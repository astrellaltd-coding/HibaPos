// The floor under FiscalCounter — L-38, Batch 4.5.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// `scripts/fix-fiscal-counter.ts` exists to repair a counter that has fallen
// BEHIND the tables: it reads `max(number)` from orders, shifts and Z reports
// and writes those values into the singleton. Written that way it is also a
// rewind. Run after anything that removes rows — a bad restore, or the
// `port-real-data.ts` wipe this batch deleted — it sets the counters DOWN, to
// 0 if the tables are empty, and the next genuine sale then prints a receipt
// number already sealed into the fiscal journal.
//
// `init-fiscal-counter.ts` has the same shape at one remove: it creates the
// singleton at 0. That is correct on a fresh database and wrong on any
// database whose row went missing while its tables kept their history.
//
// THE RULE
// --------
// A counter may be RAISED and may be left alone. It may never be LOWERED.
// That keeps the whole repair capability the scripts exist for — a counter
// that is too low is the condition they repair — and removes the only way
// they could damage the journal. L-38's direction says exactly this: refuse
// to lower, do not remove the repair.
//
// WHY IT REFUSES RATHER THAN CLAMPS
// ---------------------------------
// Silently writing `max(current, proposed)` would leave the operator
// believing a repair happened when it did not. A counter disagreeing with
// its tables in the *downward* direction means rows were destroyed, which is
// a data-loss incident and not something a repair script should paper over.
// So the script stops and says which field, with both numbers.
//
// WHY THIS IS A MODULE AND NOT AN `if` IN THE SCRIPT
// -------------------------------------------------
// `bun test src` globs `src/` only, so a rule living in `scripts/` cannot be
// tested at all — and this is a rule about the integrity of a sealed fiscal
// journal. Same reasoning as `account-policy.ts` (Batch 4.3): a pure function
// over plain inputs can be asserted directly. It imports nothing, so the
// scripts can pull it in without dragging Next.js into a CLI context.

/**
 * The four counters in the singleton.
 *
 * `lastFiscalEventSequence` is here although L-38 names only the other
 * three — see `counterRegressions` for why it has to be.
 */
export type FiscalCounterFields = {
  lastReceiptNumber: number;
  lastShiftNumber: number;
  lastZReportNumber: number;
  lastFiscalEventSequence: number;
};

export const FISCAL_COUNTER_FIELDS: readonly (keyof FiscalCounterFields)[] = [
  "lastReceiptNumber",
  "lastShiftNumber",
  "lastZReportNumber",
  "lastFiscalEventSequence",
] as const;

/** French labels for the operator-facing refusal. */
const FIELD_LABELS: Record<keyof FiscalCounterFields, string> = {
  lastReceiptNumber: "numéro de ticket",
  lastShiftNumber: "numéro de service",
  lastZReportNumber: "numéro de rapport Z",
  lastFiscalEventSequence: "séquence du journal fiscal",
};

/** One counter the proposed write would move backwards. */
export type CounterRegression = {
  field: keyof FiscalCounterFields;
  current: number;
  proposed: number;
};

/**
 * Every field a proposed write would LOWER.
 *
 * An empty array means the write only raises counters or leaves them equal,
 * and is safe. A non-empty array must stop the write.
 *
 * `proposed` is partial because the repair scripts write subsets:
 * `fix-fiscal-counter.ts` touches three of the four fields. A field the
 * caller does not propose is not compared — omitting a field leaves it
 * alone, which cannot lower it.
 *
 * THE FOURTH FIELD. L-38 names three counters, because those are the three
 * `fix-fiscal-counter.ts` writes in its `update:` branch. Its `create:`
 * branch is the one that matters here: both scripts omit
 * `lastFiscalEventSequence` when creating the row, so Prisma's `@default(0)`
 * applies. On a database that has lost its singleton but kept its
 * `FiscalEvent` rows, creating the row therefore rewinds the journal
 * sequence to 0 and the next event reuses a sequence number already inside
 * the hash chain — the same defect as the three named ones, on the path
 * L-38's own last sentence points at ("`init-fiscal-counter.ts` upserts the
 * singleton at 0 and needs the same floor"). Guarding three of four would
 * have left it.
 */
export function counterRegressions(
  current: FiscalCounterFields,
  proposed: Partial<FiscalCounterFields>,
): CounterRegression[] {
  const regressions: CounterRegression[] = [];
  for (const field of FISCAL_COUNTER_FIELDS) {
    const next = proposed[field];
    if (next === undefined) continue;
    if (next < current[field]) {
      regressions.push({ field, current: current[field], proposed: next });
    }
  }
  return regressions;
}

/**
 * The operator-facing refusal.
 *
 * Names every offending field with both numbers, and says what the condition
 * means — a counter above its tables is the signature of destroyed rows, and
 * that is worth more of the operator's attention than the failed repair.
 *
 * Throws on an empty list rather than composing a refusal out of nothing.
 * Two reasons. A refusal message with no fields in it would tell an operator
 * their repair was rejected without saying what for; and while validating
 * this batch, the test asserting the guidance text PASSED against a
 * deliberately disabled floor, because the header and trailer are present
 * whether or not any field is. Making the empty case impossible is what
 * stops that test from being able to pass vacuously.
 */
export function describeCounterRegressions(regressions: CounterRegression[]): string {
  if (regressions.length === 0) {
    throw new Error(
      "describeCounterRegressions called with no regressions — a refusal must name what it refuses.",
    );
  }
  const lines = regressions.map(
    (r) =>
      `  - ${FIELD_LABELS[r.field]} (${r.field}) : ${r.current} -> ${r.proposed}`,
  );
  return [
    "REFUS : cette réparation ferait RECULER le compteur fiscal.",
    "",
    ...lines,
    "",
    "Un compteur fiscal ne peut jamais être abaissé : le prochain ticket",
    "porterait un numéro déjà scellé dans le journal. Un compteur SUPÉRIEUR",
    "à ses tables signifie que des lignes ont été détruites — c'est cela",
    "qu'il faut examiner, pas le compteur.",
    "",
    "Restaurez une sauvegarde (scripts/decrypt-backup.ts) plutôt que",
    "d'aligner le compteur sur des tables amputées.",
  ].join("\n");
}
