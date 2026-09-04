// `prisma db seed` orchestrator (invoked by `npm run db:seed` → `prisma db seed`).
// Creates the bootstrap admin + manager users (PINs sourced from env with
// insecure defaults) AND seeds the catalog + settings. Idempotent in the sense
// that it exits with a no-op message when rows already exist, so it is safe
// to re-run transparently from `prisma migrate deploy` pipelines.
import { PrismaClient } from "@prisma/client";
import { hashPin } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("[seed] Base déjà initialisée — aucune action.");
    return;
  }

  const adminPin = process.env.SEED_ADMIN_PIN ?? "123456";
  const managerPin = process.env.SEED_MANAGER_PIN ?? "111111";

  if (!/^\d{6}$/.test(adminPin)) throw new Error("SEED_ADMIN_PIN doit contenir 6 chiffres.");
  if (!/^\d{6}$/.test(managerPin)) throw new Error("SEED_MANAGER_PIN doit contenir 6 chiffres.");

  const admin = await prisma.user.create({
    data: {
      username: "admin",
      name: "Administrateur",
      role: "SUPER_ADMIN",
      pinHash: await hashPin(adminPin),
      active: true,
    },
  });
  await prisma.user.create({
    data: {
      username: "manager",
      name: "Gérant",
      role: "MANAGER",
      pinHash: await hashPin(managerPin),
      active: true,
    },
  });

  // Defer to the shared seed module for catalog + settings so the runtime
  // `POST /api/seed` route (first-boot path) and the CLI orchestrator stay
  // in lockstep. The shared module imports `db` from `@/lib/db`; instead we
  // re-implement the catalog seed inline using the same exported constants,
  // to avoid pulling Next.js server-only modules into a CLI context.
  const {
    SEED_CATEGORIES,
    SEED_PRODUCTS,
    SEED_ADDONS,
  } = await import("../src/lib/services/seed");

  // Categories
  const catMap: Record<string, string> = {};
  for (const c of SEED_CATEGORIES) {
    const cat = await prisma.category.create({
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
    const product = await prisma.product.create({
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
        const group = await prisma.optionGroup.create({
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
          await prisma.optionChoice.create({
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
    await prisma.addOn.create({
      data: { name: a.name, price: a.price, image: a.image, active: true, sortOrder: i },
    });
  }

  // Settings — inline (DEFAULT_SETTINGS mirror so we don't need server-only imports).
  const seedSettings: Record<string, unknown> = {
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
  };
  for (const [k, v] of Object.entries(seedSettings)) {
    await prisma.setting.upsert({
      where: { key: k },
      create: { key: k, value: JSON.stringify(v) },
      update: { value: JSON.stringify(v) },
    });
  }

  // Fiscal counter singleton
  await prisma.fiscalCounter.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      lastReceiptNumber: 0,
      lastShiftNumber: 0,
      lastZReportNumber: 0,
      lastFiscalEventSequence: 0,
    },
    update: {},
  });

  // Audit log entry (no `audit()` import — direct table write)
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: "SYSTEM_SEED",
      entity: "System",
      entityId: null,
      details: JSON.stringify({
        users: 2,
        categories: SEED_CATEGORIES.length,
        products: SEED_PRODUCTS.length,
        addons: SEED_ADDONS.length,
      }),
    },
  });

  console.log("[seed] Base initialisée. Utilisateurs: admin, manager.");
  // NOTE: the temporary PINs are intentionally NOT logged or printed.
  // They come from SEED_ADMIN_PIN / SEED_MANAGER_PIN (see .env.example) —
  // the operator already knows them. Rotate immediately after first login.
}

main()
  .catch((e) => {
    console.error("[seed] failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });