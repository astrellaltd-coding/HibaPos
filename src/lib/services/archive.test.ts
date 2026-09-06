import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { db } from "@/lib/db";
import { canonicalize, computeEventHash } from "@/lib/fiscal";
import { buildAnnualArchive, recordAnnualArchive, appendFiscalEvent, verifyFiscalChain } from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { SOFTWARE_NAME, SOFTWARE_VERSION } from "@/lib/version";

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

  // L-53 (Batch 3.7) — the archive says which software, at which version,
  // wrote it. `version` below is the SCHEMA version of the file and moved
  // 2 → 3 when `software` was added; the two had been confused for each other.
  it("names the software and its version, in the payload and in the notice (L-53)", async () => {
    const built = await buildAnnualArchive(2026);
    const parsed = JSON.parse(built.json);
    expect(parsed.software).toEqual({ name: SOFTWARE_NAME, version: SOFTWARE_VERSION });
    // AMENDED 2026-09-06 (Batch 3.8, DD-23): 3 → 4, when `dailyCloses` was
    // added to the payload. The number is the SCHEMA version of the archive
    // file, and it moves whenever the file's shape does.
    // AMENDED AGAIN 2026-09-06 (Batch 3.10, L-55): 4 → 5, when `refunds` and
    // `cashMovements` were added. Amended because the shape genuinely moved,
    // not to make a run go green — the assertion that the number IS pinned is
    // what this line is for, and it did its job both times.
    expect(parsed.version).toBe(5);
    expect(parsed).toHaveProperty("dailyCloses");
    expect(parsed.notice).toContain(`Logiciel : ${SOFTWARE_NAME}, version ${SOFTWARE_VERSION}`);
    // Not vacuous: a real dotted release, not a placeholder.
    expect(parsed.software.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ---------------------------------------------------------------------------
// Batch 3.10 — L-55 (the two missing row-level sections) and L-56 (the notice).
// ---------------------------------------------------------------------------

/** Wipe everything the archive reads, and return a user to hang rows off. */
async function resetForArchive() {
  await db.fiscalArchive.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.cashMovement.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
  return db.user.create({
    data: {
      username: `arch55-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "SUPER_ADMIN",
      pinHash: "x:y",
    },
  });
}

async function aShift(userId: string, number: number, openedAt: Date) {
  return db.shift.create({
    data: { number, openedById: userId, openedAt, status: "CLOSED", openingFloat: 5000 },
  });
}

async function anOrder(shiftId: string, userId: string, number: number, createdAt: Date) {
  return db.order.create({
    data: {
      number,
      shiftId,
      cashierId: userId,
      createdAt,
      subtotal: 1000,
      vatTotal: 91,
      total: 1000,
      itemCount: 1,
    },
  });
}

// The archive's window is the TRADING year (DD-24), so these dates are chosen
// against a 05:00 cut-off rather than against midnight: 2026-01-01 at 02:00
// belongs to the 2025 exercice, and 2027-01-01 at 02:00 belongs to 2026's.
describe("the annual archive carries refunds and cash movements as ROWS (L-55)", () => {
  it("includes a cash movement made inside the exercice, with its shift and cashier", async () => {
    const user = await resetForArchive();
    const shift = await aShift(user.id, 1, new Date(2026, 5, 1, 10));
    await db.cashMovement.create({
      data: {
        shiftId: shift.id,
        category: "APPROVISIONNEMENT",
        amount: 5000,
        reason: "Fond de caisse",
        cashierId: user.id,
        createdAt: new Date(2026, 5, 1, 11),
      },
    });

    const parsed = JSON.parse((await buildAnnualArchive(2026)).json);
    expect(parsed.cashMovements).toHaveLength(1);
    expect(parsed.cashMovements[0].amount).toBe(5000);
    expect(parsed.cashMovements[0].category).toBe("APPROVISIONNEMENT");
    expect(parsed.cashMovements[0].reason).toBe("Fond de caisse");
    // Readable without resolving ids against another section, the way `orders`
    // already carries its shift number and cashier.
    expect(parsed.cashMovements[0].shift.number).toBe(1);
    expect(parsed.cashMovements[0].cashier.name).toBe("Resp");
  });

  it("leaves out a cash movement on the wrong side of the trading-year cut-off", async () => {
    const user = await resetForArchive();
    const shift = await aShift(user.id, 1, new Date(2026, 0, 1, 10));
    // 02:00 on 1 January 2027 — a calendar year later, but still inside the
    // 2026 trading year, which ends at the 05:00 cut-off.
    await db.cashMovement.create({
      data: {
        shiftId: shift.id,
        category: "PRELEVEMENT",
        amount: -2000,
        reason: "Dépôt coffre",
        cashierId: user.id,
        createdAt: new Date(2027, 0, 1, 2),
      },
    });
    // 02:00 on 1 January 2026 — inside the 2025 trading year.
    await db.cashMovement.create({
      data: {
        shiftId: shift.id,
        category: "PRELEVEMENT",
        amount: -3000,
        reason: "Dépôt coffre veille",
        cashierId: user.id,
        createdAt: new Date(2026, 0, 1, 2),
      },
    });

    const in2026 = JSON.parse((await buildAnnualArchive(2026)).json);
    expect(in2026.cashMovements.map((m: { amount: number }) => m.amount)).toEqual([-2000]);
    const in2025 = JSON.parse((await buildAnnualArchive(2025)).json);
    expect(in2025.cashMovements.map((m: { amount: number }) => m.amount)).toEqual([-3000]);
  });

  it("puts a refund paid in the NEXT exercice into that exercice's archive (L-55)", async () => {
    // The half of the finding no existing section can reach. A refund paid in
    // year N+1 against a year-N order appeared in NO `orders` section of any
    // archive: year N's window closed before it happened, and year N+1's
    // window contains no such order. It reached the archive only as an event.
    const user = await resetForArchive();
    const shift = await aShift(user.id, 1, new Date(2026, 5, 1, 10));
    const order = await anOrder(shift.id, user.id, 1, new Date(2026, 5, 1, 12));
    await db.refund.create({
      data: {
        orderId: order.id,
        amount: 400,
        reason: "Retour tardif",
        cashierId: user.id,
        shiftId: shift.id,
        method: "CASH",
        createdAt: new Date(2027, 2, 3, 14), // March 2027 — the next exercice
      },
    });

    const a2027 = JSON.parse((await buildAnnualArchive(2027)).json);
    // The order is not in 2027 — it was rung in 2026 — so this row exists in
    // 2027's archive ONLY because refunds are keyed on their own date.
    expect(a2027.orders).toHaveLength(0);
    expect(a2027.refunds).toHaveLength(1);
    expect(a2027.refunds[0].amount).toBe(400);
    // …and it says what it corrects, without a lookup into another archive.
    expect(a2027.refunds[0].order.number).toBe(1);

    // 2026's archive still holds the sale, and still carries the refund nested
    // under it — nothing was moved or removed, only added.
    const a2026 = JSON.parse((await buildAnnualArchive(2026)).json);
    expect(a2026.orders).toHaveLength(1);
    expect(a2026.orders[0].refunds).toHaveLength(1);
    // But its OWN period section is empty: no money moved in 2026 for it.
    expect(a2026.refunds).toHaveLength(0);
  });

  it("lists a same-exercice refund TWICE, under its order and in the period section", async () => {
    // Deliberate, and the notice says so: the two sections answer different
    // questions. Asserted rather than left implicit so that a later batch
    // "deduplicating" them has to argue with a test.
    const user = await resetForArchive();
    const shift = await aShift(user.id, 1, new Date(2026, 5, 1, 10));
    const order = await anOrder(shift.id, user.id, 1, new Date(2026, 5, 1, 12));
    const refund = await db.refund.create({
      data: {
        orderId: order.id,
        amount: 250,
        reason: "Erreur de saisie",
        cashierId: user.id,
        shiftId: shift.id,
        method: "CASH",
        createdAt: new Date(2026, 5, 1, 13),
      },
    });

    const parsed = JSON.parse((await buildAnnualArchive(2026)).json);
    expect(parsed.orders[0].refunds[0].id).toBe(refund.id);
    expect(parsed.refunds[0].id).toBe(refund.id);
    expect(parsed.notice).toContain("apparaît deux");
  });

  it("bumps the schema version to 5, because the file's shape moved", async () => {
    await resetForArchive();
    const parsed = JSON.parse((await buildAnnualArchive(2026)).json);
    expect(parsed.version).toBe(5);
    expect(parsed).toHaveProperty("refunds");
    expect(parsed).toHaveProperty("cashMovements");
  });
});

describe("the archive notice claims only what the code does (L-56)", () => {
  // « Date certaine » is art. 1377 du code civil and is conferred by a third
  // party. A file written, timestamped and hashed by the till confers none,
  // whatever it says about itself. The notice said « et leur donne date
  // certaine » and `docs/attestation-conformite.md` said the same in a document
  // signed under art. 441-1 du code pénal.
  //
  // Both are asserted here, in one place, because correcting one and leaving
  // the other is the failure mode this is guarding — 3.7 corrected the notice
  // for L-53 and left this line, which is how L-56 came to exist.
  const CLAIMS_DATE_CERTAINE = /donn(e|ant|é|ent)[^.]{0,60}date certaine/i;

  it("does not claim the archive confers date certaine", async () => {
    const { notice } = await buildAnnualArchive(2026);
    expect(notice).not.toMatch(CLAIMS_DATE_CERTAINE);
    // Not passing because the paragraph vanished: it still names the term and
    // says what is true about it instead.
    expect(notice).toContain("1377");
    expect(notice).toContain("ne confère pas par lui-même");
  });

  it("says instead what the archive really has, and both parts are checkable", async () => {
    const { notice } = await buildAnnualArchive(2026);
    // The journal entry that records the generation…
    expect(notice).toContain("ARCHIVE_GENEREE");
    // …and the checksum a third party can reproduce. Both already existed;
    // the notice now rests its claim on them rather than on a legal term.
    expect(notice).toContain("sha256sum");
    expect(notice).toContain("generatedAt");
  });

  it("keeps the SIGNED attestation in step with the notice", () => {
    const attestation = readFileSync(
      path.join(process.cwd(), "docs", "attestation-conformite.md"),
      "utf8",
    );
    // Guard against a vacuous pass if the file is ever moved or emptied.
    expect(attestation).toContain("Attestation individuelle de conformité");

    // Asserted on the DECLARATION, not on the whole file. The editorial notes
    // at the top say of themselves that they « ne font pas partie de la
    // déclaration », and note 6 deliberately quotes the withdrawn sentence so a
    // reader can see what changed — the same convention note 4 uses. Matching
    // the whole file would therefore forbid the file from recording its own
    // correction, which is the opposite of the point.
    const declaration = attestation.slice(attestation.indexOf("## Volet 1"));
    expect(declaration).toContain("**Archivage**");
    expect(declaration).not.toMatch(CLAIMS_DATE_CERTAINE);
    // And the withdrawal is explained rather than silently applied.
    expect(attestation).toContain("L-56");
    // ADDED after a revert nobody caught: removing the corrected Archivage
    // wording's pointer to note 6 passed every test in this file. A signatory
    // who reads only the declaration would then meet no warning at all, which
    // is the whole reason note 6 exists — so the pointer is pinned too.
    expect(declaration).toContain("Voir note 6");
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
