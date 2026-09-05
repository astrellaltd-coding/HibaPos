"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { parseEuroInput } from "@/lib/money";
import { Money } from "@/components/shared/money";
import { StepUpPinDialog, type StepUpConfirmation } from "@/components/pos/step-up-pin-dialog";
import { CASH_MOVEMENT_LABELS, requiresStepUp } from "@/lib/services/cash-movement";
import type { CashMovementDto } from "@/types/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Category = CashMovementDto["category"];

/** Which way each category moves the money, and how the operator is asked for it.
 *
 *  The operator types a POSITIVE amount and picks a reason; the sign is the
 *  category's, not something to get right by hand. `ERREUR_DE_CAISSE` is the one
 *  that genuinely goes both ways, so it — and only it — offers the choice. */
const DIRECTION: Record<Category, 1 | -1 | null> = {
  APPROVISIONNEMENT: 1,
  PRELEVEMENT: -1,
  DEPENSE: -1,
  ERREUR_DE_CAISSE: null,
};

const HINTS: Record<Category, string> = {
  APPROVISIONNEMENT: "Ajout d'espèces dans le tiroir (fond de caisse).",
  PRELEVEMENT: "Retrait d'espèces vers le coffre.",
  DEPENSE: "Paiement fournisseur ou petite dépense réglée en espèces.",
  ERREUR_DE_CAISSE: "Correction après comptage — dans un sens ou dans l'autre.",
};

export function CashMovementDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<Category>("DEPENSE");
  const [amountStr, setAmountStr] = useState("");
  const [reason, setReason] = useState("");
  const [correctionAdds, setCorrectionAdds] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const magnitude = parseEuroInput(amountStr);
  const direction = DIRECTION[category] ?? (correctionAdds ? 1 : -1);
  const signed = magnitude != null && magnitude > 0 ? magnitude * direction : null;
  const needsPin = signed != null && requiresStepUp(signed);

  const reset = () => {
    setCategory("DEPENSE");
    setAmountStr("");
    setReason("");
    setCorrectionAdds(false);
  };

  const record = useMutation({
    mutationFn: async (stepUpToken?: string) =>
      api.post<CashMovementDto>("/api/cash-movements", {
        category,
        amount: signed,
        reason: reason.trim(),
        ...(stepUpToken ? { stepUpToken } : {}),
      }),
    onSuccess: () => {
      // The X report and the shift list both change: `expectedCash` moved.
      void qc.invalidateQueries({ queryKey: ["x-report"] });
      void qc.invalidateQueries({ queryKey: ["shifts"] });
      void qc.invalidateQueries({ queryKey: ["cash-movements"] });
      toast.success("Mouvement enregistré");
      reset();
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    },
  });

  const submit = () => {
    if (signed == null || !reason.trim()) return;
    // The PIN is raised only for money leaving the drawer (operator,
    // 2026-09-05). `requiresStepUp` is the SERVER's function, imported rather
    // than reimplemented: a client that guessed differently would either prompt
    // for nothing or be refused after the operator had already typed.
    if (needsPin) setStepUpOpen(true);
    else record.mutate(undefined);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mouvement de caisse</DialogTitle>
            <DialogDescription>
              Entrée ou sortie d&apos;espèces qui n&apos;est pas une vente. Le montant
              est répercuté sur les espèces attendues à la clôture.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motif</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(DIRECTION) as Category[]).map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={category === c ? "default" : "outline"}
                    className="h-auto justify-start py-2 text-left"
                    onClick={() => setCategory(c)}
                  >
                    <span className="flex flex-col items-start">
                      <span className="text-sm font-medium">{CASH_MOVEMENT_LABELS[c]}</span>
                      <span className="text-[11px] font-normal opacity-70">
                        {DIRECTION[c] === 1 ? "Entrée" : DIRECTION[c] === -1 ? "Sortie" : "Entrée ou sortie"}
                      </span>
                    </span>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{HINTS[category]}</p>
            </div>

            {category === "ERREUR_DE_CAISSE" && (
              <div className="space-y-2">
                <Label>Sens de la correction</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={correctionAdds ? "default" : "outline"}
                    onClick={() => setCorrectionAdds(true)}
                  >
                    Excédent (ajoute)
                  </Button>
                  <Button
                    type="button"
                    variant={!correctionAdds ? "default" : "outline"}
                    onClick={() => setCorrectionAdds(false)}
                  >
                    Manquant (retire)
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="cash-movement-amount">Montant</Label>
              <Input
                id="cash-movement-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="h-12 text-lg"
              />
              {signed != null && (
                <p className={cn("text-xs", signed < 0 ? "text-rose-600" : "text-emerald-600")}>
                  {signed < 0 ? "Sortie de " : "Entrée de "}
                  <Money amount={Math.abs(signed)} className="font-medium" />
                  {needsPin ? " — confirmation par PIN requise." : ""}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cash-movement-reason">Détail</Label>
              <Input
                id="cash-movement-reason"
                placeholder="Ex. : fournisseur boissons"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={280}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button
              onClick={submit}
              disabled={signed == null || !reason.trim() || record.isPending}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Money leaving the drawer only (operator, 2026-09-05). */}
      <StepUpPinDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        action="CASH_OUT"
        amount={signed != null ? Math.abs(signed) : undefined}
        onConfirmed={(c: StepUpConfirmation) => {
          setStepUpOpen(false);
          record.mutate(c.stepUpToken);
        }}
        title="Confirmation du mouvement"
        description="Toute sortie d'espèces doit être confirmée par votre code PIN."
      />
    </>
  );
}
