import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { armChainKey, CHAIN_KEY, unacknowledgedSecrets } from "@/lib/services/secret-store";
import { audit } from "@/lib/services/audit";

// POST /api/setup/chain-key — arm `FISCAL_CHAIN_KEY`. This is R6.2, as a
// button instead of a hand-edited `.env`.
//
// ── THE ORDERING RULE IS THE WHOLE ROUTE ────────────────────────────────────
// DD-25: the key is armed once, on an EMPTY journal. A journal that holds
// unkeyed events and then acquires a key verifies under neither mode, and
// `fiscal.ts:111` throws `ChainKeyMisconfiguredError` at the next fiscal write
// — which is correct, and far too late: the till would stop taking money.
//
// `fiscal-key.ts` names an `assertChainKeyArmable` guard. **There is no such
// function** — the enforcement is `fiscal.ts:111`, at write time. So the check
// belongs here, and it is a count rather than an inference: zero
// `FiscalEvent` rows, or refuse.
export const CHAIN_KEY_NOT_EMPTY_REFUSAL =
  "Le journal fiscal contient déjà des écritures. La clé de chaînage ne peut être armée que " +
  "sur un journal vide : une chaîne mixte ne serait vérifiable ni dans un sens ni dans l'autre. " +
  "Faites la remise à zéro d'avant mise en service, puis armez la clé.";

export const POST = withAuth(
  async (_req, { user }) => {
    const events = await db.fiscalEvent.count();
    if (events > 0) {
      return NextResponse.json(
        { error: CHAIN_KEY_NOT_EMPTY_REFUSAL, events },
        { status: 409 },
      );
    }

    const { value, alreadyArmed } = armChainKey();
    if (alreadyArmed) {
      // L-119 (R9.4) — RETURNED ONLY WHILE IT IS STILL UNACKNOWLEDGED.
      //
      // This returned the live key on EVERY call, and audited only the first —
      // so every later read-back was untraced. `setup/secrets/route.ts`
      // documents the bound in the same feature: « After POST, this route
      // answers with nothing to show and cannot be used to read a key back. »
      // It could, through this sibling. The real bound was « the journal is
      // still empty », which is precisely the R6.2 → first-sale window.
      //
      // Not an error, and still not a second key: re-arming would orphan every
      // hash already written under the first one. The value is still put in
      // front of somebody who has not recorded it — that is the failure this
      // whole flow exists to prevent — but once they say they have, this route
      // stops being a way to read it.
      const pending = unacknowledgedSecrets().includes(CHAIN_KEY);
      await audit(
        "FISCAL_CHAIN_KEY_READ_BACK",
        "Secret",
        null,
        // Names only, never values — the rule this file already follows.
        { name: CHAIN_KEY, disclosed: pending },
        user.id,
      );
      return pending
        ? NextResponse.json({ value, alreadyArmed: true })
        : NextResponse.json({
            alreadyArmed: true,
            acknowledged: true,
            message:
              "La clé de chaînage est déjà armée et vous avez confirmé l'avoir enregistrée. " +
              "Elle n'est plus affichée ici. Elle se trouve dans le fichier " +
              "db/secrets.json de cette installation.",
          });
    }
    await audit("FISCAL_CHAIN_KEY_ARMED", "Secret", null, { name: CHAIN_KEY, events: 0 }, user.id);
    return NextResponse.json({ value, alreadyArmed: false });
  },
  { roles: ["SUPER_ADMIN"] },
);
