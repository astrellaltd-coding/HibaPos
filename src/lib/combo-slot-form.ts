// Editing a menu's composition in the catalogue screen — the decisions
// (Batch 5.10).
//
// Batch 5.9 built the model, the allocation, the till flow and the validation,
// and left no way to ENTER a menu: the API accepted `isCombo` and `comboSlots`
// and the product form never sent them, so the six menus could only be created
// by hand with `curl`. This is that gap.
//
// EVERYTHING DECIDABLE LIVES HERE, not in the component. Batch 5.7c's M-19 was
// a mapping inside `product-options-dialog-v2.tsx` that no test could reach,
// and Batch 5.9 found the same shape again one layer out, in
// `payment-dialog.tsx`. Twice is a rule: a form's mapping is extracted, and the
// component renders what this returns.
//
// THE FORM AND THE SERVER SHARE ONE VALIDATOR. `slotFormErrors` builds the
// payload and hands it to `validateComboShape` — the very function
// `POST/PUT /api/catalog/products` runs — so the sentence the operator reads
// before saving is the sentence the server would have answered with. A second
// implementation here is how the two come to disagree about what a valid menu
// is.

import type { CategoryDto, ProductDto } from "@/types/api";
import { validateComboShape } from "@/lib/validation";

/** One slot, as the form holds it. Surcharges are EUROS here and cents in the
 *  payload, which is the same convention the price fields in this form use. */
export type SlotForm = {
  name: string;
  quantity: number;
  sourceCategoryId: string;
  /** Empty means « the whole source-category tree, no surcharge ». */
  choices: { productId: string; surcharge: number }[];
  /** A group the MENU governs: answered with a choice, or asked by nobody. */
  optionRules: { categoryOptionGroupId: string; categoryOptionChoiceId: string | null }[];
};

export type SlotPayload = {
  name: string;
  quantity: number;
  sortOrder: number;
  sourceCategoryId: string;
  choices: { productId: string; surcharge: number; sortOrder: number }[];
  optionRules: { categoryOptionGroupId: string; categoryOptionChoiceId: string | null }[];
};

/** A blank slot, for the « add a component » button. */
export function emptySlot(sourceCategoryId = ""): SlotForm {
  return { name: "", quantity: 1, sourceCategoryId, choices: [], optionRules: [] };
}

/** The stored menu, as the form should show it. */
export function slotsFromProduct(product: ProductDto | null): SlotForm[] {
  return [...(product?.comboSlots ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      name: s.name,
      quantity: s.quantity,
      sourceCategoryId: s.sourceCategoryId,
      choices: [...s.choices]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({ productId: c.productId, surcharge: c.surcharge / 100 })),
      optionRules: s.optionRules.map((r) => ({ ...r })),
    }));
}

/**
 * The form, as the API takes it.
 *
 * A slot with no name is DROPPED rather than sent, because the form always
 * carries one blank row for the operator to type into and sending it would be
 * refused for a missing name — an error about a row they had not filled in yet.
 * `sortOrder` is the position, so reordering is moving a row.
 */
export function slotsToPayload(slots: SlotForm[]): SlotPayload[] {
  return slots
    .filter((s) => s.name.trim() !== "")
    .map((s, i) => ({
      name: s.name.trim(),
      quantity: Math.max(1, Math.round(Number(s.quantity) || 1)),
      sortOrder: i,
      sourceCategoryId: s.sourceCategoryId,
      choices: s.choices.map((c, j) => ({
        productId: c.productId,
        surcharge: Math.round((Number(c.surcharge) || 0) * 100),
        sortOrder: j,
      })),
      optionRules: s.optionRules.map((r) => ({ ...r })),
    }));
}

/** The category and its children — the tree a slot draws from. Categories are
 *  at most two deep, so this is the same one-step walk everything else does. */
export function categoryTreeIds(sourceCategoryId: string, categories: CategoryDto[]): string[] {
  return [sourceCategoryId, ...categories.filter((c) => c.parentId === sourceCategoryId).map((c) => c.id)];
}

/**
 * The products a slot could be filled with.
 *
 * **A MENU IS NEVER OFFERED**, here as at the till and as at the server: `Menu`
 * is a child of `Pizzas`, so an « any pizza » slot reaches the menus themselves.
 * Showing one in this picker would let the operator build a menu the checkout
 * then refuses, which is the worst of both — accepted in the editor, broken in
 * service.
 */
export function candidateProducts(
  sourceCategoryId: string,
  products: ProductDto[],
  categories: CategoryDto[],
): ProductDto[] {
  if (!sourceCategoryId) return [];
  const tree = new Set(categoryTreeIds(sourceCategoryId, categories));
  return products
    .filter((p) => tree.has(p.categoryId) && !p.isCombo && p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/**
 * The option groups a slot can govern.
 *
 * Derived from the FILLERS rather than from the category, and that is not a
 * shortcut: `GET /api/catalog/categories` does not return option groups at all,
 * while every product carries its merged list with `inherited: true` and the
 * real group id on it. The groups a menu can govern are exactly the ones its
 * components inherit, so the fillers are also the more truthful source.
 *
 * Only INHERITED groups are offered. A product's own groups belong to that one
 * product; a slot spanning a whole category cannot govern them, and
 * `ComboSlotOptionRule` has a foreign key to `CategoryOptionGroup` that would
 * refuse the id anyway.
 */
export function governableGroups(
  sourceCategoryId: string,
  products: ProductDto[],
  categories: CategoryDto[],
): { id: string; name: string; required: boolean; choices: { id: string; name: string }[] }[] {
  const seen = new Map<string, { id: string; name: string; required: boolean; choices: { id: string; name: string }[] }>();
  for (const p of candidateProducts(sourceCategoryId, products, categories)) {
    for (const g of p.options) {
      if (!g.inherited || seen.has(g.id)) continue;
      seen.set(g.id, {
        id: g.id,
        name: g.name,
        required: g.required,
        choices: g.choices.map((c) => ({ id: c.id, name: c.name })),
      });
    }
  }
  return [...seen.values()];
}

/** How a slot treats one inherited group — the three-way the editor shows. */
export type RuleMode = "ask" | "fixed" | "silent";

export function ruleModeFor(slot: SlotForm, groupId: string): { mode: RuleMode; choiceId: string | null } {
  const rule = slot.optionRules.find((r) => r.categoryOptionGroupId === groupId);
  if (!rule) return { mode: "ask", choiceId: null };
  return { mode: rule.categoryOptionChoiceId ? "fixed" : "silent", choiceId: rule.categoryOptionChoiceId };
}

/** Set how a slot treats one group. `ask` removes the rule entirely. */
export function withRule(slot: SlotForm, groupId: string, mode: RuleMode, choiceId: string | null): SlotForm {
  const others = slot.optionRules.filter((r) => r.categoryOptionGroupId !== groupId);
  if (mode === "ask") return { ...slot, optionRules: others };
  return {
    ...slot,
    optionRules: [
      ...others,
      { categoryOptionGroupId: groupId, categoryOptionChoiceId: mode === "fixed" ? choiceId : null },
    ],
  };
}

/**
 * What is wrong with this menu, in the server's own words.
 *
 * Runs `validateComboShape` — the function the routes run — over the payload
 * this form would send, so the operator cannot be shown « looks fine » for
 * something the server is about to refuse. The catalogue-side checks
 * (`combo-admin.ts`) need the database and still run server-side; this is the
 * half that can be answered before the round trip.
 */
export function slotFormErrors(args: {
  isCombo: boolean;
  /** The menu's sur-place price, in CENTS — the forfait that gets ventilated. */
  priceCents: number;
  slots: SlotForm[];
}): string[] {
  return validateComboShape({
    isCombo: args.isCombo,
    price: args.priceCents,
    comboSlots: slotsToPayload(args.slots),
  });
}

/**
 * What to send as `comboSlots`, or `undefined` to leave the stored ones alone.
 *
 * THE C-24 RULE, and Batch 5.9 note 6 is why it is a function rather than an
 * inline ternary. An absent field means « leave them alone »; an empty array
 * means « delete them all ». A form that always sent the array would wipe a
 * menu's composition the moment anything else on the screen went wrong, and the
 * menu would go on selling at its forfait under the higher-rate fallback —
 * over-taxing every sale with nothing on screen to say so.
 *
 *  - a menu           → send the slots
 *  - was a menu, now not → send `[]`, which is the operator deliberately
 *                          clearing it by turning the switch off
 *  - never a menu     → send nothing at all
 */
export function comboSlotsForPayload(args: {
  isCombo: boolean;
  wasCombo: boolean;
  slots: SlotForm[];
}): SlotPayload[] | undefined {
  if (args.isCombo) return slotsToPayload(args.slots);
  if (args.wasCombo) return [];
  return undefined;
}
