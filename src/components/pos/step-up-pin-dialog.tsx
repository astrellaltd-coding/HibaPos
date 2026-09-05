"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import { Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

export type StepUpConfirmation = {
  stepUpToken: string;
  action: "DISCOUNT" | "REFUND" | "CASH_OUT";
  amount: number | null;
  expSec: number;
};

type StepUpPinDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Bound into the signed token, and re-checked by the operation. */
  action: "DISCOUNT" | "REFUND" | "CASH_OUT";
  /** CENTS. Bound into the token; the server compares it exactly. */
  amount?: number;
  onConfirmed: (confirmation: StepUpConfirmation) => void;
  title?: string;
  description?: string;
};

/**
 * DD-19, Batch 4.4c — the signed-in user re-enters THEIR OWN PIN.
 *
 * Deliberately NOT `ManagerApprovalDialog`, which asks for "le PIN d'un
 * manager" and posts to `/api/auth/approve` (DELETED in Batch 7.2 — see `api/auth/step-up/route.ts`). That route tests the PIN against
 * every manager and then forbids self-approval, so with one operational role
 * (DD-07) it can never confirm the caller's own action. This posts to
 * `/api/auth/step-up`, which re-authenticates the caller and nobody else.
 *
 * The wording matters as much as the route: what is being bought is not a
 * second person's judgement — there is no second person — but proof that
 * somebody who knows the PIN is standing at the till.
 */
export function StepUpPinDialog({
  open,
  onOpenChange,
  action,
  amount,
  onConfirmed,
  title = "Confirmation par PIN",
  description = "Saisissez votre code PIN pour confirmer cette opération.",
}: StepUpPinDialogProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const clean = pin.trim();
    if (!clean) {
      toast.error("Veuillez saisir votre code PIN.");
      return;
    }
    if (!/^\d{6,}$/.test(clean)) {
      toast.error("Le code PIN doit contenir au moins 6 chiffres.");
      return;
    }
    setLoading(true);
    try {
      const confirmation = await api.post<StepUpConfirmation>("/api/auth/step-up", {
        pin: clean,
        action,
        amount: amount ?? undefined,
      });
      setPin("");
      onConfirmed(confirmation);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Code PIN invalide.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setPin(""); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="step-up-pin">Votre code PIN</Label>
          <Input
            id="step-up-pin"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="••••••"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={loading || !pin.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
