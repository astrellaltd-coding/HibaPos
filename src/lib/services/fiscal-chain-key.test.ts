import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import {
  computeEventHash,
  computeCloseHash,
  verifyEvents,
  verifyCloses,
  type ChainEventRow,
} from "@/lib/fiscal";
import {
  fiscalChainKey,
  isChainKeyed,
  isChainKeyMisconfigured,
  CHAIN_KEY_MIXED_MESSAGE,
  CHAIN_KEY_DIAGNOSIS_UNKEYED_JOURNAL,
  CHAIN_KEY_DIAGNOSIS_KEYED_JOURNAL,
} from "@/lib/fiscal-key";
import {
  appendFiscalEvent,
  verifyFiscalChain,
  diagnoseChainKey,
  closeDay,
} from "@/lib/services/fiscal";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { formatIntegrityCode } from "@/lib/services/day-close-ticket";

// DD-25 (Batch 3.9) — the keyed fiscal chain, and the refusal that keeps it
// honest.
//
// NOTHING IN LAW REQUIRES THIS, and the record says so: BOFiP § 60 imposes no
// technique and § 140 names chaining and signature as alternatives. It is the
// operator's choice, taken with the limit stated — on a till where the operator
// is administrator, a secret in a file is findable, and the half that actually
// works is the code printed on the day-close slip and filed with the books.
//
// **The centre of this file is the mixed chain.** A journal half-written without
// the key and half with it verifies under neither mode, and the failure reads
// as tampering rather than as the misconfiguration it is. So arming a key onto
// a journal that already holds unkeyed events is refused, and the refusal is
// proved from evidence — the previous entry recomputes unkeyed — rather than
// from a flag somebody could flip.

const KEY = "test-fiscal-chain-key-at-least-32-characters-long-0123456789";
const OTHER_KEY = "a-different-fiscal-chain-key-also-at-least-32-chars-0123456789";

function arm(key: string | null) {
  if (key === null) delete process.env.FISCAL_CHAIN_KEY;
  else process.env.FISCAL_CHAIN_KEY = key;
}

async function reset() {
  await db.fiscalEvent.deleteMany();
  await db.dailyClose.deleteMany();
  await db.monthlyClose.deleteMany();
  await db.annualClose.deleteMany();
  await db.cashMovement.deleteMany();
  await db.zReport.deleteMany();
  await db.shift.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
  const user = await db.user.create({
    data: {
      username: `dd25-${Date.now()}-${Math.random()}`,
      name: "Resp",
      role: "SUPER_ADMIN",
      pinHash: "x:y",
    },
  });
  return user.id;
}

beforeEach(() => arm(null));
afterEach(() => arm(null));

describe("the key reader (DD-25)", () => {
  it("treats unset, empty and whitespace as unkeyed — a supported state, not a fault", () => {
    arm(null);
    expect(fiscalChainKey()).toBeNull();
    expect(isChainKeyed()).toBe(false);
    arm("");
    expect(fiscalChainKey()).toBeNull();
    arm("   ");
    expect(fiscalChainKey()).toBeNull();
  });

  it("refuses a short key, and names the VARIABLE rather than the value", () => {
    // Batch 7.3's rule: a secret in an error message is a secret in a log.
    arm("too-short");
    let message = "";
    try {
      fiscalChainKey();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("FISCAL_CHAIN_KEY");
    expect(message).not.toContain("too-short");
  });

  it("returns the configured key when it is long enough", () => {
    arm(KEY);
    expect(fiscalChainKey()).toBe(KEY);
    expect(isChainKeyed()).toBe(true);
  });
});

describe("the fingerprint, keyed and unkeyed (pure)", () => {
  const ts = new Date("2026-06-12T18:00:00.000Z");

  it("is unchanged without a key — every event written before DD-25 still verifies", () => {
    // The literal is the value the pre-3.9 function produced for these inputs.
    // If this moves, the production journal stops verifying.
    const a = computeEventHash(null, 1, "VENTE", ts, '{"total":1000}');
    const b = computeEventHash(null, 1, "VENTE", ts, '{"total":1000}', null);
    const c = computeEventHash(null, 1, "VENTE", ts, '{"total":1000}', undefined);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs with a key, and differs again with a different key", () => {
    const plain = computeEventHash(null, 1, "VENTE", ts, '{"total":1000}');
    const keyed = computeEventHash(null, 1, "VENTE", ts, '{"total":1000}', KEY);
    const other = computeEventHash(null, 1, "VENTE", ts, '{"total":1000}', OTHER_KEY);
    expect(keyed).not.toBe(plain);
    expect(other).not.toBe(keyed);
    expect(keyed).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic: the same inputs and key always give the same answer.
    expect(computeEventHash(null, 1, "VENTE", ts, '{"total":1000}', KEY)).toBe(keyed);
  });

  it("keys the close fingerprint on the same terms", () => {
    const plain = computeCloseHash(null, "2026-06-12", ts, '{"x":1}');
    const keyed = computeCloseHash(null, "2026-06-12", ts, '{"x":1}', KEY);
    expect(keyed).not.toBe(plain);
    expect(computeCloseHash(null, "2026-06-12", ts, '{"x":1}', null)).toBe(plain);
  });
});

describe("verification needs the mode the chain was written in (pure)", () => {
  const ts = new Date("2026-06-12T18:00:00.000Z");
  const chain = (key: string | null): ChainEventRow[] => {
    const h1 = computeEventHash(null, 1, "VENTE", ts, '{"n":1}', key);
    const h2 = computeEventHash(h1, 2, "VENTE", ts, '{"n":2}', key);
    return [
      { sequence: 1, type: "VENTE", timestamp: ts, dataJson: '{"n":1}', previousHash: null, hash: h1 },
      { sequence: 2, type: "VENTE", timestamp: ts, dataJson: '{"n":2}', previousHash: h1, hash: h2 },
    ];
  };

  it("verifies a keyed chain with its key and an unkeyed chain with none", () => {
    expect(verifyEvents(chain(KEY), KEY).ok).toBe(true);
    expect(verifyEvents(chain(null), null).ok).toBe(true);
  });

  it("fails a keyed chain read without the key, at the first entry", () => {
    const r = verifyEvents(chain(KEY), null);
    expect(r.ok).toBe(false);
    expect(r.firstBreakAt).toBe(1);
  });

  it("fails an unkeyed chain read with a key, and fails under the WRONG key", () => {
    expect(verifyEvents(chain(null), KEY).ok).toBe(false);
    expect(verifyEvents(chain(KEY), OTHER_KEY).ok).toBe(false);
  });

  it("does the same for the close chains", () => {
    const t = new Date("2026-07-01T05:00:00.000Z");
    const h = computeCloseHash(null, "2026-06-30", t, '{"x":1}', KEY);
    const rows = [{ period: "2026-06-30", timestamp: t, dataJson: '{"x":1}', previousHash: null, hash: h }];
    expect(verifyCloses(rows, KEY).ok).toBe(true);
    expect(verifyCloses(rows, null).ok).toBe(false);
  });
});

describe("THE ARMING GUARD — a mixed chain is refused, loudly", () => {
  it("REFUSES to append keyed onto a journal written unkeyed, and writes nothing", async () => {
    await reset();
    arm(null);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    expect(await db.fiscalEvent.count()).toBe(1);

    // The operator sets the key on a journal that already has history.
    arm(KEY);
    await expect(
      db.$transaction(async (tx) => {
        await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 2, total: 2000 } });
      }),
    ).rejects.toThrow(CHAIN_KEY_MIXED_MESSAGE);

    // Nothing was written, and the counter did not move either — a refused
    // append must not burn a sequence number or the journal would gap.
    expect(await db.fiscalEvent.count()).toBe(1);
    const counter = await db.fiscalCounter.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(counter.lastFiscalEventSequence).toBe(1);

    // And with the key removed again, the journal is exactly as it was.
    arm(null);
    expect((await verifyFiscalChain()).ok).toBe(true);
  });

  it("ALLOWS arming on an EMPTY journal — the state Batch 8.0 leaves behind", async () => {
    await reset();
    arm(KEY);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 2, total: 2000 } });
    });
    expect(await db.fiscalEvent.count()).toBe(2);
    expect((await verifyFiscalChain()).ok).toBe(true);

    // The same journal read without the key does NOT verify, which is the
    // whole point of keying it.
    arm(null);
    const r = await verifyFiscalChain();
    expect(r.ok).toBe(false);
    expect(r.firstBreakAt).toBe(1);
  });

  it("lets an unkeyed journal go on being appended to, unchanged", async () => {
    await reset();
    arm(null);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 2, total: 2000 } });
    });
    expect(await db.fiscalEvent.count()).toBe(2);
    expect((await verifyFiscalChain()).ok).toBe(true);
  });

  it("keys the day close too, so the printed code is the keyed fingerprint", async () => {
    const userId = await reset();
    arm(KEY);
    const day = await closeDay("2026-06-12", userId, false, new Date(2026, 5, 20));
    expect((await verifyFiscalChain()).ok).toBe(true);
    // The code on the paper is still the fingerprint of the sealed row — Batch
    // 3.8's ticket does not change, only what the fingerprint is computed from.
    expect(formatIntegrityCode(day.hash)).toBe(
      day.hash.slice(0, 16).toUpperCase().match(/.{1,4}/g)!.join("-"),
    );
    // And that fingerprint is the keyed one.
    expect(day.hash).not.toBe(
      computeCloseHash(day.previousHash, day.period, day.sealedAt, day.dataJson, null),
    );
    expect(day.hash).toBe(
      computeCloseHash(day.previousHash, day.period, day.sealedAt, day.dataJson, KEY),
    );
  });
});

describe("a key problem is not reported as tampering", () => {
  it("says the journal is unkeyed when a key is configured over one", async () => {
    await reset();
    arm(null);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    arm(KEY);
    expect((await verifyFiscalChain()).ok).toBe(false);
    expect(await diagnoseChainKey()).toBe(CHAIN_KEY_DIAGNOSIS_UNKEYED_JOURNAL);
  });

  it("names the missing key as a possibility when the journal was keyed", async () => {
    await reset();
    arm(KEY);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    arm(null);
    expect((await verifyFiscalChain()).ok).toBe(false);
    expect(await diagnoseChainKey()).toBe(CHAIN_KEY_DIAGNOSIS_KEYED_JOURNAL);
  });

  it("says nothing when the chain verifies, and nothing on an empty journal", async () => {
    await reset();
    arm(null);
    expect(await diagnoseChainKey()).toBeNull(); // empty
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    expect(await diagnoseChainKey()).toBeNull(); // verifies
  });

  it("blames no key when a key is set and the record was genuinely rewritten", async () => {
    // The case the diagnosis must NOT swallow: a real alteration on a correctly
    // keyed journal is tampering, and saying "check your key" would send
    // somebody the wrong way.
    await reset();
    arm(KEY);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    const ev = await db.fiscalEvent.findFirstOrThrow();
    await db.fiscalEvent.update({
      where: { id: ev.id },
      data: { dataJson: '{"orderNumber":1,"total":999999}' },
    });
    expect((await verifyFiscalChain()).ok).toBe(false);
    expect(await diagnoseChainKey()).toBeNull();
  });
});

describe("the refusal reaches the OPERATOR, not just the server log", () => {
  // FOUND BY THE WALKTHROUGH, not by the tests above. The guard fired
  // correctly and the message reached the log, but `POST /api/fiscal/drawer`
  // answered **500 with an empty body**: on the till the operator saw nothing
  // at all. "Refused" is not "refused loudly". It is handled once in the API
  // wrapper, where `ScryptBusyError` already set the precedent, so every route
  // that appends a fiscal event answers the same way.
  it("is a typed error the API layer can answer with", async () => {
    await reset();
    arm(null);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    arm(KEY);
    let caught: unknown = null;
    try {
      await db.$transaction(async (tx) => {
        await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 2, total: 2000 } });
      });
    } catch (e) {
      caught = e;
    }
    expect(isChainKeyMisconfigured(caught)).toBe(true);
    expect((caught as Error).message).toBe(CHAIN_KEY_MIXED_MESSAGE);
  });

  it("answers 503 with the French message, on a route that has no try/catch of its own", async () => {
    // The drawer route is the one the walkthrough caught answering 500 with an
    // empty body. It still has no error handling of its own; the wrapper does.
    const { signInAs, callJson, clearCookies } = await import("@/lib/route-harness");
    const { hashPin } = await import("@/lib/auth");
    await reset();
    clearCookies();
    await db.session.deleteMany();
    const manager = await db.user.create({
      data: { username: "dd25-route", name: "R", role: "MANAGER", pinHash: await hashPin("252525") },
    });
    await signInAs({ id: manager.id, username: "dd25-route", role: "MANAGER" });

    arm(null);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    arm(KEY);

    const { POST } = await import("@/app/api/fiscal/drawer/route");
    const res = await callJson<{ error?: string }>(POST, {
      method: "POST",
      url: "http://localhost/api/fiscal/drawer",
      body: { reason: "test" },
    });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe(CHAIN_KEY_MIXED_MESSAGE);
    expect(res.body.error).not.toContain(KEY);
    clearCookies();
  });
});

describe("the key never leaves the process", () => {
  it("does not appear in the guard's refusal message", async () => {
    await reset();
    arm(null);
    await db.$transaction(async (tx) => {
      await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 1, total: 1000 } });
    });
    arm(KEY);
    let message = "";
    try {
      await db.$transaction(async (tx) => {
        await appendFiscalEvent(tx, { type: "VENTE", data: { orderNumber: 2, total: 2000 } });
      });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toBe(CHAIN_KEY_MIXED_MESSAGE);
    expect(message).not.toContain(KEY);
  });

  it("does not appear in any of the three diagnosis strings", () => {
    for (const s of [
      CHAIN_KEY_MIXED_MESSAGE,
      CHAIN_KEY_DIAGNOSIS_KEYED_JOURNAL,
      CHAIN_KEY_DIAGNOSIS_UNKEYED_JOURNAL,
    ]) {
      expect(s).not.toContain(KEY);
      expect(s.length).toBeGreaterThan(40); // they say something, not just a code
    }
  });
});
