// `prisma db seed` orchestrator (invoked by `npm run db:seed` → `prisma db seed`).
// Creates the bootstrap admin + manager users AND seeds the catalog + settings.
// Idempotent in the sense that it exits with a no-op message when rows already
// exist, so it is safe to re-run transparently from `prisma migrate deploy`
// pipelines.
//
// ── WHICH PINS, AND WHOSE DECISION EACH IS — L-191 ──────────────────────────
// This file read `SEED_MANAGER_PIN ?? "111111"` and described its own defaults
// as « insecure » in this comment, which is not the same as refusing them.
// **R9.5 fixed exactly that in `POST /api/seed`** — the login-screen button on
// a fresh install — and this path was not in its row, so the CLI went on
// installing the PIN the route had begun refusing. It was found from the other
// end: `scripts/README.md` points a first boot HERE.
//
//   * **admin — `123456`, DELIBERATELY**, with `SEED_ADMIN_PIN` still
//     overriding. The operator's decision of 2026-09-13, taken knowing the
//     value is published in this repository and in a commit message:
//     « Admin always 123456, manager chose his own or generate a random one
//     and show it. » Recorded as their decision, not as an oversight.
//   * **manager — `SEED_MANAGER_PIN` if set, otherwise GENERATED** and
//     **printed once**. A published default in that variable is refused.
//
// **SO THIS FILE NOW PRINTS A PIN**, which reverses what it used to promise at
// the bottom. Only the generated one, only on the run that creates it, never on
// the idempotent re-run. The alternative is a manager account nobody can log
// into, which is worse than the published default it replaces — a mistake
// `seed/route.ts` made first and had caught by a test.
//
// The denylist is `PUBLISHED_DEFAULT_PINS` in `auth.ts`, which this file was
// already one named import away from.
import { PrismaClient } from "@prisma/client";
import { randomInt } from "crypto";
import { hashPin, isPublishedDefaultPin } from "../src/lib/auth";
import { PUBLISHED_PIN_REFUSAL } from "../src/lib/services/account-policy";

/**
 * A six-digit PIN nobody can look up — the CLI half of L-118's generator.
 *
 * `randomInt`, not `Math.random()`: this is a live credential. Uniform over
 * `[0, 1_000_000)` and zero-padded, so `000042` is as likely as any other value
 * and the keyspace is the full 10^6. A published default cannot come out of
 * here — they are two specific values in a million — but it is checked anyway
 * rather than argued about: the cost is a comparison, and the alternative is a
 * probability argument standing in a security path.
 *
 * Deliberately a copy of `seed/route.ts`'s and not an import: that module is a
 * Next route handler and pulls `next/server` into a CLI that has no business
 * loading it. `seed-pin-parity.test.ts` pins the two against each other.
 */
function generateSeedPin(): string {
  for (let i = 0; i < 8; i++) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!isPublishedDefaultPin(pin)) return pin;
  }
  // Unreachable in practice; refusing beats returning a known value.
  throw new Error("Impossible de générer un code qui ne soit pas un défaut publié.");
}

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("[seed] Base déjà initialisée — aucune action.");
    return;
  }

  // The admin's is the operator's decision — see the header. `123456` stands.
  const adminPin = process.env.SEED_ADMIN_PIN ?? "123456";
  if (!/^\d{6}$/.test(adminPin)) throw new Error("SEED_ADMIN_PIN doit contenir 6 chiffres.");

  // The manager's: chosen, or made. `generatedManagerPin` is non-null only when
  // this run made one, and only then is it printed.
  const configuredManagerPin = process.env.SEED_MANAGER_PIN?.trim() || null;
  if (configuredManagerPin && !/^\d{6}$/.test(configuredManagerPin)) {
    throw new Error("SEED_MANAGER_PIN doit contenir 6 chiffres.");
  }
  if (configuredManagerPin && isPublishedDefaultPin(configuredManagerPin)) {
    throw new Error(`SEED_MANAGER_PIN : ${PUBLISHED_PIN_REFUSAL}`);
  }
  // `??` short-circuits, so nothing is generated when one was configured. This
  // way round rather than the route's, so the type is `string` without a `!`.
  const managerPin = configuredManagerPin ?? generateSeedPin();
  const generatedManagerPin = configuredManagerPin ? null : managerPin;

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

  // DD-15 (Batch 5.7a): the standalone `AddOn` seed was here too — this file
  // deliberately mirrors `src/lib/services/seed.ts` rather than importing it,
  // so BOTH copies had to lose it. Category add-ons are seeded with their
  // category and are unaffected.

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
    printerName: "Sunso WTP-801", // L-12 (7.2): the physical printer. The live SETTING is the operator's to change (Open Threads → B).
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
      }),
    },
  });

  console.log("[seed] Base initialisée. Utilisateurs: admin, manager.");
  // L-191 — WHAT IS PRINTED AND WHAT IS NOT.
  //
  // This said « the temporary PINs are intentionally NOT logged or printed …
  // the operator already knows them ». That was exactly false in the case that
  // mattered: when the manager's came from the built-in default, nobody had
  // been told anything, and the value was published in this repository.
  //
  // A PIN that was CHOSEN is still never printed — whoever set the variable
  // knows it. A PIN this run GENERATED is printed once, because the only other
  // option is an account nobody can open.
  if (generatedManagerPin) {
    // The box is BUILT from its contents rather than drawn by hand: the first
    // version hard-coded the rules and the padding, and the digits sat visibly
    // off-centre with the right-hand border adrift. An operator reading a
    // generated credential at midnight should not be wondering whether the
    // output is broken. Accents and « — » are single UTF-16 units, so `.length`
    // is the printed width here.
    const title = "CODE GÉRANT (manager) — généré, affiché UNE SEULE FOIS";
    const width = title.length + 4;
    const row = (s: string) => {
      const left = Math.floor((width - s.length) / 2);
      return `  │${" ".repeat(left)}${s}${" ".repeat(width - s.length - left)}│`;
    };
    console.log("");
    console.log(`  ┌${"─".repeat(width)}┐`);
    console.log(row(title));
    console.log(row(generatedManagerPin));
    console.log(`  └${"─".repeat(width)}┘`);
    console.log("  Notez-le maintenant : il n'est stocké nulle part en clair.");
    console.log("  Pour le choisir vous-même, relancez avec SEED_MANAGER_PIN.");
    console.log("");
  }
  // The admin's is `123456` unless SEED_ADMIN_PIN was set — the operator's
  // decision of 2026-09-13, and published. Rotate it after the first login.
}

main()
  .catch((e) => {
    console.error("[seed] failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });