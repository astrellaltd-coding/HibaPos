import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import { createWindowsRawTransport, defaultSpoolerScriptPath } from "@/lib/services/printer-transport";
import { appRoot } from "@/lib/paths";

// L-96 (R9.1) — a print helper that never runs is not a print.
//
// THE FINDING, and it is measured rather than argued: `powershell.exe -File
// <missing>` **exits 0**. Reproduced with this transport's own `spawn`, not
// with `Start-Process` (which reports a non-zero code and would have hidden
// it): exit code 0, 300 bytes on stderr, and nothing on the contract the code
// checks. So `result.code !== 0` passed, and `orders/[id]/print` wrote
// `printStatus: "PRINTED", printedAt: now` for a ticket that had never reached
// a printer. Nothing on the paper, and the till said nothing.
//
// Two halves, both here: the helper is resolved from a real app root rather
// than `process.cwd()` — the sixth such anchor, and the one `paths.ts` exists
// to remove — and exit 0 with output on stderr is a failure.

const PAYLOAD = Buffer.from("ESC/POS bytes");
let tmp: string | null = null;

function scratch(): string {
  tmp = path.join(os.tmpdir(), `hibapos-l96-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmp, { recursive: true });
  return tmp;
}

afterEach(() => {
  if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

/** A `run` that must never be reached. Calling it is the failure. */
const runMustNotHappen = () => {
  throw new Error("the transport spawned PowerShell for a helper that is not there");
};

describe("L-96 — the helper must exist before anything is called a print", () => {
  it("refuses when the script is missing, instead of reporting success", async () => {
    const dir = scratch();
    const t = createWindowsRawTransport(
      { printerName: "SUNSO WTP-800", scriptPath: path.join(dir, "not-here.ps1") },
      { run: runMustNotHappen },
    );
    await expect(t.send(PAYLOAD)).rejects.toThrow(/introuvable/);
  });

  it("names the path it looked at, because that is the fixable part", async () => {
    const dir = scratch();
    const missing = path.join(dir, "not-here.ps1");
    const t = createWindowsRawTransport(
      { printerName: "P", scriptPath: missing },
      { run: runMustNotHappen },
    );
    await expect(t.send(PAYLOAD)).rejects.toThrow(new RegExp(missing.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")));
  });

  it("says no ticket was printed, in the words the cashier reads", async () => {
    const dir = scratch();
    const t = createWindowsRawTransport(
      { printerName: "P", scriptPath: path.join(dir, "nope.ps1") },
      { run: runMustNotHappen },
    );
    await expect(t.send(PAYLOAD)).rejects.toThrow(/Aucun ticket n'a été imprimé/);
  });

  it("does not stage the job file, or spawn anything, for a helper that is not there", async () => {
    // Ordering, not just the end state. The guard is checked BEFORE the payload
    // is written, so a missing helper costs no disk write and no process.
    //
    // Asserting only « the directory ends empty » would prove nothing: the
    // `finally` deletes the job file on every path, so that assertion passes
    // with the guard removed. Measured — it survived the revert. What the guard
    // actually changes is whether anything happened at all, so that is what is
    // asserted: nothing was spawned, and the receipt never touched the disk.
    const dir = scratch();
    let spawned = false;
    let stagedWhenSpawned: string[] = [];
    const t = createWindowsRawTransport(
      { printerName: "P", scriptPath: path.join(dir, "nope.ps1"), tmpDir: dir },
      {
        run: async () => {
          spawned = true;
          stagedWhenSpawned = readdirSync(dir);
          return { code: 0, stdout: "", stderr: "" };
        },
      },
    );
    await expect(t.send(PAYLOAD)).rejects.toThrow(/introuvable/);
    expect(spawned, "PowerShell was spawned for a helper that is not there").toBe(false);
    expect(stagedWhenSpawned, "the receipt was written to disk before the check").toEqual([]);
  });
});

describe("L-96 — exit 0 is not on its own a print", () => {
  /** A helper that exists, so only the run's outcome is under test. */
  function realScript(dir: string): string {
    const p = path.join(dir, "print-raw.ps1");
    writeFileSync(p, "# a helper that exists\n");
    return p;
  }

  it("refuses exit 0 with anything on stderr", async () => {
    // PowerShell exits 0 for a whole class of start-up failures — a script it
    // cannot parse, an argument it rejects, a policy that stops it — writing
    // the reason to stderr and nothing to the exit code. That is the exact
    // shape the audit measured.
    const dir = scratch();
    const t = createWindowsRawTransport(
      { printerName: "P", scriptPath: realScript(dir), tmpDir: dir },
      { run: async () => ({ code: 0, stdout: "", stderr: "The argument '…' is not recognized." }) },
    );
    await expect(t.send(PAYLOAD)).rejects.toThrow(/signalé une erreur/);
  });

  it("accepts exit 0 with a clean stderr", async () => {
    // The other direction, and the one that would make this useless if wrong:
    // a real print must still succeed.
    const dir = scratch();
    const t = createWindowsRawTransport(
      { printerName: "P", scriptPath: realScript(dir), tmpDir: dir },
      { run: async () => ({ code: 0, stdout: "OK", stderr: "" }) },
    );
    await expect(t.send(PAYLOAD)).resolves.toBeUndefined();
  });

  it("ignores whitespace-only stderr", async () => {
    // A trailing newline from a helper that printed perfectly well must not
    // turn a good job into a refusal.
    const dir = scratch();
    const t = createWindowsRawTransport(
      { printerName: "P", scriptPath: realScript(dir), tmpDir: dir },
      { run: async () => ({ code: 0, stdout: "", stderr: "\r\n  \n" }) },
    );
    await expect(t.send(PAYLOAD)).resolves.toBeUndefined();
  });

  it("still refuses a non-zero exit, which was already right", async () => {
    const dir = scratch();
    const t = createWindowsRawTransport(
      { printerName: "P", scriptPath: realScript(dir), tmpDir: dir },
      { run: async () => ({ code: 2, stdout: "", stderr: "" }) },
    );
    await expect(t.send(PAYLOAD)).rejects.toThrow(/exited 2/);
  });

  it("cleans up the job file even when it refuses", async () => {
    const dir = scratch();
    const t = createWindowsRawTransport(
      { printerName: "P", scriptPath: realScript(dir), tmpDir: dir },
      { run: async () => ({ code: 0, stdout: "", stderr: "boom" }) },
    );
    await expect(t.send(PAYLOAD)).rejects.toThrow();
    // Only the helper we wrote — a receipt is a fiscal document and does not
    // linger in the OS temp directory because a print failed.
    expect(readdirSync(dir)).toEqual(["print-raw.ps1"]);
  });
});

describe("L-96 — the helper is resolved from the app root, not the cwd", () => {
  it("anchors on appRoot()", () => {
    // `process.cwd()` was the sixth such anchor and the one `paths.ts` exists
    // to remove. Under Tauri the working directory is not the install
    // directory, so a packaged build would look somewhere the helper is not.
    expect(defaultSpoolerScriptPath()).toBe(path.join(appRoot(), ".zscripts", "print-raw.ps1"));
  });

  it("follows HIBAPOS_APP_DIR when a package sets it", () => {
    const real = process.env.HIBAPOS_APP_DIR;
    process.env.HIBAPOS_APP_DIR = path.join(os.tmpdir(), "packaged-hibapos");
    try {
      expect(defaultSpoolerScriptPath()).toBe(
        path.join(path.resolve(path.join(os.tmpdir(), "packaged-hibapos")), ".zscripts", "print-raw.ps1"),
      );
    } finally {
      if (real === undefined) delete process.env.HIBAPOS_APP_DIR;
      else process.env.HIBAPOS_APP_DIR = real;
    }
  });

  it("finds the real helper on this checkout", () => {
    // The guard against an anchor that resolves cleanly to nowhere:
    // `.zscripts/print-raw.ps1` is tracked and live (R6.4 needs it).
    expect(existsSync(defaultSpoolerScriptPath())).toBe(true);
  });
});
