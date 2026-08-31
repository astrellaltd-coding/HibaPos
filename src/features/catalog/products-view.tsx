"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import type { CategoryDto, ProductDto, OptionGroupDto } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PageHeader, EmptyState } from "@/components/shared/empty-state";
import { ProductImage } from "@/components/shared/product-image";
import { MediaPickerDialog } from "@/components/shared/media-picker-dialog";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  GripVertical,
  Settings2,
  Loader2,
  ImagePlus,
  Ruler,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ChoiceForm = { name: string; priceModifier: number; pickupPriceModifier?: number; deliveryPriceModifier?: number; image?: string | null };
type GroupForm = { name: string; required: boolean; multiple: boolean; choices: ChoiceForm[] };
type SizeForm = { name: string; pickupPrice: number; deliveryPrice: number };

const SIZE_GROUP_NAME = "Taille";
const DEFAULT_SIZES: SizeForm[] = [
  { name: "Petite", pickupPrice: 0, deliveryPrice: 0 },
  { name: "Moyenne", pickupPrice: 0, deliveryPrice: 0 },
  { name: "Grande", pickupPrice: 0, deliveryPrice: 0 },
];

// VAT is generally 10% (handled via settings), except for bottled drinks (5.5%)

function productToSizes(product: ProductDto): SizeForm[] | null {
  const opts = product.options;
  const tg = opts.find((g) => g.name === SIZE_GROUP_NAME);
  if (!tg || tg.choices.length < 2) return null;
  const pickupBase = product.pickupPrice ?? 0;
  const deliveryBase = product.deliveryPrice ?? 0;
  return tg.choices.map((c) => ({ 
    name: c.name, 
    pickupPrice: (pickupBase + (c.pickupPriceModifier ?? c.priceModifier)) / 100,
    deliveryPrice: (deliveryBase + (c.deliveryPriceModifier ?? c.priceModifier)) / 100,
  }));
}

function sizesToGroupAndPrice(sizes: SizeForm[]): { pickupPrice: number; deliveryPrice: number; group: GroupForm } {
  const validSizes = sizes.filter((s) => s.name.trim());
  const pickupBase = validSizes.length > 0 ? validSizes[0].pickupPrice : 0;
  const deliveryBase = validSizes.length > 0 ? validSizes[0].deliveryPrice : 0;
  return {
    pickupPrice: Math.round(pickupBase * 100),
    deliveryPrice: Math.round(deliveryBase * 100),
    group: {
      name: SIZE_GROUP_NAME,
      required: true,
      multiple: false,
      choices: validSizes.map((s) => ({
        name: s.name.trim(),
        priceModifier: Math.round((s.pickupPrice - pickupBase) * 100),
        pickupPriceModifier: Math.round((s.pickupPrice - pickupBase) * 100),
        deliveryPriceModifier: Math.round((s.deliveryPrice - deliveryBase) * 100),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function ProductsView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [editing, setEditing] = useState<ProductDto | "new" | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<CategoryDto[]>("/api/catalog/categories"),
  });
  const { data: products, isLoading } = useQuery({
    queryKey: ["products", "all", true],
    queryFn: () => api.get<ProductDto[]>("/api/catalog/products?all=1"),
  });

  const toggleAvailability = useMutation({
    mutationFn: (vars: { id: string; available: boolean }) =>
      api.post("/api/catalog/products/availability", { updates: [vars] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products", "out-of-stock"] });
    },
  });

  const visible = useMemo(() => {
    if (!products) return [];
    let list = [...products];
    if (categoryFilter !== "all") list = list.filter((p) => p.categoryId === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [products, categoryFilter, search]);

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={Package}
        title="Produits"
        description="Carte du restaurant et options de personnalisation"
        actions={
          <Button className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Nouveau produit
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Toutes les catégories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categories
              ?.filter((c) => !c.parentId)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
              .map((parent) => (
                <div key={parent.id}>
                  <SelectItem value={parent.id}>{parent.name}</SelectItem>
                  {categories
                    .filter((c) => c.parentId === parent.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                    .map((child) => (
                      <SelectItem key={child.id} value={child.id} className="pl-6">
                        └ {child.name}
                      </SelectItem>
                    ))}
                </div>
              ))}
            {categories
              ?.filter((c) => c.parentId && !categories.some((p) => p.id === c.parentId && !p.parentId))
              .map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Package} title="Aucun produit" description="Ajoutez votre premier produit pour démarrer." />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto scroll-thin rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Produit</th>
                <th className="px-4 py-3 font-medium">Catégorie</th>
                <th className="px-4 py-3 text-right font-medium">Prix</th>
                <th className="px-4 py-3 text-center font-medium">TVA</th>
                <th className="px-4 py-3 text-center font-medium">Options</th>
                <th className="px-4 py-3 text-center font-medium">Statut</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-t border-border bg-card hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <ProductImage image={p.image} alt={p.name} className="h-9 w-9 shrink-0 rounded-lg text-lg" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{p.name}</p>
                        {p.description && <p className="line-clamp-1 text-xs text-muted-foreground">{p.description}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.category && (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.category.color }} />
                        {(() => {
                          const cat = categories?.find((c) => c.id === p.categoryId);
                          if (cat?.parentName) {
                            return <span className="text-muted-foreground">{cat.parentName} / <span className="text-foreground font-medium">{p.category.name}</span></span>;
                          }
                          return p.category.name;
                        })()}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-primary">
                    {/* Show size range if product has Taille group */}
                    {(() => {
                      const tg = p.options.find((g) => g.name === SIZE_GROUP_NAME);
                      if (tg && tg.choices.length >= 2) {
                        const min = p.price;
                        const max = p.price + Math.max(...tg.choices.map((c) => c.priceModifier));
                        return <span className="text-xs">{formatEuro(min)} – {formatEuro(max)}</span>;
                      }
                      return formatEuro(p.price);
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-center text-xs text-muted-foreground">{p.vatRate}%</td>
                  <td className="px-4 py-2.5 text-center">
                    {p.options.length > 0 ? (
                      <div className="flex flex-col items-center gap-0.5">
                        {p.options.find((g) => g.name === SIZE_GROUP_NAME) && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Ruler className="h-2.5 w-2.5" />
                            {p.options.find((g) => g.name === SIZE_GROUP_NAME)!.choices.length} tailles
                          </Badge>
                        )}
                        {p.options.filter((g) => g.name !== SIZE_GROUP_NAME).length > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            <Settings2 className="h-3 w-3" />
                            {p.options.filter((g) => g.name !== SIZE_GROUP_NAME).length}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => toggleAvailability.mutate({ id: p.id, available: !p.available })}
                      disabled={toggleAvailability.isPending}
                      title={p.available ? "Marquer comme épuisé" : "Marquer comme disponible"}
                      className="cursor-pointer transition-transform active:scale-95 disabled:cursor-wait"
                    >
                      {p.available ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Disponible</Badge>
                      ) : (
                        <Badge variant="secondary" className="hover:bg-rose-100 hover:text-rose-700">Épuisé</Badge>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" aria-label="Modifier le produit" onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductFormDialog
          product={editing === "new" ? null : editing}
          categories={categories ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product form dialog
// ---------------------------------------------------------------------------

function ProductFormDialog({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: ProductDto | null;
  categories: CategoryDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Detect existing sizes on load
  const existingSizes = product ? productToSizes(product) : null;

  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? "");
  const [expandedParent, setExpandedParent] = useState<string | null>(() => {
    // On edit, pre-expand the parent if the product is in a sub-category
    const cat = categories.find((c) => c.id === product?.categoryId);
    if (cat?.parentId) return cat.parentId;
    if (cat && cat.children && cat.children.length > 0) return cat.id;
    return null;
  });
  const [image, setImage] = useState(product?.image ?? "");
  const [vatRate, setVatRate] = useState(product?.vatRate ?? 10);
  const [active, setActive] = useState(product?.active ?? true);
  const [inheritCategoryGlobals, setInheritCategoryGlobals] = useState(product?.inheritCategoryGlobals ?? true);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Per-choice picker: tracks which choice index is being picked for
  const [choicePickerOpen, setChoicePickerOpen] = useState(false);
  const choicePickerTarget = useRef<{ gi: number; ci: number } | null>(null);

  // Size mode
  const [sizesEnabled, setSizesEnabled] = useState(!!existingSizes);
  const [sizes, setSizes] = useState<SizeForm[]>(existingSizes ?? DEFAULT_SIZES.map((s) => ({ ...s })));

  // Single price (used when sizes are OFF)
  const [pickupPrice, setPickupPrice] = useState(product?.pickupPrice != null ? product.pickupPrice / 100 : 0);
  const [deliveryPrice, setDeliveryPrice] = useState(product?.deliveryPrice != null ? product.deliveryPrice / 100 : 0);

  // Other option groups (excluding "Taille")
  const [groups, setGroups] = useState<GroupForm[]>(
    (product?.options ?? [])
      .filter((g: OptionGroupDto) => g.name !== SIZE_GROUP_NAME)
      .map((g: OptionGroupDto) => ({
        name: g.name,
        required: g.required,
        multiple: g.multiple,
        choices: g.choices.map((c) => ({ name: c.name, priceModifier: c.priceModifier / 100, image: c.image ?? undefined })),
      })),
  );
  const [saving, setSaving] = useState(false);

  const updateGroup = (idx: number, patch: Partial<GroupForm>) =>
    setGroups((gs) => gs.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  const addGroup = () =>
    setGroups((gs) => [...gs, { name: "", required: false, multiple: false, choices: [] }]);
  const removeGroup = (idx: number) => setGroups((gs) => gs.filter((_, i) => i !== idx));
  const addChoice = (gi: number) =>
    updateGroup(gi, { choices: [...groups[gi].choices, { name: "", priceModifier: 0, image: undefined }] });
  const updateChoice = (gi: number, ci: number, patch: Partial<ChoiceForm>) =>
    updateGroup(gi, {
      choices: groups[gi].choices.map((c, i) => (i === ci ? { ...c, ...patch } : c)),
    });
  const removeChoice = (gi: number, ci: number) =>
    updateGroup(gi, { choices: groups[gi].choices.filter((_, i) => i !== ci) });

  const updateSize = (i: number, patch: Partial<SizeForm>) =>
    setSizes((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const addSize = () => setSizes((ss) => [...ss, { name: "", pickupPrice: 0, deliveryPrice: 0 }]);
  const removeSize = (i: number) => setSizes((ss) => ss.filter((_, idx) => idx !== i));

  const valid = name.trim() && categoryId && (
    sizesEnabled
      ? sizes.filter((s) => s.name.trim()).length >= 2
      : pickupPrice >= 0 && deliveryPrice >= 0
  );

  const handleSave = async () => {
    if (!valid) {
      toast.error(sizesEnabled ? "Ajoutez au moins 2 tailles avec un nom" : "Veuillez remplir le nom et la catégorie");
      return;
    }

    // Build final options
    type CleanChoice = { name: string; priceModifier: number; pickupPriceModifier?: number; deliveryPriceModifier?: number; image?: string | null };
    type CleanGroup = { name: string; required: boolean; multiple: boolean; choices: CleanChoice[] };
    const cleanGroups: CleanGroup[] = groups
      .filter((g) => g.name.trim())
      .map((g) => ({
        name: g.name.trim(),
        required: g.required,
        multiple: g.multiple,
        choices: g.choices.filter((c) => c.name.trim()).map((c): CleanChoice => ({ 
          name: c.name.trim(), 
          priceModifier: Math.round((Number(c.priceModifier) || 0) * 100),
          image: c.image ?? null,
        })),
      }));

    let finalPrice: number;
    let finalPickupPrice: number;
    let finalDeliveryPrice: number;
    let finalOptions: typeof cleanGroups;

    if (sizesEnabled) {
      const { pickupPrice: basePickup, deliveryPrice: baseDelivery, group: sizeGroup } = sizesToGroupAndPrice(sizes);
      finalPrice = basePickup;
      finalPickupPrice = basePickup;
      finalDeliveryPrice = baseDelivery;
      finalOptions = [sizeGroup, ...cleanGroups];
    } else {
      finalPrice = Math.round(Number(pickupPrice) * 100);
      finalPickupPrice = Math.round(Number(pickupPrice) * 100);
      finalDeliveryPrice = Math.round(Number(deliveryPrice) * 100);
      finalOptions = cleanGroups;
    }

    const payload = {
      name: name.trim(),
      description: null,
      price: finalPrice,
      pickupPrice: finalPickupPrice,
      deliveryPrice: finalDeliveryPrice,
      vatRate: Number(vatRate),
      categoryId,
      image: image.trim() || null,
      active,
      available: active,
      inheritCategoryGlobals,
      sortOrder: product?.sortOrder ?? 0,
      options: finalOptions,
    };

    setSaving(true);
    try {
      if (product) {
        await api.put(`/api/catalog/products/${product.id}`, payload);
        toast.success("Produit mis à jour");
      } else {
        await api.post("/api/catalog/products", payload);
        toast.success("Produit créé");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[95vh] w-full max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border p-5 pr-12">
          <DialogTitle>{product ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
          <div className="flex items-center gap-6">
            {categories.find((c) => c.id === categoryId)?.name.toLowerCase().includes("boisson") && (
              <div className="flex items-center gap-2">
                <Switch 
                  checked={vatRate === 5.5} 
                  onCheckedChange={(v) => setVatRate(v ? 5.5 : 10)} 
                  id="header-is-drink" 
                />
                <Label htmlFor="header-is-drink" className="text-sm font-medium">Bouteille / Canette</Label>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={active} onCheckedChange={setActive} id="header-active" />
              <Label htmlFor="header-active" className="text-sm font-medium">Actif</Label>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 scroll-thin">
          <div className="space-y-5 p-5">

            {/* ── 1. Catégorie ── */}
            <div className="space-y-2">
              <Label className="mb-2 block text-xs">Catégorie *</Label>

              {/* Parent category cards */}
              <div className="flex flex-wrap gap-3">
                {(() => {
                  const roots = categories
                    .filter((c) => !c.parentId)
                    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
                  return roots.map((parent) => {
                    const isExpanded = expandedParent === parent.id;
                    const isSelected = categoryId === parent.id;
                    const isImg = parent.icon && (parent.icon.startsWith("/") || parent.icon.startsWith("http"));
                    const hasChildren = categories.some((c) => c.parentId === parent.id);
                    return (
                      <button
                        key={parent.id}
                        type="button"
                        onClick={() => {
                          if (hasChildren) {
                            setExpandedParent(parent.id);
                          } else {
                            setCategoryId(parent.id);
                            setExpandedParent(null);
                          }
                        }}
                        className={cn(
                          "flex shrink-0 flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition-all",
                          isExpanded || isSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-transparent bg-muted/40 hover:border-border hover:bg-muted/70",
                        )}
                      >
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg">
                          {isImg ? (
                            <img src={parent.icon!} alt={parent.name} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-3xl leading-none">{parent.icon ?? "🍽️"}</span>
                          )}
                        </div>
                        <span className={cn("w-14 truncate text-center text-[11px] font-medium leading-tight", isExpanded || isSelected ? "text-primary" : "text-muted-foreground")}>
                          {parent.name}
                        </span>
                      </button>
                    );
                  });
                })()}
                {/* Orphan sub-categories (parent missing) */}
                {(() => {
                  const roots = categories.filter((c) => !c.parentId);
                  const orphans = categories.filter((c) => c.parentId && !roots.some((r) => r.id === c.parentId));
                  return orphans.map((o) => {
                    const oSelected = categoryId === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setCategoryId(o.id);
                          setExpandedParent(null);
                        }}
                        className={cn(
                          "flex shrink-0 flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition-all",
                          oSelected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-transparent bg-muted/40 hover:border-border hover:bg-muted/70",
                        )}
                      >
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg">
                          <span className="text-3xl leading-none">{o.icon ?? "🍽️"}</span>
                        </div>
                        <span className={cn("w-14 truncate text-center text-[11px] font-medium leading-tight", oSelected ? "text-primary" : "text-muted-foreground")}>
                          {o.name}
                        </span>
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Sub-category pills — shown when a parent with children is expanded */}
              {expandedParent && (() => {
                const parent = categories.find((c) => c.id === expandedParent);
                if (!parent) return null;
                const children = categories
                  .filter((c) => c.parentId === expandedParent)
                  .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
                if (children.length === 0) return null;
                return (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setCategoryId(parent.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        categoryId === parent.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                    >
                      Tous {parent.name}
                    </button>
                    {children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => setCategoryId(child.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          categoryId === child.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                        )}
                      >
                        {child.name}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* ── 2. Informations de base ── */}
            <div className="grid grid-cols-2 items-start gap-5">
              <div className="flex flex-col gap-4">
                <div>
                  <Label className="mb-1.5 block text-xs">Nom *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Margherita" />
                </div>
                
                <div className="flex items-end gap-3">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="mb-1.5 block text-xs">À emporter (€) *</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={pickupPrice}
                        onChange={(e) => setPickupPrice(Number(e.target.value))}
                        disabled={sizesEnabled}
                        className="tabular-nums"
                      />
                    </div>
                    <div>
                      <Label className="mb-1.5 block text-xs">Livraison (€) *</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={deliveryPrice}
                        onChange={(e) => setDeliveryPrice(Number(e.target.value))}
                        disabled={sizesEnabled}
                        className="tabular-nums"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-center justify-end pb-2 gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Tailles multiples</Label>
                    <Switch
                      checked={sizesEnabled}
                      onCheckedChange={(v) => {
                        setSizesEnabled(v);
                        if (v && sizes.every((s) => s.pickupPrice === 0 && s.deliveryPrice === 0)) {
                          setSizes((ss) => ss.map((s, i) => i === 0 ? { ...s, pickupPrice: Number(pickupPrice), deliveryPrice: Number(deliveryPrice) } : s));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* right column: photo */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-[10px] text-muted-foreground">Photo</Label>
                {image && (image.startsWith("/") || image.startsWith("http")) ? (
                  <div className="relative h-24 w-full overflow-hidden rounded-xl border border-border bg-muted/30">
                    <img src={image} alt={name} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="Supprimer l'image"
                      onClick={() => setImage("")}
                      className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 text-xs text-white transition-colors hover:bg-black/70"
                    >
                      <ImagePlus className="h-3.5 w-3.5" /> Changer
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                  >
                    <ImagePlus className="h-5 w-5" />
                    <span className="text-center text-xs font-medium leading-tight">Ajouter une photo</span>
                  </button>
                )}
              </div>
            </div>

            {/* Dialogs for media picking — rendered outside ScrollArea columns */}
            <MediaPickerDialog
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              currentUrl={image || null}
              title="Photo du produit"
              defaultFolder="Produits"
              onSelect={(url) => { setImage(url); }}
            />
            <MediaPickerDialog
              open={choicePickerOpen}
              onOpenChange={setChoicePickerOpen}
              title="Photo du choix"
              defaultFolder="Options"
              onSelect={(url) => {
                const t = choicePickerTarget.current;
                if (t) { updateChoice(t.gi, t.ci, { image: url }); }
                choicePickerTarget.current = null;
              }}
            />

            {sizesEnabled && (
              <>
                <Separator />
                {/* ── 3. Tailles ── */}
                <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                  <div className="mb-2 grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span>Nom de la taille</span>
                    <span className="w-24 text-center">À emporter (€)</span>
                    <span className="w-24 text-center">Livraison (€)</span>
                    <span className="w-8" />
                  </div>
                  {sizes.map((s, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                      <Input
                        value={s.name}
                        onChange={(e) => updateSize(i, { name: e.target.value })}
                        placeholder={i === 0 ? "Ex. Petite" : i === 1 ? "Ex. Moyenne" : "Ex. Grande"}
                        className="h-9"
                      />
                      <div className="relative w-24">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={s.pickupPrice}
                          onChange={(e) => updateSize(i, { pickupPrice: Number(e.target.value) })}
                          className="h-9 pr-7 tabular-nums"
                          placeholder="0"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                      </div>
                      <div className="relative w-24">
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          value={s.deliveryPrice}
                          onChange={(e) => updateSize(i, { deliveryPrice: Number(e.target.value) })}
                          className="h-9 pr-7 tabular-nums"
                          placeholder="0"
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-muted-foreground hover:text-destructive"
                        aria-label="Retirer la taille"
                        onClick={() => removeSize(i)}
                        disabled={sizes.length <= 2}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 gap-1 text-xs text-muted-foreground"
                    onClick={addSize}
                  >
                    <Plus className="h-3 w-3" /> Ajouter une taille
                  </Button>
                </div>
              </>
            )}

            <Separator />

            {/* ── 4. Héritage global de la catégorie ── */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Hériter des options & suppléments globaux</p>
                <p className="text-xs text-muted-foreground">Applique les réglages définis dans la catégorie « {categories.find((c) => c.id === categoryId)?.name ?? "—"} »</p>
              </div>
              <Switch checked={inheritCategoryGlobals} onCheckedChange={setInheritCategoryGlobals} />
            </div>

            {/* ── 5. Options de personnalisation ── */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Options de personnalisation</p>
                  <p className="text-xs text-muted-foreground">Groupes de choix (cuisson, sauces, suppléments…)</p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={addGroup}>
                  <Plus className="h-3.5 w-3.5" /> Ajouter un groupe
                </Button>
              </div>

              {groups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground">
                  Aucune option. Le produit sera ajouté directement au panier.
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.map((g, gi) => (
                    <div key={gi} className="rounded-xl border border-border bg-card p-3.5">
                      <div className="mb-3 flex items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                        <Input
                          value={g.name}
                          onChange={(e) => updateGroup(gi, { name: e.target.value })}
                          placeholder="Nom du groupe (ex. Cuisson)"
                          className="h-9 flex-1 font-medium"
                        />
                        <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive" aria-label="Retirer le groupe d'options" onClick={() => removeGroup(gi)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="mb-3 flex flex-wrap gap-4 pl-6">
                        <label className="flex items-center gap-2 text-xs">
                          <Switch checked={g.required} onCheckedChange={(v) => updateGroup(gi, { required: v })} />
                          Obligatoire
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <Switch checked={g.multiple} onCheckedChange={(v) => updateGroup(gi, { multiple: v })} />
                          Choix multiple
                        </label>
                      </div>
                      <div className="space-y-1.5 pl-6">
                        {g.choices.map((c, ci) => (
                          <div key={ci} className="flex items-center gap-2">
                            {/* Choice image thumbnail / upload button */}
                            <button
                              type="button"
                              title="Ajouter une photo"
                              onClick={() => {
                                choicePickerTarget.current = { gi, ci };
                                setChoicePickerOpen(true);
                              }}
                              className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40 transition-colors hover:border-primary/50 hover:bg-muted/70"
                            >
                              {c.image ? (
                                <img src={c.image} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <ImagePlus className="h-3.5 w-3.5 text-muted-foreground m-auto" />
                              )}
                            </button>
                            <Input
                              value={c.name}
                              onChange={(e) => updateChoice(gi, ci, { name: e.target.value })}
                              placeholder="Choix"
                              className="h-8 flex-1 text-sm"
                            />
                            <div className="relative w-28">
                              <Input
                                type="number"
                                step="0.1"
                                value={c.priceModifier}
                                onChange={(e) => updateChoice(gi, ci, { priceModifier: Number(e.target.value) })}
                                className="h-8 pr-7 text-sm tabular-nums"
                                placeholder="0"
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive" aria-label="Retirer le choix" onClick={() => removeChoice(gi, ci)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => addChoice(gi)}>
                          <Plus className="h-3 w-3" /> Ajouter un choix
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border p-4">
          <div className="text-sm text-muted-foreground">
            {product ? "Modifications appliquées immédiatement." : "Le produit sera visible en caisse."}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || !valid} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {product ? "Enregistrer" : "Créer le produit"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
