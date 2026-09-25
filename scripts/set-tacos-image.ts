#!/usr/bin/env bun
/**
 * Point `Tacos M`, `L` and `XL` at their photograph.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * **L-232.** 80 of 86 products carry an image. The six that do not are the
 * three Tacos and the three « sans boisson » box variants — and the boxes are
 * `showOnPos = 0`, so **the Tacos are the only tile a cashier can see with no
 * photograph**. `add-tacos.ts` left `Product.image` null deliberately (« a
 * script that guessed would be writing a decision nobody took ») and the
 * decision was then never taken, on either machine, for days.
 *
 * The operator took it on the FRANCE TILL on 2026-09-20, in the médiathèque,
 * and not here. So the two catalogues diverged — the till prints
 * `a38c95977b5e1122`, this machine `b6a76daf0befc587`, and the only section
 * that differs is `Product`. **This script closes that gap from the other
 * side**, with the string measured off the till rather than retyped:
 * `/uploads/Produits/Tacos.webp` reproduced the till's digests exactly,
 * first of five candidate spellings.
 *
 * ── WHY A SCRIPT AND NOT THE MÉDIATHÈQUE ────────────────────────────────────
 * Doing it in the screen means running the application against
 * `db/custom.db`, which the plan's § 5 marks « ❌ Never, from this
 * directory ». And a value typed twice on two machines is a value that can
 * differ by a capital letter and cost another round of fingerprint
 * archaeology. This writes the one string that is known to match.
 *
 * ── DRY RUN UNLESS GIVEN `--apply` ──────────────────────────────────────────
 *   bun scripts/set-tacos-image.ts            # report only, changes nothing
 *   bun scripts/set-tacos-image.ts --apply    # write it
 *
 * Idempotent: rows already pointing at that file are left alone, and a row
 * pointing at a DIFFERENT image is refused rather than overwritten — that
 * would be undoing somebody's choice, which is not this script's to make.
 */
import { PrismaClient } from "@prisma/client";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { uploadsDir } from "../src/lib/paths";

const APPLY = process.argv.includes("--apply");

/** The stored value, and the file it has to correspond to. */
const IMAGE_URL = "/uploads/Produits/Tacos.webp";
const SIZES = ["Tacos M", "Tacos L", "Tacos XL"] as const;

function sha256(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** The database this run will touch, from `DATABASE_URL` — rule 3 of
 *  `scripts/README.md`: the variable is what these scripts obey. */
function databaseFile(): string {
  const url = process.env.DATABASE_URL ?? "";
  const m = /^file:(.*?)(\?|$)/.exec(url);
  if (!m?.[1]) throw new Error(`DATABASE_URL is not a file: URL — got ${url || "(unset)"}`);
  return m[1];
}

/** Read the three rows through a client that is CLOSED again before anything
 *  else looks at the file. That close is what lets the journal check below
 *  mean something — see it for the whole argument (L-234). */
async function readSizes(): Promise<{ id: string; name: string; image: string | null }[]> {
  const db = new PrismaClient();
  try {
    return await db.product.findMany({
      where: { name: { in: [...SIZES] } },
      select: { id: true, name: true, image: true },
    });
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN (pass --apply to write) ===");

  const file = databaseFile();
  console.log(`\nDatabase    : ${file}`);

  // --- refusal 1: the photograph must actually be there ----------------------
  // A row pointing at a file that does not exist is a broken image on the POS,
  // which is worse than no image: it looks like a fault rather than a gap.
  const onDisk = path.join(uploadsDir(), "Produits", "Tacos.webp");
  if (!existsSync(onDisk)) {
    throw new Error(
      `${onDisk} does not exist, so ${IMAGE_URL} would point at nothing. ` +
        `The file is tracked in git and arrives with the code — check the working tree.`,
    );
  }
  console.log(`Photograph  : ${onDisk} (${statSync(onDisk).size.toLocaleString("fr-FR")} bytes)`);

  const rows = await readSizes();

  // --- refusal 2: one file must be the whole database ------------------------
  // AFTER `readSizes()` has opened a client and closed it, and that ordering is
  // the whole correctness of this check. SQLite removes `-wal` and `-shm` when
  // the last connection closes, so any read-only tool's leftovers are gone by
  // now and anything still here has appeared SINCE — which is worth refusing.
  // `apply-migration.ts` relies on exactly this and documents it; L-233 is what
  // happens when the same check runs while a connection is still open.
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    if (existsSync(file + suffix)) {
      throw new Error(
        `${path.basename(file)}${suffix} sits beside the database after this script closed its ` +
          `own connection, so something else holds it. A restore point taken now would not be ` +
          `the whole database. Stop the application and run this again.`,
      );
    }
  }

  // --- refusal 3: the three sizes must be there -----------------------------
  const found = new Map(rows.map((r) => [r.name, r]));
  const missing = SIZES.filter((s) => !found.has(s));
  if (missing.length) {
    throw new Error(
      `missing product(s): ${missing.join(", ")}. Run add-tacos.ts first — this script ` +
        `points existing rows at a photograph, it does not create them.`,
    );
  }

  // --- refusal 4: never overwrite a different choice -------------------------
  const conflicting = rows.filter((r) => r.image && r.image !== IMAGE_URL);
  if (conflicting.length) {
    throw new Error(
      `these already point somewhere else, and overwriting would undo a decision this script ` +
        `did not take:\n` +
        conflicting.map((r) => `    ${r.name} -> ${r.image}`).join("\n"),
    );
  }

  const toSet = rows.filter((r) => r.image !== IMAGE_URL);
  console.log("");
  for (const r of rows) {
    const mark = r.image === IMAGE_URL ? "already set" : "WOULD SET";
    console.log(`  ${r.name.padEnd(12)} ${String(r.image ?? "(none)").padEnd(30)} ${mark}`);
  }

  if (!toSet.length) {
    console.log(`\nAll three already point at ${IMAGE_URL}. Nothing to write.`);
    return;
  }

  if (!APPLY) {
    console.log(`\n${toSet.length} row(s) would be set to ${IMAGE_URL}. Nothing written.`);
    console.log("Re-run with --apply.");
    return;
  }

  // --- restore point ---------------------------------------------------------
  // Its own, sha-verified, into a SIBLING of the repo — putting it inside would
  // place a production database in the working tree. Taken while no connection
  // is open, so the .db is the whole database.
  const snapshots = path.resolve(process.cwd(), "..", "db-snapshots");
  if (!existsSync(snapshots)) mkdirSync(snapshots, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const restore = path.join(snapshots, `before-tacos-image-${stamp}.db`);
  copyFileSync(file, restore);
  const beforeSha = sha256(file);
  if (sha256(restore) !== beforeSha) {
    throw new Error("Restore point does not match the source. Refusing to write.");
  }
  console.log(`\nRestore point : ${restore}`);
  console.log(`  sha256      : ${beforeSha}`);

  // --- write, then read it back ----------------------------------------------
  const db = new PrismaClient();
  try {
    await db.$transaction(
      toSet.map((r) => db.product.update({ where: { id: r.id }, data: { image: IMAGE_URL } })),
    );

    const after = await db.product.findMany({
      where: { name: { in: [...SIZES] } },
      select: { name: true, image: true },
    });
    const wrong = after.filter((r) => r.image !== IMAGE_URL);
    if (wrong.length) {
      throw new Error(
        `read-back disagrees: ${wrong.map((r) => `${r.name} -> ${r.image}`).join(", ")}. ` +
          `Restore point above.`,
      );
    }

    // Fold the write out of the log before reporting the file's hash, so the
    // number means what it says on a WAL database and the next tool does not
    // meet a log this script left behind.
    await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
    console.log(`\n  ${after.length} row(s) read back at ${IMAGE_URL}.`);
  } finally {
    await db.$disconnect();
  }

  console.log(`  sha256 after : ${sha256(file)}`);
  console.log("\n✅ DONE. Re-run catalogue-fingerprint.ts on BOTH machines — they should now agree.");
}

main().catch((e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
