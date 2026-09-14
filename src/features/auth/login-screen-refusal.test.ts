import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { profileCardText, describeProfilesFailure } from "@/features/auth/login-screen";
import { ApiError } from "@/lib/api-client";

// L-103 and L-147 (R9.5) — the login screen's two failures of speech.
//
// One says nothing when it cannot open, the other says the same thing twice.
//
// WHY THESE ARE FUNCTIONS AND NOT A RENDER. `login-screen.tsx` uses
// `useAnimation`, `framer-motion` and `next/image`; there is no DOM and no test
// renderer in this suite, which is a dependency decision `payment-line.test.tsx`
// records rather than one this batch may take. So the two pieces that were
// WRONG were extracted and are exercised for real — the same move R8.2 made for
// `PaymentLineRow` and R9.1 for `ReceiptPrintable`, and for the same reason:
// « nothing rendered it » is how both of these survived.

const ROLE_STYLE = {
  SUPER_ADMIN: { label: "Administrateur", description: "Accès complet" },
  MANAGER: { label: "Gérant", description: "Caisse et gestion" },
} as const;

describe("L-147 — two members of staff are not one card twice", () => {
  it("names the person", async () => {
    // THE FINDING: the card rendered `ROLE_STYLE[profile.role].label` and never
    // the account's name, and DD-07 leaves MANAGER as the only operational
    // role — so a second member of staff produced **two identical « Gérant »
    // cards with no way to tell them apart.** Seen with two active MANAGERs.
    const a = profileCardText({ name: "Sofia", role: "MANAGER" }, ROLE_STYLE.MANAGER);
    const b = profileCardText({ name: "Karim", role: "MANAGER" }, ROLE_STYLE.MANAGER);
    expect(a.title).toBe("Sofia");
    expect(b.title).toBe("Karim");
    expect(a.title, "two MANAGERs still render the same card").not.toBe(b.title);
  });

  it("keeps the role visible, as the subtitle", async () => {
    // The role is not lost — the card still says what the account can DO, and
    // now also whose it is. Replacing one with the other would be a different
    // defect.
    const card = profileCardText({ name: "Sofia", role: "MANAGER" }, ROLE_STYLE.MANAGER);
    expect(card.subtitle).toBe("Gérant");
  });

  it("falls back to exactly what it showed before, for an account with no name", async () => {
    for (const name of [null, undefined, "", "   "]) {
      const card = profileCardText({ name, role: "MANAGER" }, ROLE_STYLE.MANAGER);
      expect({ name, ...card }).toEqual({
        name,
        title: "Gérant",
        subtitle: "Caisse et gestion",
      });
    }
  });

  it("trims, so a stray space is not a name", async () => {
    expect(profileCardText({ name: "  Sofia  ", role: "MANAGER" }, ROLE_STYLE.MANAGER).title).toBe(
      "Sofia",
    );
  });

  it("does the same for the administrator", async () => {
    const card = profileCardText({ name: "Aymen", role: "SUPER_ADMIN" }, ROLE_STYLE.SUPER_ADMIN);
    expect(card).toEqual({ title: "Aymen", subtitle: "Administrateur" });
  });
});

describe("L-103 — the till will not open, and it says so", () => {
  it("explains a 429 and asks to be retried", async () => {
    // THE FINDING: `GET /api/auth/profiles` is rate-limited 30/min on key
    // `profiles:${ip}` where `clientIp()` returns the CONSTANT `"local"` —
    // DD-06 means there is no proxy to believe, so it is **one global bucket
    // for the whole machine.** The refusal was swallowed by a bare `catch {}`:
    // an empty picker, no message, and a reload that re-entered the same
    // exhausted bucket.
    const err = new ApiError("Trop de requêtes", 429, { retryAfterSec: 42 });
    const out = describeProfilesFailure(err);
    expect(out.retryAfterSec).toBe(42);
    expect(out.message).toContain("42");
    expect(out.message).toContain("Trop de tentatives");
  });

  it("takes the delay from the BODY, because headers do not survive ApiError", async () => {
    // The route sets `Retry-After` and `ApiError` carries only `status` and
    // `body`, so the header was unreachable from the screen. R9.5 put the
    // number in the body too.
    const err = new ApiError("Trop de requêtes", 429, { retryAfterSec: 7 });
    expect(describeProfilesFailure(err).retryAfterSec).toBe(7);
  });

  it("still schedules a retry when the body says nothing", async () => {
    // An older server, or a proxy that ate the body. A refusal with no delay
    // must not become a screen that never retries.
    const err = new ApiError("Trop de requêtes", 429, {});
    const out = describeProfilesFailure(err);
    expect(out.retryAfterSec).toBeGreaterThan(0);
  });

  it("clamps a delay that would park the screen", async () => {
    // A server answering 86400 would leave the till showing a countdown for a
    // day. The operator can always press the button; the automatic retry
    // should not be the thing that gives up.
    const err = new ApiError("Trop de requêtes", 429, { retryAfterSec: 86_400 });
    expect(describeProfilesFailure(err).retryAfterSec).toBeLessThanOrEqual(120);
    const tiny = new ApiError("Trop de requêtes", 429, { retryAfterSec: 0 });
    expect(describeProfilesFailure(tiny).retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("does NOT schedule a retry for a failure that will not fix itself", async () => {
    // A 500 retried on a timer is a loop against a broken server. Only the
    // rate limit is known to clear on its own.
    for (const status of [400, 401, 403, 500, 503]) {
      const out = describeProfilesFailure(new ApiError("boom", status, {}));
      expect({ status, retry: out.retryAfterSec }).toEqual({ status, retry: null });
    }
  });

  it("says SOMETHING for every failure, which is the whole finding", async () => {
    // The bare `catch {}` is what made an empty picker indistinguishable from
    // an empty database. Every path must produce words.
    const cases: unknown[] = [
      new ApiError("boom", 500, {}),
      new ApiError("", 503, {}),
      new Error("network down"),
      new Error(""),
      "a string",
      null,
      undefined,
    ];
    for (const err of cases) {
      const out = describeProfilesFailure(err);
      expect(out.message.length, `nothing was said for ${String(err)}`).toBeGreaterThan(10);
      expect(out.message).toContain("profils");
    }
  });
});

describe("L-103 — the screen actually uses it", () => {
  const src = readFileSync(
    path.join(process.cwd(), "src/features/auth/login-screen.tsx"),
    "utf8",
  );

  it("no longer swallows the failure", async () => {
    // The exact comment the audit quoted. If it comes back, so has the defect.
    expect(src).not.toContain("The empty state remains visible if the profile request fails");
    expect(src, "a bare catch is back on the profile load").not.toMatch(
      /\}\s*catch\s*\{\s*\n\s*\/\/[^\n]*\n\s*\}\s*finally/,
    );
  });

  it("renders the message and offers a retry", async () => {
    expect(src).toContain("loadError");
    expect(src).toContain("Réessayer");
    expect(src).toContain("describeProfilesFailure");
  });

  it("settles the two requests independently", async () => {
    // They were fetched in a `Promise.all` with `GET /api/seed`, so either
    // failure took both — an unrelated seed hiccup could empty the screen.
    expect(src).toContain("Promise.allSettled");
    expect(src, "one failure can still blank the other").not.toMatch(
      /Promise\.all\(\[\s*\n\s*api\.get<LoginProfile/,
    );
  });
});
