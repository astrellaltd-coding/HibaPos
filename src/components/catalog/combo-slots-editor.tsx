"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";
import {
  candidateProducts,
  emptySlot,
  governableGroups,
  ruleModeFor,
  withRule,
  type RuleMode,
  type SlotForm,
} from "@/lib/combo-slot-form";
import type { CategoryDto, ProductDto } from "@/types/api";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

/**
 * Editing a menu's composition (Batch 5.10).
 *
 * One block per slot: what the cashier is asked, how many times, where the
 * answers come from, and — for each option group the components inherit —
 * whether the menu asks it, answers it, or covers it elsewhere.
 *
 * This component renders and calls back. Every decision it needs is in
 * `lib/combo-slot-form.ts`, which is where a test can reach them.
 */
export function ComboSlotsEditor({
  slots,
  onChange,
  products,
  categories,
  errors,
}: {
  slots: SlotForm[];
  onChange: (slots: SlotForm[]) => void;
  products: ProductDto[];
  categories: CategoryDto[];
  errors: string[];
}) {
  const setSlot = (i: number, next: SlotForm) =>
    onChange(slots.map((s, k) => (k === i ? next : s)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= slots.length) return;
    const next = [...slots];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Un menu est vendu à un prix forfaitaire et se compose au comptoir, question par question.
        Le prix ci-dessus est le forfait — c&apos;est lui qui est ventilé entre les taux de TVA.
      </p>

      {errors.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
        >
          <p className="mb-1 font-semibold">Ce menu ne peut pas être enregistré :</p>
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {slots.map((slot, i) => {
        const fillers = candidateProducts(slot.sourceCategoryId, products, categories);
        const groups = governableGroups(slot.sourceCategoryId, products, categories);
        const whitelisted = new Set(slot.choices.map((c) => c.productId));

        return (
          <div key={i} className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Composant {i + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Monter le composant ${i + 1}`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Descendre le composant ${i + 1}`}
                  disabled={i === slots.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Supprimer le composant ${i + 1}`}
                  onClick={() => onChange(slots.filter((_, k) => k !== i))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`slot-name-${i}`}>Question posée</Label>
                <Input
                  id={`slot-name-${i}`}
                  value={slot.name}
                  placeholder="Pizza"
                  onChange={(e) => setSlot(i, { ...slot, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`slot-qty-${i}`}>Combien de fois</Label>
                <Input
                  id={`slot-qty-${i}`}
                  type="number"
                  min="1"
                  max="10"
                  value={slot.quantity}
                  onChange={(e) => setSlot(i, { ...slot, quantity: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`slot-cat-${i}`}>Choisir dans</Label>
                <Select
                  value={slot.sourceCategoryId}
                  onValueChange={(v) =>
                    // The whitelist and the rules belong to the OLD category and
                    // mean nothing under a new one, so changing it clears both
                    // rather than leaving ids that point somewhere else.
                    setSlot(i, { ...slot, sourceCategoryId: v, choices: [], optionRules: [] })
                  }
                >
                  <SelectTrigger id={`slot-cat-${i}`} className="w-full">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.parentId ? "— " : ""}
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {slot.sourceCategoryId && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Produits proposés
                </p>
                {fillers.length === 0 ? (
                  <p className="text-xs text-destructive">
                    Aucun produit disponible dans cette catégorie. Un menu ne peut pas contenir un menu.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground">
                      {whitelisted.size === 0
                        ? `Tous (${fillers.length}) — le caissier choisit librement. Cochez pour restreindre.`
                        : whitelisted.size === 1
                          ? "Un seul produit coché : le composant est imposé et le caissier n'est pas interrogé."
                          : `${whitelisted.size} produits proposés au caissier.`}
                    </p>
                    <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {fillers.map((p) => {
                        const chosen = slot.choices.find((c) => c.productId === p.id);
                        return (
                          <div
                            key={p.id}
                            className={cn(
                              "flex items-center gap-2 rounded-md border p-2",
                              chosen ? "border-primary bg-primary/5" : "border-border bg-card",
                            )}
                          >
                            <input
                              type="checkbox"
                              id={`slot-${i}-p-${p.id}`}
                              className="h-4 w-4 shrink-0"
                              checked={!!chosen}
                              onChange={(e) =>
                                setSlot(i, {
                                  ...slot,
                                  choices: e.target.checked
                                    ? [...slot.choices, { productId: p.id, surcharge: 0 }]
                                    : slot.choices.filter((c) => c.productId !== p.id),
                                })
                              }
                            />
                            <label
                              htmlFor={`slot-${i}-p-${p.id}`}
                              className="min-w-0 flex-1 truncate text-sm"
                            >
                              {p.name}{" "}
                              <span className="text-xs text-muted-foreground">{formatEuro(p.price)}</span>
                            </label>
                            {chosen && (
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="text-xs text-muted-foreground">+</span>
                                <Input
                                  aria-label={`Supplément pour ${p.name}`}
                                  type="number"
                                  step="0.10"
                                  min="0"
                                  className="h-9 w-20"
                                  value={chosen.surcharge}
                                  onChange={(e) =>
                                    setSlot(i, {
                                      ...slot,
                                      choices: slot.choices.map((c) =>
                                        c.productId === p.id
                                          ? { ...c, surcharge: Number(e.target.value) || 0 }
                                          : c,
                                      ),
                                    })
                                  }
                                />
                                <span className="text-xs text-muted-foreground">€</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Un supplément est facturé <strong>en sus</strong> du forfait, au taux de son
                      composant, et n&apos;entre pas dans la ventilation.
                    </p>
                  </>
                )}
              </div>
            )}

            {groups.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Options héritées
                </p>
                <div className="flex flex-col gap-2">
                  {groups.map((g) => {
                    const { mode, choiceId } = ruleModeFor(slot, g.id);
                    return (
                      <div key={g.id} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-24 text-sm">
                          {g.name}
                          {g.required && <span className="text-destructive"> *</span>}
                        </span>
                        <Select
                          value={mode}
                          onValueChange={(v) =>
                            setSlot(
                              i,
                              withRule(
                                slot,
                                g.id,
                                v as RuleMode,
                                v === "fixed" ? (choiceId ?? g.choices[0]?.id ?? null) : null,
                              ),
                            )
                          }
                        >
                          <SelectTrigger className="h-11 w-56" aria-label={`Traitement de « ${g.name} »`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ask">Demander au caissier</SelectItem>
                            <SelectItem value="fixed">Imposé par le menu</SelectItem>
                            <SelectItem value="silent">Ne pas demander</SelectItem>
                          </SelectContent>
                        </Select>
                        {mode === "fixed" && (
                          <Select
                            value={choiceId ?? ""}
                            onValueChange={(v) => setSlot(i, withRule(slot, g.id, "fixed", v))}
                          >
                            <SelectTrigger className="h-11 w-40" aria-label={`Choix imposé pour « ${g.name} »`}>
                              <SelectValue placeholder="Choix" />
                            </SelectTrigger>
                            <SelectContent>
                              {g.choices.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  <strong>Imposé</strong> : le menu répond à la place du caissier — la taille d&apos;une
                  pizza, par exemple, qui compte dans le prix de référence du composant.{" "}
                  <strong>Ne pas demander</strong> : un autre composant du menu s&apos;en charge — la
                  frite d&apos;un burger, que le menu demande une seule fois.
                </p>
              </div>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        className="h-11"
        onClick={() => onChange([...slots, emptySlot()])}
      >
        <Plus className="mr-1 h-4 w-4" />
        Ajouter un composant
      </Button>
    </div>
  );
}
