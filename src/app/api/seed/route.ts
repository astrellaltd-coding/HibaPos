import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { randomInt } from "crypto";
import { hashPin, isPublishedDefaultPin } from "@/lib/auth";
import { PUBLISHED_PIN_REFUSAL } from "@/lib/services/account-policy";
import { seedCatalogAndSettings, isEmojiImage } from "@/lib/services/seed";
import { isScryptBusyError } from "@/lib/pin-hash-queue";
import { hasTraded, NOT_FRESH_REFUSAL } from "@/lib/services/account-policy";
import { scryptBusyResponse } from "@/lib/api-handler";

// Re-export helper so any consumer (none currently, but defensive) keeps it.
export { isEmojiImage };

/**
 * POST /api/seed
 * First-boot seeding: when no users exist yet, anyone can bootstrap the demo
 * dataset. Once seeded, the route refuses to re-run unless the caller is a
 * SUPER_ADMIN; in that case it's a no-op (idempotent message returned).
 *
 * ── WHICH PINS, AND WHO DECIDED — L-118 (R9.5) ──────────────────────────────
 * `isPublishedDefaultPin` had ONE call site in the repository — an operator
 * CLI — while this route, unauthenticated on a fresh install and wired to a
 * button on the login screen, installed **123456 and 111111 as live
 * credentials**. `docs/INVARIANTS.md` states the denylist as a property of the
 * system; it was a property of one script. **This is the path the France fresh
 * install takes**, so it was put to the operator rather than decided here.
 *
 * THEIR ANSWER, 2026-09-13: « Admin always 123456, manager chose his own or
 * generate a random one and show it. »
 *
 *   * **admin — `123456`, deliberately.** `SEED_ADMIN_PIN` still overrides it.
 *     Recorded as their decision and not as an oversight: the value is
 *     published in this repository and in a commit message, so anyone holding a
 *     copy knows the super-administrator's PIN on a freshly seeded install.
 *     They were told that before choosing.
 *   * **manager — `SEED_MANAGER_PIN` if set, otherwise GENERATED** and returned
 *     once so it can be written down. A published default is refused here, so
 *     `111111` can no longer be installed by accident.
 *
 * SO A PIN IS NOW RETURNED, which reverses what this docblock used to promise.
 * Only the generated one, only on the call that creates it, and never on the
 * idempotent re-run — the same « shown once, record it elsewhere » shape
 * `setup/secrets` uses, and the alternative was a value nobody could learn.
 * Still never logged to stdout.
 */
/**
 * A six-digit PIN nobody can look up — L-118 (R9.5).
 *
 * `randomInt` rather than `Math.random()`: this is a live credential, and the
 * whole point of generating one is that it is not predictable. Rejection-free —
 * `randomInt(0, 1_000_000)` is uniform over the range — and zero-padded, so
 * `000042` is as likely as any other value and the keyspace is the full 10^6.
 *
 * A published default cannot come out of here (they are two specific values in
 * a million), but it is checked anyway rather than argued about: the cost is a
 * comparison and the alternative is a probability argument in a security path.
 */
function generateSeedPin(): string {
  for (let i = 0; i < 8; i++) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (!isPublishedDefaultPin(pin)) return pin;
  }
  // Unreachable in practice; refusing beats returning a known value.
  throw new Error("Could not generate a PIN that is not a published default.");
}

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

  // Bootstrap path — see the docblock for whose decision each of these is.
  const adminPin = process.env.SEED_ADMIN_PIN ?? "123456";
  if (!/^\d{6}$/.test(adminPin)) {
    return NextResponse.json({ error: "SEED_ADMIN_PIN doit contenir 6 chiffres." }, { status: 500 });
  }

  // The manager's: chosen, or made. `generatedManagerPin` is non-null only when
  // this call made one, and only then is it returned.
  const configuredManagerPin = process.env.SEED_MANAGER_PIN?.trim() || null;
  if (configuredManagerPin && !/^\d{6}$/.test(configuredManagerPin)) {
    return NextResponse.json({ error: "SEED_MANAGER_PIN doit contenir 6 chiffres." }, { status: 500 });
  }
  if (configuredManagerPin && isPublishedDefaultPin(configuredManagerPin)) {
    return NextResponse.json({ error: PUBLISHED_PIN_REFUSAL }, { status: 400 });
  }
  const generatedManagerPin = configuredManagerPin ? null : generateSeedPin();
  const managerPin = configuredManagerPin ?? generatedManagerPin!;

  // L-118 (R9.5) — BUILT ONCE, SPREAD INTO EVERY RESPONSE PAST THIS POINT.
  //
  // Both users are created below, before the catalogue is touched, so every
  // return after that has installed a credential. My first version added the
  // PIN to the success response only and dropped it from the two
  // catalogue-failure branches — a manager account nobody could ever log into,
  // which is **worse than the published default it replaced**. Caught by a
  // test, not by reading.
  //
  // One object, spread everywhere, so the next branch added here has to
  // actively leave it out. `seed-pin-payload.test.ts` counts the spreads
  // against the returns.
  const pinPayload = generatedManagerPin ? { managerPin: generatedManagerPin } : {};

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
    // L-118 (R9.5) — THE PIN GOES IN BOTH OF THESE TOO.
    //
    // The users are already created at this point, with the generated PIN. A
    // catalogue failure that returned without it would install a credential and
    // show it to nobody — **worse than the published default it replaced**,
    // because the manager account becomes unusable rather than merely known.
    // Found by the test, not by reading: the catalogue P2002 branch is the one
    // a second seed against an existing catalogue takes.
    if (code === "P2002") {
      return NextResponse.json({
        ok: true,
        message: generatedManagerPin
          ? "Base initialisée (requête concurrente). Notez le code du gérant maintenant : il ne sera plus affiché."
          : "Base initialisée (requête concurrente).",
        users: 2,
        ...pinPayload,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        message:
          "Les deux comptes ont été créés, mais le catalogue n'a PAS été initialisé. " +
          "Vérifiez la base avant de continuer." +
          (generatedManagerPin ? " Notez le code du gérant : il ne sera plus affiché." : ""),
        users: 2,
        ...pinPayload,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }

  // L-118 (R9.5): the generated manager PIN, once. `managerPin` is present in
  // the response ONLY when this call made it — a configured SEED_MANAGER_PIN is
  // the operator's own value and they already have it, and the idempotent
  // re-run above returns before reaching here.
  return NextResponse.json({
    ok: true,
    message: generatedManagerPin
      ? "Base initialisée. Notez le code du gérant maintenant : il ne sera plus affiché."
      : "Base initialisée. Les codes sont ceux de SEED_ADMIN_PIN / SEED_MANAGER_PIN.",
    users: 2,
    ...pinPayload,
    ...counts,
  });
}

export async function GET() {
  const count = await db.user.count();
  return NextResponse.json({ initialized: count > 0 });
}