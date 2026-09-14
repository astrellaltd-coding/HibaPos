// L-22 (Batch 7.5) — zod speaks French, everywhere, once.
//
// THE FINDING. Validation errors reached the French UI as untranslated English
// zod messages. Reproduced verbatim before this file existed: `receiptWidth`
// out of range yielded **"Too big: expected number to be <=48"** — which is the
// exact string the operator saw as L-20, on the screen that saves every other
// setting. Measured 2026-09-07: **24 API routes** hand
// `parsed.error.issues[0]?.message` straight to the client, and `validation.ts`
// declares **89** zod fields of which only **19** carry a French message. So
// roughly seventy fields could answer a French operator in English.
//
// WHY A LOCALE AND NOT SEVENTY ANNOTATIONS. zod 4 ships the translation
// (`z.locales.fr()`), so one call fixes every schema in the codebase including
// the ones nobody has written yet. Annotating fields one at a time would fix
// the fields somebody remembered — the same shape of half-fix that L-21 and
// L-63 turned out to be.
//
// **Per-field messages still win.** zod prefers a message declared on the field
// over the locale, so the 19 French messages already in `validation.ts` are
// untouched and this cannot regress them — pinned by a test.
//
// WHY THIS IS ITS OWN MODULE, IMPORTED IN TWO PLACES. Neither place is enough
// alone, and that was measured rather than assumed:
//
//   * `src/lib/validation.ts` — covers the shared schemas and the client forms
//     it says it also serves. But **13 API routes declare inline schemas and do
//     not import `validation.ts`** (`step-up`, `orders`, `close-day`,
//     `close-month`, `close-year`, `reports/x`, `reports/z`, `tables`,
//     `tables/[id]`, `users/[id]`, `media`, `catalog/products/availability`,
//     `catalog/products/update-images`), so those would still have answered in
//     English.
//   * `src/instrumentation.ts` — runs once at server start, before any request,
//     so it covers those 13 and anything added later. But it is server-only.
//
// The call is a module side effect on purpose: an import is the only thing that
// runs in both a bundled route and a test file without a caller remembering to.
import { z } from "zod";

/**
 * L-150 (R9.10) — THE FRENCH IS FRENCH, NOT TYPESCRIPT WITH ACCENTS.
 *
 * `z.locales.fr()` translates the sentence and leaves the TYPE NAME and the
 * COMPARISON OPERATOR in it. Measured, on the shipped locale:
 *
 *   « Trop grand : **string** doit avoir **<=500** caractères »
 *   « Entrée invalide : **int** attendu, nombre reçu »
 *   « Entrée invalide : nombre attendu, **string** reçu »
 *   « Trop petit : **string** doit avoir **>=3** caractères »
 *
 * These reach a restaurant operator: 24 API routes hand
 * `parsed.error.issues[0]?.message` straight to the client, which is the whole
 * reason L-22 installed this locale in the first place. Half-translating is the
 * shape L-22 fixed; this is its remainder.
 *
 * **The locale is wrapped, not replaced.** Everything zod says stays as zod
 * says it, and four substitutions are applied to the result: the type names a
 * cashier has no use for, and the operators that belong in code. A message with
 * none of them is returned untouched, so a per-field French message — which zod
 * prefers over the locale, and which `validation.ts` declares 19 of — is
 * unaffected.
 */
/**
 * A word boundary that understands accents.
 *
 * `\b` IS ASCII-ONLY in JavaScript, and this code exists to produce French:
 * `/\bint\b/` matches the `int` in « intérieur », because `é` is not an ASCII
 * word character and so counts as a boundary. Measured — the substitution
 * produced « nombre entier**érieur** », in the one language this has to be
 * right in.
 */
const word = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${w}(?![\\p{L}\\p{N}_])`, "gu");

const TYPE_WORDS: [RegExp, string][] = [
  // Longest first: `bigint` must not be matched as `int`.
  [word("bigint"), "nombre entier"],
  [word("int"), "nombre entier"],
  [word("string"), "texte"],
  [word("number"), "nombre"],
  [word("boolean"), "booléen"],
  [word("date"), "date"],
  [word("array"), "liste"],
  [word("object"), "objet"],
  [word("null"), "vide"],
  [word("undefined"), "absent"],
];

/** « <=500 » → « au plus 500 ». The operator is not text an operator reads. */
function spellOperators(message: string): string {
  return message
    .replace(/<=\s*/g, "au plus ")
    .replace(/>=\s*/g, "au moins ")
    .replace(/(?<![<>=!])<\s*(?=\d)/g, "moins de ")
    .replace(/(?<![<>=!])>\s*(?=\d)/g, "plus de ");
}

export function humaniseZodMessage(message: string): string {
  let out = spellOperators(message);
  for (const [pattern, word] of TYPE_WORDS) out = out.replace(pattern, word);
  return out;
}

const french = z.locales.fr();

z.config({
  ...french,
  localeError: (issue) => {
    const base = french.localeError?.(issue);
    const message = typeof base === "string" ? base : (base as { message?: string })?.message;
    if (typeof message !== "string") return base as never;
    return humaniseZodMessage(message) as never;
  },
});

/** Exported so an importer has something to reference — a bare side-effect
 *  import is easy to "tidy away" as unused. Its value is not interesting. */
export const ZOD_LOCALE = "fr";
