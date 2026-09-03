import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { db } from "@/lib/db";
import { canonicalize, computeEventHash } from "@/lib/fiscal";
import { buildAnnualArchive, recordAnnualArchive, appendFiscalEvent, verifyFiscalChain } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";

// Batch 3.3 — C-04 (archive checksum) and M-02 (archive row before file).
//
// C-04: canonicalize() had no Date branch, so a Date fell into the generic
// object case, Object.keys(date) is [], and every timestamp serialised to {}.
// Two payloads seven years apart hashed identically. And the checksum was
// computed over the canonical form while the FILE was pretty-printed JSON with
// the checksum embedded, so a third party could not reproduce it at all. The
// archive's own notice promised both properties.

describe("canonicalize — Date (C-04)", () => {
  it("serialises a Date as its instant, not as an empty object", () => {
    expect(canonicalize(new Date("2026-01-01T10:00:00.000Z"))).toBe('"2026-01-01T10:00:00.000Z"');
    expect(canonicalize({ d: new Date("2026-01-01T10:00:00.000Z") })).toBe(
      '{"d":"2026-01-01T10:00:00.000Z"}',
    );
  });

  it("makes two payloads differing only in a date hash DIFFERENTLY", () => {
    // The audit's exact case.
    const a = canonicalize({ orderNumber: 1, createdAt: new Date("2026-01-01T10:00:00.000Z") });
    const b = canonicalize({ orderNumber: 1, createdAt: new Date("2019-05-05T10:00:00.000Z") });
    expect(a).not.toBe(b);
    const h = (x: string) => createHash("sha256").update(x).digest("hex");
    expect(h(a)).not.toBe(h(b));
    // Before the fix both produced {"createdAt":{},"orderNumber":1}.
    expect(a).not.toContain('"createdAt":{}');
  });

  it("treats an Invalid Date like a non-finite number", () => {
    expect(canonicalize({ d: new Date("not a date") })).toBe('{"d":null}');
  });

  it("leaves every other value type exactly as it was", () => {
    // The chain-compatibility surface: these are the shapes that appear in
    // stored dataJson, and none of them may move.
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ s: "x", n: null, t: true, f: false })).toBe(
      '{"f":false,"n":null,"s":"x","t":true}',
    );
    expect(canonicalize([1, "a", null])).toBe('[1,"a",null]');
    expect(canonicalize({ n: NaN, i: Infinity })).toBe('{"i":null,"n":null}');
    expect(canonicalize({ u: undefined })).toBe('{"u":null}');
    expect(canonicalize({ nested: { z: 1, a: [{ k: "v" }] } })).toBe(
      '{"nested":{"a":[{"k":"v"}],"z":1}}',
    );
  });
});

describe("the existing chain still verifies after the canonicaliser changed", () => {
  beforeEach(async () => {
    await db.fiscalEvent.deleteMany();
    await db.fiscalCounter.deleteMany();
    await ensureFiscalCounter();
  });

  it("recomputes the hash of a payload shaped like the live VENTE events", async () => {
    // The two events in the production database carry exactly these value
    // types: strings, numbers, and an array of {amount, method} objects. If
    // the Date branch had disturbed any of them, this hash would move.
    const data = {
      cashierId: "cms5rne6m0000n3qw8cki3mt4",
      discountTotal: 0,
      itemCount: 2,
      orderNumber: 19,
      orderType: "DINE_IN",
      payments: [{ amount: 2380, method: "CASH" }],
      subtotal: 2380,
      total: 2380,
      vatTotal: 216,
    };
    expect(canonicalize(data)).toBe(
      '{"cashierId":"cms5rne6m0000n3qw8cki3mt4","discountTotal":0,"itemCount":2,' +
        '"orderNumber":19,"orderType":"DINE_IN","payments":[{"amount":2380,"method":"CASH"}],' +
        '"subtotal":2380,"total":2380,"vatTotal":216}',
    );
    // And the hash is a pure function of that string plus the chain fields.
    const ts = new Date("2026-08-28T01:00:00.000Z");
    expect(computeEventHash(null, 1, "VENTE", ts, canonicalize(data))).toBe(
      computeEventHash(null, 1, "VENTE", ts, canonicalize(data)),
    );
  });

  it("a freshly written chain verifies end to end", async () => {
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 2, total: 2000 } });
    });
    const result = await verifyFiscalChain();
    expect(result.ok).toBe(true);
    expect(result.firstBreakAt).toBeNull();
  });
});

describe("the archive checksum is reproducible from the file (C-04)", () => {
  beforeEach(async () => {
    await db.fiscalArchive.deleteMany();
    await db.fiscalEvent.deleteMany();
    await db.fiscalCounter.deleteMany();
    await ensureFiscalCounter();
  });

  it("equals sha256 of the exact bytes written to disk", async () => {
    const built = await buildAnnualArchive(2026);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hibapos-archive-"));
    const file = path.join(dir, built.filename);
    await fs.writeFile(file, built.json, "utf8");

    // What an inspector does: sha256sum the delivered file.
    const onDisk = await fs.readFile(file);
    const independent = createHash("sha256").update(onDisk).digest("hex");

    expect(independent).toBe(built.checksum);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("ships a sha256sum manifest a third party can check directly", async () => {
    const built = await buildAnnualArchive(2026);
    expect(built.checksumFilename).toBe("hibapos-archive-2026.json.sha256");
    // The `sha256sum -c` format: "<hash>  <filename>".
    expect(built.checksumFileContent).toBe(`${built.checksum}  ${built.filename}\n`);
  });

  it("does NOT embed the checksum in the bytes it covers", async () => {
    const built = await buildAnnualArchive(2026);
    const parsed = JSON.parse(built.json);
    expect(parsed.checksum).toBeUndefined();
    expect(built.json).not.toContain(built.checksum);
  });

  it("changing a timestamp changes the checksum", async () => {
    // The property the notice promises, exercised on a real payload rather
    // than a synthetic one. Two builds of the same year differ only in
    // `generatedAt`, which is a timestamp — so the checksums must differ.
    const a = await buildAnnualArchive(2026);
    await new Promise((r) => setTimeout(r, 2));
    const b = await buildAnnualArchive(2026);
    expect(JSON.parse(a.json).generatedAt).not.toBe(JSON.parse(b.json).generatedAt);
    expect(a.checksum).not.toBe(b.checksum);
  });

  it("is readable and self-describing without HibaPOS", async () => {
    const built = await buildAnnualArchive(2026);
    const parsed = JSON.parse(built.json);
    expect(parsed.format).toBe("hibapos-fiscal-archive");
    expect(parsed.year).toBe(2026);
    expect(typeof parsed.notice).toBe("string");
    expect(parsed.notice).toContain("sha256sum");
    expect(parsed).toHaveProperty("fiscalEvents");
    expect(parsed).toHaveProperty("zReports");
    expect(parsed).toHaveProperty("monthlyCloses");
  });
});

describe("building an archive writes nothing (M-02)", () => {
  beforeEach(async () => {
    await db.fiscalArchive.deleteMany();
    await db.fiscalEvent.deleteMany();
    await db.fiscalCounter.deleteMany();
    await ensureFiscalCounter();
  });

  it("leaves no row and no journal entry, so a failed write blocks nothing", async () => {
    await buildAnnualArchive(2026);
    // The old generateAnnualArchive() created both here, before the route had
    // written a single byte — so a failed write left a row that refused
    // regeneration while the download route asked for exactly that.
    expect(await db.fiscalArchive.count()).toBe(0);
    expect(await db.fiscalEvent.count()).toBe(0);
  });

  it("records only when asked, and journals what reached the disk", async () => {
    const user = await db.user.create({
      data: { username: `arch-${Date.now()}`, name: "Arch", role: "SUPER_ADMIN", pinHash: "x:y" },
    });
    const built = await buildAnnualArchive(2026);
    const archive = await recordAnnualArchive(2026, user.id, {
      filename: built.filename,
      checksum: built.checksum,
      sizeBytes: built.sizeBytes,
    });

    expect(archive.checksum).toBe(built.checksum);
    expect(archive.sizeBytes).toBe(built.sizeBytes);

    const ev = await db.fiscalEvent.findFirst({ where: { type: "ARCHIVE_GENEREE" } });
    expect(ev).not.toBeNull();
    expect(JSON.parse(ev!.dataJson).checksum).toBe(built.checksum);
    expect(archive.fiscalEventId).toBe(ev!.id);
  });
});
