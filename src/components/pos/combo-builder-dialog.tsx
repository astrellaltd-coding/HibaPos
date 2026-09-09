"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";
import { ProductImage } from "@/components/shared/product-image";
import {
  useCartStore,
  toCartOptions,
  componentExtras,
  effectiveChoiceModifier,
  type CartAddOn,
  type CartComponent,
  type CartItem,
} from "@/store/cart-store";
import {
  builderSeats,
  seatLabel,
  slotProducts,
  askedGroups,
  buildComponent,
  menuForfait,
  fixedFiller,
  fillerSurcharge,
} from "@/lib/combo-builder";
import type { CategoryDto, ProductDto } from "@/types/api";
import { Check, ChevronLeft, ChevronRight, Plus } from "lucide-react";

/**
 * Ringing a menu composé, one slot at a time (Batch 5.9c).
 *
 * The cashier is asked « quelle pizza ? », « quelle boisson ? » in turn, and
 * each answer is configured on its own — the first burger with salade, the
 * second without. THE SIZE IS NEVER ASKED: the menu fixes it, so a Menu Chill's
 * pizzas are Seniors and the question does not appear.
 *
 * The decisions live in `lib/combo-builder.ts`, not here. A mapping inside a
 * component cannot be exercised by a test, and that is exactly how M-19
 * survived in `product-options-dialog-v2.tsx` until Batch 5.7c extracted it.
 */
export function ComboBuilderDialog({
  menu,
  products,
  categories,
  open,
  onOpenChange,
}: {
  menu: ProductDto | null;
  products: ProductDto[];
  categories: CategoryDto[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addItem, orderType } = useCartStore();

  const seats = useMemo(() => (menu ? builderSeats(menu.comboSlots) : []), [menu]);

  /** Components confirmed so far, one per seat, in seat order. */
  const [done, setDone] = useState<CartComponent[]>([]);
  /** The product picked at the CURRENT seat, before its options are confirmed. */
  const [picked, setPicked] = useState<ProductDto | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [chosenAddons, setChosenAddons] = useState<Record<string, boolean>>({});

  const step = done.length;
  const seat = seats[step] ?? null;

  // A slot offering exactly one filler asks nothing — the Duo's « 2 Burgers
  // Cheese Royal ». The cashier configures it and moves on.
  const offered = useMemo(
    () => (seat ? slotProducts(seat.slot, products, categories) : []),
    [seat, products, categories],
  );
  const forced = useMemo(
    () => (seat ? fixedFiller(seat, products, categories) : null),
    [seat, products, categories],
  );
  const current = picked ?? forced;

  const groups = useMemo(
    () => (seat && current ? askedGroups(seat.slot, current) : []),
    [seat, current],
  );
  const addOns = current?.addOns ?? [];
  const missingRequired = groups.some((g) => g.required && (selected[g.name]?.length ?? 0) === 0);

  const forfait = menu ? menuForfait(menu, orderType) : 0;
  const extrasSoFar = done.reduce((acc, c) => acc + componentExtras(c), 0);
  const pendingExtras =
    seat && current
      ? fillerSurcharge(seat.slot, current.id) +
        toCartOptions(groups, selected, orderType).reduce((a, o) => a + o.priceModifier, 0) +
        Object.entries(chosenAddons)
          .filter(([, v]) => v)
          .reduce((a, [id]) => a + (addOns.find((x) => x.id === id)?.price ?? 0), 0)
      : 0;
  const runningTotal = forfait + extrasSoFar + pendingExtras;

  const resetSeat = () => {
    setPicked(null);
    setSelected({});
    setChosenAddons({});
  };

  const close = (v: boolean) => {
    if (!v) {
      setDone([]);
      resetSeat();
    }
    onOpenChange(v);
  };

  const toggleChoice = (groupName: string, choiceName: string, multiple: boolean) => {
    setSelected((s) => {
      const cur = s[groupName] ?? [];
      if (multiple) {
        return {
          ...s,
          [groupName]: cur.includes(choiceName) ? cur.filter((c) => c !== choiceName) : [...cur, choiceName],
        };
      }
      return { ...s, [groupName]: cur.includes(choiceName) ? [] : [choiceName] };
    });
  };

  const back = () => {
    if (picked && !forced) {
      // Un-pick, back to the product list for this same seat.
      resetSeat();
      return;
    }
    if (done.length === 0) {
      close(false);
      return;
    }
    setDone((d) => d.slice(0, -1));
    resetSeat();
  };

  const confirmSeat = () => {
    if (!seat || !current || missingRequired) return;
    const cartAddons: CartAddOn[] = Object.entries(chosenAddons)
      .filter(([, v]) => v)
      .map(([id]) => {
        const a = addOns.find((x) => x.id === id);
        return { id, name: a?.name ?? "", price: a?.price ?? 0 };
      });
    const component = buildComponent({
      seat,
      product: current,
      options: toCartOptions(groups, selected, orderType),
      addOns: cartAddons,
      orderType,
    });
    const next = [...done, component];
    resetSeat();
    if (next.length === seats.length && menu) {
      addItem({
        uid: crypto.randomUUID(),
        productId: menu.id,
        productName: menu.name,
        basePrice: menu.price,
        pickupPrice: menu.pickupPrice ?? null,
        deliveryPrice: menu.deliveryPrice ?? null,
        // The FORFAIT, and nothing else. The components' extras are added by
        // `computeLineTotal`; folding them in here would charge them twice.
        unitPrice: menuForfait(menu, orderType),
        quantity: 1,
        options: [],
        addOns: [],
        components: next,
        notes: null,
        // Display-only. A menu has no rate of its own that a sale ever uses:
        // the checkout explodes it into one line per component, each with its
        // own resolved rate.
        vatRate: menu.effectiveVatRate ?? menu.vatRate,
        image: menu.image,
      } satisfies CartItem);
      setDone([]);
      onOpenChange(false);
      return;
    }
    setDone(next);
  };

  if (!menu) return null;
  const isLast = step === seats.length - 1;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex h-[85vh] max-h-[85vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="flex items-center justify-between pr-8">
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">{menu.name}</DialogTitle>
              {seat && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Étape {step + 1} sur {seats.length} — {seatLabel(seat)}
                </p>
              )}
            </div>
            <span className="shrink-0 text-xl font-bold text-primary">{formatEuro(runningTotal)}</span>
          </div>

          {/* The running summary: what is already in the menu. Prices are NOT
              shown per component — they would be the forfait's allocated
              shares, which nobody was charged. */}
          {done.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {done.map((c, i) => (
                <span
                  key={`${c.slotId}-${i}`}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {c.productName}
                </span>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Pick the component ── */}
          {seat && !current && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Choisir : {seatLabel(seat)}
              </p>
              {offered.length === 0 ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  Aucun produit disponible pour ce composant. Corrigez le menu dans le catalogue.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {offered.map((p) => {
                    const extra = fillerSurcharge(seat.slot, p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPicked(p)}
                        className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-border bg-card p-3 text-center transition-all duration-150 hover:border-primary/40 hover:bg-muted/30"
                      >
                        <ProductImage image={p.image} alt={p.name} className="h-12 w-12 rounded-lg" />
                        <span className="text-sm font-semibold leading-tight text-foreground">{p.name}</span>
                        {extra > 0 && (
                          <span className="text-xs font-medium text-primary">+{formatEuro(extra)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Configure it ── */}
          {seat && current && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <ProductImage image={current.image} alt={current.name} className="h-11 w-11 rounded-lg" />
                <div>
                  <p className="font-semibold text-foreground">{current.name}</p>
                  <p className="text-xs text-muted-foreground">{seatLabel(seat)}</p>
                </div>
              </div>

              {groups.length === 0 && addOns.length === 0 && (
                <p className="text-sm text-muted-foreground">Rien à configurer pour ce composant.</p>
              )}

              {groups.map((g) => (
                <div key={g.id}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.name} {g.required && <span className="text-destructive">*</span>}
                    </p>
                    <span className="text-[11px] text-muted-foreground">
                      {g.required ? "Obligatoire" : "Facultatif"} · {g.multiple ? "plusieurs" : "un seul"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {g.choices.map((c) => {
                      const isSel = (selected[g.name] ?? []).includes(c.name);
                      // Same card as `product-options-dialog-v2.tsx`, image and
                      // all. THE FIRST DRAFT OF THIS DIALOG DREW NO IMAGES —
                      // and 36 of the 39 category choices and all 49 product
                      // choices on this catalogue have one, so a cashier who
                      // knows the ordinary screen by its pictures was handed a
                      // wall of text the moment they rang a menu.
                      const hasImg = c.image && (c.image.startsWith("/") || c.image.startsWith("http"));
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleChoice(g.name, c.name, g.multiple)}
                          className={cn(
                            "group relative flex h-[100px] w-full flex-col items-center gap-1 rounded-lg border-2 px-1 py-2 text-center transition-all duration-150",
                            isSel
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border bg-card hover:border-primary/40 hover:bg-muted/30",
                          )}
                        >
                          {isSel && (
                            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                          )}
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-muted/50">
                            {hasImg ? (
                              <ProductImage image={c.image} alt={c.name} className="h-full w-full object-cover text-lg" />
                            ) : (
                              <span className="text-2xl leading-none">🍽️</span>
                            )}
                          </div>
                          <div className="flex flex-col items-center gap-0">
                            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
                              {c.name}
                            </span>
                            {/* WHAT THIS CHOICE ADDS TO THE FORFAIT.
                                Missing entirely until 2026-09-09, reported by
                                the operator: « Frite Cheddar » inside a Duo
                                looked free here and appeared at +1,50 € in the
                                cart. The Duos ask for a frite through the
                                burgers' own required group, whose cheddar
                                carries a 150 modifier.

                                `effectiveChoiceModifier` is the function
                                `toCartOptions` uses, so this figure and the one
                                the line is charged are the same number by
                                construction rather than by agreement. */}
                            {(() => {
                              const extra = effectiveChoiceModifier(c, orderType);
                              if (extra > 0)
                                return (
                                  <span className="text-[10px] font-semibold text-primary">
                                    +{formatEuro(extra)}
                                  </span>
                                );
                              if (extra < 0)
                                return (
                                  <span className="text-[10px] font-semibold text-primary">
                                    {formatEuro(extra)}
                                  </span>
                                );
                              return <span className="text-[10px] text-muted-foreground">Inclus</span>;
                            })()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {addOns.length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Suppléments
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {addOns.map((a) => {
                      const isSel = !!chosenAddons[a.id];
                      // 19 of the 21 supplements on this catalogue carry a
                      // picture. This is the one the operator noticed first.
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
                            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-2.5 w-2.5" />
                            </span>
                          )}
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md bg-muted/50">
                            <ProductImage image={a.image} alt={a.name} className="h-full w-full object-cover text-lg" />
                          </div>
                          <div className="flex flex-col items-center gap-0">
                            <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
                              {a.name}
                            </span>
                            <span className="text-[10px] font-semibold text-primary">+{formatEuro(a.price)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" className="h-12 min-w-[120px]" onClick={back}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            {done.length === 0 && !picked ? "Annuler" : "Retour"}
          </Button>
          <Button
            type="button"
            className="h-12 min-w-[180px]"
            disabled={!current || missingRequired}
            onClick={confirmSeat}
          >
            {isLast ? (
              <>
                <Plus className="mr-1 h-4 w-4" />
                Ajouter au panier
              </>
            ) : (
              <>
                Suivant
                <ChevronRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
