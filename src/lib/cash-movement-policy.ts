// DD-12's cash-movement rules — the pure half, with no database in its graph.
//
// L-160 (R10.1) — WHY THIS FILE EXISTS.
//
// `cash-movement-dialog.tsx` is `"use client"` and imported two pure values
// from `services/cash-movement.ts`, whose module graph is `@/lib/db` →
// `@prisma/client`. The result, confirmed in the built artifact by a reverse
// import graph over 104 modules: a **501.7 KB client chunk** — the largest, and
// 19 % of 2.68 MB of client JS — containing `db.ts` compiled for the browser.
//
// It does not crash and **no secret leaks**. What it costs is a till loading
// half a megabyte of Prisma to draw a dialog.
//
// **THE FIX IS ON THIS SIDE, NEVER IN `db.ts`.** That module's top-level
// `globalThis` assignment is an invariant — it is what stops two PrismaClients
// existing, which is L-61's cause — and it is also what makes the module
// un-tree-shakeable. Moving the constants is the only move that does not touch
// it.
//
// R9.7 made this worse before it made it better: L-155 pointed the dialog at
// the exported category list to stop DD-12's rule living in three hand-copied
// places, which was right, and added a second import across this boundary,
// which was not. Both are resolved here — one copy of the rule, and no database
// on the client.
//
// **Nothing in this file may import `@/lib/db`, `@prisma/client`, or any
// service that does.** `client-bundle.test.ts` asserts it.

/**
 * The categories DD-12 fixed, in the order the screen offers them.
 *
 * A FIXED list because prose reasons cannot be totalled. The enum in
 * `schema.prisma` is the list; this is its order.
 */
export const CASH_MOVEMENT_CATEGORIES = [
  "APPROVISIONNEMENT",
  "PRELEVEMENT",
  "DEPENSE",
  "ERREUR_DE_CAISSE",
] as const;

export type CashMovementCategory = (typeof CASH_MOVEMENT_CATEGORIES)[number];

/** What the operator reads. The enum values are stable; these are not. */
export const CASH_MOVEMENT_LABELS: Record<CashMovementCategory, string> = {
  APPROVISIONNEMENT: "Approvisionnement",
  PRELEVEMENT: "Prélèvement",
  DEPENSE: "Dépense",
  ERREUR_DE_CAISSE: "Erreur de caisse",
};

/**
 * Which way each category moves the money — L-155 (R9.7), moved here by L-160.
 *
 * The operator types a POSITIVE amount and picks a reason; the sign is the
 * category's, not something to get right by hand. `ERREUR_DE_CAISSE` is the one
 * that genuinely goes both ways, so it — and only it — offers the choice.
 *
 * ONE COPY. This existed in three hand-copied places until R9.7: a constant a
 * test pinned and the screen ignored, the screen's own local map, and the
 * service's private `REQUIRED_SIGN`. The server refuses a wrong sign, so a
 * screen that disagreed would offer a movement the API rejects.
 */
export const CASH_MOVEMENT_DIRECTION: Record<CashMovementCategory, 1 | -1 | null> = {
  APPROVISIONNEMENT: 1,
  PRELEVEMENT: -1,
  DEPENSE: -1,
  ERREUR_DE_CAISSE: null,
};

/**
 * Does this movement need the operator's PIN?
 *
 * The direction of the money, not the category name (operator, 2026-09-05).
 * Pure, so the route, the client and the tests all ask the same question — the
 * client needs it to know whether to raise the PIN pad at all, and a client
 * that guessed differently from the server would either prompt for nothing or
 * be refused after the operator had typed.
 */
export function requiresStepUp(amountCents: number): boolean {
  return amountCents < 0;
}

export const NO_OPEN_SHIFT_FOR_MOVEMENT_MESSAGE =
  "Aucune caisse ouverte. Ouvrez une caisse avant d'enregistrer un mouvement.";

export const ZERO_AMOUNT_MESSAGE = "Le montant doit être différent de zéro.";
