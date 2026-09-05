// Cash movements — entrée / sortie de caisse (M-05, DD-12, Batch 5.5).
//
// THE FINDING. `expectedCash` was `openingFloat + cash − cashRefunds`, and there
// was no model of any kind for money moving in or out of the drawer for any
// other reason. So a 200 € supplier payment produced a phantom 200 € shortfall
// at the close, every time — which trains staff to ignore the variance figure
// and defeats the point of C-02's correction. On a till where EVERY payment
// ever taken is cash, that is not a corner case.
//
// THE ANSWER (operator, 2026-09-05, DD-12). Four categories, fixed rather than
// free text, because prose reasons cannot be totalled: *approvisionnement*
// (float top-up), *prélèvement* (cash to the safe), *dépense* (supplier or
// petty cash) and *erreur de caisse* (a counting correction).
//
// THE APPROVAL RULE (operator, 2026-09-05, the gap DD-12 left). A step-up PIN
// for money LEAVING the drawer only. The rule is the DIRECTION of the money and
// not the category name, so a negative *erreur de caisse* is gated and a
// positive one is not.
//
// A COST THAT IS INHERITED, NOT CHOSEN. Batch 4.4c put `/api/auth/approve` and
// `/api/auth/step-up` on ONE shared five-attempt counter, by operator decision.
// A cash-out PIN spends from that same budget, so five fumbled payout PINs lock
// REFUNDS and DISCOUNTS for fifteen minutes. A separate counter was considered
// and NOT built: it would reopen 4.4c's decision, which is not this batch's to
// reopen. Recorded so the operator can revisit it deliberately.

import { db } from "@/lib/db";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { TX_FISCAL, isTransactionBusyError } from "@/lib/tx-options";
import type { CashMovementType } from "@prisma/client";

/** In-transaction validation failure carrying the HTTP status the route returns. */
export class CashMovementError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CashMovementError";
    this.status = status;
  }
}

/** The four, in the order the screen offers them. */
export const CASH_MOVEMENT_CATEGORIES = [
  "APPROVISIONNEMENT",
  "PRELEVEMENT",
  "DEPENSE",
  "ERREUR_DE_CAISSE",
] as const;

/** What the operator reads. The enum values are stable; these are not. */
export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  APPROVISIONNEMENT: "Approvisionnement",
  PRELEVEMENT: "Prélèvement",
  DEPENSE: "Dépense",
  ERREUR_DE_CAISSE: "Erreur de caisse",
};

/**
 * Which sign a category is allowed to carry.
 *
 * `null` means either — and `ERREUR_DE_CAISSE` is the only one, because a
 * counting correction genuinely goes both ways. Everything else has exactly one
 * honest direction, and a row that disagreed with its own category would make
 * every per-category total meaningless — which is the one thing DD-12 chose a
 * fixed list to protect.
 */
const REQUIRED_SIGN: Record<CashMovementType, 1 | -1 | null> = {
  APPROVISIONNEMENT: 1,
  PRELEVEMENT: -1,
  DEPENSE: -1,
  ERREUR_DE_CAISSE: null,
};

/**
 * Does this movement need the operator's PIN?
 *
 * The direction of the money, not the category name (operator, 2026-09-05).
 * Exported and pure so the route, the client and the tests all ask the same
 * question — the client needs it to know whether to raise the PIN pad at all,
 * and a client that guessed differently from the server would either prompt for
 * nothing or be refused after the operator had typed.
 */
export function requiresStepUp(amountCents: number): boolean {
  return amountCents < 0;
}

export const NO_OPEN_SHIFT_FOR_MOVEMENT_MESSAGE =
  "Aucune caisse ouverte. Ouvrez une caisse avant d'enregistrer un mouvement.";

export const ZERO_AMOUNT_MESSAGE = "Le montant doit être différent de zéro.";

export const WRONG_SIGN_MESSAGES: Record<string, string> = {
  APPROVISIONNEMENT: "Un approvisionnement ajoute de l'argent : le montant doit être positif.",
  PRELEVEMENT: "Un prélèvement retire de l'argent : le montant doit être négatif.",
  DEPENSE: "Une dépense retire de l'argent : le montant doit être négatif.",
};

/** Shown when a close is holding the database. Nothing was written. */
export const MOVEMENT_BUSY_MESSAGE =
  "La caisse est occupée (clôture en cours). Réessayez dans quelques secondes.";

/**
 * Does this amount agree with the direction its category means?
 *
 * Returns the French refusal, or `null` when the pair is legal. Pure and
 * exported so the ROUTE can refuse before it consumes the operator's single-use
 * PIN token — found in this batch's walkthrough: a negative `APPROVISIONNEMENT`
 * needs a PIN under the direction rule and can never be recorded whatever the
 * PIN says, so without this the caller is told "Confirmation par code PIN
 * requise", supplies one, and only then learns the real problem. That is L-41's
 * shape, at the site whose open-till check was already ordered to avoid it.
 *
 * `recordCashMovement` keeps its own copy of the check: this one exists to give
 * a better message sooner, not to be the guarantee.
 */
export function categorySignRefusal(
  category: CashMovementType,
  amount: number,
): string | null {
  if (!Number.isInteger(amount) || amount === 0) return ZERO_AMOUNT_MESSAGE;
  const required = REQUIRED_SIGN[category];
  if (required !== null && Math.sign(amount) !== required) {
    return WRONG_SIGN_MESSAGES[category] ?? ZERO_AMOUNT_MESSAGE;
  }
  return null;
}

export type CashMovementInput = {
  category: CashMovementType;
  /** SIGNED cents: positive into the drawer, negative out of it. */
  amount: number;
  reason: string;
  cashierId: string;
  /** The step-up approver, for an outgoing movement. Null when none was needed. */
  approverId: string | null;
  factice: boolean;
};

export type CashMovementResult = {
  id: string;
  shiftId: string;
  amount: number;
  fiscalEventId: string;
};

/**
 * Record one movement, inside a transaction.
 *
 * The till is resolved HERE and not by the caller, for the reason Batch 4.7
 * established at three other sites and Batch 5.3 at a fourth: a read outside a
 * transaction does not wait for one, so a Z close committing beside this
 * request could seal a shift a movement is about to land in — and a sealed Z
 * cannot be corrected. `orderBy` matches `processRefund`, `/api/shifts/summary`
 * and `GET /api/reports/x`, so every one of them names the same till.
 */
export async function recordCashMovement(
  input: CashMovementInput,
): Promise<CashMovementResult> {
  const refusal = categorySignRefusal(input.category, input.amount);
  if (refusal) throw new CashMovementError(refusal, 400);

  return db
    .$transaction(async (tx) => {
      const shift = await tx.shift.findFirst({
        where: { status: "OPEN" },
        orderBy: { openedAt: "desc" },
        select: { id: true },
      });
      if (!shift) {
        throw new CashMovementError(NO_OPEN_SHIFT_FOR_MOVEMENT_MESSAGE, 409);
      }

      const movement = await tx.cashMovement.create({
        data: {
          shiftId: shift.id,
          category: input.category,
          amount: input.amount,
          reason: input.reason,
          cashierId: input.cashierId,
          approvedById: input.approverId,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.cashierId,
          action: "CASH_MOVEMENT_RECORDED",
          entity: "CashMovement",
          entityId: movement.id,
          details: JSON.stringify({
            category: input.category,
            amount: input.amount,
            reason: input.reason,
            approvedById: input.approverId,
            shiftId: shift.id,
          }),
        },
      });

      // --- Fiscal journal (JFP) — mouvement de caisse tracé ---
      //
      // A movement is NOT a sale: it touches no revenue, no VAT and not the
      // perpetual `GrandTotal`. What it touches is the drawer, and the drawer
      // is what the Z report reconciles — so it is journalled for the same
      // reason a refund is, and `addRefundToGrandTotal` has no counterpart here
      // on purpose.
      const ev = await appendFiscalEvent(tx, {
        type: "MOUVEMENT_CAISSE",
        userId: input.cashierId,
        factice: input.factice,
        shiftId: shift.id,
        cashMovementId: movement.id,
        data: {
          category: input.category,
          amount: input.amount,
          reason: input.reason,
          cashierId: input.cashierId,
          approverId: input.approverId,
          shiftId: shift.id,
        },
      });
      await tx.cashMovement.update({
        where: { id: movement.id },
        data: { fiscalEventId: ev.id },
      });

      return {
        id: movement.id,
        shiftId: shift.id,
        amount: movement.amount,
        fiscalEventId: ev.id,
      };
    }, TX_FISCAL)
    .catch((e) => {
      if (isTransactionBusyError(e)) {
        throw new CashMovementError(MOVEMENT_BUSY_MESSAGE, 503);
      }
      throw e;
    });
}
