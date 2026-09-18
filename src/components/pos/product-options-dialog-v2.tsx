"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";
import { ProductImage } from "@/components/shared/product-image";
import { useCartStore, productUnitPrice, toCartOptions, type CartOption, type CartItem } from "@/store/cart-store";
import type { ProductDto, OptionGroupDto } from "@/types/api";
import { Check, Minus, Plus } from "lucide-react";
// uuid replaced with built-in crypto.randomUUID()

export function ProductOptionsDialog({
  product,
  open,
  onOpenChange,
  editItem,
}: {
  product: ProductDto | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editItem?: CartItem | null;
}) {
  const { addItem, updateItem } = useCartStore();
  const isEditing = !!editItem;

  const initialSelected = useMemo(() => {
    if (!editItem) return {};
    const map: Record<string, string[]> = {};
    for (const o of editItem.options) {
      map[o.group] = [...(map[o.group] ?? []), o.choice];
    }
    return map;
  }, [editItem]);

  const initialAddons = useMemo(() => {
    if (!editItem) return {};
    const map: Record<string, boolean> = {};
    for (const a of editItem.addOns) {
      if (a.id) map[a.id] = true;
    }
    return map;
  }, [editItem]);

  const [selected, setSelected] = useState<Record<string, string[]>>(initialSelected);
  const [chosenAddons, setChosenAddons] = useState<Record<string, boolean>>(initialAddons);
  const [qty, setQty] = useState(editItem?.quantity ?? 1);
  const [note, setNote] = useState(editItem?.notes ?? "");

  // THIS DIALOG IS REMOUNTED FOR EVERY OPEN, which is what makes the four
  // `useState` initialisers above load-bearing rather than decorative.
  // `pos-view.tsx` gives it a `key` that changes each time it is opened, so React
  // discards the previous instance and those initialisers run again against the
  // current `editItem`.
  //
  // WHAT THIS REPLACED, AND THE BUG IT CAUSED. The dialog used to be mounted
  // once and reused, so the initialisers ran on the first mount of the session
  // and never again; re-seeding was left to `setTimeout(reset, 200)` on CLOSE,
  // whose closure captured the `editItem` of the render that closed it. So the
  // first open after adding a product showed NOTHING selected, and the first
  // open after confirming an edit showed the selection as it had been BEFORE
  // that edit. Closing and reopening appeared to fix it, because that second
  // close finally captured the current line.
  //
  // Neither was cosmetic. `cartAddons` below is built from what is DISPLAYED and
  // handed straight to `updateItem`, so confirming from a stale view wrote the
  // stale supplements onto the line — dropping ones the customer had asked for,
  // or restoring ones they had removed — and moved the line price with them.
  //
  // Remounting is React's own answer to "reset state when the subject changes".
  // An effect that re-seeded on `open` was tried first and trips
  // `react-hooks/set-state-in-effect`, which is a rule worth keeping.
  const close = (v: boolean) => {
    onOpenChange(v);
  };

  const { orderType } = useCartStore();
  const options = useMemo(() => product?.options ?? [], [product]);

  // Separate size group from other options
  const sizeGroup = options.find((g) => g.name === "Taille");
  const otherOptions = options.filter((g) => g.name !== "Taille");

  /**
   * L-217 — A GROUP WITH A QUOTA IS COUNTED, not toggled.
   *
   * `selected[group]` has always been a LIST of choice names, and
   * `toCartOptions` pushes one cart option per entry — so the same name twice
   * is « 2 x viande hachee » all the way to the server. Nothing ever produced a
   * repeat, because every group was a toggle.
   *
   * ONLY a group carrying `included` behaves this way. Sauces, Crudites and
   * Type de pain keep the toggle they have always had: a cashier who taps
   * « Harissa » twice must not order two of it.
   */
  const countOf = (groupName: string, choiceName: string) =>
    (selected[groupName] ?? []).filter((c) => c === choiceName).length;
  const totalOf = (groupName: string) => (selected[groupName] ?? []).length;

  const addOne = (groupName: string, choiceName: string, included: number) => {
    setSelected((s) => {
      const current = s[groupName] ?? [];
      // REFUSED, not charged - the operator's decision, 2026-09-18. A size
      // costs the size's price; somebody wanting more meat rings a bigger one.
      if (current.length >= included) return s;
      return { ...s, [groupName]: [...current, choiceName] };
    });
  };

  const removeOne = (groupName: string, choiceName: string) => {
    setSelected((s) => {
      const current = s[groupName] ?? [];
      const i = current.lastIndexOf(choiceName);
      if (i < 0) return s;
      return { ...s, [groupName]: [...current.slice(0, i), ...current.slice(i + 1)] };
    });
  };

  const toggleChoice = (groupName: string, choiceName: string, multiple: boolean) => {
    setSelected((s) => {
      const current = s[groupName] ?? [];
      if (multiple) {
        return { ...s, [groupName]: current.includes(choiceName) ? current.filter((c) => c !== choiceName) : [...current, choiceName] };
      }
      return { ...s, [groupName]: current.includes(choiceName) ? [] : [choiceName] };
    });
  };

  // M-19 (Batch 5.7c): this mapping was inline here and could not be tested,
  // which is exactly why the defect survived — `cart-store.ts`'s tests build a
  // `CartItem` by hand and never run it. It now lives beside `CartOption`.
  const cartOptions: CartOption[] = useMemo(
    () => (product ? toCartOptions(options, selected, orderType) : []),
    [selected, options, product, orderType],
  );

  const unitPrice = product ? productUnitPrice(product, cartOptions, orderType) : 0;
  const applicableAddOns = product?.addOns ?? [];
  const addonsTotal = Object.entries(chosenAddons)
    .filter(([, v]) => v)
    .reduce((acc, [id]) => acc + (applicableAddOns.find((a) => a.id === id)?.price ?? 0), 0);
  // DOC-14 (Batch 7.5). This was
  //     Math.round((unitPrice + addonsTotal) * qty * 100) / 100
  // and the displayed figure was always RIGHT: `productUnitPrice()` returns
  // integer cents and add-on prices are cents, so `Math.round(cents × qty ×
  // 100) / 100` is exactly `cents × qty`. What it was not is readable — it is
  // vestigial euros-era rounding sitting in a money path, i.e. the exact shape
  // of the cents/euros confusion that produced C-01 and C-02. Removed rather
  // than commented, because the arithmetic is the documentation.
  const lineTotal = (unitPrice + addonsTotal) * qty;

  const missingRequired = options.some((g) => g.required && (selected[g.name]?.length ?? 0) === 0);
  const selectedAddonCount = Object.values(chosenAddons).filter(Boolean).length;

  const handleAdd = () => {
    if (!product || missingRequired) return;
    const cartAddons = Object.entries(chosenAddons)
      .filter(([, v]) => v)
      .map(([id]) => {
        const a = applicableAddOns.find((x) => x.id === id);
        return {
          id,
          name: a?.name ?? "",
          price: a?.price ?? 0,
        };
      });

    if (isEditing && editItem) {
      updateItem(editItem.uid, {
        options: cartOptions,
        addOns: cartAddons,
        quantity: qty,
        unitPrice,
        notes: note.trim() || null,
      });
    } else {
      const item: CartItem = {
        uid: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        basePrice: product.price,
        pickupPrice: product.pickupPrice ?? null,
        deliveryPrice: product.deliveryPrice ?? null,
        unitPrice,
        quantity: qty,
        options: cartOptions,
        addOns: cartAddons,
        notes: note.trim() || null,
        // The effective rate (own, or inherited from the category chain).
        // Display-only client-side — the checkout API recomputes it server-side.
        vatRate: product.effectiveVatRate ?? product.vatRate,
        image: product.image,
      };
      addItem(item);
    }
    close(false);
  };

  const renderChoicePrice = (c: OptionGroupDto["choices"][number]) => {
    const hasAbsolute = c.pickupPrice != null;
    if (hasAbsolute) {
      const price = orderType === "LIVRAISON" ? c.deliveryPrice : c.pickupPrice;
      return <span className="text-base font-bold text-primary">{formatEuro(price ?? 0)}</span>;
    }
    let mod = c.priceModifier;
    if (orderType === "TAKEAWAY" && c.pickupPriceModifier != null) mod = c.pickupPriceModifier;
    else if (orderType === "LIVRAISON" && c.deliveryPriceModifier != null) mod = c.deliveryPriceModifier;
    if (mod > 0) return <span className="text-sm text-muted-foreground">+{formatEuro(mod)}</span>;
    if (mod < 0) return <span className="text-sm text-muted-foreground">{formatEuro(mod)}</span>;
    return <span className="text-sm text-muted-foreground">Inclus</span>;
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {/* ── Header ── */}
        <DialogHeader className="shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-xl font-bold tracking-tight">{product?.name}</DialogTitle>
            <span className="shrink-0 text-xl font-bold text-primary">{formatEuro(unitPrice + addonsTotal)}</span>
          </div>
        </DialogHeader>

        {/* ── Size Section (only shown if product has a Taille group) ── */}
        {sizeGroup && (
          <div className="shrink-0 border-b border-border bg-muted/20 px-6 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Choisir la taille {sizeGroup.required && <span className="text-destructive">*</span>}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {sizeGroup.choices.map((c) => {
                const isSel = (selected[sizeGroup.name] ?? []).includes(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChoice(sizeGroup.name, c.name, sizeGroup.multiple)}
                    className={cn(
                      "relative flex flex-col items-center justify-center gap-1 rounded-xl border-2 p-5 text-center transition-all duration-150",
                      isSel
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
                    )}
                  >
                    {isSel && (
                      <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                    <span className="text-lg font-bold text-foreground">{c.name}</span>
                    {renderChoicePrice(c)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Scrollable Content: Other Options + Supplements ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            {/* Other option groups — same compact card size as Suppléments */}
            {otherOptions.map((g) => {
              const colCount =
                g.choices.length <= 3 ? 3 :
                g.choices.length <= 4 ? 4 :
                g.choices.length <= 5 ? 5 :
                g.choices.length <= 6 ? 6 : 7;

              return (
                <div key={g.id}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.name}{" "}
                      {g.required && <span className="text-destructive">*</span>}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      {g.included != null ? (
                        /* L-217 - the size's own count, said out loud. Without
                         * it a cashier meets a card that will not add and has
                         * nothing to read, which is the silence L-211 and L-214
                         * were both about. */
                        <span className={cn("font-medium", totalOf(g.name) >= g.included && "text-primary")}>
                          {totalOf(g.name)} / {g.included} incluse{g.included > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <>
                          {g.required ? "Obligatoire" : "Facultatif"} ·{" "}
                          {g.multiple ? "plusieurs" : "un seul"}
                        </>
                      )}
                    </span>
                  </div>

                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
                  >
                    {g.choices.map((c) => {
                      const count = countOf(g.name, c.name);
                      const isSel = count > 0;
                      // L-217: a quota'd group counts; every other group toggles.
                      const quota = g.included ?? null;
                      const full = quota !== null && totalOf(g.name) >= quota;
                      const hasImg = c.image && (c.image.startsWith("/") || c.image.startsWith("http"));
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            quota !== null
                              ? addOne(g.name, c.name, quota)
                              : toggleChoice(g.name, c.name, g.multiple)
                          }
                          disabled={quota !== null && full && count === 0}
                          aria-label={quota !== null ? `${c.name} (${count})` : undefined}
                          className={cn(
                            "group relative flex h-[100px] w-full flex-col items-center gap-1 rounded-lg border-2 px-1 py-2 text-center transition-all duration-150",
                            isSel
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
                            quota !== null && full && count === 0 && "opacity-40",
                          )}
                        >
                          {isSel && quota === null && (
                            <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-2.5 w-2.5" />
                            </div>
                          )}
                          {isSel && quota !== null && (
                            <>
                              <div className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                                {count}
                              </div>
                              {/* THE WAY BACK. A stepper that only goes up is a
                                * trap on a touchscreen: the cashier's only
                                * escape from a mis-tap would be to cancel the
                                * whole article. A real 44 px target, and
                                * `stopPropagation` so it does not also add one. */}
                              <span
                                role="button"
                                tabIndex={-1}
                                aria-label={`Retirer ${c.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeOne(g.name, c.name);
                                }}
                                className="absolute left-0 top-0 grid h-11 w-11 min-h-[44px] min-w-[44px] place-items-center rounded-lg text-muted-foreground hover:text-destructive"
                              >
                                <Minus className="h-4 w-4" />
                              </span>
                            </>
                          )}
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-muted/50">
                            {hasImg ? (
                              <ProductImage image={c.image} alt={c.name} className="h-full w-full object-cover text-lg" />
                            ) : (
                              <span className="text-2xl leading-none">🍽️</span>
                            )}
                          </div>
                          <div className="flex flex-col items-center gap-0">
                            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">{c.name}</span>
                            <span className="text-[10px] font-semibold text-primary">{renderChoicePrice(c)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Supplements */}
            {applicableAddOns.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Suppléments</p>
                  {selectedAddonCount > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {selectedAddonCount} sélectionné{selectedAddonCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {applicableAddOns.map((a) => {
                    const isSel = !!chosenAddons[a.id];
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setChosenAddons((s) => ({ ...s, [a.id]: !s[a.id] }))}
                        className={cn(
                          "group relative flex h-[100px] w-full flex-col items-center gap-1 rounded-lg border-2 px-1 py-2 text-center transition-all duration-150",
                          isSel
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
                        )}
                      >
                        {isSel && (
                          <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5" />
                          </div>
                        )}
                        <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-muted/50">
                          <ProductImage image={a.image} alt={a.name} className="h-full w-full object-cover text-lg" />
                        </div>
                        <div className="flex flex-col items-center gap-0">
                          <span className="text-[11px] font-medium leading-tight text-foreground">{a.name}</span>
                          <span className="text-[10px] font-semibold text-primary">+{formatEuro(a.price)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Note field */}
            <div className="pt-2">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Note / Instructions</p>
                <span className="text-xs text-muted-foreground">{note.length}/200</span>
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                placeholder="ex: sans oignons, bien cuit..."
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                rows={2}
              />
            </div>

            {/* Reserved space for future feature cards */}
            <div className="h-24" />
          </div>
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="shrink-0 flex-row items-center justify-between gap-4 border-t border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-lg" aria-label="Diminuer la quantité" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center text-lg font-bold tabular-nums">{qty}</span>
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-lg" aria-label="Augmenter la quantité" onClick={() => setQty((q) => q + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            className="h-12 flex-1 gap-2 text-lg font-bold shadow-sm transition-all active:scale-[0.98]"
            onClick={handleAdd}
            disabled={missingRequired}
          >
            {missingRequired
              ? "Sélection obligatoire"
              : isEditing
                ? `Modifier · ${formatEuro(lineTotal)}`
                : `Ajouter · ${formatEuro(lineTotal)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
