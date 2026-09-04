"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Images,
  Upload,
  Trash2,
  Copy,
  Loader2,
  ZoomIn,
  Tag,
  Package,
  Settings2,
  Folder,
  PlusCircle,
} from "lucide-react";

type MediaItem = {
  url: string;
  filename: string;
  folder: string;  // e.g. "produits" or "" for root
  size: number | null;
  width: number | null;
  height: number | null;
  usedBy: { type: string; label: string }[];
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const TYPE_META: Record<string, { label: string; icon: typeof Package; color: string }> = {
  produit: { label: "Produit", icon: Package, color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  option:  { label: "Option",  icon: Settings2, color: "bg-violet-500/10 text-violet-600 border-violet-200" },
  categorie: { label: "Catégorie", icon: Folder, color: "bg-amber-500/10 text-amber-600 border-amber-200" },
  // C-25 (Batch 4.6): add-ons became visible as usage. Without an entry
  // here the badge would fall back to rendering the raw type string.
  supplement: { label: "Supplément", icon: PlusCircle, color: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
};

export function MediaView() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [uploadFolder, setUploadFolder] = useState<string>("Produits");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ["media"],
    queryFn: () => api.get<MediaItem[]>("/api/media"),
  });

  // Collect unique folder names from the data
  const folders = Array.from(new Set(items.map((i) => i.folder).filter(Boolean))).sort();
  const filtered = folderFilter ? items.filter((i) => i.folder === folderFilter) : items;

  const deleteMutation = useMutation({
    mutationFn: (url: string) =>
      api.delete("/api/media", { url }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media"] });
      toast.success("Image supprimée");
      setDeleteTarget(null);
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de la suppression");
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const oversized = files.filter((f) => f.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      toast.error(`${oversized.length} image(s) trop volumineuse(s) (max 5 Mo).`);
    }

    const toUpload = files.filter((f) => f.size <= 5 * 1024 * 1024);
    if (toUpload.length === 0) {
      e.target.value = "";
      return;
    }

    setUploading(true);
    let success = 0;
    let failed = 0;

    for (const file of toUpload) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (uploadFolder) formData.append("folder", uploadFolder);
        await api.post<{ url: string }>("/api/upload", formData);
        success++;
      } catch {
        failed++;
      }
    }

    if (success > 0) {
      toast.success(`${success} image(s) importée(s).`);
      qc.invalidateQueries({ queryKey: ["media"] });
    }
    if (failed > 0) {
      toast.error(`${failed} échec(s).`);
    }

    setUploading(false);
    e.target.value = "";
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("URL copiée !");
  };

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={Images}
        title="Médiathèque"
        description="Toutes les images utilisées dans vos produits, catégories et options de personnalisation."
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              onClick={() => {
                setUploadFolder(folderFilter || "Produits");
                setUploadDialogOpen(true);
              }}
              disabled={uploading}
              className="gap-2"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Importer une image
            </Button>
          </>
        }
      />

      {/* Folder filter bar */}
      {folders.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFolderFilter(null)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              folderFilter === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <Images className="h-3 w-3" /> Tout
          </button>
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => setFolderFilter(folderFilter === f ? null : f)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                folderFilter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <Folder className="h-3 w-3" />
              {f}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Images className="h-12 w-12 opacity-20" />
          <p className="text-sm">{folderFilter ? `Aucune image dans "${folderFilter}"` : "Aucune image trouvee."}</p>
          <p className="max-w-xs text-center text-xs opacity-70">
            Ajoutez des images à vos produits, catégories ou options de personnalisation pour les voir apparaître ici.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{filtered.length} image{filtered.length !== 1 ? "s" : ""}{folderFilter ? ` dans "${folderFilter}"` : ""}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filtered.map((item) => (
              <MediaCard
                key={item.url}
                item={item}
                onPreview={() => setPreview(item)}
                onCopy={() => handleCopy(item.url)}
                onDelete={() => setDeleteTarget(item)}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Lightbox preview ── */}
      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
          {preview && (
            <div className="flex flex-col">
              <div className="relative flex max-h-[60vh] items-center justify-center overflow-hidden bg-muted/40">
                <img
                  src={preview.url}
                  alt={preview.filename}
                  className="max-h-[60vh] w-full object-contain"
                />
              </div>
              <div className="flex flex-col gap-3 p-5">
                <p className="font-semibold text-foreground truncate">{preview.filename}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(preview.size)}</p>
                <div className="flex flex-wrap gap-2">
                  {preview.usedBy.map((u, i) => {
                    const meta = TYPE_META[u.type];
                    const Icon = meta?.icon ?? Tag;
                    return (
                      <span
                        key={i}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${meta?.color ?? "bg-muted text-foreground"}`}
                      >
                        <Icon className="h-3 w-3" />
                        {u.label}
                      </span>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleCopy(preview.url)}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copier l&apos;URL
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => { setPreview(null); setDeleteTarget(preview); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette image&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Le fichier <span className="font-medium text-foreground">{deleteTarget?.filename}</span> sera
                  supprimé définitivement du disque.
                </p>
                {deleteTarget && deleteTarget.usedBy.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-2 text-sm font-semibold text-amber-800">
                      ⚠ Cette image est actuellement utilisée par :
                    </p>
                    <ul className="space-y-1">
                      {deleteTarget.usedBy.map((u, i) => {
                        const meta = TYPE_META[u.type];
                        const Icon = meta?.icon ?? Tag;
                        return (
                          <li key={i} className="flex items-center gap-2 text-xs text-amber-700">
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="font-medium capitalize">{meta?.label ?? u.type}</span>
                            <span className="text-amber-600">— {u.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-xs text-amber-600">
                      Les images de ces éléments seront retirées.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.url)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Supprimer définitivement"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Upload Target Folder Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Importer une image</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Dossier de destination</Label>
              <Select value={uploadFolder} onValueChange={setUploadFolder}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Produits">Produits</SelectItem>
                  <SelectItem value="Categories">Catégories</SelectItem>
                  <SelectItem value="Options">Options</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Choisissez le dossier dans lequel vous souhaitez ranger cette image pour mieux l'organiser.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Annuler</Button>
            <Button onClick={() => {
              setUploadDialogOpen(false);
              fileInputRef.current?.click();
            }}>Continuer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MediaCard
// ─────────────────────────────────────────────────────────────────────────────
function MediaCard({
  item,
  onPreview,
  onCopy,
  onDelete,
}: {
  item: MediaItem;
  onPreview: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const primaryUsage = item.usedBy[0];
  const meta = primaryUsage ? TYPE_META[primaryUsage.type] : null;
  const Icon = meta?.icon ?? Tag;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      {/* Image area */}
      <button
        type="button"
        onClick={onPreview}
        className="relative aspect-square overflow-hidden bg-muted/30"
      >
        <img
          src={item.url}
          alt={item.filename}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Hover overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/20 group-hover:opacity-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-md">
            <ZoomIn className="h-4 w-4 text-foreground" />
          </div>
        </div>
      </button>

      {/* Info area */}
      <div className="flex flex-col gap-1.5 p-2.5">
        <p className="truncate text-[11px] font-medium text-foreground leading-tight" title={item.filename}>
          {item.filename}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-muted-foreground">{formatBytes(item.size)}</p>
          {item.width && item.height && (
            <p className={`text-[10px] ${(item.width < 300 || item.height < 300) ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
              {item.width}×{item.height}
              {(item.width < 300 || item.height < 300) && " (basse résolution)"}
            </p>
          )}
        </div>

        {/* Folder badge */}
        {item.folder && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
            <Folder className="h-2.5 w-2.5" />
            {item.folder}
          </span>
        )}

        {/* Usage badge */}
        {primaryUsage && meta && (
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.color}`}
          >
            <Icon className="h-2.5 w-2.5" />
            {primaryUsage.label.length > 14 ? primaryUsage.label.slice(0, 14) + "…" : primaryUsage.label}
            {item.usedBy.length > 1 && (
              <span className="ml-0.5 opacity-60">+{item.usedBy.length - 1}</span>
            )}
          </span>
        )}
      </div>

      {/* Action buttons (appear on hover) */}
      <div className="absolute right-1.5 top-1.5 flex flex-col gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button
          type="button"
          aria-label="Copier l'URL"
          onClick={(e) => { e.stopPropagation(); onCopy(); }}
          title="Copier l'URL"
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/90 shadow text-foreground hover:bg-white"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Supprimer l'image"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Supprimer"
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/90 shadow text-destructive hover:bg-white"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
