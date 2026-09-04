"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CategoryDto, ProductDto, OrderDto } from "@/types/api";
import { CartPanel } from "@/components/pos/cart-panel";
import { ProductOptionsDialog } from "@/components/pos/product-options-dialog-v2";
import { PaymentDialog } from "@/components/pos/payment-dialog";
import { ReceiptDialog } from "@/components/pos/receipt-dialog";
import { DiscountDialog } from "@/components/pos/discount-dialog";
import { ProductImage } from "@/components/shared/product-image";
import { EmptyState } from "@/components/shared/empty-state";
import { useCartStore, productUnitPrice, computeCartTotals, type CartItem } from "@/store/cart-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";
// uuid replaced with built-in crypto.randomUUID() (Node 19+, all evergreen browsers)
import { Search, PackageX, Loader2, LockKeyhole, Keyboard, ShoppingCart as CartIcon, X } from "lucide-react";
import { useAppStore, POS_SEARCH_INPUT_ID } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PosView() {
  const { setView, posSearch: search } = useAppStore();
  const { addItem, items, orderType, setOrderType, holdCurrent, heldOrders } = useCartStore();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeSubCategory, setActiveSubCategory] = useState<string | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<ProductDto | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [editCartItem, setEditCartItem] = useState<CartItem | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<OrderDto | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const { data: categories, isLoading: catLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<CategoryDto[]>("/api/catalog/categories"),
  });

  const { data: products, isLoading: prodLoading } = useQuery({
    queryKey: ["products", "all", true],
    queryFn: () => api.get<ProductDto[]>("/api/catalog/products?all=1"),
  });

  const visibleProducts = useMemo(() => {
    if (!products) return [];
    let list = products.filter((p) => p.active);
    if (activeCategory !== "all") {
      if (activeSubCategory) {
        list = list.filter((p) => p.categoryId === activeSubCategory);
      } else {
        const parentCat = categories?.find((c) => c.id === activeCategory && !c.parentId);
        if (parentCat && parentCat.children && parentCat.children.length > 0) {
          const childIds = parentCat.children.map((ch) => ch.id);
          list = list.filter((p) => p.categoryId === activeCategory || childIds.includes(p.categoryId));
        } else {
          list = list.filter((p) => p.categoryId === activeCategory);
        }
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCategory, activeSubCategory, categories, search]);

  const handleEditItem = (item: CartItem) => {
    const product = products?.find((p) => p.id === item.productId);
    if (!product) return;
    setOptionsProduct(product);
    setEditCartItem(item);
    setOptionsOpen(true);
  };

  const handleProductClick = (product: ProductDto) => {
    if (!product.available) return;
    const hasOptions = product.options.length > 0 || product.addOns.length > 0;
    if (hasOptions) {
      setOptionsProduct(product);
      setEditCartItem(null);
      setOptionsOpen(true);
    } else {
      addItem({
        uid: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        basePrice: product.price,
        pickupPrice: product.pickupPrice ?? null,
        deliveryPrice: product.deliveryPrice ?? null,
        unitPrice: productUnitPrice(product, [], orderType),
        quantity: 1,
        options: [],
        addOns: [],
        // The effective rate (own, or inherited from the category chain).
        // Display-only client-side — the checkout API recomputes it server-side.
        vatRate: product.effectiveVatRate ?? product.vatRate,
        image: product.image,
      });
    }
  };

  // Batch 5.1: the search box is the topbar's (topbar.tsx), rendered only on
  // this view. The ref that used to stand here was never attached to an
  // element, so this stayed a no-op even after the matcher was fixed — F1
  // and "/" fired and focused nothing. Reach it by the id both files import.
  const focusSearch = useCallback(() => {
    const el = document.getElementById(POS_SEARCH_INPUT_ID);
    if (!(el instanceof HTMLInputElement)) return;
    el.focus();
    el.select();
  }, []);

  const [discountOpen, setDiscountOpen] = useState(false);

  // Memoize the shortcuts array so useKeyboardShortcuts doesn't tear down and
  // re-subscribe its keydown listener on every render. Dependencies are the
  // actual cart-derived primitives the handlers read.
  const itemsLength = items.length;
  const heldOrdersCount = heldOrders.length;
  const shortcuts = useMemo(
    () => [
      { key: "F1", handler: focusSearch },
      { key: "F2", handler: () => setOrderType("DINE_IN") },
      { key: "F3", handler: () => setOrderType("TAKEAWAY") },
      {
        key: "F4",
        handler: () =>
          itemsLength > 0 && holdCurrent(`Commande ${heldOrdersCount + 1}`),
      },
      { key: "F5", handler: () => setOrderType("LIVRAISON") },
      {
        key: "F8",
        handler: () => itemsLength > 0 && setDiscountOpen(true),
      },
      { key: "F9", handler: () => itemsLength > 0 && setPayOpen(true) },
      { key: "?", shift: true, handler: () => setHelpOpen(true) },
      { key: "/", handler: focusSearch },
      // Batch 5.1: on the French AZERTY keyboard this restaurant uses, "/" is
      // typed as Shift+":" (Windows VkKeyScanEx, layout 0000040C: vk 0xBF +
      // SHIFT), so the shift-less entry above never matches there. A numeric
      // keypad's "/" is unshifted on every layout and still uses it.
      { key: "/", shift: true, handler: focusSearch },
    ],
    [focusSearch, setOrderType, holdCurrent, itemsLength, heldOrdersCount],
  );

  useKeyboardShortcuts(shortcuts);

  const loading = catLoading || prodLoading;

  return (
    <div className="flex h-full min-h-0" style={{ touchAction: "none" }}>
      {/* Catalog side */}
      <div className="flex min-w-0 flex-1 flex-col bg-muted/20">
        {/* Category cards — horizontal scroll row */}
        <div className="shrink-0 px-4 pt-4 pb-2">
          <div className="overflow-x-auto scroll-thin rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 shadow-sm p-3" style={{ touchAction: "pan-x" }}>
            <div className="flex justify-between gap-3 min-w-full">
            <CategoryTab
              active={activeCategory === "all"}
              onClick={() => { setActiveCategory("all"); setActiveSubCategory(null); }}
              color="#f59e0b"
              icon={undefined}
              label="Tout"
            />
            {(categories ?? [])
              .filter((c) => c.active && !c.parentId)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
              .map((c) => (
                <CategoryTab
                  key={c.id}
                  active={activeCategory === c.id}
                  onClick={() => { setActiveCategory(c.id); setActiveSubCategory(null); }}
                  color={c.color}
                  icon={c.icon ?? undefined}
                  label={c.name}
                />
              ))}
            {(categories ?? [])
              .filter((c) => c.active && c.parentId && !(categories ?? []).some((p) => p.id === c.parentId && !p.parentId))
              .map((c) => (
                <CategoryTab
                  key={c.id}
                  active={activeCategory === c.id}
                  onClick={() => { setActiveCategory(c.id); setActiveSubCategory(null); }}
                  color={c.color}
                  icon={c.icon ?? undefined}
                  label={c.name}
                />
              ))}
          </div>
        </div>

        {/* Sub-category chips */}
        {(() => {
          const parent = categories?.find((c) => c.id === activeCategory && !c.parentId);
          if (!parent || !parent.children || parent.children.length === 0) return null;
          return (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveSubCategory(null)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  activeSubCategory === null
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                Tous {parent.name}
              </button>
              {parent.children.map((child) => {
                const isActive = activeSubCategory === child.id;
                return (
                  <button
                    key={child.id}
                    onClick={() => setActiveSubCategory(child.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    {child.name}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

        {/* Product grid */}
        <div className="scroll-thin flex-1 overflow-y-auto p-4 pt-3" style={{ touchAction: "pan-y" }}>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement du catalogue…
            </div>
          ) : visibleProducts.length === 0 ? (
            <EmptyState
              icon={search ? Search : PackageX}
              title={search ? "Aucun produit trouvé" : "Aucun produit dans cette catégorie"}
              description={search ? "Essayez un autre terme de recherche." : "Ajoutez des produits depuis le catalogue."}
            />
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {visibleProducts.map((product) => (
                <ProductCard key={product.id} product={product} onClick={() => handleProductClick(product)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart side — desktop */}
      <div className="hidden w-[360px] shrink-0 border-l border-border xl:w-[400px] lg:flex lg:flex-col min-h-0 rounded-l-2xl overflow-hidden">
        <CartPanel onCheckout={() => setPayOpen(true)} onEditItem={handleEditItem} onOpenDiscount={() => setDiscountOpen(true)} />
      </div>

      {/* Cart side — mobile */}
      {mobileCartOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileCartOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-[340px] max-w-[85vw] border-l border-border bg-card shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 h-11 w-11"
              aria-label="Fermer le panier"
              onClick={() => setMobileCartOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
            <CartPanel onCheckout={() => { setPayOpen(true); setMobileCartOpen(false); }} onEditItem={handleEditItem} onOpenDiscount={() => setDiscountOpen(true)} />
          </div>
        </div>
      )}

      {/* Mobile floating cart button */}
      {items.length > 0 && !mobileCartOpen && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lg shadow-primary/30 transition-all active:scale-95 lg:hidden"
        >
          <CartIcon className="h-5 w-5" />
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground/25 px-1.5 text-xs font-bold tabular-nums">
            {items.reduce((acc, i) => acc + i.quantity, 0)}
          </span>
          <span className="text-sm font-semibold">{formatEuro(computeCartTotals(items, 0).total)}</span>
        </button>
      )}

      {/* Dialogs */}
      <ProductOptionsDialog product={optionsProduct} open={optionsOpen} onOpenChange={(v) => { setOptionsOpen(v); if (!v) setEditCartItem(null); }} editItem={editCartItem} />
      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        onCompleted={(order) => setReceiptOrder(order)}
      />
      <ReceiptDialog order={receiptOrder} open={!!receiptOrder} onOpenChange={(v) => !v && setReceiptOrder(null)} />
      <DiscountDialog open={discountOpen} onOpenChange={setDiscountOpen} />

      {/* Keyboard shortcuts help */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-primary" /> Raccourcis clavier
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {[
              { keys: "F1 / /", label: "Rechercher un produit" },
              { keys: "F2", label: "Mode sur place" },
              { keys: "F3", label: "Mode à emporter" },
              { keys: "F5", label: "Mode livraison" },
              { keys: "F4", label: "Mettre la commande en attente" },
              { keys: "F8", label: "Remise (manager)" },
              { keys: "F9", label: "Encaisser" },
              { keys: "Shift + ?", label: "Afficher cette aide" },
              { keys: "Échap", label: "Fermer les dialogues" },
            ].map((s) => (
              <div key={s.keys} className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-sm text-foreground">{s.label}</span>
                <kbd className="rounded-md border border-border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground shadow-sm">
                  {s.keys}
                </kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {!loading && (
        <ShiftHint onClick={() => setView("shifts")} />
      )}
    </div>
  );
}

function CategoryTab({
  active,
  onClick,
  color,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  icon?: string;
  label: string;
}) {
  const isImage = icon && (icon.startsWith("/") || icon.startsWith("http"));

  return (
    <button
      onClick={onClick}
      className="flex h-[88px] w-[88px] shrink-0 flex-col items-center gap-1.5 transition-all outline-none focus:outline-none"
    >
      {/* Image / icon area */}
      <div
        className="flex h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-xl"
        style={{ backgroundColor: isImage ? "transparent" : "hsl(var(--muted) / 0.4)" }}
      >
        {isImage ? (
          <img src={icon} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span
            className="text-3xl leading-none"
            style={{ filter: active ? "none" : "grayscale(0.3)" }}
          >
            🍽️
          </span>
        )}
      </div>
      {/* Label */}
      <span
        className={cn(
          "w-20 truncate text-center text-[12px] font-semibold leading-tight",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        style={active ? { color } : undefined}
      >
        {label}
      </span>
    </button>
  );
}

const ProductCard = memo(function ProductCard({ product, onClick }: { product: ProductDto; onClick: () => void }) {
  // Narrow cart-store selector: subscribe ONLY to this product's in-cart qty
  // so a qty change on one card doesn't re-render every card in the grid.
  const inCartQty = useCartStore((s) =>
    s.items
      .filter((i) => i.productId === product.id)
      .reduce((acc, i) => acc + i.quantity, 0),
  );

  return (
    <button
      onClick={onClick}
      disabled={!product.available}
      className={cn(
        "group relative flex h-[160px] w-full flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98]",
        product.available
          ? inCartQty > 0
            ? "border-primary/60 ring-1 ring-primary/30 hover:border-primary"
            : "border-border hover:border-primary/50"
          : "cursor-not-allowed border-border opacity-60",
      )}
    >
      {/* Image — fixed height container */}
      <div className="relative flex h-[110px] w-full items-center justify-center overflow-hidden p-2">
        <ProductImage
          image={product.image}
          alt={product.name}
          className="h-[90%] w-[90%] text-4xl transition-transform duration-200 group-hover:scale-110"
        />

        {inCartQty > 0 && (
          <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-md">
            {inCartQty}
          </span>
        )}
        {!product.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-foreground">Épuisé</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div className="flex h-[50px] flex-col items-center justify-center p-2">
        <p className="line-clamp-2 text-center text-[13px] font-semibold leading-tight text-foreground">{product.name}</p>
      </div>
    </button>
  );
});
// `React.memo` default — re-render only when `product` or `onClick` change.

function ShiftHint({ onClick }: { onClick: () => void }) {
  const { data: shift } = useQuery({
    queryKey: ["shift", "current"],
    queryFn: () => api.get<{ id: string } | null>("/api/shifts/current"),
  });
  if (shift) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 shadow-lg">
        <LockKeyhole className="h-4 w-4 text-amber-600" />
        <span className="text-xs font-medium text-amber-800">Aucune caisse ouverte — l'encaissement est bloqué</span>
        <Button size="sm" className="h-7" onClick={onClick}>
          Ouvrir
        </Button>
      </div>
    </div>
  );
}
