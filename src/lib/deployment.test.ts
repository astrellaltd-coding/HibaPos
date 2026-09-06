import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import manifest from "@/app/manifest";

// C-07 / L-59 (Batch 1.4) — the deployment contract, asserted.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. The launcher, the installer and the
// update procedure are PowerShell: `bun test` cannot run them, `tsc` does not
// see them and `eslint` does not lint them, so every property they carry would
// otherwise live only in a comment. Batch 1.4's own validation criteria are
// nearly all acts on the target machine — a cold reboot, a killed process, a
// simulated update — and none of those can happen from here.
//
// So this file does the one thing that CAN be done from here: it reads the
// scripts as text and pins the decisions that are dangerous to reverse. It
// cannot tell you the till boots. It can tell you that nobody deleted the
// refusal that stops a fresh database being seeded over a misconfigured path,
// which is the failure mode that costs the most and shows the least.
//
// The idiom is `plan-freshness.test.ts`'s: a standing assertion beats a
// paragraph nobody re-reads.

const ZSCRIPTS = path.join(process.cwd(), ".zscripts");
const read = (name: string) => readFileSync(path.join(ZSCRIPTS, name), "utf8");

const ALL_SCRIPTS = [
  "build.ps1",
  "dev.ps1",
  "start.ps1",
  "hibapos-server.ps1",
  "hibapos-kiosk.ps1",
  "install-windows.ps1",
  "update.ps1",
];

describe("the scripts exist and are readable, so nothing below passes vacuously", () => {
  it("finds all four new ones", () => {
    for (const f of ["hibapos-server.ps1", "hibapos-kiosk.ps1", "install-windows.ps1", "update.ps1"]) {
      expect(read(f).length, `${f} is empty or missing`).toBeGreaterThan(500);
    }
  });
});

describe("every .ps1 survives Windows PowerShell 5.1's decoder", () => {
  // FOUND BY RUNNING THE PARSER, not by reading. Three of the four new scripts
  // failed `[Parser]::ParseFile` on first write with "the string is missing the
  // terminator" — because **Windows PowerShell 5.1 reads a BOM-less .ps1 as
  // ANSI (Windows-1252), not UTF-8**. An em dash (U+2014) inside a
  // double-quoted string arrives as three cp1252 characters, one of which is
  // `"` (0x94, RIGHT DOUBLE QUOTATION MARK) — and PowerShell honours smart
  // quotes as string delimiters. So a typographic dash in a comment is
  // harmless and the same dash inside a message silently ends the string.
  //
  // Two belts, because the cost of getting this wrong is a till that will not
  // start and an error that points at the wrong line.
  for (const f of ALL_SCRIPTS) {
    it(`${f}: pure ASCII, and carries a UTF-8 BOM`, () => {
      const bytes = readFileSync(path.join(ZSCRIPTS, f));
      expect(
        bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
        `${f} has no UTF-8 BOM; PowerShell 5.1 will decode it as ANSI`,
      ).toBe(true);
      const text = bytes.subarray(3).toString("utf8");
      const offenders = [...new Set([...text].filter((c) => c.charCodeAt(0) > 126))];
      expect(
        offenders,
        `${f} contains non-ASCII: ${offenders.map((c) => `${c} (U+${c.charCodeAt(0).toString(16)})`).join(", ")}. ` +
          `Use ASCII — the French messages in these scripts are deliberately written without accents.`,
      ).toEqual([]);
    });
  }
});

describe("no launcher may bootstrap a database (L-59)", () => {
  // The finding: `start.ps1` answered a missing database by running
  // `prisma migrate deploy` AND `prisma db seed`, and `prisma/seed.ts` falls
  // back to the PINs this repository publishes. A path typo therefore produced
  // a live till with an empty journal and known credentials.
  it("prisma/seed.ts really does fall back to the published PINs", () => {
    // Asserted, not assumed — this is the premise the refusals rest on, and if
    // it ever stops being true the refusals can be reconsidered on evidence.
    const seed = readFileSync(path.join(process.cwd(), "prisma", "seed.ts"), "utf8");
    expect(seed).toContain('process.env.SEED_ADMIN_PIN ?? "123456"');
    expect(seed).toContain('process.env.SEED_MANAGER_PIN ?? "111111"');
  });

  it("neither production launcher seeds", () => {
    for (const f of ["start.ps1", "hibapos-server.ps1"]) {
      const src = read(f);
      // Allow the words inside a comment explaining why they are gone; forbid
      // them as commands. A PowerShell command line here starts with `bun` or
      // `bunx`, never with `#`.
      const commands = src
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => !l.startsWith("#"));
      expect(commands.some((l) => /db:seed|prisma db seed/.test(l)), `${f} seeds`).toBe(false);
      expect(commands.some((l) => /db:deploy|migrate deploy/.test(l)), `${f} migrates`).toBe(false);
    }
  });

  it("both refuse, in French, and name what to run instead", () => {
    for (const f of ["start.ps1", "hibapos-server.ps1"]) {
      const src = read(f);
      expect(src).toContain("Base de donnees introuvable");
      expect(src).toContain("install-windows.ps1");
      // A refusal that returns 0 is not a refusal: Task Scheduler would show a
      // green tick over a dead till.
      expect(src).toMatch(/exit 1/);
    }
  });
});

describe("the server launcher refuses a schema it does not match", () => {
  it("checks migration status and stops rather than applying it", () => {
    const src = read("hibapos-server.ps1");
    expect(src).toContain("prisma migrate status");
    // Checking is the point; applying at boot is the thing being avoided —
    // this project treats `migrate deploy` on production as a deliberate act,
    // rehearsed on a copy first.
    const commands = src.split("\n").map((l) => l.trim()).filter((l) => !l.startsWith("#"));
    expect(commands.some((l) => /migrate deploy/.test(l))).toBe(false);
    expect(src).toContain("update.ps1");
  });

  it("requires SESSION_SECRET and DATABASE_URL before starting anything", () => {
    const src = read("hibapos-server.ps1");
    expect(src).toContain("SESSION_SECRET");
    expect(src).toContain("DATABASE_URL");
  });

  it("puts its log with the DATA, not with the install", () => {
    // An update replaces the install directory. A log that lived there would
    // take the evidence of the last crash with it — which is the one thing
    // wanted after a crash.
    const src = read("hibapos-server.ps1");
    expect(src).toContain("HIBAPOS_DATA_DIR");
    expect(src).toMatch(/Join-Path \$DataDir "logs"/);
  });
});

describe("the update procedure never touches the data (C-05, C-07)", () => {
  const src = read("update.ps1");
  /** Command lines only. A PowerShell comment starts with `#`, and the header
   *  of this script deliberately QUOTES the dangerous commands to explain why
   *  they are absent — an assertion over the raw text would forbid the file
   *  from documenting its own reasoning. (Found by this test failing on its
   *  own script's header, which is the check working.) */
  const commands = src.split("\n").map((l) => l.trim()).filter((l) => !l.startsWith("#"));

  it("runs no git clean, at any strength", () => {
    // C-07's evidence: the old update story was `git pull` over a tree holding
    // 134 committed product photos, with `git clean -fd` as the way out. That
    // deletes every image a restore cannot put back (C-05).
    expect(commands.some((l) => /git\s+clean/.test(l))).toBe(false);
    // …and the reasoning is written down rather than merely obeyed.
    expect(src).toMatch(/git clean/);
  });

  it("removes nothing at all", () => {
    expect(commands.some((l) => /Remove-Item|rmdir|del\s|Clear-Content/.test(l))).toBe(false);
  });

  it("runs migrations BEFORE the build, so a failure leaves the old code in place", () => {
    expect(src.indexOf("migrate deploy")).toBeLessThan(src.indexOf("bun run build"));
  });

  it("demands a verified, off-machine backup first", () => {
    // STRENGTHENED after a revert nobody caught. This read
    // `expect(src).toContain("decrypt-backup.ts")` over the RAW text — and the
    // script's own header comment mentions `scripts/decrypt-backup.ts` while
    // explaining why the backup is not automated. So the operator-facing
    // instruction could be deleted outright and this still passed. Asserted on
    // the command lines now, and shown to fail only in the new form.
    const instructions = commands.filter((l) => l.startsWith("Write-Host"));
    expect(instructions.some((l) => l.includes("decrypt-backup.ts"))).toBe(true);
    expect(instructions.some((l) => /Copy it OFF this machine/.test(l))).toBe(true);
    // And it is a stop, not a suggestion: -Apply asks for confirmation.
    expect(commands.some((l) => /Read-Host/.test(l) && /Sauvegarde/.test(l))).toBe(true);
    expect(src.indexOf("Backup (MANUAL")).toBeLessThan(src.indexOf("migrate deploy"));
  });

  it("tells the operator to check the perpetual total across the update", () => {
    // The attestation claims the grand total never returns to zero « y compris
    // lors des mises à jour du logiciel ». This is where that gets checked.
    expect(src).toContain("/api/fiscal/verify");
    expect(src).toContain("grandTotal");
  });

  it("is a dry run unless -Apply is given", () => {
    expect(src).toContain("[switch]$Apply");
    expect(src).toContain("DRY RUN");
  });
});

describe("the installer moves a fiscal database the careful way", () => {
  const src = read("install-windows.ps1");

  it("is a dry run unless -Apply is given", () => {
    expect(src).toContain("[switch]$Apply");
    expect(src).toContain("DRY RUN");
  });

  it("copies and verifies rather than moving", () => {
    // A failed Move-Item on a database is unrecoverable; a failed copy costs
    // disk. The source is renamed aside, never deleted, so the whole operation
    // is reversible by hand.
    expect(src).toContain("Copy-Item");
    expect(src).toContain("Get-FileHash");
    expect(src).toContain("Rename-Item");
    const commands = src.split("\n").map((l) => l.trim()).filter((l) => !l.startsWith("#"));
    expect(commands.some((l) => /Move-Item/.test(l))).toBe(false);
    expect(commands.some((l) => /Remove-Item/.test(l))).toBe(false);
  });

  it("refuses to move onto a non-empty target", () => {
    expect(src).toContain("TARGET NOT EMPTY");
  });

  it("targets DD-02's directory and registers both tasks", () => {
    expect(src).toContain("C:\\HibaPOS\\data");
    expect(src).toContain("HibaPOS Server");
    expect(src).toContain("HibaPOS Kiosk");
    // The server at startup, the kiosk at logon — a browser cannot start
    // before a desktop session exists, and the till must survive a power cut
    // even when nobody can sign in.
    expect(src).toContain("-AtStartup");
    expect(src).toContain("-AtLogOn");
    // Task Scheduler IS the supervisor; that is why no nssm/WinSW is shipped.
    expect(src).toContain("-RestartCount 3");
  });

  it("warns about the plain-text auto-login registry key instead of using it", () => {
    expect(src).toContain("netplwiz");
    expect(src).toContain("AutoAdminLogon");
    expect(src).toMatch(/Do NOT use the AutoAdminLogon/);
  });

  it("points at batch 8.0 before the first real sale", () => {
    // The one ordering that can never be undone.
    expect(src).toMatch(/BEFORE the first real sale/);
    expect(src).toContain("FISCAL_CHAIN_KEY");
  });
});

describe("the kiosk launcher waits for the server before opening a window", () => {
  const src = read("hibapos-kiosk.ps1");

  it("probes the liveness endpoint first", () => {
    // Otherwise the first thing on the till is a connection-refused page —
    // which is exactly the impression this batch exists to remove.
    expect(src).toContain("/api");
    expect(src).toContain("Invoke-WebRequest");
  });

  it("opens a chromeless window at localhost", () => {
    expect(src).toContain("--app=");
    expect(src).toContain("http://localhost:3000");
    // NOT the LAN address: it is not a secure context, so it is not
    // installable and the session cookie does not stick (DD-06).
    expect(src).not.toMatch(/192\.168\./);
  });

  it("falls back to the default browser rather than failing silently", () => {
    expect(src).toContain("Start-Process $Url");
  });
});

describe("the web manifest makes it installable on localhost", () => {
  const m = manifest();

  it("declares the fields an install needs", () => {
    expect(m.name).toContain("HibaPOS");
    expect(m.short_name).toBe("HibaPOS");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.lang).toBe("fr");
  });

  it("ships a 192 and a 512 icon, plus a maskable one", () => {
    const icons = m.icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    // Real files, not a data URI: the previous favicon was an inline SVG
    // drawing the mark with <text>, which renders in whatever font exists.
    for (const i of icons) {
      expect(i.src.startsWith("/icons/")).toBe(true);
      expect(readFileSync(path.join(process.cwd(), "public", i.src)).length).toBeGreaterThan(300);
    }
  });

  it("matches the theme colour the app already ships", () => {
    expect(m.theme_color).toBe("#f59e0b");
  });
});
