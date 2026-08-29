import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hashPin } from "@/lib/auth";
import { seedCatalogAndSettings, isEmojiImage } from "@/lib/services/seed";

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
  const existingCount = await db.user.count();
  if (existingCount > 0) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (user?.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Réservé au super administrateur" },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true, message: "Déjà initialisé", skipped: true });
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

  let admin: { id: string };
  try {
    admin = await db.user.create({
      data: {
        username: "admin",
        name: "Administrateur",
        role: "SUPER_ADMIN",
        pinHash: hashPin(adminPin),
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
  try {
    await db.user.create({
      data: {
        username: "manager",
        name: "Gérant",
        role: "MANAGER",
        pinHash: hashPin(managerPin),
        active: true,
      },
    });
  } catch {
    // Manager row lost the race — the concurrent request created it.
  }

  let counts: { categories: number; products: number; addons: number };
  try {
    counts = await seedCatalogAndSettings(admin.id);
  } catch {
    // Catalog lost the race (unique category names). The concurrent request
    // completed the seeding — treat as success.
    return NextResponse.json({
      ok: true,
      message: "Base initialisée (requête concurrente).",
      users: 2,
    });
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