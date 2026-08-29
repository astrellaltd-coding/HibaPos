"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Upload, Loader2, Search, X, Images, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

type MediaItem = {
  url: string;
  filename: string;
  folder: string;
  size: number | null;
  width: number | null;
  height: number | null;
  usedBy: { type: string; label: string }[];
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called when user confirms a selection */
  onSelect: (url: string) => void;
  /** Currently selected URL (highlights it in the grid) */
  currentUrl?: string | null;
  title?: string;
  /** Automatically upload to this folder */
  defaultFolder?: string;
};

export function MediaPickerDialog({ open, onOpenChange, onSelect, currentUrl, title = "Choisir une image", defaultFolder }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(currentUrl ?? null);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState<string | null>(defaultFolder ?? null);

  const { data: items = [], isLoading } = useQuery<MediaItem[]>({
    queryKey: ["media"],
    queryFn: () => api.get<MediaItem[]>("/api/media"),
    enabled: open,
  });

  const folders = Array.from(new Set(items.map((i) => i.folder).filter(Boolean))).sort();
  
  let filtered = items.filter((item) =>
    !search.trim() || item.filename.toLowerCase().includes(search.toLowerCase())
  );
  if (folderFilter) {
    filtered = filtered.filter((i) => i.folder === folderFilter);
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop volumineuse (max 5 Mo).");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (defaultFolder) formData.append("folder", defaultFolder);
      const res = await api.post<{ url: string }>("/api/upload", formData);
      await qc.invalidateQueries({ queryKey: ["media"] });
      setSelected(res.url);
      toast.success("Image importée.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Echec du téléchargement.";
      toast.error(msg);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleOpen = (v: boolean) => {
    if (!v) {
      setSearch("");
      setFolderFilter(defaultFolder ?? null);
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Images className="h-4.5 w-4.5 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="h-8 pl-8 text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Importer
          </Button>
        </div>

        {/* Folder filter bar */}
        {folders.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2 border-b border-border bg-muted/10 px-5 py-2">
            <button
              onClick={() => setFolderFilter(null)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                folderFilter === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              <Images className="h-3 w-3" /> Tout
            </button>
            {folders.map((f) => (
              <button
                key={f}
                onClick={() => setFolderFilter(folderFilter === f ? null : f)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors",
                  folderFilter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                <Folder className="h-3 w-3" />
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Grid — min-h-0 + overflow-y-auto fixes scroll when nested inside another Dialog.
            ScrollArea's h-full cannot resolve in a nested dialog context; explicit overflow works. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="p-4">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Images className="h-10 w-10 opacity-20" />
                <p className="text-sm">
                  {items.length === 0
                    ? "Aucune image. Importez-en une ci-dessus."
                    : "Aucun resultat pour cette recherche."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {filtered.map((item) => {
                  const isSel = selected === item.url;
                  return (
                    <button
                      key={item.url}
                      type="button"
                      onClick={() => {
                        onSelect(item.url);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-xl border-2 transition-all duration-150",
                        isSel ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-primary/50"
                      )}
                    >
                      <img
                        src={item.url}
                        alt={item.filename}
                        className="h-full w-full object-cover"
                      />

                      {/* Filename tooltip on hover */}
                      <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-2 py-1 text-center text-[10px] text-white opacity-0 transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100">
                        <p className="truncate">{item.filename}</p>
                        {item.width && item.height && (
                          <p className="text-[9px] opacity-80">{item.width}×{item.height}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => handleOpen(false)}>
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
