"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { CategoryDto } from "@/types/api";
import { PageHeader, EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FolderTree, Plus, PlusCircle, Pencil, Trash2, Loader2, Package, ImagePlus, X, Ruler, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaPickerDialog } from "@/components/shared/media-picker-dialog";

const COLOR_PRESETS = [
  "#f59e0b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#10b981",
  "#06b6d4",
  "#0ea5e9",
  "#ec4899",
  "#a855f7",
  "#64748b",
];

type CategoryForm = {
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  active: boolean;
  parentId: string;
  /** "" = not set here (inherit from the parent, or the product's own rate). */
  vatRate: string;
  optionGroups: CategoryOptionGroupForm[];
  addOns: CategoryAddOnForm[];
};

type CategoryOptionGroupForm = {
  id?: string;
  name: string;
  required: boolean;
  multiple: boolean;
  sortOrder: number;
  choices: CategoryOptionChoiceForm[];
};

type CategoryOptionChoiceForm = {
  id?: string;
  name: string;
  priceModifier: number;
  pickupPriceModifier: number | null;
  deliveryPriceModifier: number | null;
  image: string | null;
  sortOrder: number;
};

type CategoryAddOnForm = {
  id?: string;
  name: string;
  price: number;
  image: string | null;
  sortOrder: number;
  active: boolean;
};

type CategoryPayload = {
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  active: boolean;
  parentId: string | null;
  vatRate: number | null;
  optionGroups: CategoryOptionGroupForm[];
  addOns: CategoryAddOnForm[];
};

const EMPTY_FORM: CategoryForm = {
  name: "",
  color: COLOR_PRESETS[0],
  icon: "",
  sortOrder: 0,
  active: true,
  parentId: "",
  vatRate: "",
  optionGroups: [],
  addOns: [],
};

/** Returns true if the icon value is a URL (uploaded image) rather than an emoji */
function isImageUrl(icon: string | null | undefined): boolean {
  if (!icon) return false;
  return icon.startsWith("/") || icon.startsWith("http");
}

export function CategoriesView() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryDto | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<
    | { type: "icon" }
    | { type: "choice"; groupIndex: number; choiceIndex: number }
    | { type: "addon"; addonIndex: number }
    | null
  >(null);

  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevGroupCount = useRef(form.optionGroups.length);

  useEffect(() => {
    if (form.optionGroups.length > prevGroupCount.current) {
      const lastEl = groupRefs.current[form.optionGroups.length - 1];
      if (lastEl) {
        lastEl.scrollIntoView({ behavior: "smooth", block: "center" });
        const input = lastEl.querySelector("input") as HTMLInputElement | null;
        input?.focus();
      }
    }
    prevGroupCount.current = form.optionGroups.length;
  }, [form.optionGroups.length]);

  // Category-level sizes (Taille group)
  const [sizesEnabled, setSizesEnabled] = useState(false);
  const [sizes, setSizes] = useState<{ name: string; pickupPrice: number; deliveryPrice: number }[]>([
    { name: "", pickupPrice: 0, deliveryPrice: 0 },
    { name: "", pickupPrice: 0, deliveryPrice: 0 },
    { name: "", pickupPrice: 0, deliveryPrice: 0 },
  ]);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<CategoryDto[]>("/api/catalog/categories"),
  });

  // Reset form state on dialog CLOSE — moved here so we don't call setState
  // inside an effect (react-hooks/set-state-in-effect rule).
  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setSizesEnabled(false);
    setSizes([
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
    ]);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSizesEnabled(false);
    setSizes([
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
    ]);
    setDialogOpen(true);
  };

  const openCreateSub = (parentId: string) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, parentId });
    setSizesEnabled(false);
    setSizes([
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
      { name: "", pickupPrice: 0, deliveryPrice: 0 },
    ]);
    setDialogOpen(true);
  };

  const openEdit = async (cat: CategoryDto) => {
    setEditing(cat);
    // Fetch full category details including option groups and add-ons
    const full = await api.get<CategoryDto>(`/api/catalog/categories/${cat.id}`);
    const sizeGroup = (full.optionGroups ?? []).find((g) => g.name === "Taille");
    const hasSizes = !!sizeGroup && sizeGroup.choices.length >= 2;
    setSizesEnabled(hasSizes);
    if (hasSizes) {
      setSizes(
        sizeGroup!.choices.map((c) => ({
          name: c.name,
          pickupPrice: (c.priceModifier ?? 0) / 100,
          deliveryPrice: (c.deliveryPriceModifier ?? c.priceModifier ?? 0) / 100,
        })),
      );
    } else {
      setSizes([
        { name: "", pickupPrice: 0, deliveryPrice: 0 },
        { name: "", pickupPrice: 0, deliveryPrice: 0 },
        { name: "", pickupPrice: 0, deliveryPrice: 0 },
      ]);
    }
    setForm({
      name: full.name,
      color: full.color,
      icon: full.icon ?? "",
      sortOrder: full.sortOrder,
      active: full.active,
      parentId: full.parentId ?? "",
      vatRate: full.vatRate == null ? "" : String(full.vatRate),
      optionGroups: (full.optionGroups ?? [])
        .filter((g) => g.name !== "Taille")
        .map((g) => ({
          id: g.id,
          name: g.name,
          required: g.required,
          multiple: g.multiple,
          sortOrder: g.sortOrder,
          choices: g.choices.map((c) => ({
            id: c.id,
            name: c.name,
            priceModifier: c.priceModifier / 100,
            pickupPriceModifier: c.pickupPriceModifier ?? null,
            deliveryPriceModifier: c.deliveryPriceModifier ?? null,
            image: c.image ?? null,
            sortOrder: c.sortOrder,
          })),
        })),
      addOns: (full.addOns ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        price: a.price / 100,
        image: a.image,
        sortOrder: a.sortOrder,
        active: a.active,
      })),
    });
    setDialogOpen(true);
  };

  const createMut = useMutation({
    mutationFn: (body: CategoryPayload) =>
      api.post<CategoryDto>("/api/catalog/categories", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Catégorie créée");
      closeDialog();
    },
    onError: (e: ApiError) => toast.error(e.message || "Erreur lors de la création"),
  });

  const updateMut = useMutation({
    mutationFn: (body: CategoryPayload) =>
      api.put<CategoryDto>(`/api/catalog/categories/${editing?.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Catégorie mise à jour");
      closeDialog();
    },
    onError: (e: ApiError) => toast.error(e.message || "Erreur lors de la mise à jour"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/catalog/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      toast.success("Catégorie supprimée");
      setDeleteTarget(null);
      setDeleteConfirm("");
    },
    onError: (e: ApiError) => toast.error(e.message || "Erreur lors de la suppression"),
  });

  // upload is now handled via MediaPickerDialog

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Le nom est requis");
      return;
    }
    setSaving(true);
    try {
      const sizeGroup = sizesEnabled
        ? {
            name: "Taille",
            required: true,
            multiple: false,
            sortOrder: 0,
            choices: sizes
              .filter((s) => s.name.trim())
              .map((s, j) => ({
                name: s.name.trim(),
                priceModifier: 0,
                pickupPriceModifier: null,
                deliveryPriceModifier: null,
                pickupPrice: Math.round((Number(s.pickupPrice) || 0) * 100),
                deliveryPrice: Math.round((Number(s.deliveryPrice) || 0) * 100),
                image: null,
                sortOrder: j,
              })),
          }
        : null;

      const payload: CategoryPayload = {
        name: form.name.trim(),
        color: form.color,
        icon: form.icon.trim() || null,
        sortOrder: Number.isFinite(form.sortOrder) ? Number(form.sortOrder) : 0,
        active: form.active,
        parentId: form.parentId.trim() || null,
        vatRate: form.vatRate === "" ? null : Number(form.vatRate),
        optionGroups: [
          ...(sizeGroup ? [sizeGroup] : []),
          ...form.optionGroups.map((g, i) => ({
            name: g.name,
            required: g.required,
            multiple: g.multiple,
            sortOrder: sizeGroup ? i + 1 : i,
            choices: g.choices.map((c, j) => ({
              name: c.name,
              priceModifier: Math.round((c.priceModifier || 0) * 100),
              pickupPriceModifier: c.pickupPriceModifier,
              deliveryPriceModifier: c.deliveryPriceModifier,
              image: c.image,
              sortOrder: j,
            })),
          })),
        ],
        addOns: form.addOns.map((a, i) => ({
          name: a.name,
          price: Math.round((a.price || 0) * 100),
          image: a.image,
          sortOrder: i,
          active: a.active,
        })),
      };
      if (editing) {
        await updateMut.mutateAsync(payload);
      } else {
        await createMut.mutateAsync(payload);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteConfirm !== deleteTarget.name) {
      toast.error("Le nom saisi ne correspond pas");
      return;
    }
    setDeleting(true);
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={FolderTree}
        title="Catégories"
        description="Organisez vos produits par catégorie"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nouvelle catégorie
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !categories || categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Aucune catégorie"
          description="Créez votre première catégorie pour organiser vos produits."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nouvelle catégorie
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(() => {
            // Build tree: render parents first, then their children indented
            const roots = categories.filter((c) => !c.parentId);
            const rendered: React.ReactNode[] = [];
            const renderCat = (cat: CategoryDto, depth: number) => {
              rendered.push(
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  depth={depth}
                  onEdit={() => openEdit(cat)}
                  onDelete={() => {
                    setDeleteTarget(cat);
                    setDeleteConfirm("");
                  }}
                  onCreateSub={depth === 0 ? () => openCreateSub(cat.id) : undefined}
                />,
              );
              // Render children in sort order
              const children = categories
                .filter((c) => c.parentId === cat.id)
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
              for (const child of children) {
                renderCat(child, depth + 1);
              }
            };
            for (const root of roots.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
              renderCat(root, 0);
            }
            return rendered;
          })()}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Modifier la catégorie" : "Nouvelle catégorie"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Mettez à jour les informations de la catégorie."
                : "Renseignez les informations de la nouvelle catégorie."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Left column — basic info */}
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="cat-name">Nom</Label>
                <Input
                  id="cat-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex. Burgers"
                  autoFocus
                  maxLength={60}
                />
              </div>

              <div className="grid gap-2">
                <Label>Couleur</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={cn(
                        "h-11 w-11 rounded-full border-2 transition-transform hover:scale-110",
                        form.color.toLowerCase() === c.toLowerCase()
                          ? "border-foreground ring-2 ring-foreground/20"
                          : "border-transparent",
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Couleur ${c}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="cat-color" className="sr-only">
                    Couleur personnalisée
                  </Label>
                  <input
                    id="cat-color"
                    type="color"
                    value={form.color}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, color: e.target.value }))
                    }
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <Input
                    type="text"
                    value={form.color}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, color: e.target.value }))
                    }
                    className="w-28 font-mono text-xs"
                    placeholder="#f59e0b"
                  />
                </div>
              </div>

              {/* Image de la categorie — media picker */}
              <MediaPickerDialog
                open={pickerOpen}
                onOpenChange={(v) => { if (!v) setPickerTarget(null); setPickerOpen(v); }}
                currentUrl={
                  pickerTarget?.type === "icon" && isImageUrl(form.icon)
                    ? form.icon
                    : pickerTarget?.type === "choice" && pickerTarget.groupIndex != null && pickerTarget.choiceIndex != null
                      ? (form.optionGroups[pickerTarget.groupIndex]?.choices[pickerTarget.choiceIndex]?.image ?? null)
                      : pickerTarget?.type === "addon" && pickerTarget.addonIndex != null
                        ? (form.addOns[pickerTarget.addonIndex]?.image ?? null)
                        : null
                }
                title={
                  pickerTarget?.type === "icon"
                    ? "Image de la catégorie"
                    : pickerTarget?.type === "choice"
                      ? "Image du choix"
                      : "Image du supplément"
                }
                defaultFolder="Categories"
                onSelect={(url) => {
                  if (pickerTarget?.type === "icon") {
                    setForm((f) => ({ ...f, icon: url }));
                  } else if (pickerTarget?.type === "choice") {
                    setForm((f) => {
                      const next = [...f.optionGroups];
                      const choices = [...next[pickerTarget.groupIndex].choices];
                      choices[pickerTarget.choiceIndex] = { ...choices[pickerTarget.choiceIndex], image: url };
                      next[pickerTarget.groupIndex] = { ...next[pickerTarget.groupIndex], choices };
                      return { ...f, optionGroups: next };
                    });
                  } else if (pickerTarget?.type === "addon") {
                    setForm((f) => {
                      const next = [...f.addOns];
                      next[pickerTarget.addonIndex] = { ...next[pickerTarget.addonIndex], image: url };
                      return { ...f, addOns: next };
                    });
                  }
                  setPickerOpen(false);
                  setPickerTarget(null);
                }}
              />
              {form.icon && isImageUrl(form.icon) ? (
                <div className="relative w-full overflow-hidden rounded-xl border border-border bg-muted/30">
                  <img
                    src={form.icon}
                    alt="Image categorie"
                    className="h-32 w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label="Supprimer l'image"
                    onClick={() => setForm((f) => ({ ...f, icon: "" }))}
                    className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPickerTarget({ type: "icon" }); setPickerOpen(true); }}
                    className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 text-xs text-white transition-colors hover:bg-black/70"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Changer
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setPickerTarget({ type: "icon" }); setPickerOpen(true); }}
                  className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                >
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-sm font-medium">Choisir depuis la mediateheque</span>
                  <span className="text-xs">PNG, JPG, WEBP</span>
                </button>
              )}

              <div className="grid gap-2">
                <Label htmlFor="cat-sort">Ordre de tri</Label>
                <Input
                  id="cat-sort"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      sortOrder: parseInt(e.target.value, 10) || 0,
                    }))
                  }
                  min={0}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <div>
                  <Label htmlFor="cat-active" className="cursor-pointer">
                    Catégorie active
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Les catégories inactives n'apparaissent pas à la caisse.
                  </p>
                </div>
                <Switch
                  id="cat-active"
                  checked={form.active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                />
              </div>

              {/* Parent category info: shown when creating a sub-category */}
              {form.parentId && !editing && (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    Sera créée sous :{" "}
                    <span className="font-medium text-foreground">
                      {categories?.find((c) => c.id === form.parentId)?.name ?? "—"}
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    La sous-catégorie hérite de la couleur et des options de sa catégorie parente.
                  </p>
                </div>
              )}

              {/* Parent category dropdown: only shown when editing */}
              {editing && (
                <div className="grid gap-2">
                  <Label htmlFor="cat-parent">Catégorie parente</Label>
                  <Select
                    value={form.parentId || "__none__"}
                    onValueChange={(v) => setForm((f) => ({ ...f, parentId: v === "__none__" ? "" : v }))}
                  >
                    <SelectTrigger id="cat-parent">
                      <SelectValue placeholder="Aucune (catégorie principale)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Aucune (catégorie principale)</SelectItem>
                      {categories
                        ?.filter((c) => !c.parentId && c.id !== editing?.id)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* TVA (L-16/L-17, Batch 3.1c). The rate lives on the category
                  because the fiscal criterion is the container, not the drink:
                  `Canette` and `Bouteilles` are 5,5 %, while their parent
                  `Boissons` stays on the 10 % default so a cup drink added
                  later inherits the right rate. */}
              <div className="grid gap-2">
                <Label htmlFor="cat-vat">Taux de TVA de la catégorie</Label>
                <Select
                  value={form.vatRate || "__none__"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, vatRate: v === "__none__" ? "" : v }))
                  }
                >
                  <SelectTrigger id="cat-vat">
                    <SelectValue placeholder="Non défini" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Non défini</SelectItem>
                    <SelectItem value="10">10 % — sur place et à emporter</SelectItem>
                    <SelectItem value="5.5">5,5 % — canettes et bouteilles</SelectItem>
                    <SelectItem value="20">20 % — boissons alcoolisées</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  S&apos;applique aux produits de cette catégorie réglés sur « taux de la
                  catégorie ». « Non défini » remonte à la catégorie parente.
                </p>
              </div>
            </div>

            {/* Right column — sizes, global options & add-ons */}
            <div className="space-y-4">
              {/* Global Sizes Section */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-muted-foreground" />
                    <h4 className="text-sm font-semibold">Tailles globales</h4>
                  </div>
                  <Switch
                    checked={sizesEnabled}
                    onCheckedChange={(v) => setSizesEnabled(v)}
                  />
                </div>
                {sizesEnabled && (
                  <div className="space-y-2">
                    <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span>Nom</span>
                      <span className="w-20 text-center">À emporter</span>
                      <span className="w-20 text-center">Livraison</span>
                      <span className="w-8" />
                    </div>
                    {sizes.map((s, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                        <Input
                          value={s.name}
                          onChange={(e) =>
                            setSizes((ss) => ss.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))
                          }
                          placeholder={i === 0 ? "Ex. Petite" : i === 1 ? "Ex. Moyenne" : "Ex. Grande"}
                          className="h-8 text-sm"
                        />
                        <div className="relative w-20">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={s.pickupPrice}
                            onChange={(e) =>
                              setSizes((ss) => ss.map((x, idx) => (idx === i ? { ...x, pickupPrice: Number(e.target.value) || 0 } : x)))
                            }
                            className="h-8 pr-5 text-sm tabular-nums"
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">€</span>
                        </div>
                        <div className="relative w-20">
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            value={s.deliveryPrice}
                            onChange={(e) =>
                              setSizes((ss) => ss.map((x, idx) => (idx === i ? { ...x, deliveryPrice: Number(e.target.value) || 0 } : x)))
                            }
                            className="h-8 pr-5 text-sm tabular-nums"
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">€</span>
                        </div>
                        <button
                          type="button"
                          aria-label="Retirer la taille"
                          onClick={() => setSizes((ss) => ss.filter((_, idx) => idx !== i))}
                          disabled={sizes.length <= 2}
                          className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-destructive disabled:opacity-40"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setSizes((ss) => [...ss, { name: "", pickupPrice: 0, deliveryPrice: 0 }])}
                    >
                      <Plus className="h-3 w-3" /> Ajouter une taille
                    </Button>
                  </div>
                )}
                {!sizesEnabled && (
                  <p className="text-xs text-muted-foreground">Activez pour définir des tailles avec prix fixe pour tous les produits de cette catégorie.</p>
                )}
              </div>

              {/* Global Options Section */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Options globales</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() =>
                        setForm((f) => ({
                          ...f,
                          optionGroups: [
                            ...f.optionGroups,
                            { name: "", required: false, multiple: false, sortOrder: f.optionGroups.length, choices: [{ name: "", priceModifier: 0, pickupPriceModifier: null, deliveryPriceModifier: null, image: null, sortOrder: 0 }] },
                          ],
                        }))
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter un groupe
                  </Button>
                </div>

                {form.optionGroups.length === 0 && (
                  <p className="text-xs text-muted-foreground">Aucune option globale. Ajoutez un groupe pour tous les produits de cette catégorie.</p>
                )}

                {form.optionGroups.map((group, gi) => (
                  <div key={gi} ref={(el) => { groupRefs.current[gi] = el; }} className="space-y-2 rounded-md border border-border bg-card p-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={group.name}
                        onChange={(e) =>
                          setForm((f) => {
                            const next = [...f.optionGroups];
                            next[gi] = { ...next[gi], name: e.target.value };
                            return { ...f, optionGroups: next };
                          })
                        }
                        placeholder="Nom du groupe (ex: Sauce)"
                        className="flex-1 text-sm"
                      />
                      <button
                        type="button"
                        disabled={gi === 0}
                        aria-label="Monter le groupe"
                        onClick={() =>
                          setForm((f) => {
                            const next = [...f.optionGroups];
                            [next[gi - 1], next[gi]] = [next[gi], next[gi - 1]];
                            return { ...f, optionGroups: next };
                          })
                        }
                        className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Monter"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={gi === form.optionGroups.length - 1}
                        aria-label="Descendre le groupe"
                        onClick={() =>
                          setForm((f) => {
                            const next = [...f.optionGroups];
                            [next[gi], next[gi + 1]] = [next[gi + 1], next[gi]];
                            return { ...f, optionGroups: next };
                          })
                        }
                        className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Descendre"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Retirer le groupe d'options"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            optionGroups: f.optionGroups.filter((_, i) => i !== gi),
                          }))
                        }
                        className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                        title="Supprimer le groupe"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={group.required}
                          onChange={(e) =>
                            setForm((f) => {
                              const next = [...f.optionGroups];
                              next[gi] = { ...next[gi], required: e.target.checked };
                              return { ...f, optionGroups: next };
                            })
                          }
                        />
                        Obligatoire
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={group.multiple}
                          onChange={(e) =>
                            setForm((f) => {
                              const next = [...f.optionGroups];
                              next[gi] = { ...next[gi], multiple: e.target.checked };
                              return { ...f, optionGroups: next };
                            })
                          }
                        />
                        Multiple
                      </label>
                    </div>
                    <div className="space-y-1.5">
                      {group.choices.map((choice, ci) => (
                        <div key={ci} className="flex items-center gap-2">
                          {/* Choice image thumbnail / picker */}
                          {choice.image && isImageUrl(choice.image) ? (
                            <div className="relative shrink-0">
                              <img src={choice.image} alt="" className="h-8 w-8 rounded-md object-cover" />
                              <button
                                type="button"
                                onClick={() => {
                                  setForm((f) => {
                                    const next = [...f.optionGroups];
                                    const choices = [...next[gi].choices];
                                    choices[ci] = { ...choices[ci], image: null };
                                    next[gi] = { ...next[gi], choices };
                                    return { ...f, optionGroups: next };
                                  });
                                }}
                                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-white"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label="Image du choix"
                              onClick={() => { setPickerTarget({ type: "choice", groupIndex: gi, choiceIndex: ci }); setPickerOpen(true); }}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary"
                              title="Ajouter une image"
                            >
                              <ImagePlus className="h-4 w-4" />
                            </button>
                          )}
                          <Input
                            value={choice.name}
                            onChange={(e) =>
                              setForm((f) => {
                                const next = [...f.optionGroups];
                                const choices = [...next[gi].choices];
                                choices[ci] = { ...choices[ci], name: e.target.value };
                                next[gi] = { ...next[gi], choices };
                                return { ...f, optionGroups: next };
                              })
                            }
                            placeholder="Choix"
                            className="flex-1 text-sm"
                          />
                          <Input
                            type="number"
                            step={0.5}
                            value={choice.priceModifier}
                            onChange={(e) =>
                              setForm((f) => {
                                const next = [...f.optionGroups];
                                const choices = [...next[gi].choices];
                                choices[ci] = { ...choices[ci], priceModifier: Number(e.target.value) || 0 };
                                next[gi] = { ...next[gi], choices };
                                return { ...f, optionGroups: next };
                              })
                            }
                            placeholder="+€"
                            className="w-20 text-sm"
                          />
                          <button
                            type="button"
                            aria-label="Retirer le choix"
                            onClick={() =>
                              setForm((f) => {
                                const next = [...f.optionGroups];
                                next[gi] = { ...next[gi], choices: next[gi].choices.filter((_, i) => i !== ci) };
                                return { ...f, optionGroups: next };
                              })
                            }
                            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                            title="Supprimer le choix"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() =>
                          setForm((f) => {
                            const next = [...f.optionGroups];
                          next[gi] = {
                            ...next[gi],
                            choices: [...next[gi].choices, { name: "", priceModifier: 0, pickupPriceModifier: null, deliveryPriceModifier: null, image: null, sortOrder: next[gi].choices.length }],
                          };
                            return { ...f, optionGroups: next };
                          })
                        }
                      >
                        <Plus className="h-3 w-3" /> Ajouter un choix
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Global Add-ons Section */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Suppléments globaux</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        addOns: [...f.addOns, { name: "", price: 0, image: null, sortOrder: f.addOns.length, active: true }],
                      }))
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Ajouter
                  </Button>
                </div>

                {form.addOns.length === 0 && (
                  <p className="text-xs text-muted-foreground">Aucun supplément global.</p>
                )}

                {form.addOns.map((addon, ai) => (
                  <div key={ai} className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
                    {/* Add-on image thumbnail / picker */}
                    {addon.image && isImageUrl(addon.image) ? (
                      <div className="relative shrink-0">
                        <img src={addon.image} alt="" className="h-8 w-8 rounded-md object-cover" />
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => {
                              const next = [...f.addOns];
                              next[ai] = { ...next[ai], image: null };
                              return { ...f, addOns: next };
                            });
                          }}
                          className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-white"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label="Image du supplément"
                        onClick={() => { setPickerTarget({ type: "addon", addonIndex: ai }); setPickerOpen(true); }}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary"
                        title="Ajouter une image"
                      >
                        <ImagePlus className="h-4 w-4" />
                      </button>
                    )}
                    <Input
                      value={addon.name}
                      onChange={(e) =>
                        setForm((f) => {
                          const next = [...f.addOns];
                          next[ai] = { ...next[ai], name: e.target.value };
                          return { ...f, addOns: next };
                        })
                      }
                      placeholder="Nom (ex: Bacon)"
                      className="flex-1 text-sm"
                    />
                    <Input
                      type="number"
                      step={0.5}
                      value={addon.price}
                      onChange={(e) =>
                        setForm((f) => {
                          const next = [...f.addOns];
                          next[ai] = { ...next[ai], price: Number(e.target.value) || 0 };
                          return { ...f, addOns: next };
                        })
                      }
                      placeholder="Prix €"
                      className="w-24 text-sm"
                    />
                    <button
                      type="button"
                      aria-label="Retirer le supplément"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          addOns: f.addOns.filter((_, i) => i !== ai),
                        }))
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                      title="Supprimer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer spans full width */}
            <DialogFooter className="md:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Enregistrer" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la catégorie</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Pour confirmer, saisissez le nom de
              la catégorie{" "}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={deleteTarget?.name}
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || deleteConfirm !== deleteTarget?.name}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryCard({
  category,
  depth,
  onEdit,
  onDelete,
  onCreateSub,
}: {
  category: CategoryDto;
  depth: number;
  onEdit: () => void;
  onDelete: () => void;
  onCreateSub?: () => void;
}) {
  const hasImage = category.icon && (category.icon.startsWith("/") || category.icon.startsWith("http"));
  const isChild = depth > 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md overflow-hidden",
        isChild && "ml-6 border-l-4",
      )}
      style={isChild ? { borderLeftColor: category.color } : undefined}
    >
      {/* Image area */}
      <div
        className="relative h-28 w-full flex items-center justify-center"
        style={{ backgroundColor: `${category.color}22` }}
      >
        {hasImage ? (
          <img
            src={category.icon!}
            alt={category.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <FolderTree className="h-10 w-10 opacity-30" style={{ color: category.color }} />
        )}
        <span
          className="absolute right-2 top-2 h-3 w-3 rounded-full ring-2 ring-card"
          style={{ backgroundColor: category.color }}
          aria-hidden
        />
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {isChild && category.parentName && (
              <p className="text-[11px] text-muted-foreground truncate">{category.parentName} /</p>
            )}
            <h3 className="text-base font-semibold text-foreground">{category.name}</h3>
          </div>
          <div className="flex shrink-0 gap-1">
            {isChild && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                Sous-catégorie
              </Badge>
            )}
            <Badge variant={category.active ? "default" : "secondary"}>
              {category.active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          <span>
            {category.productCount ?? 0}{" "}
            {category.productCount === 1 ? "produit" : "produits"}
          </span>
          <span aria-hidden>·</span>
          <span>Ordre {category.sortOrder}</span>
        </div>

        <div className="flex items-center justify-end gap-1 border-t border-border pt-2">
          {onCreateSub && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCreateSub}
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              Sous-catégorie
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Modifier">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Supprimer"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
