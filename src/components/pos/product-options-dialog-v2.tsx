"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";
import { ProductImage } from "@/components/shared/product-image";
import { useCartStore, productUnitPrice, type CartOption, type CartItem } from "@/store/cart-store";
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

  const reset = () => {
    setSelected(isEditing ? initialSelected : {});
    setChosenAddons(isEditing ? initialAddons : {});
    setQty(editItem?.quantity ?? 1);
    setNote(editItem?.notes ?? "");
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  };

  const { orderType } = useCartStore();
  const options = useMemo(() => product?.options ?? [], [product]);

  // Separate size group from other options
  const sizeGroup = options.find((g) => g.name === "Taille");
  const otherOptions = options.filter((g) => g.name !== "Taille");

  const toggleChoice = (groupName: string, choiceName: string, multiple: boolean) => {
    setSelected((s) => {
      const current = s[groupName] ?? [];
      if (multiple) {
        return { ...s, [groupName]: current.includes(choiceName) ? current.filter((c) => c !== choiceName) : [...current, choiceName] };
      }
      return { ...s, [groupName]: current.includes(choiceName) ? [] : [choiceName] };
    });
  };

  const cartOptions: CartOption[] = useMemo(() => {
    if (!product) return [];
    const out: CartOption[] = [];
    for (const g of options) {
      const picks = selected[g.name] ?? [];
      for (const p of picks) {
        const ch = g.choices.find((c) => c.name === p);
        if (ch) {
          let effectiveMod = ch.priceModifier;
          if (orderType === "TAKEAWAY" && ch.pickupPriceModifier != null) effectiveMod = ch.pickupPriceModifier;
          else if (orderType === "LIVRAISON" && ch.deliveryPriceModifier != null) effectiveMod = ch.deliveryPriceModifier;
          out.push({
            group: g.name,
            choice: ch.name,
            choiceId: ch.id,
            priceModifier: effectiveMod,
            pickupPriceModifier: ch.pickupPriceModifier ?? null,
            deliveryPriceModifier: ch.deliveryPriceModifier ?? null,
          });
        }
      }
    }
    return out;
  }, [selected, options, product, orderType]);

  const unitPrice = product ? productUnitPrice(product, cartOptions, orderType) : 0;
  const applicableAddOns = product?.addOns ?? [];
  const addonsTotal = Object.entries(chosenAddons)
    .filter(([, v]) => v)
    .reduce((acc, [id]) => acc + (applicableAddOns.find((a) => a.id === id)?.price ?? 0), 0);
  const lineTotal = Math.round((unitPrice + addonsTotal) * qty * 100) / 100;

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
        vatRate: product.vatRate,
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
                      {g.required ? "Obligatoire" : "Facultatif"} ·{" "}
                      {g.multiple ? "plusieurs" : "un seul"}
                    </span>
                  </div>

                  <div
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
                  >
                    {g.choices.map((c) => {
                      const isSel = (selected[g.name] ?? []).includes(c.name);
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
                            <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-2.5 w-2.5" />
                            </div>
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
