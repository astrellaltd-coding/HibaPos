// DD-25 (Batch 3.9) — the secret that keys the fiscal chain.
//
// WHY THIS EXISTS, and the record should be able to say it plainly: **nothing
// in law requires it.** BOFiP § 60 states « Le législateur n'a pas défini de
// cahier des charges, ni de solution technique », and § 140 names « une
// technique de chaînage des enregistrements **ou** de signature électronique »
// as alternatives rather than as a pair. HibaPOS chains, so the requirement is
// met on the text. What the operator was shown, and chose to act on, is the gap
// underneath § 120's demand to *demonstrate* that data has not been altered:
// the recipe is readable in the source, so an administrator on the till could
// rewrite a sale AND recompute every fingerprint after it, and
// `/api/fiscal/verify` would still report `ok`. The person able to do that is
// the assujetti, who is precisely who the regime exists to constrain.
//
// ── THE HONEST LIMIT, which belongs in the attestation and not in a footnote ──
// On a single till where the operator is administrator, a secret in a file on
// that machine is findable by anyone who looks. This defeats a casual edit; it
// does not defeat a determined one. **The half that actually works is the
// printed integrity code** on the day-close slip (Batch 3.8's ticket), because
// paper the operator has filed is outside the database a forger controls.
//
// ── THE RISK THAT COMES WITH IT ──────────────────────────────────────────────
// **Lose this key and the journal can no longer be verified at all.** Every
// hash was computed with it; without it nothing recomputes, and the chain that
// exists to prove integrity proves nothing. It must be backed up with the same
// care as `BACKUP_ENCRYPTION_KEY`, and it must NOT be stored only on the till
// whose data it protects. The LNE referential requires key-management
// documentation for exactly this reason.
//
// ── WHY IT IS OPTIONAL ───────────────────────────────────────────────────────
// Unlike `SESSION_SECRET`, which the app refuses to start without, this is
// **unset by default and that is a supported state**. The journal in existence
// today was written unkeyed and must keep verifying. The key is ARMED at Batch
// 8.0's pre-go-live reset, at the one moment the journal is empty, so no mixed
// history can ever exist. `assertChainKeyArmable` is the guard that enforces
// that ordering; arming it against a journal that already holds unkeyed events
// is refused, loudly, rather than producing a chain nobody can check.

/** The configured fiscal chain key, or `null` when the chain is unkeyed. */
export function fiscalChainKey(): string | null {
  const raw = process.env.FISCAL_CHAIN_KEY;
  if (raw === undefined) return null;
  const key = raw.trim();
  if (key.length === 0) return null;
  if (key.length < 32) {
    // Deliberately names the variable and not the value. A secret in an error
    // message is a secret in a log (Batch 7.3's rule).
    throw new Error(
      "FISCAL_CHAIN_KEY must be at least 32 characters long. Generate with: openssl rand -hex 32",
    );
  }
  return key;
}

/** True when the chain is keyed. Reads the environment every call on purpose:
 *  a module-level constant would freeze the answer at import time, and the
 *  tests need to arm and disarm it around a single process. */
export function isChainKeyed(): boolean {
  return fiscalChainKey() !== null;
}

/** The message the guard raises, kept here so the test asserts the real text
 *  rather than a copy of it. */
export const CHAIN_KEY_MIXED_MESSAGE =
  "FISCAL_CHAIN_KEY est configurée alors que le journal fiscal existant a été écrit sans clé. " +
  "Une chaîne mixte ne serait vérifiable ni dans un sens ni dans l'autre. " +
  "La clé ne peut être armée que sur un journal vide (remise à zéro d'avant mise en service, lot 8.0).";

/**
 * A typed error, so the API layer can answer with the message instead of a bare
 * 500 — and so that answering is not a string match on French prose.
 *
 * **Found by the walkthrough, not by the tests.** The guard fired correctly and
 * the message reached the server log, but `POST /api/fiscal/drawer` answered
 * `500` with an EMPTY BODY: the operator saw nothing at all. "Refused" is not
 * "refused loudly", and a till that stops taking money without saying why is
 * the worst version of this. Every route that appends a fiscal event is
 * affected, so it is handled once in `withAuth` / `withAuthParams`, where
 * `ScryptBusyError` already sets the precedent.
 */
export class ChainKeyMisconfiguredError extends Error {
  constructor(message: string = CHAIN_KEY_MIXED_MESSAGE) {
    super(message);
    this.name = "ChainKeyMisconfiguredError";
  }
}

export function isChainKeyMisconfigured(e: unknown): e is ChainKeyMisconfiguredError {
  return e instanceof ChainKeyMisconfiguredError;
}

/** What `/api/fiscal/verify` says when the chain does not verify under the
 *  configured mode but would verify under the other one. That is a
 *  misconfiguration, not tampering, and must not be reported as tampering. */
export const CHAIN_KEY_DIAGNOSIS_KEYED_JOURNAL =
  "Le journal a été écrit AVEC une clé et aucune clé n'est configurée ici : " +
  "restaurez FISCAL_CHAIN_KEY. Sans elle le journal ne peut pas être vérifié.";
export const CHAIN_KEY_DIAGNOSIS_UNKEYED_JOURNAL =
  "Le journal a été écrit SANS clé et une clé est configurée ici : " +
  "retirez FISCAL_CHAIN_KEY, ou armez-la sur un journal vide (lot 8.0).";
