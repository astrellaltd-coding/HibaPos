// Two account-safety rules that used to live inline in their routes —
// M-23 and C-18, Batch 4.3.
//
// They are here rather than in the handlers for the reason Batch 4.1 moved
// the approval lockout out of `/api/auth/approve`: a rule expressed inside a
// route can only be tested by standing up a request, and `withAuth` →
// `getSession()` → `cookies()` throws outside one. Pure functions over plain
// inputs can be asserted directly, which is what the plan's validation for
// this batch asks for.

// ---------------------------------------------------------------------------
// M-23 — a caller may not rewrite their own credentials
// ---------------------------------------------------------------------------

/** A refusal to return, or null to proceed. */
export type Refusal = { error: string; status: number } | null;

export const SELF_PIN_REFUSAL =
  "Vous ne pouvez pas modifier votre propre code PIN. Demandez au super administrateur.";
export const SELF_ACTIVE_REFUSAL =
  "Vous ne pouvez pas modifier l'état de votre propre compte.";
export const SELF_DEACTIVATE_REFUSAL =
  "Vous ne pouvez pas désactiver votre propre compte.";

/**
 * Decide whether a `PUT /api/users/[id]` may proceed.
 *
 * The hole (M-23): the route admitted any caller editing their own row —
 * `user.id === params.id` — and then applied `pin` and `active` from the body
 * with no further check. Anyone standing at an unlocked till could therefore
 * change the signed-in cashier's PIN permanently, or switch their account
 * off, without knowing the current PIN and with no manager in the flow. No
 * screen was needed; the route answers a plain HTTP request.
 *
 * The finding's own direction was "require the current PIN", which presumes a
 * self-service PIN-change flow. There is none in this application: the only
 * PIN-changing surface is the `Utilisateurs` view, gated
 * `roles: ["SUPER_ADMIN"]` at `nav-config.ts:49`, so a cashier or a manager
 * cannot change their own PIN from anywhere. The operator's decision of
 * 2026-09-04 is to keep it that way for now, so the shape that fits is a flat
 * refusal: it closes the hole, needs no new screen, and leaves the
 * `Utilisateurs` view working exactly as it does — a SUPER_ADMIN reaching
 * this route is administering an account, not self-servicing one.
 *
 * Self-deactivation is refused for **everyone**, super administrator
 * included. The DELETE route already refuses self-deletion and refuses to
 * drop the last active super administrator; this is the same lockout through
 * another door.
 */
export function refuseUserSelfEdit(input: {
  callerId: string;
  callerRole: string;
  targetId: string;
  /** Presence is what matters, not the value — `undefined` means "not sent". */
  pin: unknown;
  active: unknown;
}): Refusal {
  const isSelfEdit = input.callerId === input.targetId;
  if (!isSelfEdit) return null;

  if (input.callerRole !== "SUPER_ADMIN") {
    if (input.pin !== undefined) return { error: SELF_PIN_REFUSAL, status: 403 };
    if (input.active !== undefined) return { error: SELF_ACTIVE_REFUSAL, status: 403 };
  }
  if (input.active === false) {
    return { error: SELF_DEACTIVATE_REFUSAL, status: 400 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// C-18 — the unauthenticated bootstrap belongs to a fresh install only
// ---------------------------------------------------------------------------

/** The counters `POST /api/seed` inspects. Null when the row does not exist. */
export type TradingFingerprint = {
  counter: {
    lastReceiptNumber: number;
    lastShiftNumber: number;
    lastZReportNumber: number;
    lastFiscalEventSequence: number;
  } | null;
  orderCount: number;
  eventCount: number;
};

/**
 * Has this database ever traded?
 *
 * `POST /api/seed` is unauthenticated while `User` is empty, and creates a
 * SUPER_ADMIN with the published default PIN. Its only guard was that user
 * count. But `scripts/seed-users.ts` and `scripts/seed-category-options.ts`
 * open with unguarded `deleteMany({})` calls (C-17), so emptying `User` is one
 * careless script away — and at that moment the route would hand a brand-new
 * super administrator to whoever asked first.
 *
 * A database that has traded is not a fresh install, whatever its user count
 * says. Any advanced fiscal counter, any order and any journal entry is proof
 * of prior life, and a first boot has none of them. The operator's way back
 * from a wipe is `bun run db:seed` at a shell on the machine — a deliberate
 * act by someone with access, rather than a button anyone can press.
 */
export function hasTraded(f: TradingFingerprint): boolean {
  if (f.orderCount > 0 || f.eventCount > 0) return true;
  const c = f.counter;
  if (c == null) return false;
  return (
    c.lastReceiptNumber > 0 ||
    c.lastShiftNumber > 0 ||
    c.lastZReportNumber > 0 ||
    c.lastFiscalEventSequence > 0
  );
}

export const NOT_FRESH_REFUSAL =
  "Base non vierge : des données existent déjà. L'initialisation automatique est refusée. Contactez l'administrateur.";
