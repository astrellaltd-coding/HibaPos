// Bootstrap seed data — shared constants + helper for both /api/seed and
// the `prisma db seed` orchestrator (prisma/seed.ts).
import { db } from "@/lib/db";
import { saveSettings, DEFAULT_SETTINGS } from "@/lib/services/settings";
import { audit } from "@/lib/services/audit";
import { ensureFiscalCounter } from "@/lib/services/sequence";

export type SeedCategory = {
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
};

export type SeedProduct = {
  name: string;
  description?: string;
  price: number; // cents (e.g. 750 = 7.50 €)
  vatRate: number;
  category: string;
  image: string;
  options?: {
    name: string;
    required: boolean;
    multiple: boolean;
    choices: { name: string; priceModifier: number }[]; // priceModifier in cents
  }[];
};

export type SeedAddOn = {
  name: string;
  price: number; // cents
  image: string;
};

export const SEED_CATEGORIES: SeedCategory[] = [
  { name: "Burgers", color: "#f59e0b", icon: "🍔", sortOrder: 1 },
  { name: "Menus", color: "#ef4444", icon: "🍟", sortOrder: 2 },
  { name: "Tex-Mex", color: "#f97316", icon: "🌮", sortOrder: 3 },
  { name: "Pizzas", color: "#eab308", icon: "🍕", sortOrder: 4 },
  { name: "Wraps & Sandwichs", color: "#84cc16", icon: "🌯", sortOrder: 5 },
  { name: "Accompagnements", color: "#a16207", icon: "🥔", sortOrder: 6 },
  { name: "Boissons", color: "#0ea5e9", icon: "🥤", sortOrder: 7 },
  { name: "Desserts", color: "#ec4899", icon: "🍰", sortOrder: 8 },
];

export const SEED_PRODUCTS: SeedProduct[] = [
  // Burgers (food 10%)
  {
    name: "Cheese Classic",
    description: "Steak haché, cheddar, salade, tomate, oignons, sauce maison",
    price: 750,
    vatRate: 10,
    category: "Burgers",
    image: "/products/cheese-classic.png",
    options: [
      {
        name: "Cuisson",
        required: true,
        multiple: false,
        choices: [
          { name: "Saignant", priceModifier: 0 },
          { name: "À point", priceModifier: 0 },
          { name: "Bien cuit", priceModifier: 0 },
        ],
      },
      {
        name: "Suppléments",
        required: false,
        multiple: true,
        choices: [
          { name: "Supplément cheddar", priceModifier: 100 },
          { name: "Supplément steak", priceModifier: 200 },
          { name: "Bacon", priceModifier: 150 },
        ],
      },
    ],
  },
  { name: "Double Cheese", description: "Double steak, double cheddar, sauce maison", price: 990, vatRate: 10, category: "Burgers", image: "/products/double-cheese.png" },
  { name: "Chicken Crispy", description: "Poulet croustillant, cheddar, salade, sauce algérienne", price: 850, vatRate: 10, category: "Burgers", image: "/products/chicken-crispy.png" },
  { name: "Veggie Burger", description: "Galette végétale, cheddar, légumes, sauce yaourt", price: 800, vatRate: 10, category: "Burgers", image: "/products/veggie-burger.png" },
  { name: "Big Bacon", description: "Double steak, bacon, cheddar, sauce barbecue", price: 1050, vatRate: 10, category: "Burgers", image: "/products/big-bacon.png" },
  { name: "Fish Burger", description: "Filet de poisson pané, tartare, salade", price: 820, vatRate: 10, category: "Burgers", image: "/products/fish-burger.png" },

  // Menus
  { name: "Menu Cheese Classic", description: "Burger + frites + boisson 33cl", price: 1150, vatRate: 10, category: "Menus", image: "🍟" },
  { name: "Menu Double Cheese", description: "Double cheese + frites + boisson 33cl", price: 1390, vatRate: 10, category: "Menus", image: "🍟" },
  { name: "Menu Chicken Crispy", description: "Chicken + frites + boisson 33cl", price: 1250, vatRate: 10, category: "Menus", image: "🍗" },
  { name: "Menu Big Bacon", description: "Big bacon + frites + boisson 33cl", price: 1450, vatRate: 10, category: "Menus", image: "🥓" },

  // Tex-Mex
  { name: "Tacos XL", description: "Tacos 2 viandes, sauce fromagère, frites incluses", price: 950, vatRate: 10, category: "Tex-Mex", image: "/products/tacos-xl.png" },
  { name: "Tacos M", description: "Tacos 1 viande, sauce fromagère", price: 650, vatRate: 10, category: "Tex-Mex", image: "🌮" },
  { name: "Nachos Cheddar", description: "Tortillas, cheddar fondu, jalapeños", price: 550, vatRate: 10, category: "Tex-Mex", image: "/products/nachos.png" },
  { name: "Quesadilla", description: "Tortilla, poulet, fromage, oignons", price: 700, vatRate: 10, category: "Tex-Mex", image: "/products/quesadilla.png" },

  // Pizzas
  { name: "Pizza Margherita", description: "Tomate, mozzarella, basilic", price: 900, vatRate: 10, category: "Pizzas", image: "/products/pizza-margherita.png" },
  { name: "Pizza Reine", description: "Tomate, mozzarella, jambon, champignons", price: 1050, vatRate: 10, category: "Pizzas", image: "/products/pizza-reine.png" },
  { name: "Pizza Pepperoni", description: "Tomate, mozzarella, pepperoni", price: 1150, vatRate: 10, category: "Pizzas", image: "/products/pizza-pepperoni.png" },
  { name: "Pizza 4 Fromages", description: "Mozzarella, cheddar, gorgonzola, emmental", price: 1100, vatRate: 10, category: "Pizzas", image: "/products/pizza-4fromages.png" },

  // Wraps
  { name: "Wrap Poulet", description: "Poulet, salade, tomate, sauce", price: 690, vatRate: 10, category: "Wraps & Sandwichs", image: "/products/wrap-poulet.png" },
  { name: "Wrap Viande Hachée", description: "Viande hachée, oignons, sauce algérienne", price: 720, vatRate: 10, category: "Wraps & Sandwichs", image: "/products/wrap-poulet.png" },
  { name: "Panini Chèvre", description: "Chèvre, miel, noix", price: 590, vatRate: 10, category: "Wraps & Sandwichs", image: "/products/panini-chevre.png" },

  // Accompagnements
  { name: "Frites", description: "Frites maison, sauce au choix", price: 300, vatRate: 10, category: "Accompagnements", image: "/products/frites.png" },
  { name: "Frites Grand", description: "Grandes frites, sauce au choix", price: 450, vatRate: 10, category: "Accompagnements", image: "🍟" },
  { name: "Potatoes", description: "Potatoes épicées", price: 350, vatRate: 10, category: "Accompagnements", image: "/products/potatoes.png" },
  { name: "Salade César", description: "Salade, poulet, parmesan, croûtons", price: 750, vatRate: 10, category: "Accompagnements", image: "/products/salade-cesar.png" },

  // Boissons (20%)
  { name: "Coca-Cola 33cl", price: 250, vatRate: 20, category: "Boissons", image: "/products/coca-cola.png" },
  { name: "Coca-Cola Zéro 33cl", price: 250, vatRate: 20, category: "Boissons", image: "🥤" },
  { name: "Fanta 33cl", price: 250, vatRate: 20, category: "Boissons", image: "/products/fanta.png" },
  { name: "Eau Minérale 50cl", price: 180, vatRate: 5.5, category: "Boissons", image: "/products/eau.png" },
  { name: "Jus d'Orange", price: 300, vatRate: 10, category: "Boissons", image: "/products/jus-orange.png" },
  { name: "Thé Pêche 50cl", price: 280, vatRate: 20, category: "Boissons", image: "/products/the-peche.png" },
  { name: "Café", price: 150, vatRate: 10, category: "Boissons", image: "/products/cafe.png" },
  { name: "Capuccino", price: 220, vatRate: 10, category: "Boissons", image: "/products/cappuccino.png" },

  // Desserts
  { name: "Muffin Chocolat", price: 280, vatRate: 10, category: "Desserts", image: "/products/muffin.png" },
  { name: "Cookie", price: 220, vatRate: 10, category: "Desserts", image: "/products/cookie.png" },
  { name: "Tiramisu", price: 400, vatRate: 10, category: "Desserts", image: "/products/tiramisu.png" },
  { name: "Glace 2 boules", price: 350, vatRate: 10, category: "Desserts", image: "/products/glace.png" },
];

export const SEED_ADDONS: SeedAddOn[] = [
  { name: "Supplément sauce", price: 50, image: "/products/addon-sauce.png" },
  { name: "Supplément cheddar", price: 100, image: "/products/addon-cheddar.png" },
  { name: "Bacon", price: 150, image: "/products/addon-bacon.png" },
  { name: "Supplément viande", price: 200, image: "/products/addon-viande.png" },
  { name: "Jalapeños", price: 80, image: "/products/addon-jalapenos.png" },
  { name: "Oignons frits", price: 80, image: "/products/addon-oignons.png" },
];

/** Determines whether a stored image value is an emoji (vs URL / data URI). */
export function isEmojiImage(value: string | null | undefined): boolean {
  if (!value) return false;
  if (
    value.startsWith("http") ||
    value.startsWith("/") ||
    value.startsWith("data:")
  ) {
    return false;
  }
  return value.length <= 8;
}

/**
 * Idempotent seed of catalog + settings (assumes caller already created the
 * admin and manager User rows). Returns counts for audit purposes. Safe to
 * re-run ONLY when the DB is empty of these entities; does not check whether
 * the rows already exist.
 */
export async function seedCatalogAndSettings(auditorUserId: string): Promise<{
  categories: number;
  products: number;
  addons: number;
}> {
  // Fiscal counter singleton MUST exist or every order/shift/Z creation
  // throws P2025. The CLI orchestrator (prisma/seed.ts) creates it too, but
  // the API seed path previously missed it (post-audit N2).
  await ensureFiscalCounter();

  // Categories
  const catMap: Record<string, string> = {};
  for (const c of SEED_CATEGORIES) {
    const cat = await db.category.create({
      data: { name: c.name, color: c.color, icon: c.icon, sortOrder: c.sortOrder, active: true },
    });
    catMap[c.name] = cat.id;
  }

  // Products + options
  let order = 0;
  for (const p of SEED_PRODUCTS) {
    order++;
    const catId = catMap[p.category];
    if (!catId) continue;
    const product = await db.product.create({
      data: {
        name: p.name,
        description: p.description ?? null,
        price: p.price,
        vatRate: p.vatRate,
        categoryId: catId,
        image: p.image,
        active: true,
        available: true,
        sortOrder: order,
      },
    });
    if (p.options) {
      for (let i = 0; i < p.options.length; i++) {
        const g = p.options[i];
        const group = await db.optionGroup.create({
          data: {
            productId: product.id,
            name: g.name,
            required: g.required,
            multiple: g.multiple,
            sortOrder: i,
          },
        });
        for (let j = 0; j < g.choices.length; j++) {
          const ch = g.choices[j];
          await db.optionChoice.create({
            data: {
              groupId: group.id,
              name: ch.name,
              priceModifier: ch.priceModifier,
              sortOrder: j,
            },
          });
        }
      }
    }
  }

  // Add-ons
  for (let i = 0; i < SEED_ADDONS.length; i++) {
    const a = SEED_ADDONS[i];
    await db.addOn.create({
      data: { name: a.name, price: a.price, image: a.image, active: true, sortOrder: i },
    });
  }

  // Settings (matches DEFAULT_SETTINGS plus operator metadata)
  await saveSettings({
    ...DEFAULT_SETTINGS,
    restaurantName: "HibaPOS France",
    restaurantAddress: "12 Rue de la Paix, 75002 Paris",
    restaurantPhone: "01 23 45 67 89",
    restaurantSiret: "812 345 678 00021",
    restaurantTva: "FR 12 345678901",
    footerNote: "Merci de votre visite — À bientôt !",
    defaultVatRate: 10,
    currency: "EUR",
    printerName: "Epson TM-m30",
    receiptWidth: 80,
    discountApprovalThreshold: 20,
    autoPrint: false,
  });

  await audit(
    "SYSTEM_SEED",
    "System",
    null,
    {
      users: 2,
      categories: SEED_CATEGORIES.length,
      products: SEED_PRODUCTS.length,
      addons: SEED_ADDONS.length,
    },
    auditorUserId,
  );

  return {
    categories: SEED_CATEGORIES.length,
    products: SEED_PRODUCTS.length,
    addons: SEED_ADDONS.length,
  };
}