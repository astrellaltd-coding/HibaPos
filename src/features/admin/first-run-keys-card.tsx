"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, Copy, Download, ShieldCheck, TriangleAlert, Loader2 } from "lucide-react";

// First-run keys — the one screen in this application that shows a secret.
//
// WHY IT EXISTS. An install generates its own `SESSION_SECRET` and
// `BACKUP_ENCRYPTION_KEY` on first run, and arms `FISCAL_CHAIN_KEY` when the
// operator says so. Two of those must leave the machine:
//
//   * lose `BACKUP_ENCRYPTION_KEY` and every backup is unreadable — a key that
//     exists only on the disk it protects is not protecting anything;
//   * lose `FISCAL_CHAIN_KEY` and the fiscal journal can never be verified
//     again, because every hash was computed with it.
//
// `SESSION_SECRET` is different and is shown for completeness only: losing it
// signs everybody out once and costs nothing else.
//
// WHAT « SHOWN ONCE » MEANS, HONESTLY. After acknowledgement the route stops
// returning the values and this card disappears. The keys are still in
// `<dataDir>/db/secrets.json`, because the application has to read them. This
// is a prompt to record them elsewhere, not a claim that they became secret.

type Pending = { name: string; value: string };
type SecretsState = {
  pending: Pending[];
  unacknowledged: string[];
  storedAt: string;
  chainArmed: boolean;
};

const WHY: Record<string, { label: string; risk: string; critical: boolean }> = {
  BACKUP_ENCRYPTION_KEY: {
    label: "Clé de chiffrement des sauvegardes",
    risk: "Sans elle, aucune sauvegarde ne peut être restaurée. Jamais.",
    critical: true,
  },
  FISCAL_CHAIN_KEY: {
    label: "Clé de chaînage du journal fiscal",
    risk: "Sans elle, le journal fiscal ne peut plus être vérifié du tout.",
    critical: true,
  },
  SESSION_SECRET: {
    label: "Clé de signature des sessions",
    risk: "Sa perte déconnecte tout le monde une fois, et rien de plus.",
    critical: false,
  },
};

export function FirstRunKeysCard() {
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);

  const state = useQuery({
    queryKey: ["setup-secrets"],
    queryFn: () => api.get<SecretsState>("/api/setup/secrets"),
  });

  const acknowledge = useMutation({
    mutationFn: (names: string[]) => api.post<{ remaining: string[] }>("/api/setup/secrets", { names }),
    onSuccess: () => {
      setConfirmed(false);
      qc.invalidateQueries({ queryKey: ["setup-secrets"] });
      toast.success("Clés confirmées comme enregistrées");
    },
    onError: (e) =>
      toast.error("Confirmation impossible", {
        description: e instanceof ApiError ? e.message : String(e),
      }),
  });

  const armChain = useMutation({
    mutationFn: () =>
      api.post<{ value: string; alreadyArmed: boolean }>("/api/setup/chain-key", {}),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["setup-secrets"] });
      toast[r.alreadyArmed ? "info" : "success"](
        r.alreadyArmed ? "La clé était déjà armée" : "Clé de chaînage armée",
        { description: "Enregistrez-la hors de cette machine avant de continuer." },
      );
    },
    onError: (e) =>
      toast.error("Armement refusé", {
        description: e instanceof ApiError ? e.message : String(e),
      }),
  });

  const pending = state.data?.pending ?? [];
  // From the server. NOT `!pending.some(...)`: that is true both when the key
  // was armed and recorded, and when it was never armed at all — so the card
  // would offer to arm a key already protecting a journal.
  const chainArmed = state.data?.chainArmed ?? true;

  function copy(value: string, name: string) {
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${name} copiée`),
      () => toast.error("Copie impossible — sélectionnez la valeur à la main"),
    );
  }

  function saveAll() {
    const body = pending
      .map((p) => `${p.name}=${p.value}`)
      .join("\r\n");
    const blob = new Blob([`# HibaPOS — clés à conserver HORS de cette machine\r\n${body}\r\n`], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hibapos-cles-a-conserver.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Nothing outstanding and the chain already armed: this card has no job.
  if (state.isLoading) return null;
  if (pending.length === 0 && chainArmed) return null;

  return (
    <Card className="border-amber-500/60 bg-amber-500/[0.06]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-amber-600" />
          Clés de cette installation — à enregistrer ailleurs
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pending.length > 0 ? (
          <>
            <p className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300">
              Ces clés ont été générées par cette installation. Copiez-les <strong>hors de cette
              machine</strong> — clé USB, gestionnaire de mots de passe, papier dans un coffre.
              Elles ne seront plus affichées après confirmation.
            </p>

            {pending.map((p) => {
              const why = WHY[p.name];
              return (
                <div key={p.name} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {why?.label ?? p.name}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => copy(p.value, p.name)}>
                      <Copy className="h-3.5 w-3.5" />
                      Copier
                    </Button>
                  </div>
                  <code className="block overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                    {p.value}
                  </code>
                  <span
                    className={
                      why?.critical
                        ? "text-xs font-medium text-amber-700 dark:text-amber-400"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {why?.critical ? "⚠ " : ""}
                    {why?.risk ?? p.name}
                  </span>
                </div>
              );
            })}

            <Button variant="outline" onClick={saveAll} className="self-start">
              <Download className="h-4 w-4" />
              Télécharger en fichier texte
            </Button>

            <div className="flex items-center gap-3 border-t border-border pt-3">
              <input
                id="keys-recorded"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <Label htmlFor="keys-recorded" className="cursor-pointer text-sm font-normal">
                J&apos;ai enregistré ces clés hors de cette machine
              </Label>
            </div>
            <Button
              onClick={() => acknowledge.mutate(pending.map((p) => p.name))}
              disabled={!confirmed || acknowledge.isPending}
              className="self-start"
            >
              {acknowledge.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Confirmer et masquer
            </Button>
          </>
        ) : null}

        {chainArmed ? null : (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              Clé de chaînage du journal fiscal
            </span>
            <p className="text-xs text-muted-foreground">
              À armer <strong>une seule fois</strong>, sur un journal fiscal vide, avant la
              première vente réelle. Chaque empreinte du journal est alors calculée avec elle. Si
              le journal contient déjà des écritures, l&apos;armement est refusé — faites la remise
              à zéro d&apos;abord.
            </p>
            <Button
              variant="outline"
              onClick={() => armChain.mutate()}
              disabled={armChain.isPending}
              className="self-start"
            >
              {armChain.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Armer la clé de chaînage
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
