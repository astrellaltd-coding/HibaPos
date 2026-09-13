import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import path from "path";
import os from "os";
import {
  resolveSecret,
  lazySecret,
  chainKeyArmed,
  armChainKey,
  acknowledgeSecrets,
  unacknowledgedSecrets,
  secretStorePath,
  isSecretMisconfigured,
  SecretMisconfiguredError,
  CHAIN_KEY,
  GENERATED_SECRETS,
} from "@/lib/services/secret-store";
import {
  fiscalChainKey,
  isChainKeyMisconfigured,
  CHAIN_KEY_MIN_LENGTH,
  CHAIN_KEY_TOO_SHORT_MESSAGE,
} from "@/lib/fiscal-key";
import { backupsDir } from "@/lib/paths";

// R9.4 — an install with no `.env` resolves its secrets, and a bad one says so.
//
// L-106 · L-115 · L-116. The three that share `secret-store.ts` and the shape
// of their failure: **something is wrong with a secret and the till does not
// say so.** Each was measured live by the audit rather than reasoned about, and
// each produced a symptom that looked like something else.
//
// ── NO ASSERTION IN THIS FILE PRINTS A SECRET ────────────────────────────────
// Values are compared by length, by shape and against each other, following
// `secret-store.test.ts`'s rule. A test that echoed one would put it in CI
// output.

const REAL: Record<string, string | undefined> = {};
const TOUCHED = [...GENERATED_SECRETS, CHAIN_KEY, "HIBAPOS_DATA_DIR", "BACKUP_LOCATION"];
let sandbox: string;

function useSandbox() {
  sandbox = path.join(
    os.tmpdir(),
    `hibapos-r94-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(path.join(sandbox, "db"), { recursive: true });
  process.env.HIBAPOS_DATA_DIR = sandbox;
  process.env.BACKUP_LOCATION = path.join(sandbox, "db", "backups");
  // Guard the guard: if the paths did not move, every test below would be
  // reading the install's own store and the operator's real backups.
  expect(secretStorePath().startsWith(sandbox)).toBe(true);
  expect(backupsDir().startsWith(sandbox)).toBe(true);
}

beforeEach(() => {
  for (const name of TOUCHED) {
    REAL[name] = process.env[name];
    delete process.env[name];
  }
  useSandbox();
});

afterEach(() => {
  if (sandbox && existsSync(sandbox)) rmSync(sandbox, { recursive: true, force: true });
  for (const name of TOUCHED) {
    if (REAL[name] === undefined) delete process.env[name];
    else process.env[name] = REAL[name];
  }
});

/** An encrypted backup on disk, of the kind a real key was used to write. */
function existingBackup(name = "hibapos-backup-2026-09-01.dbenc") {
  const dir = backupsDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), "not really ciphertext");
}

describe("L-106 — a deleted secret store must not orphan the backups", () => {
  it("generates freely on a genuinely fresh install", async () => {
    // The direction that would make the guard intolerable if wrong: a first run
    // has no backups, nothing can be orphaned, and it must just work.
    const r = resolveSecret("BACKUP_ENCRYPTION_KEY");
    expect(r.source).toBe("generated");
    expect(r.value.length).toBeGreaterThanOrEqual(32);
  });

  it("REFUSES to mint a new backup key when encrypted backups already exist", async () => {
    // THE FINDING. A corrupt store is refused loudly, with the right reasoning
    // — « overwriting it would discard a backup key and make every existing
    // backup unreadable ». A DELETED one returned `{secrets:{}}` and this
    // function then made a brand-new key with no error and no warning.
    // Measured by the audit: `a97945f9…` before the delete, `39abcbd0…` after,
    // source `generated`. Deleting the file is at least as destructive as
    // corrupting it, and it is the outcome the corrupt path exists to prevent.
    existingBackup();
    expect(() => resolveSecret("BACKUP_ENCRYPTION_KEY")).toThrow(/backups already exist/);
  });

  it("names both files, because the operator has to reconcile them", async () => {
    existingBackup();
    let message = "";
    try {
      resolveSecret("BACKUP_ENCRYPTION_KEY");
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain(secretStorePath());
    expect(message).toContain(backupsDir());
    // …and says what the ways out are, rather than only that it refused.
    expect(message).toContain("Restore the secret store");
    expect(message).toContain("move them aside");
  });

  it("writes nothing when it refuses", async () => {
    // A guard that refused AFTER persisting would be worse than none: the store
    // would hold a key nothing can use and the next boot would sail past.
    existingBackup();
    expect(() => resolveSecret("BACKUP_ENCRYPTION_KEY")).toThrow();
    expect(existsSync(secretStorePath())).toBe(false);
  });

  it("still resolves from the store when the store is intact", async () => {
    // The guard is about an ABSENT value, not about the presence of backups. An
    // install with both a store and backups — which is every healthy install
    // that has ever run — must be untouched.
    const first = resolveSecret("BACKUP_ENCRYPTION_KEY");
    existingBackup();
    const second = resolveSecret("BACKUP_ENCRYPTION_KEY");
    expect(second.source).toBe("store");
    expect(second.value).toBe(first.value);
  });

  it("lets the environment win, as it always has", async () => {
    existingBackup();
    process.env.BACKUP_ENCRYPTION_KEY = "x".repeat(64);
    const r = resolveSecret("BACKUP_ENCRYPTION_KEY");
    expect(r.source).toBe("environment");
  });

  it("does not stand in the way of SESSION_SECRET", async () => {
    // Scoped to the one secret whose loss is irreversible. A session secret
    // regenerating logs everyone out; a backup key regenerating loses the data.
    existingBackup();
    expect(resolveSecret("SESSION_SECRET").source).toBe("generated");
  });

  it("treats an UNREADABLE backup directory as « something might be there »", async () => {
    // Answering « no » on an error would restore the silent regeneration the
    // guard exists to stop, so the uncertain case takes the safe side.
    //
    // A REGULAR FILE where the directory belongs, because that is a failure the
    // guard can actually meet: `existsSync` says yes and `readdirSync` throws
    // ENOTDIR. An invalid path does NOT reach the catch — `existsSync` simply
    // answers false, which is « no directory », which is « no backups », which
    // is correct. Measured: that version of this test passed with no throw at
    // all and proved nothing.
    const asFile = path.join(sandbox, "backups-not-a-dir");
    writeFileSync(asFile, "");
    process.env.BACKUP_LOCATION = asFile;
    expect(() => resolveSecret("BACKUP_ENCRYPTION_KEY")).toThrow(/backups already exist/);
  });

  it("treats a MISSING backup directory as no backups, which it is", async () => {
    // The other side of the same branch, and the common one: a fresh install
    // has no backup directory at all and must not be blocked by its absence.
    process.env.BACKUP_LOCATION = path.join(sandbox, "never-created");
    expect(resolveSecret("BACKUP_ENCRYPTION_KEY").source).toBe("generated");
  });
});

describe("L-115 — a malformed chain key refuses in words, not as an empty 500", () => {
  it("throws the TYPED error the wrapper can map", async () => {
    // THE FINDING. This threw a plain `Error` three lines above the typed error
    // built for exactly this case, and `isChainKeyMisconfigured()` is an
    // `instanceof` test — so `withAuth` could not map it and every fiscal write
    // answered **500 with a zero-byte body.** Measured by the audit: login 200,
    // then `POST /api/fiscal/drawer` → HTTP 500, empty.
    process.env[CHAIN_KEY] = "too-short";
    let caught: unknown;
    try {
      fiscalChainKey();
    } catch (e) {
      caught = e;
    }
    expect(caught, "a short key was accepted").toBeInstanceOf(Error);
    expect(
      isChainKeyMisconfigured(caught),
      "a plain Error — the wrapper cannot map this and the till answers an empty 500",
    ).toBe(true);
  });

  it("says it in French, and never prints the value", async () => {
    process.env[CHAIN_KEY] = "abcdef0123456789";
    let message = "";
    try {
      fiscalChainKey();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toBe(CHAIN_KEY_TOO_SHORT_MESSAGE);
    expect(message).toContain("32 caractères");
    expect(message, "the key itself reached the message, and therefore the log").not.toContain(
      "abcdef0123456789",
    );
  });

  it("still accepts a good key and still reads absence as unkeyed", async () => {
    // Both directions, because a guard that refused everything would stop the
    // till just as thoroughly.
    delete process.env[CHAIN_KEY];
    expect(fiscalChainKey()).toBeNull();
    process.env[CHAIN_KEY] = "  ";
    expect(fiscalChainKey(), "whitespace is not a key").toBeNull();
    process.env[CHAIN_KEY] = "a".repeat(CHAIN_KEY_MIN_LENGTH);
    expect(fiscalChainKey()).toHaveLength(CHAIN_KEY_MIN_LENGTH);
  });

  it("refuses at exactly one character short, and accepts at the threshold", async () => {
    process.env[CHAIN_KEY] = "a".repeat(CHAIN_KEY_MIN_LENGTH - 1);
    expect(() => fiscalChainKey()).toThrow();
    process.env[CHAIN_KEY] = "a".repeat(CHAIN_KEY_MIN_LENGTH);
    expect(() => fiscalChainKey()).not.toThrow();
  });
});

describe("L-115 — « armed » means a key the till will accept", () => {
  it("does not call a too-short key armed", async () => {
    // COMPOUNDING THE ABOVE, and the half that made it invisible:
    // `chainKeyArmed()` was `process.env[CHAIN_KEY]?.trim()`, truthy for any
    // non-empty value. So `GET /api/setup/secrets` reported `chainArmed: true`
    // **while the till refused every sale** — the one screen an operator would
    // check to find out whether arming had worked told them it had.
    process.env[CHAIN_KEY] = "too-short";
    expect(chainKeyArmed(), "a key the till rejects was reported as armed").toBe(false);
  });

  it("says armed for a real key, from the environment or the store", async () => {
    process.env[CHAIN_KEY] = "a".repeat(64);
    expect(chainKeyArmed()).toBe(true);

    delete process.env[CHAIN_KEY];
    expect(chainKeyArmed()).toBe(false);
    armChainKey();
    delete process.env[CHAIN_KEY]; // armChainKey parks it there too
    expect(chainKeyArmed(), "a key in the store is armed across a restart").toBe(true);
  });

  it("does not call a too-short STORED key armed either", async () => {
    // The store is written by `armChainKey`, which generates 64 hex — but a
    // hand-edited file is exactly the case this reports on.
    mkdirSync(path.dirname(secretStorePath()), { recursive: true });
    writeFileSync(
      secretStorePath(),
      JSON.stringify({ secrets: { [CHAIN_KEY]: "short" }, unacknowledged: [] }),
    );
    expect(chainKeyArmed()).toBe(false);
  });

  it("agrees with fiscalChainKey at every length", async () => {
    // The two disagreeing is the whole finding, so the property is stated as
    // agreement rather than as two separate thresholds.
    for (const len of [0, 1, 8, 31, 32, 33, 64]) {
      if (len === 0) delete process.env[CHAIN_KEY];
      else process.env[CHAIN_KEY] = "a".repeat(len);

      let accepted: boolean;
      try {
        accepted = fiscalChainKey() !== null;
      } catch {
        accepted = false;
      }
      expect({ len, armed: chainKeyArmed() }).toEqual({ len, armed: accepted });
    }
  });
});

describe("L-116 — a malformed SESSION_SECRET is answerable, not a bare 500", () => {
  it("resolves at import and refuses at USE", async () => {
    // THE FINDING: the server printed `✓ Ready`, the login screen rendered 200,
    // `GET /api/auth/profiles` answered 200 with a populated picker — and
    // `POST /api/auth/login` answered **500 Internal Server Error**. A till
    // that looks fine and cannot take a login.
    //
    // The cause was the SHAPE, not the check: validating at module load meant
    // the import failed and Next answered a bare 500 no handler could dress.
    process.env.SESSION_SECRET = "far-too-short";
    const get = lazySecret("SESSION_SECRET");
    expect(get, "building the accessor must not throw — that is the whole fix").toBeTypeOf(
      "function",
    );
    expect(() => get()).toThrow(SecretMisconfiguredError);
  });

  it("is typed, so the wrapper and the login route can answer it", async () => {
    process.env.SESSION_SECRET = "far-too-short";
    let caught: unknown;
    try {
      lazySecret("SESSION_SECRET")();
    } catch (e) {
      caught = e;
    }
    expect(isSecretMisconfigured(caught)).toBe(true);
    expect((caught as SecretMisconfiguredError).secretName).toBe("SESSION_SECRET");
  });

  it("says which variable, in French, without the value", async () => {
    process.env.SESSION_SECRET = "hunter2-hunter2";
    let message = "";
    try {
      lazySecret("SESSION_SECRET")();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).toContain("SESSION_SECRET");
    expect(message).toContain("32 caractères");
    expect(message).toContain(".env");
    expect(message, "the value reached the message, and therefore the log").not.toContain(
      "hunter2",
    );
  });

  it("returns the value when it is fine, every time", async () => {
    const good = "b".repeat(64);
    process.env.SESSION_SECRET = good;
    const get = lazySecret("SESSION_SECRET");
    expect(get()).toBe(good);
    expect(get(), "resolved once, not re-read per call").toBe(good);
  });

  it("still generates one for an install that has none", async () => {
    // PREP-3's whole purpose. A missing secret is not a misconfiguration.
    delete process.env.SESSION_SECRET;
    const get = lazySecret("SESSION_SECRET");
    expect(get().length).toBeGreaterThanOrEqual(32);
  });

  it("refuses at one character short of the threshold", async () => {
    process.env.SESSION_SECRET = "c".repeat(31);
    expect(() => lazySecret("SESSION_SECRET")()).toThrow(SecretMisconfiguredError);
    process.env.SESSION_SECRET = "c".repeat(32);
    expect(() => lazySecret("SESSION_SECRET")()).not.toThrow();
  });
});

describe("L-119 — the chain key stops being readable back once recorded", () => {
  it("returns the value while it is still unacknowledged", async () => {
    // The failure this flow exists to prevent is a key nobody wrote down, so
    // the screen must still be able to put it in front of someone.
    const first = armChainKey();
    expect(first.alreadyArmed).toBe(false);
    expect(unacknowledgedSecrets()).toContain(CHAIN_KEY);

    const again = armChainKey();
    expect(again.alreadyArmed).toBe(true);
    expect(again.value).toBe(first.value);
  });

  it("stops returning it after the operator says they recorded it", async () => {
    // THE FINDING: `armChainKey()` returns `{value, alreadyArmed: true}`
    // UNCONDITIONALLY, so `POST /api/setup/chain-key` handed the live key back
    // on every call — and audited only the first, so every later read was
    // untraced. `setup/secrets/route.ts` documents the bound in the same
    // feature: « After POST, this route answers with nothing to show and cannot
    // be used to read a key back. » It could, through the sibling.
    //
    // The route is what enforces this; `armChainKey` still answers, because the
    // application itself has to be able to read the key it signs with.
    armChainKey();
    acknowledgeSecrets([CHAIN_KEY]);
    expect(unacknowledgedSecrets()).not.toContain(CHAIN_KEY);
  });

  it("arms once and never mints a second key", async () => {
    // Re-arming would orphan every hash written under the first one.
    const first = armChainKey();
    acknowledgeSecrets([CHAIN_KEY]);
    const second = armChainKey();
    expect(second.value).toBe(first.value);
    expect(second.alreadyArmed).toBe(true);
  });
});
