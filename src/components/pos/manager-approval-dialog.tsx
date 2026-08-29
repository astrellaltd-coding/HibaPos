"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export type ApprovedManager = {
  id: string;
  name: string;
  role: string;
  approvalToken: string;
  action: string;
  amount: number | null;
};

type ManagerApprovalDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Bound to the signed approval token (DISCOUNT or REFUND). */
  action: "DISCOUNT" | "REFUND";
  /** Optional amount to bind into the HMAC sigil. Pass when known. */
  amount?: number;
  onApproved: (approver: ApprovedManager) => void;
  title?: string;
  description?: string;
};

/**
 * PIN pad for manager/super-admin approval of a sensitive action.
 * Backed by POST /api/auth/approve which now returns a signed single-use
 * approvalToken bound to (action, amount, expSec). The onApproved callback
 * receives the token alongside the approver metadata; callers should forward
 * `approvalToken` (not `approver.id`) in their downstream mutation bodies
 * — the legacy `approvedById` is rejected server-side for cashiers.
 */
export function ManagerApprovalDialog({
  open,
  onOpenChange,
  action,
  amount,
  onApproved,
  title = "Validation manager",
  description = "Cette opération sensible nécessite l'approbation d'un manager ou super-admin.",
}: ManagerApprovalDialogProps) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const clean = pin.trim();
    if (!clean) {
      toast.error("Veuillez saisir un PIN.");
      return;
    }
    if (!/^\d{6,}$/.test(clean)) {
      toast.error("Le PIN manager doit contenir au moins 6 chiffres.");
      return;
    }
    setLoading(true);
    try {
      const approver = await api.post<ApprovedManager>("/api/auth/approve", {
        pin: pin.trim(),
        action,
        amount: amount ?? undefined,
      });
      toast.success(`Approuvé par ${approver.name}`);
      setPin("");
      onApproved(approver);
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "PIN invalide.";
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
            <ShieldCheck className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mgr-pin">PIN manager</Label>
          <Input
            id="mgr-pin"
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
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Valider"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}