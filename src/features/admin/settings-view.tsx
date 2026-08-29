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
import { Settings, Save, Loader2, Store, Calculator, Printer } from "lucide-react";

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
                      <SelectItem value="58">58 mm</SelectItem>
                      <SelectItem value="80">80 mm</SelectItem>
                    </SelectContent>
                  </Select>
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
                  placeholder="Epson TM-m30"
                />
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
                  Impression automatique du ticket après encaissement
                </Label>
              </div>
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
