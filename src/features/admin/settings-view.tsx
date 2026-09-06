"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { SettingsDto } from "@/types/api";
import { PageHeader } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Settings, Save, Loader2, Store, Calculator, Printer, FlaskConical } from "lucide-react";

export function SettingsView() {
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsDto>("/api/settings"),
  });

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={Settings}
        title="Paramètres"
        description="Configuration du restaurant et de la caisse"
      />

      {isLoading || !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <SettingsForm initial={data} />
      )}
    </div>
  );
}

function SettingsForm({ initial }: { initial: SettingsDto }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SettingsDto>(initial);

  const save = useMutation({
    mutationFn: (body: SettingsDto) => api.put<SettingsDto>("/api/settings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Paramètres enregistrés");
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de l'enregistrement");
    },
  });

  const update = <K extends keyof SettingsDto>(key: K, value: SettingsDto[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  // Printer commissioning (C-03, Batch 1.3). Prints against the SAVED
  // settings, not the unsaved form — the server reads its own configuration,
  // so testing an edit that has not been saved would silently test the old
  // address. Hence the "enregistrez avant de tester" hint next to the button.
  const [printerTesting, setPrinterTesting] = useState(false);

  const runPrinterTest = async (openDrawer: boolean) => {
    setPrinterTesting(true);
    try {
      const result = await api.post<{ ok: boolean; columns?: number; target?: string }>(
        "/api/print/test",
        { openDrawer },
      );
      toast.success(
        openDrawer
          ? "Page de test envoyée — le tiroir doit s'ouvrir."
          : `Page de test envoyée (${result.columns ?? "?"} colonnes).`,
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Échec de l'impression de test.");
    } finally {
      setPrinterTesting(false);
    }
  };

  const canSubmit =
    form.restaurantName.trim().length > 0 && !save.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    save.mutate(form);
  };

  return (
        <div className="flex flex-1 flex-col gap-5">
          {/* Restaurant */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Store className="h-4 w-4 text-primary" />
                Restaurant
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label htmlFor="r-name">
                    Nom du restaurant <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="r-name"
                    value={form.restaurantName}
                    onChange={(e) => update("restaurantName", e.target.value)}
                    placeholder="HibaPOS France"
                  />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label htmlFor="r-addr">Adresse</Label>
                  <Textarea
                    id="r-addr"
                    value={form.restaurantAddress ?? ""}
                    onChange={(e) =>
                      update("restaurantAddress", e.target.value || null)
                    }
                    placeholder="12 rue de la Paix, 75002 Paris"
                    className="min-h-20"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="r-phone">Téléphone</Label>
                  <Input
                    id="r-phone"
                    value={form.restaurantPhone ?? ""}
                    onChange={(e) =>
                      update("restaurantPhone", e.target.value || null)
                    }
                    placeholder="01 23 45 67 89"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="r-siret">SIRET</Label>
                  <Input
                    id="r-siret"
                    value={form.restaurantSiret ?? ""}
                    onChange={(e) =>
                      update("restaurantSiret", e.target.value || null)
                    }
                    placeholder="123 456 789 00012"
                  />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label htmlFor="r-tva">N° TVA intracom.</Label>
                  <Input
                    id="r-tva"
                    value={form.restaurantTva ?? ""}
                    onChange={(e) =>
                      update("restaurantTva", e.target.value || null)
                    }
                    placeholder="FR12345678901"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Caisse */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calculator className="h-4 w-4 text-primary" />
                Caisse
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="s-vat">Taux de TVA par défaut (%)</Label>
                  <Input
                    id="s-vat"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={form.defaultVatRate}
                    onChange={(e) =>
                      update("defaultVatRate", Number(e.target.value) || 0)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    10 % alimentaire, 20 % boissons, 5,5 % certaines boissons.
                  </p>
                </div>
                {/* DD-24 (Batch 3.8). Written in the operator's terms, not the
                    code's: this is "when does my day end", and the consequence
                    it controls is which day a late ticket lands in. */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="s-cutoff">Fin de la journée d&apos;exploitation</Label>
                  <Input
                    id="s-cutoff"
                    type="number"
                    min="0"
                    max="23"
                    value={form.businessDayCutoffHour ?? 5}
                    onChange={(e) =>
                      update("businessDayCutoffHour", Number(e.target.value) || 0)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Heure à laquelle une journée d&apos;exploitation se termine et la suivante
                    commence. Avec 5, un service qui finit à 1h30 reste dans la journée de la
                    veille. Mettez 0 pour suivre le calendrier. Détermine aussi les bornes des
                    clôtures mensuelle et annuelle.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="s-width">Largeur du ticket</Label>
                  <Select
                    value={String(form.receiptWidth)}
                    onValueChange={(v) => update("receiptWidth", Number(v))}
                  >
                    <SelectTrigger id="s-width" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* The stored value is a COLUMN count, which is what
                          renderReceipt lays the ticket out to (L-13). The
                          label names the paper it corresponds to, because
                          that is what the operator can actually measure. */}
                      <SelectItem value="32">58 mm (32 colonnes)</SelectItem>
                      <SelectItem value="48">80 mm (48 colonnes)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Imprimez une page de test pour vérifier que la règle tient
                    sur une seule ligne.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <Label htmlFor="s-footer">Note de bas de ticket</Label>
                  <Textarea
                    id="s-footer"
                    maxLength={200}
                    value={form.footerNote ?? ""}
                    onChange={(e) =>
                      update("footerNote", e.target.value || null)
                    }
                    placeholder="Merci de votre visite !"
                    className="min-h-20"
                  />
                  <p className="text-xs text-muted-foreground">
                    {(form.footerNote ?? "").length}/200 caractères.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Imprimante */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Printer className="h-4 w-4 text-primary" />
                Imprimante
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="p-name">Nom de l&apos;imprimante</Label>
                <Input
                  id="p-name"
                  value={form.printerName ?? ""}
                  onChange={(e) =>
                    update("printerName", e.target.value || null)
                  }
                  placeholder="Sunso WTP-801"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="p-host">Adresse IP de l&apos;imprimante</Label>
                  <Input
                    id="p-host"
                    value={form.printerHost ?? ""}
                    onChange={(e) => update("printerHost", e.target.value || null)}
                    placeholder="192.168.1.50"
                    inputMode="decimal"
                  />
                  <p className="text-xs text-muted-foreground">
                    L&apos;imprimante doit avoir une adresse IP fixe.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="p-port">Port</Label>
                  <Input
                    id="p-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.printerPort ?? 9100}
                    onChange={(e) => update("printerPort", Number(e.target.value) || 9100)}
                  />
                  <p className="text-xs text-muted-foreground">
                    9100 sauf configuration particulière.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="printer-enabled"
                  type="checkbox"
                  checked={form.printerEnabled ?? false}
                  onChange={(e) => update("printerEnabled", e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="printer-enabled" className="cursor-pointer text-sm font-normal">
                  Imprimer les tickets sur l&apos;imprimante thermique
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="drawer-on-cash"
                  type="checkbox"
                  checked={form.openDrawerOnCash ?? true}
                  onChange={(e) => update("openDrawerOnCash", e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="drawer-on-cash" className="cursor-pointer text-sm font-normal">
                  Ouvrir le tiroir-caisse lors d&apos;un paiement en espèces
                </Label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="auto-print"
                  type="checkbox"
                  checked={form.autoPrint ?? false}
                  onChange={(e) => update("autoPrint", e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="auto-print" className="cursor-pointer text-sm font-normal">
                  Ouvrir aussi la boîte d&apos;impression du navigateur
                </Label>
              </div>

              <Separator />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => runPrinterTest(false)}
                  disabled={printerTesting}
                >
                  {printerTesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4" />
                  )}
                  Imprimer une page de test
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => runPrinterTest(true)}
                  disabled={printerTesting}
                >
                  Tester le tiroir-caisse
                </Button>
                <p className="text-xs text-muted-foreground">
                  Enregistrez les réglages avant de tester.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Mode FACTICE / simulation (L-18, Batch 3.1b).
              The mode was already wired into every fiscal write path and into
              renderReceipt(); it simply had no control, so it was permanently
              off and development sales were journalled as genuine. */}
          <Card className={form.factice ? "border-amber-500/60 bg-amber-500/[0.06]" : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4 text-primary" />
                Mode formation (FACTICE)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <input
                  id="factice"
                  type="checkbox"
                  checked={form.factice ?? false}
                  onChange={(e) => update("factice", e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <Label htmlFor="factice" className="cursor-pointer text-sm font-normal">
                  Marquer les ventes comme simulations
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                À activer pour les essais et la formation. Chaque ticket porte alors la mention
                <strong> FACTICE — SIMULATION / TICKET NON VALABLE</strong>, et chaque écriture du
                journal fiscal est marquée comme fictive. À désactiver avant la première vente
                réelle.
              </p>
              {form.factice ? (
                <p className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                  Mode formation actif — les ventes enregistrées ne sont pas des ventes réelles.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Separator />

          <div className="flex justify-end pb-2">
            <Button onClick={handleSubmit} disabled={!canSubmit} size="lg">
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Enregistrer
            </Button>
          </div>
        </div>
  );
}
