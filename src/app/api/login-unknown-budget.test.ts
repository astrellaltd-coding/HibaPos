import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { clearCookies, callJson } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { ensureFiscalCounter } from "@/lib/services/sequence";
import { hashPin } from "@/lib/auth";
import { POST as login } from "@/app/api/auth/login/route";
import { PIN_HASH_MAX_CONCURRENT, PIN_HASH_MAX_QUEUED } from "@/lib/pin-hash-queue";

// L-30 (Batch 7.4b) — enumerating usernames must not be able to push an honest
// operator to 503.
//
// THE FINDING. Every unknown username burns one `hashPin` on purpose, to
// flatten the timing signal that would otherwise enumerate accounts. Those
// derivations pass through the bounded queue (2 concurrent + 32 queued = 34).
// The login throttle is keyed `login:<ip>:<username>` and `<ip>` is the
// constant "local" since Batch 4.1 stopped believing proxy headers — so each
// invented username was its own bucket and nothing capped how many a caller
// could mint. Measured: 60 simultaneous unknown-username logins → 34 served,
// 26 refused 503, and a real login in that window would have been refused too.
//
// THE FIX, AND THE FIX IT IS NOT. A second budget on the unknown-user path,
// keyed WITHOUT the username. **The burn is not removed** — the row says so in
// as many words, and removing it would trade a denial-of-service for an
// enumeration oracle, which is a worse trade. Past the budget the response is
// identical and only the burn is skipped.

const PIN = "246810";

async function wipe() {
  // EVERY table that references `User`, in dependency order.
  //
  // This file first wiped only sessions, audit rows and users — and passed
  // locally, because the files that leave orders behind happened to run after
  // it. **CI failed it**, with `P2003` on `user.deleteMany()`, because the file
  // order on Linux is different. That is **L-40's within-run half**, which
  // Batch 6.3 fixed only ACROSS runs and said so in as many words: the per-run
  // database "does NOT make files independent of each other WITHIN a run".
  //
  // A partial wipe is not a shortcut here; it is a dependency on file order.
  await db.session.deleteMany();
  await db.cashMovement.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.auditLog.deleteMany();
  await db.zReport.deleteMany();
  await db.payment.deleteMany();
  await db.receipt.deleteMany();
  await db.refund.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.shift.deleteMany();
  await db.grandTotal.deleteMany();
  await db.user.deleteMany();
  await db.fiscalCounter.deleteMany();
  await ensureFiscalCounter();
}

beforeEach(async () => {
  clearCookies();
  await wipe();
  await db.user.create({
    data: { username: "real-operator", name: "Réel", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
});

afterAll(clearCookies);

function attempt(username: string, pin = "000000") {
  return callJson<{ error?: string }>(login, {
    url: "http://localhost/api/auth/login",
    method: "POST",
    body: { username, pin },
  });
}

describe("L-30 — unknown usernames share one budget", () => {
  it("answers 401 with the same body before and after the budget is spent", async () => {
    // The property that matters most: nothing about the RESPONSE tells a
    // caller whether they are still being burned. If the status or the message
    // changed past the budget, this fix would have created the very oracle the
    // burn exists to close.
    const first = await attempt("ghost-1");
    expect(first.status).toBe(401);

    const responses = [];
    for (let i = 2; i <= 12; i++) responses.push(await attempt(`ghost-${i}`));

    for (const r of responses) {
      expect(r.status).toBe(401);
      expect(r.body.error).toBe(first.body.error);
    }
  });

  it("a real operator still signs in while unknown names are being tried", async () => {
    // The finding's actual harm, asserted directly.
    for (let i = 0; i < 20; i++) await attempt(`ghost-${i}`);

    const ok = await callJson<{ username?: string }>(login, {
      url: "http://localhost/api/auth/login",
      method: "POST",
      body: { username: "real-operator", pin: PIN },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe("real-operator");
  });

  it("an honest login is NOT refused 503 while 60 unknown names are tried AT THE SAME TIME", async () => {
    // THE FINDING'S OWN MEASUREMENT, turned into an assertion: 60 simultaneous
    // unknown-username logins → 34 served, 26 refused 503, "and a legitimate
    // login arriving inside that window would have been among the refused".
    //
    // ── WHY THIS SHAPE, AND NOT THE ONE I WROTE FIRST ───────────────────────
    // The first version timed 50 sequential-ish attempts and asserted they
    // finished quickly. **Reverting the fix did not break it** — the burn is
    // ~390 ms and 34 of them two-at-a-time still came in under the threshold,
    // so the test proved nothing. A timing threshold is also exactly what L-24
    // warns about on this machine. What matters is not how long the attack
    // takes; it is whether the OPERATOR is refused, so that is what is
    // asserted, as a status code.
    const swarm = Array.from({ length: 60 }, (_, i) => attempt(`flood-${i}`));
    const honest = callJson<{ username?: string }>(login, {
      url: "http://localhost/api/auth/login",
      method: "POST",
      body: { username: "real-operator", pin: PIN },
    });

    const [ok] = await Promise.all([honest, ...swarm]);

    // 503 is the bounded queue refusing (C-09 / Batch 4.2). Getting one here
    // is the defect: the till says "réessayez dans un instant" because
    // somebody guessed sixty names.
    expect(ok.status).not.toBe(503);
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe("real-operator");

    // And the queue's depth is what the finding measured, pinned so the
    // numbers above keep meaning what they say.
    expect(PIN_HASH_MAX_CONCURRENT + PIN_HASH_MAX_QUEUED).toBe(34);
  });

  it("a KNOWN username is not affected by the unknown budget", async () => {
    // The unknown budget must not become a second brute-force limiter on real
    // accounts — that is what `login:<ip>:<username>` is for, and it counts
    // differently. Spend the unknown budget, then get the ordinary 401 for a
    // wrong PIN on a real account rather than anything new.
    for (let i = 0; i < 10; i++) await attempt(`ghost-${i}`);

    const wrongPin = await attempt("real-operator", "999999");
    expect(wrongPin.status).toBe(401);
    // The message for a wrong PIN on a REAL account is not the unknown-user
    // one, which is how we know the request reached the PIN check.
    expect(wrongPin.body.error).not.toBe("Utilisateur introuvable ou inactif");
  });
});
