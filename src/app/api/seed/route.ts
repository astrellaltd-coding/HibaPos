import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hashPin } from "@/lib/auth";
import { seedCatalogAndSettings, isEmojiImage } from "@/lib/services/seed";
import { isScryptBusyError } from "@/lib/pin-hash-queue";
import { hasTraded, NOT_FRESH_REFUSAL } from "@/lib/services/account-policy";
import { scryptBusyResponse } from "@/lib/api-handler";

// Re-export helper so any consumer (none currently, but defensive) keeps it.
export { isEmojiImage };

/**
 * POST /api/seed
 * First-boot seeding: when no users exist yet, anyone can bootstrap the demo
 * dataset (admin + manager with default PINs from env `SEED_ADMIN_PIN` /
 * `SEED_MANAGER_PIN`, defaulting to 123456 / 111111 for backward compat).
 * Once seeded, the route refuses to re-run unless the caller is a SUPER_ADMIN;
 * in that case it's a no-op (idempotent message returned).
 *
 * PINs are intentionally NOT returned in the response and NOT logged to stdout.
 * The operator must obtain them out-of-band (env / deployment docs) and rotate
 * them after first login.
 */
export async function POST() {
  // C-09, Batch 4.2 — `hashPin` is async and bounded; answer 503 rather than
  // a raw 500 if the bootstrap lands while the queue is saturated.
  try {
    return await seed();
  } catch (e) {
    if (isScryptBusyError(e)) return scryptBusyResponse();
    throw e;
  }
}

async function seed() {
  const existingCount = await db.user.count();
  if (existingCount > 0) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Réservé au super administrateur" },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, message: "Déjà initialisé", skipped: true });
  }

  // C-18 (Batch 4.3) — the bootstrap is for a FRESH install, not for one
  // whose users happen to have been deleted. Rule and rationale in
  // `account-policy.ts`.
  const [counter, orderCount, eventCount] = await Promise.all([
    db.fiscalCounter.findUnique({ where: { id: "singleton" } }),
    db.order.count(),
    db.fiscalEvent.count(),
  ]);
  if (hasTraded({ counter, orderCount, eventCount })) {
    return NextResponse.json({ error: NOT_FRESH_REFUSAL }, { status: 409 });
  }

  // Bootstrap path. Default PINs end up as defaults in env if unset.
  const adminPin = process.env.SEED_ADMIN_PIN ?? "123456";
  const managerPin = process.env.SEED_MANAGER_PIN ?? "111111";
  if (!/^\d{6}$/.test(adminPin)) {
    return NextResponse.json({ error: "SEED_ADMIN_PIN doit contenir 6 chiffres." }, { status: 500 });
  }
  if (!/^\d{6}$/.test(managerPin)) {
    return NextResponse.json({ error: "SEED_MANAGER_PIN doit contenir 6 chiffres." }, { status: 500 });
  }

  const adminPinHash = await hashPin(adminPin);
  let admin: { id: string };
  try {
    admin = await db.user.create({
      data: {
        username: "admin",
        name: "Administrateur",
        role: "SUPER_ADMIN",
        pinHash: adminPinHash,
        active: true,
      },
      select: { id: true },
    });
  } catch (e) {
    // Concurrent first-boot race: another request seeded between our count()
    // and create(). The unique username constraint fires P2002 — treat as
    // "already initialized" instead of a raw 500.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { ok: true, message: "Déjà initialisé (requête concurrente)", skipped: true },
        { status: 200 },
      );
    }
    throw e;
  }
  const managerPinHash = await hashPin(managerPin);
  try {
    await db.user.create({
      data: {
        username: "manager",
        name: "Gérant",
        role: "MANAGER",
        pinHash: managerPinHash,
        active: true,
      },
    });
  } catch {
    // Manager row lost the race — the concurrent request created it.
  }

  let counts: { categories: number; products: number };
  try {
    counts = await seedCatalogAndSettings(admin.id);
  } catch (e) {
    // L-31 (Batch 7.4c). This used to be a bare `catch` reporting EVERY error
    // as a won race, so an operator was told "Base initialisée" when the
    // catalogue had not been seeded at all. Observed during Batch 4.3's
    // validation: on a copy whose users were empty but whose catalogue was
    // intact, `seedCatalogAndSettings` threw on duplicate category names and
    // the route answered 200 with that message.
    //
    // A lost race has a signature — P2002, the unique constraint — and the
    // users branch above already distinguishes it. Anything else is a real
    // failure and is now reported as one: the two bootstrap users WERE
    // created, which the operator needs to know, and the catalogue was not.
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? (e as { code?: string }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json({
        ok: true,
        message: "Base initialisée (requête concurrente).",
        users: 2,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        message:
          "Les deux comptes ont été créés, mais le catalogue n'a PAS été initialisé. " +
          "Vérifiez la base avant de continuer.",
        users: 2,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      "Base initialisée. Consultez la documentation opérateur (ou SEED_ADMIN_PIN / SEED_MANAGER_PIN) pour les PINs temporaires. Changez-les immédiatement.",
    users: 2,
    ...counts,
  });
}

export async function GET() {
  const count = await db.user.count();
  return NextResponse.json({ initialized: count > 0 });
}