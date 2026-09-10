// R3.1 — which products the till's PRODUCT GRID shows.
//
// ── WHY THIS IS A MODULE AND NOT A `useMemo` ─────────────────────────────────
// It was one, inline in `pos-view.tsx`. It is out here because it is now a rule
// rather than a display detail: `showOnPos` decides whether a product can be
// rung up ON ITS OWN, and the thing that makes that rule mean anything is its
// counterpart — `combo-builder.ts`'s `slotProducts`, which decides whether a
// product may fill a menu slot and **deliberately does not consult
// `showOnPos`.**
//
// Those two functions are the whole of R3.1. A product that is hidden here and
// offered there is a food-only menu component: sellable inside a forfait, never
// alone. If somebody ever "tidies" the two into one predicate, the three boxes
// of L-69 stop being expressible and Box 15's food half appears on the till for
// a customer to order by itself. Neither file may lose its half without the
// other being reconsidered.
//
// This project's own repeated lesson is that an extracted rule proves only the
// rule and not that anything calls it, so `pos-grid.test.ts` also asserts that
// `pos-view.tsx` has no product filter of its own left.

import type { CategoryDto, ProductDto } from "@/types/api";

/**
 * May this product be rung up on its own?
 *
 * `active` is the catalogue's own withdrawal switch and has always gated the
 * grid. `showOnPos` is R3.1's addition and gates only this.
 *
 * `!== false` rather than `=== true`: a `ProductDto` deserialised from a client
 * that predates the column carries `undefined`, and the honest reading of that
 * is « this product appeared on the grid », which is what every product did
 * before the migration. The serialisers already default it, so this is the
 * second belt on the same braces.
 */
export function sellableAlone(product: ProductDto): boolean {
  return product.active && product.showOnPos !== false;
}

export type PosGridFilters = {
  /** `"all"`, or a category id. */
  categoryId: string;
  /** A child category id when one is selected, else null. */
  subCategoryId: string | null;
  /** The search box. Trimmed and lower-cased here, not by the caller. */
  search: string;
};

/**
 * The grid, in the order it is drawn.
 *
 * `sellableAlone` gates EVERY path into this list — the default view, a
 * category, a sub-category and the search box alike. That is the property that
 * matters: hidden is hidden from the whole grid, not merely from its default
 * view, so typing « box » cannot hand the cashier a food-only component to sell
 * by itself.
 *
 * It is applied first only because it is the cheapest filter. **That ordering
 * is NOT load-bearing** — moving it after the search gives the same set, and
 * the revert of exactly this line was run and correctly changed nothing. An
 * earlier draft of this comment claimed the ordering was the point; it was
 * wrong, and it is corrected here rather than propped up with a test that would
 * have asserted the same list twice.
 */
export function posGridProducts(
  products: ProductDto[],
  categories: CategoryDto[],
  filters: PosGridFilters,
): ProductDto[] {
  let list = products.filter(sellableAlone);

  if (filters.categoryId !== "all") {
    if (filters.subCategoryId) {
      list = list.filter((p) => p.categoryId === filters.subCategoryId);
    } else {
      const parent = categories.find((c) => c.id === filters.categoryId && !c.parentId);
      if (parent && parent.children && parent.children.length > 0) {
        const childIds = parent.children.map((ch) => ch.id);
        list = list.filter(
          (p) => p.categoryId === filters.categoryId || childIds.includes(p.categoryId),
        );
      } else {
        list = list.filter((p) => p.categoryId === filters.categoryId);
      }
    }
  }

  const q = filters.search.trim().toLowerCase();
  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));

  return list;
}
