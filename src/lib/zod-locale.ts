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

z.config(z.locales.fr());

/** Exported so an importer has something to reference — a bare side-effect
 *  import is easy to "tidy away" as unused. Its value is not interesting. */
export const ZOD_LOCALE = "fr";
