// M-21 (2026-09-05), Batch 5.7d — what a failed `/api/auth/me` means.
//
// No imports beyond the DTO type, so the store can use it and a test can run
// it without a browser. Same shape as `discount-policy.ts` and
// `tender-policy.ts`.
//
// ── THE FINDING, AND WHY ITS ROW UNDERSTATED IT ──────────────────────────────
// `app-store.ts`'s `fetchUser` caught EVERY failure to `next = null`:
//
//     try { next = (await api.get(...)).user } catch { next = null }
//
// The audit recorded that as "ejects the cashier mid-service". Measured in the
// 5.7 split, it is worse: that `null` reaches
// `operatorChanged(someone, null) → true → clearForOperatorChange()`, so a
// transient network blip **destroys the in-progress sale** — the exact payload
// Batch 5.4 (C-23) built cart persistence to protect. Losing the session is an
// annoyance; losing the basket mid-service is money and a queue.
//
// ── THREE CASES, NOT TWO ─────────────────────────────────────────────────────
// The old code had one branch for "anything went wrong". There are three
// materially different things, and only two of them end a session:
//
//   signed-in    200 with a user           → adopt it (the identity guard then
//                                            decides whether the cart clears)
//   signed-out   200 with `{user: null}`,  → the SERVER says there is no
//                or 401 / 403                session. End it, clear the cart.
//   unreachable  network error, timeout,   → we do not know. Keep whoever was
//                5xx, anything else          there and keep their cart.
//
// "Unreachable" deliberately fails towards KEEPING the session. The screen is
// already locked behind an auto-lock (`use-auto-lock.ts`) and every privileged
// action is re-checked server-side, so a stale client-side `user` cannot
// authorise anything on its own — while a wrongly-cleared cart is unrecoverable
// work.

import type { UserDto } from "@/types/api";

export type SessionProbe =
  | { kind: "signed-in"; user: UserDto }
  | { kind: "signed-out" }
  | { kind: "unreachable" };

/** What a thrown error from `GET /api/auth/me` means. */
export function classifyMeError(err: unknown): SessionProbe {
  // `ApiError` carries the HTTP status; a network failure throws a TypeError
  // from `fetch` and has none. Read structurally rather than by `instanceof`,
  // so this stays free of the api-client import and testable in isolation.
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number" && (status === 401 || status === 403)) {
    return { kind: "signed-out" };
  }
  // Everything else — no status at all (network/DNS/offline), a 5xx, a proxy
  // error page, a parse failure — is "we could not ask", not "you are out".
  return { kind: "unreachable" };
}

/** What a successful body means. `{ user: null }` is the server stating there
 *  is no session, which is a real sign-out and not an ambiguity. */
export function classifyMeBody(body: { user: UserDto | null } | null | undefined): SessionProbe {
  const user = body?.user ?? null;
  return user ? { kind: "signed-in", user } : { kind: "signed-out" };
}

export type SessionOutcome = {
  /** The user the store should hold afterwards. */
  user: UserDto | null;
  /** Whether the cart must be cleared, i.e. the operator really changed. */
  clearCart: boolean;
  /** Whether this probe settled the question at all — false means "keep what
   *  you had", which is what makes a blip survivable. */
  settled: boolean;
};

/**
 * Fold a probe into what the store should do.
 *
 * `operatorChangedFn` is injected rather than imported so this module stays
 * free of the store (which imports the cart, which imports zustand). The store
 * passes its own `operatorChanged`, so there is exactly one identity rule.
 */
export function nextSession(
  previous: UserDto | null,
  probe: SessionProbe,
  operatorChangedFn: (prev: UserDto | null, next: UserDto | null) => boolean,
): SessionOutcome {
  if (probe.kind === "unreachable") {
    // THE FIX. Keep the operator and keep their basket. `settled: false` is
    // what tells the caller not to touch either.
    return { user: previous, clearCart: false, settled: false };
  }
  const next = probe.kind === "signed-in" ? probe.user : null;
  return { user: next, clearCart: operatorChangedFn(previous, next), settled: true };
}
