#!/usr/bin/env bun
/**
 * PIN reset — the way back in when a PIN is lost (C-17, DD-08, Batch 4.5).
 *
 * WHAT THIS REPLACED
 * ------------------
 * Until Batch 4.5 this file was called "standalone user seeding … for ad-hoc
 * repair" and opened with three unconditional deletes:
 *
 *     db.auditLog.deleteMany({})   <- the entire ISCA audit trail
 *     db.session.deleteMany({})
 *     db.user.deleteMany({})
 *
 * It then recreated `admin` and `manager` with the two PINs written into the
 * source, and printed them. An operator following the README to fix a login
 * problem destroyed the audit log; `user.deleteMany` then failed on the
 * Order foreign key, but only AFTER the audit rows were gone, with no
 * transaction to roll back. That is C-17.
 *
 * WHY IT WAS KEPT AT ALL
 * ----------------------
 * `POST /api/seed` and `bun run db:seed` both refuse once the till has
 * traded — they count users, orders and fiscal events. So with a PIN lost
 * there is otherwise no way back into a working installation. DD-08 kept the
 * capability and removed everything dangerous about it.
 *
 * WHAT IT DOES NOW
 * ----------------
 *   - It resets the PIN of ONE existing account. Nothing else.
 *   - No `deleteMany`, no `delete`, no `create`. One `update`, of one column.
 *   - No PIN in this file. The new PIN is typed at run time and never echoed.
 *   - Dry run by default; `--apply` writes.
 *   - It refuses the two PINs this repository publishes — the denylist is
 *     `PUBLISHED_DEFAULT_PINS` in `src/lib/auth.ts`, deliberately NOT here,
 *     so that neither value appears anywhere under `scripts/`.
 *   - It refuses an account that does not exist, rather than creating one:
 *     minting a super-administrator is the capability the old script abused,
 *     and a missing user row is a restore-from-backup problem.
 *
 * USAGE
 *   bun scripts/seed-users.ts                      # list accounts, write nothing
 *   bun scripts/seed-users.ts --user admin          # dry run for one account
 *   bun scripts/seed-users.ts --user admin --apply  # prompts, then writes
 *
 * The reset is journalled in the audit log as USER_PIN_RESET_SCRIPT, so a
 * PIN changed outside the application is still visible to an inspection.
 */
import { PrismaClient } from "@prisma/client";
// `hashPin` is async (C-09, Batch 4.2). `scripts/` is now inside
// tsconfig.json and eslint.config.mjs (Batch 4.5, DD-08 part 5), so a
// missing `await` here is a typecheck error rather than a PIN hash silently
// stored as the string "[object Promise]".
import { hashPin, isPublishedDefaultPin } from "../src/lib/auth";

const db = new PrismaClient();

const APPLY = process.argv.includes("--apply");

function fail(message: string): never {
  console.error(`\n  ERREUR : ${message}\n`);
  process.exit(1);
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) fail(`${flag} attend une valeur.`);
  return value;
}

/**
 * Read a PIN from the terminal without echoing it.
 *
 * Not an env var and not a flag, both of which persist: PowerShell keeps a
 * ConsoleHost_history.txt, so `--pin 481920` would leave the new PIN on disk
 * in plain text on the till itself.
 *
 * Falls back to reading piped stdin when there is no TTY, which is what lets
 * this be exercised unattended against a scratch database.
 */
let pipedLines: string[] | null = null;

/**
 * Piped input, read once and handed out a line at a time.
 *
 * Reading the stream inside each prompt would drain it on the first call and
 * leave the confirmation prompt with nothing — so a piped run would always
 * fail at the second question. One PIN per line, so a piped run supplies the
 * value and its confirmation as two identical lines.
 */
async function nextPipedLine(): Promise<string> {
  if (pipedLines === null) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    pipedLines = Buffer.concat(chunks)
      .toString("utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
  }
  const line = pipedLines.shift();
  if (line === undefined) fail("Entrée standard épuisée : PIN et confirmation attendus, un par ligne.");
  return line;
}

async function promptPin(label: string): Promise<string> {
  const stdin = process.stdin;

  if (!stdin.isTTY) return nextPipedLine();

  // Named rather than written as escapes: a raw control byte in source is
  // fragile, and an escape sequence here has already been mangled once.
  const CTRL_C = String.fromCharCode(3);
  const DEL = String.fromCharCode(127);

  process.stdout.write(`  ${label} : `);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve) => {
    let value = "";
    const onData = (buf: Buffer) => {
      const char = buf.toString("utf8");
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === CTRL_C) {
        // Leave the terminal usable on the way out.
        stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(130);
      }
      if (char === DEL || char === "\b") {
        value = value.slice(0, -1);
        return;
      }
      // Ignore anything that is not a digit, so an arrow key cannot land
      // inside a PIN as an escape sequence.
      if (/^\d$/.test(char)) value += char;
    };
    stdin.on("data", onData);
  });
}

function validatePin(pin: string): void {
  if (!/^\d{6}$/.test(pin)) {
    fail("Le PIN doit contenir exactement 6 chiffres.");
  }
  if (isPublishedDefaultPin(pin)) {
    fail(
      "Ce PIN est l'une des valeurs par défaut publiées dans ce dépôt.\n" +
        "  Elle figure dans prisma/seed.ts, dans l'historique Git et dans la\n" +
        "  documentation de remédiation : toute personne disposant du code la\n" +
        "  connaît. Choisissez une autre valeur.",
    );
  }
}

async function main() {
  console.log(
    APPLY
      ? "\n  === RÉINITIALISATION DE PIN (écriture) ==="
      : "\n  === SIMULATION — aucune écriture (ajoutez --apply) ===",
  );

  const users = await db.user.findMany({
    select: { id: true, username: true, name: true, role: true, active: true },
    orderBy: { username: "asc" },
  });

  const username = argValue("--user");

  if (!username) {
    console.log("\n  Comptes existants :\n");
    for (const u of users) {
      console.log(
        `    ${u.username.padEnd(12)} ${u.role.padEnd(12)} ${u.active ? "actif" : "inactif"}  ${u.name}`,
      );
    }
    console.log(
      "\n  Aucun compte indiqué. Relancez avec --user <identifiant>.\n" +
        "  Rien n'a été modifié.\n",
    );
    return;
  }

  const target = users.find((u) => u.username === username);

  if (!target) {
    // Deliberately NOT created. See the header: this tool cannot mint an
    // account, and a missing user row is a different (worse) incident.
    fail(
      `Aucun compte « ${username} ».\n` +
        `  Comptes présents : ${users.map((u) => u.username).join(", ") || "aucun"}.\n\n` +
        "  Cet outil réinitialise le PIN d'un compte EXISTANT et ne peut pas en\n" +
        "  créer un. Si les comptes ont disparu, c'est une perte de données :\n" +
        "  restaurez une sauvegarde (bun scripts/decrypt-backup.ts --list).",
    );
  }

  console.log(
    `\n  Compte  : ${target.username} (${target.role}, ${target.active ? "actif" : "inactif"})` +
      `\n  Action  : remplacement du hachage du PIN — aucune autre colonne, aucune suppression.\n`,
  );

  if (!APPLY) {
    console.log("  Rien n'a été écrit. Relancez avec --apply pour appliquer.\n");
    return;
  }

  const pin = await promptPin("Nouveau PIN (6 chiffres, non affiché)");
  validatePin(pin);

  const confirmation = await promptPin("Confirmez le PIN");
  if (confirmation !== pin) fail("Les deux saisies diffèrent. Rien n'a été modifié.");

  const pinHash = await hashPin(pin);

  await db.$transaction([
    db.user.update({ where: { id: target.id }, data: { pinHash } }),
    // The application journals every credential change. A PIN changed from a
    // script must be just as visible, or the audit trail records a login
    // with a PIN nothing explains.
    db.auditLog.create({
      data: {
        userId: target.id,
        action: "USER_PIN_RESET_SCRIPT",
        entity: "User",
        entityId: target.id,
        details: JSON.stringify({
          username: target.username,
          via: "scripts/seed-users.ts",
        }),
      },
    }),
  ]);

  // Never print the PIN. The old script did, and the README had to tell the
  // operator to rotate it immediately afterwards.
  console.log(
    `\n  ✓ PIN de « ${target.username} » réinitialisé.` +
      `\n    Le PIN n'est affiché nulle part : notez-le maintenant.\n`,
  );
}

main()
  .catch((e) => {
    console.error("\n  ÉCHEC :", e instanceof Error ? e.message : e, "\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
