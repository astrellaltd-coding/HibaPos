"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Download, Upload, Loader2, PackageOpen, TriangleAlert } from "lucide-react";

// Catalogue transfer — the operator's own screen for it (2026-09-11).
//
// The point of this card is that install day runs NO COMMANDS. The catalogue
// leaves one install as a file and enters the next through a file picker, and
// both halves report what they did in French. Everything it needs is already
// settled by the two routes: SUPER_ADMIN, refuse-into-non-empty, ids preserved.
//
// It is deliberately plain. Import is the destructive half and gets a
// confirmation naming the counts from the FILE, so the operator sees what they
// are about to apply rather than a filename.

/** What the two routes exchange. Only the fields this screen reads. */
type CatalogueFile = {
  format: string;
  exportedAt: string;
  software: string;
  migration: string | null;
  counts: Record<string, number>;
  missingImages: string[];
  tables: Record<string, unknown[]>;
};

type ImportResult = {
  total: number;
  inserted: Record<string, number>;
  from: { exportedAt: string; software: string; migration: string | null };
};

const LABELS: Record<string, string> = {
  category: "catégories",
  product: "produits",
  optionGroup: "groupes d'options",
  optionChoice: "choix d'options",
  categoryOptionGroup: "groupes de catégorie",
  categoryOptionChoice: "choix de catégorie",
  categoryAddOn: "suppléments",
  comboSlot: "emplacements de menu",
  comboSlotChoice: "choix d'emplacement",
  comboSlotOptionRule: "règles d'option",
};

function summarise(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${LABELS[k] ?? k}`)
    .join(" · ");
}

export function CatalogueTransferCard() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: CatalogueFile; name: string } | null>(null);

  const exportIt = useMutation({
    mutationFn: () => api.get<CatalogueFile>("/api/catalog/export"),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hibapos-catalogue-${data.exportedAt.replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Catalogue exporté", { description: summarise(data.counts) });
      // Not a failure, and not silent either: the images travel with the
      // application, so a path with no file is a problem to fix HERE.
      if (data.missingImages.length) {
        toast.warning(
          `${data.missingImages.length} image(s) référencée(s) sont absentes du disque`,
          { description: data.missingImages.slice(0, 3).join(" · ") },
        );
      }
    },
    onError: (e) =>
      toast.error("Export impossible", {
        description: e instanceof ApiError ? e.message : String(e),
      }),
  });

  const importIt = useMutation({
    mutationFn: (file: CatalogueFile) => api.post<ImportResult>("/api/catalog/import", file),
    onSuccess: (r) => {
      setPending(null);
      // Everything on screen was read from the catalogue that just changed.
      qc.invalidateQueries();
      toast.success(`Catalogue importé — ${r.total} lignes`, {
        description: summarise(r.inserted),
      });
    },
    onError: (e) => {
      setPending(null);
      toast.error("Import refusé", {
        description: e instanceof ApiError ? e.message : String(e),
      });
    },
  });

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Reset immediately, so choosing the same file twice still fires a change.
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onerror = () => toast.error("Fichier illisible");
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as CatalogueFile;
        if (!parsed?.format?.startsWith("hibapos-catalogue/")) {
          toast.error("Ce fichier n'est pas un export de catalogue HibaPOS");
          return;
        }
        setPending({ file: parsed, name: f.name });
      } catch {
        toast.error("Ce fichier n'est pas du JSON valide");
      }
    };
    reader.readAsText(f);
  }

  const fileCounts = pending
    ? Object.fromEntries(
        Object.entries(pending.file.tables).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
      )
    : {};

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageOpen className="h-4 w-4 text-primary" />
            Catalogue — export / import
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Déplace le catalogue — catégories, produits, options, suppléments et menus composés —
            vers une installation neuve. Les <strong>images ne sont pas dans le fichier</strong> :
            elles sont livrées avec l&apos;application. Les réglages et les ventes ne sont pas
            exportés.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => exportIt.mutate()}
              disabled={exportIt.isPending}
              variant="outline"
            >
              {exportIt.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exporter le catalogue
            </Button>

            <Button
              onClick={() => fileInput.current?.click()}
              disabled={importIt.isPending}
              variant="outline"
            >
              {importIt.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Importer un catalogue
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              onChange={choose}
              className="hidden"
              aria-hidden="true"
            />
          </div>

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            L&apos;import <strong>ne fusionne pas</strong> : il n&apos;écrit que dans un catalogue
            vide et refuse sinon, sans rien modifier. Chaque ligne conserve son identifiant, donc
            un catalogue réimporté reste le même catalogue.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-amber-600" />
              Importer ce catalogue ?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm">
                <span className="font-medium text-foreground">{pending?.name}</span>
                <span>{summarise(fileCounts)}</span>
                {pending ? (
                  <span className="text-xs text-muted-foreground">
                    Exporté le {new Date(pending.file.exportedAt).toLocaleString("fr-FR")} par{" "}
                    {pending.file.software || "—"}
                    {pending.file.migration ? ` · schéma ${pending.file.migration}` : ""}
                  </span>
                ) : null}
                <span className="text-xs">
                  Le catalogue actuel doit être vide. S&apos;il ne l&apos;est pas, l&apos;import
                  sera refusé et rien ne changera.
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pending && importIt.mutate(pending.file)}
              disabled={importIt.isPending}
            >
              Importer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
