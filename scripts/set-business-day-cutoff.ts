#!/usr/bin/env bun
/**
 * Set `businessDayCutoffHour` — the hour a trading day ends and the next
 * begins — on this installation.
 *
 * ── WHY A SCRIPT, FOR ONE INTEGER ───────────────────────────────────────────
 * The operator settled on 2026-09-20 that the cut-off moves **5 → 0**: the
 * owner confirmed nothing is ever sold after midnight, so the trading day
 * should follow the calendar. It is a SETTING and Réglages can edit it — but
 * on both installs the screen is the wrong instrument:
 *
 *   - **On the development machine**, reaching Réglages means running the app
 *     against `db/custom.db`, and the plan's § 5 marks `bun run dev` and
 *     `bun run start` « ❌ Never, from this directory » for exactly that reason.
 *   - **On the France till**, DD-26 puts this field in `SUPER_ADMIN_ONLY_SETTINGS`
 *     beside the SIRET, so the Gérant account the till is actually used with is
 *     refused it (**L-230**). Changing it in the UI means signing out of the
 *     working account.
 *
 * One script settles both, and carries a refusal the screen does not have.
 *
 * ── THE REFUSAL THAT MATTERS: IT WILL NOT RAISE THE HOUR AFTER A SEAL ───────
 * `businessDayCutoffHour` decides the edges of every sealed document. **Raising
 * it once a day has been sealed is one of the two things that arm L-228** — the
 * guard that refuses a sale into an already-sealed trading day. The arithmetic:
 * to book into sealed day `D` you need `businessDayOf(now) == D`, which cannot
 * happen while the hour stands still, but moving the boundary LATER drags a
 * moment that already belongs to `D+1` back into `D`. Réglages will let you do
 * it. This will not.
 *
 * LOWERING is always allowed, and so is any change while no day has been
 * sealed — which is the situation both installs are in today, and the reason
 * this is cheapest now.
 *
 * ── AND IT REFUSES A DATABASE THAT IS NOT ALL IN ONE FILE ───────────────────
 * A `-wal`, `-shm` or `-journal` beside the database means the file this script
 * would copy is NOT the whole database, so the restore point would be a
 * half-truth. Same guard, same reason, as `apply-migration.ts`. On the France
 * till the app is normally running and WAL is likely on, so expect this to fire
 * unless the Scheduled Tasks are stopped — which they are during an update.
 *
 * ── DRY RUN UNLESS GIVEN `--apply` ──────────────────────────────────────────
 *   bun scripts/set-business-day-cutoff.ts --hour 0            # report only
 *   bun scripts/set-business-day-cutoff.ts --hour 0 --apply    # write it
 *
 * `--hour` is REQUIRED and has no default. A script that defaulted to the
 * operator's current answer would re-impose it silently the next time somebody
 * ran it after changing their mind.
 *
 * Idempotent: a value already at the requested hour writes nothing.
 */
import { PrismaClient } from "@prisma/client";
import { copyFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { createHash } from "crypto";
import path from "path";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const KEY = "businessDayCutoffHour";

function sha256(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** The database this run will actually touch, from `DATABASE_URL` — rule 3 of
 *  `scripts/README.md`: the variable is what these scripts obey, and a script
 *  that reads a hardcoded path ignores it. */
function databaseFile(): string {
  const url = process.env.DATABASE_URL ?? "";
  const m = /^file:(.*?)(\?|$)/.exec(url);
  if (!m?.[1]) throw new Error(`DATABASE_URL is not a file: URL — got ${url || "(unset)"}`);
  return m[1];
}

/** The requested hour, or a refusal. Parsed strictly: « 07 » is fine, « 7h »,
 *  « -1 » and « 24 » are not, and a missing value is not a silent zero. */
function requestedHour(): number {
  const i = process.argv.indexOf("--hour");
  const raw = i >= 0 ? process.argv[i + 1] : undefined;
  if (raw === undefined || raw.startsWith("--")) {
    throw new Error("--hour is required, e.g. `--hour 0`. There is no default.");
  }
  if (!/^\d{1,2}$/.test(raw)) {
    throw new Error(`--hour must be a whole number 0-23 — got « ${raw} ».`);
  }
  const n = Number(raw);
  if (n < 0 || n > 23) throw new Error(`--hour must be 0-23 — got ${n}.`);
  return n;
}

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN (pass --apply to write) ===");

  const want = requestedHour();
  const file = databaseFile();
  console.log(`\nDatabase    : ${file}`);

  // --- what is there now -----------------------------------------------------
  // Read through the row rather than `getSettings()`, because the DEFAULT this
  // reports must be the one actually stored. An absent row means the app is
  // running on the default, and writing the row is still a real change.
  const row = await db.setting.findUnique({ where: { key: KEY } });
  let current: number | null = null;
  if (row) {
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (typeof parsed === "number") current = parsed;
    } catch {
      /* a value that will not parse is reported as unreadable below */
    }
  }
  console.log(
    `Cut-off now : ${row ? (current === null ? `UNREADABLE (${row.value})` : current) : "(no row — the app is using its built-in default)"}`,
  );
  console.log(`Requested   : ${want}`);

  // --- refusal 1: the database is not all in one file ------------------------
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(file + suffix)) {
      throw new Error(
        `${path.basename(file)}${suffix} sits beside the database, so this file is not the ` +
          `whole database and a restore point taken from it would be incomplete. ` +
          `Stop the application (on the till: both Scheduled Tasks) and run this again.`,
      );
    }
  }

  // --- refusal 2: raising the hour after a day has been sealed ---------------
  const sealed = await db.dailyClose.count();
  if (sealed > 0 && current !== null && want > current) {
    const last = await db.dailyClose.findFirst({
      orderBy: { period: "desc" },
      select: { period: true },
    });
    throw new Error(
      `REFUSED: ${sealed} trading day(s) are already sealed (latest ${last?.period}), and ` +
        `raising the cut-off from ${current} to ${want} would drag moments that belong to a ` +
        `later day back into a sealed one. That is one of the two things that arm L-228. ` +
        `Lowering it is still allowed.`,
    );
  }
  if (sealed > 0) {
    console.log(
      `\n  NOTE: ${sealed} day(s) already sealed. Each records the hour it used; this changes ` +
        `only how FUTURE days are bounded.`,
    );
  }

  // --- nothing to do? --------------------------------------------------------
  if (current === want) {
    console.log(`\nAlready ${want}. Nothing to write.`);
    return;
  }

  if (!APPLY) {
    console.log(
      `\nWould set ${KEY} = ${want}${row ? "" : " (creating the row)"}. Nothing written. ` +
        `Re-run with --apply.`,
    );
    return;
  }

  // --- restore point ---------------------------------------------------------
  // Its own, sha-verified, into a SIBLING of the repo — putting it inside would
  // place a production database in the working tree.
  const snapshots = path.resolve(process.cwd(), "..", "db-snapshots");
  if (!existsSync(snapshots)) mkdirSync(snapshots, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const restore = path.join(snapshots, `before-cutoff-${stamp}.db`);
  copyFileSync(file, restore);
  const beforeSha = sha256(file);
  if (sha256(restore) !== beforeSha) {
    throw new Error("Restore point does not match the source. Refusing to write.");
  }
  console.log(`\nRestore point : ${restore}`);
  console.log(`  sha256      : ${beforeSha}`);

  // --- write -----------------------------------------------------------------
  // JSON-encoded, because that is what every other row in this table holds and
  // what `getSettings()` runs `JSON.parse` over.
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(want) },
    update: { value: JSON.stringify(want) },
  });

  // --- verify ----------------------------------------------------------------
  // Read it back rather than trusting the write's silence, and parse it the way
  // the application will — a row that stored `"0"` as the STRING zero would
  // satisfy a naive check and give the app a cut-off it cannot use.
  const after = await db.setting.findUnique({ where: { key: KEY } });
  if (!after) throw new Error("The row is absent after the write. Restore point above.");
  const readBack: unknown = JSON.parse(after.value);
  if (typeof readBack !== "number" || readBack !== want) {
    throw new Error(
      `Read-back is ${JSON.stringify(readBack)} (${typeof readBack}), expected the number ` +
        `${want}. Restore point above.`,
    );
  }

  console.log(`\n  ${KEY} = ${readBack}, read back and parsed as a number.`);
  console.log(`  sha256 after : ${sha256(file)}`);
  console.log(`\n✅ DONE. The trading day now ends at ${String(want).padStart(2, "0")}:00.`);
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
