#!/usr/bin/env bun
/**
 * L-217 — set how many of an option group each taco size includes.
 *
 * The operator's determination, 2026-09-18: **M includes 1 viande, L 2, XL 3.**
 * A CEILING, not a requirement — the group's own `required` supplies the floor,
 * so an L is one or two — and beyond the count the caisse refuses rather than
 * charging.
 *
 * WHY THIS EXISTS AT ALL. `Viande` is a CATEGORY group shared by all three
 * sizes, so it cannot say 1, 2 and 3 at once; the number belongs to the
 * (product, group) pair and lives in `ProductOptionQuota`. The product editor
 * can set it by hand — this script is for doing all three at once, repeatably,
 * with a restore point and a verification, and for doing it again on the France
 * till when the catalogue gets there.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 *   bun run scripts/set-option-quotas.ts            # report only
 *   bun run scripts/set-option-quotas.ts --apply    # write
 *
 * Idempotent: a size already carrying its number is left alone, and running it
 * twice reports NOTHING TO CHANGE.
 *
 * It refuses rather than guesses. If a size is missing, if the group is not
 * where it is expected, or if the products do not inherit the category's
 * globals, it stops and says which — because a quota written against the wrong
 * group is a ceiling that silently never applies.
 */
import { PrismaClient } from "@prisma/client";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** The operator's rule. The category is named so the script cannot address
 *  three same-named products in some other part of the catalogue. */
const CATEGORY = "Tacos";
const GROUP = "Viande";
const INCLUDED: Record<string, number> = {
  "Tacos M": 1,
  "Tacos L": 2,
  "Tacos XL": 3,
};

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

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN (pass --apply to write) ===");
  const file = databaseFile();
  console.log(`Database : ${file}`);

  const category = await db.category.findFirst({
    where: { name: CATEGORY },
    include: {
      optionGroups: { select: { id: true, name: true, required: true, multiple: true } },
      products: {
        select: { id: true, name: true, price: true, inheritCategoryGlobals: true },
        orderBy: { price: "asc" },
      },
    },
  });
  if (!category) throw new Error(`No category named "${CATEGORY}". Refusing to guess.`);

  const group = category.optionGroups.find((g) => g.name === GROUP);
  if (!group) {
    throw new Error(
      `Category "${CATEGORY}" has no option group "${GROUP}" (has: ${
        category.optionGroups.map((g) => g.name).join(", ") || "none"
      }). Refusing.`,
    );
  }
  if (!group.multiple) {
    throw new Error(
      `"${GROUP}" is single-select, so a ceiling above one can never be reached. Refusing — this is not the group this rule is about.`,
    );
  }

  const missing = Object.keys(INCLUDED).filter((n) => !category.products.some((p) => p.name === n));
  if (missing.length > 0) {
    throw new Error(
      `Missing product(s) in "${CATEGORY}": ${missing.join(", ")}. Found: ${
        category.products.map((p) => p.name).join(", ") || "none"
      }. Refusing.`,
    );
  }

  const existing = await db.productOptionQuota.findMany({ where: { groupId: group.id } });
  const byProduct = new Map(existing.map((q) => [q.productId, q]));

  const planned: { id: string; name: string; from: number | null; to: number }[] = [];
  for (const p of category.products) {
    const want = INCLUDED[p.name];
    if (want === undefined) {
      console.log(`  ${p.name.padEnd(12)} — no rule given, left alone`);
      continue;
    }
    if (!p.inheritCategoryGlobals) {
      throw new Error(
        `"${p.name}" does not inherit the category's globals, so it never sees "${GROUP}" and a quota on it would do nothing. Refusing.`,
      );
    }
    const current = byProduct.get(p.id)?.included ?? null;
    planned.push({ id: p.id, name: p.name, from: current, to: want });
  }

  console.log(`\nGroup    : ${group.name} (required=${group.required}, multiple=${group.multiple})`);
  console.log("Plan     :");
  for (const c of planned) {
    const price = (category.products.find((p) => p.id === c.id)!.price / 100).toFixed(2).replace(".", ",");
    const verb = c.from === null ? "set" : c.from === c.to ? "unchanged" : "change";
    console.log(
      `  ${c.name.padEnd(12)} ${price} €  ${String(c.from ?? "—").padStart(3)} → ${c.to}   (${verb})`,
    );
  }

  const changes = planned.filter((c) => c.from !== c.to);
  if (changes.length === 0) {
    console.log("\nNOTHING TO CHANGE — every size already carries its number.");
    return;
  }

  if (!APPLY) {
    console.log(`\n${changes.length} row(s) would be written. Nothing written. Re-run with --apply.`);
    return;
  }

  // --- restore point ---------------------------------------------------------
  // Its own, sha-verified, into a SIBLING of the repo — putting it inside would
  // place a production database in the working tree.
  const snapshots = path.resolve(process.cwd(), "..", "db-snapshots");
  if (!existsSync(snapshots)) mkdirSync(snapshots, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const restore = path.join(snapshots, `before-option-quotas-${stamp}.db`);
  copyFileSync(file, restore);
  const beforeSha = sha256(file);
  if (sha256(restore) !== beforeSha) {
    throw new Error("Restore point does not match the source. Refusing to write.");
  }
  console.log(`\nRestore point : ${restore}`);
  console.log(`  sha256      : ${beforeSha}`);

  // --- write -----------------------------------------------------------------
  await db.$transaction(async (tx) => {
    for (const c of changes) {
      await tx.productOptionQuota.upsert({
        where: { productId_groupId: { productId: c.id, groupId: group.id } },
        create: { productId: c.id, groupId: group.id, included: c.to },
        update: { included: c.to },
      });
    }
  });

  // --- verify ----------------------------------------------------------------
  // Read it back rather than trusting the transaction's silence.
  const after = await db.productOptionQuota.findMany({
    where: { groupId: group.id },
    include: { product: { select: { name: true } } },
  });
  const seen = new Map(after.map((q) => [q.product.name, q.included]));
  const wrong: string[] = [];
  for (const [name, want] of Object.entries(INCLUDED)) {
    if (seen.get(name) !== want) wrong.push(`${name}: expected ${want}, read ${seen.get(name) ?? "nothing"}`);
  }
  if (wrong.length > 0) {
    throw new Error(`VERIFICATION FAILED:\n  ${wrong.join("\n  ")}\nRestore point: ${restore}`);
  }

  console.log("\nWritten and verified:");
  for (const [name, want] of Object.entries(INCLUDED)) {
    console.log(`  ${name.padEnd(12)} ${want} ${GROUP.toLowerCase()}${want > 1 ? "s" : ""} incluse${want > 1 ? "s" : ""}`);
  }
  console.log("\n✅ APPLIED AND VERIFIED");
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
