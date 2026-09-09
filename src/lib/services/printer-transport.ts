// Printer transport (C-03, Batch 1.3).
//
// DD-01 chose raw TCP to port 9100 over the LAN as the primary transport.
// Everything above this file deals in bytes (escpos.ts), so the transport is
// the only piece that knows how they leave the machine — which is also why
// it is the only piece a future Tauri shell might replace. A Windows RAW
// spooler transport for a USB-attached printer would implement the same
// interface and drop in here without touching the command layer.

import net from "node:net";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Anything that can deliver a finished ESC/POS job to a printer. */
export type PrinterTransport = {
  /** Deliver the bytes. Resolves once they are flushed, rejects otherwise. */
  send(payload: Buffer): Promise<void>;
  /** Human-readable target, for logs and operator-facing error messages. */
  describe(): string;
};

/**
 * How the printer is attached (Batch 1.3d, L-70).
 *
 * This is an explicit operator setting rather than something inferred from
 * which field happens to be filled in: the two modes fail differently, and a
 * cashier told to "check the network cable" for a USB printer is being sent to
 * look at a cable that does not exist.
 */
export type PrinterConnection = "network" | "usb";

export type PrinterErrorCode =
  | "UNREACHABLE"
  | "TIMEOUT"
  | "WRITE_FAILED"
  | "NOT_CONFIGURED";

/**
 * A printing failure that the caller is expected to survive.
 *
 * Printing happens *after* the sale is committed, so a dead printer must
 * never propagate as a failed checkout — it surfaces as one of these, which
 * the route turns into a warning the cashier can act on (and retry from the
 * order's reprint button).
 */
export class PrinterError extends Error {
  code: PrinterErrorCode;
  target: string;
  /**
   * Which attachment produced this failure, so the advice can name the right
   * thing to go and look at (Batch 1.3d). Defaults to `network`, which is what
   * every pre-1.3d caller meant and keeps those messages byte-identical.
   */
  connection: PrinterConnection;

  constructor(
    code: PrinterErrorCode,
    target: string,
    message: string,
    options?: { cause?: unknown; connection?: PrinterConnection },
  ) {
    super(message, options);
    this.name = "PrinterError";
    this.code = code;
    this.target = target;
    this.connection = options?.connection ?? "network";
  }

  /** Operator-facing French message — this is what reaches the toast. */
  get operatorMessage(): string {
    if (this.connection === "usb") {
      switch (this.code) {
        case "NOT_CONFIGURED":
          return "Aucune imprimante sélectionnée. Choisissez l'imprimante Windows dans les réglages.";
        case "UNREACHABLE":
          return `Imprimante « ${this.target} » introuvable dans Windows. Vérifiez qu'elle est branchée et allumée, puis re-sélectionnez-la dans les réglages.`;
        case "TIMEOUT":
          return `L'imprimante (${this.target}) ne répond pas. Vérifiez le câble USB et le papier.`;
        case "WRITE_FAILED":
          return `Échec de l'envoi vers l'imprimante (${this.target}). Le ticket n'a pas été imprimé.`;
      }
    }
    switch (this.code) {
      case "NOT_CONFIGURED":
        return "Aucune imprimante configurée. Renseignez l'adresse IP dans les réglages.";
      case "UNREACHABLE":
        return `Imprimante injoignable (${this.target}). Vérifiez qu'elle est allumée et connectée au réseau.`;
      case "TIMEOUT":
        return `L'imprimante (${this.target}) ne répond pas. Vérifiez le câble réseau et le papier.`;
      case "WRITE_FAILED":
        return `Échec de l'envoi vers l'imprimante (${this.target}). Le ticket n'a pas été imprimé.`;
    }
  }
}

export type TcpTransportOptions = {
  host: string;
  port?: number;
  /** Applies to both establishing the connection and flushing the job. */
  timeoutMs?: number;
};

/** Injectable so the transport can be tested without a real socket. */
type ConnectFn = (options: { host: string; port: number }) => net.Socket;

export const DEFAULT_PRINTER_PORT = 9100;
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Raw TCP transport — the near-universal "JetDirect" path that every
 * network thermal printer speaks on port 9100. No handshake and no
 * acknowledgement: the printer consumes whatever arrives, so a successful
 * send means "the bytes were flushed to the printer", not "a ticket came
 * out". Paper-out and cover-open cannot be detected this way; that is the
 * accepted trade-off for a transport with zero dependencies.
 */
export function createTcpTransport(
  options: TcpTransportOptions,
  deps: { connect?: ConnectFn } = {},
): PrinterTransport {
  const host = options.host?.trim();
  const port = options.port ?? DEFAULT_PRINTER_PORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const connect = deps.connect ?? ((o) => net.createConnection(o));
  const target = `${host}:${port}`;

  return {
    describe: () => target,

    send(payload: Buffer): Promise<void> {
      if (!host) {
        return Promise.reject(
          new PrinterError("NOT_CONFIGURED", target, "No printer host configured."),
        );
      }

      return new Promise<void>((resolve, reject) => {
        const socket = connect({ host, port });
        let settled = false;

        const fail = (code: PrinterErrorCode, message: string, cause?: unknown) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          reject(new PrinterError(code, target, message, { cause }));
        };

        socket.setTimeout(timeoutMs);

        socket.on("timeout", () => {
          fail("TIMEOUT", `Printer ${target} did not accept the job within ${timeoutMs} ms.`);
        });

        socket.on("error", (err: NodeJS.ErrnoException) => {
          // ECONNREFUSED / EHOSTUNREACH / ENETUNREACH all mean the same thing
          // to a cashier: the printer is not answering.
          const code = err?.code === "ETIMEDOUT" ? "TIMEOUT" : "UNREACHABLE";
          fail(code, `Cannot reach printer at ${target}: ${err?.code ?? err?.message}`, err);
        });

        socket.on("connect", () => {
          socket.write(payload, (err) => {
            if (err) {
              fail("WRITE_FAILED", `Write to ${target} failed: ${err.message}`, err);
              return;
            }
            // end() flushes, then "close" resolves — waiting for the flush is
            // what makes a resolved promise mean the bytes actually left.
            socket.end();
          });
        });

        socket.on("close", () => {
          if (settled) return;
          settled = true;
          resolve();
        });
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Windows RAW spooler transport (Batch 1.3d, L-70)
//
// The slot this file's header described from the beginning. The restaurant's
// Sunso WTP-801 is on a USB type-B cable; its INF declares the hardware as
// `USBPRINT\SUNSOWTP-800036C`, a USB printer-class device, so Windows drives
// it through a print QUEUE and the way to hand it ESC/POS untouched is a job
// of datatype RAW. Node has no binding for that; `winspool.drv` does, and
// `.zscripts/print-raw.ps1` is the three-call wrapper around it.
//
// Everything above this line is unchanged: the same `PrinterTransport`, the
// same `PrinterError`, the same byte layer. `escpos.ts` does not know which
// of the two is carrying its bytes, which is the property that made this a
// small change rather than a redesign.
// ─────────────────────────────────────────────────────────────────────────────

/** Result of running the helper. Injected in tests so no printer is needed. */
export type SpoolerRunResult = { code: number; stdout: string; stderr: string };

/** Injectable so the transport can be tested without a spooler or a printer. */
export type SpoolerRunFn = (invocation: {
  exe: string;
  args: string[];
  timeoutMs: number;
}) => Promise<SpoolerRunResult>;

export type SpoolerTransportOptions = {
  /** The Windows print-queue name, exactly as the spooler reports it. */
  printerName: string;
  /** Covers the whole helper run, not one syscall inside it. */
  timeoutMs?: number;
  /** Where the job file is staged. Defaults to the OS temp directory. */
  tmpDir?: string;
  /** Absolute path to `print-raw.ps1`. Defaults to the one in this repo. */
  scriptPath?: string;
};

const DEFAULT_SPOOLER_TIMEOUT_MS = 15_000;

/** `print-raw.ps1`'s exit codes, mapped to what the cashier is told. */
function codeForExit(exit: number): PrinterErrorCode {
  // 2 is the only one that means "this queue is not there" — the operator
  // picked a printer that Windows no longer reports, or it was unplugged.
  if (exit === 2) return "UNREACHABLE";
  return "WRITE_FAILED";
}

export function defaultSpoolerScriptPath(): string {
  return path.join(process.cwd(), ".zscripts", "print-raw.ps1");
}

/** Run PowerShell, capture its output, and never leave the promise pending. */
const realRun: SpoolerRunFn = ({ exe, args, timeoutMs }) =>
  new Promise<SpoolerRunResult>((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("TIMEOUT"));
    }, timeoutMs);

    child.stdout?.on("data", (d) => (stdout += String(d)));
    child.stderr?.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });

/**
 * Deliver an ESC/POS job to a Windows print queue as RAW.
 *
 * A resolved `send()` means the spooler accepted every byte — the same
 * guarantee, and the same limit, as the TCP transport: paper-out and
 * cover-open are still not detectable, because a RAW job is one-way.
 *
 * THE JOB IS STAGED IN A FILE and the path is passed to PowerShell, rather
 * than piping the bytes through stdin: a receipt is binary (CP1252 high bytes
 * and control codes below 0x20), and PowerShell's stdin applies an encoding
 * that mangles both. The file is written with an unguessable name, and is
 * deleted in a `finally` whether the print succeeded or not.
 */
export function createWindowsRawTransport(
  options: SpoolerTransportOptions,
  deps: { run?: SpoolerRunFn } = {},
): PrinterTransport {
  const printerName = options.printerName?.trim() ?? "";
  const timeoutMs = options.timeoutMs ?? DEFAULT_SPOOLER_TIMEOUT_MS;
  const run = deps.run ?? realRun;
  const scriptPath = options.scriptPath ?? defaultSpoolerScriptPath();
  const target = printerName || "(aucune)";

  const fail = (code: PrinterErrorCode, message: string, cause?: unknown) =>
    new PrinterError(code, target, message, { cause, connection: "usb" });

  return {
    describe: () => target,

    async send(payload: Buffer): Promise<void> {
      if (!printerName) {
        throw fail("NOT_CONFIGURED", "No Windows printer selected.");
      }

      const jobFile = path.join(
        options.tmpDir ?? os.tmpdir(),
        `hibapos-job-${randomBytes(8).toString("hex")}.bin`,
      );

      try {
        await fs.writeFile(jobFile, payload);
      } catch (err) {
        throw fail("WRITE_FAILED", `Could not stage the print job at ${jobFile}.`, err);
      }

      try {
        let result: SpoolerRunResult;
        try {
          result = await run({
            exe: "powershell.exe",
            args: [
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              scriptPath,
              "-PrinterName",
              printerName,
              "-InputFile",
              jobFile,
            ],
            timeoutMs,
          });
        } catch (err) {
          if (err instanceof Error && err.message === "TIMEOUT") {
            throw fail("TIMEOUT", `The spooler did not accept the job within ${timeoutMs} ms.`, err);
          }
          throw fail("WRITE_FAILED", `Could not run the print helper: ${String(err)}`, err);
        }

        if (result.code !== 0) {
          throw fail(
            codeForExit(result.code),
            `print-raw.ps1 exited ${result.code}: ${result.stdout.trim() || result.stderr.trim()}`,
          );
        }
      } finally {
        // A receipt is a fiscal document; it does not linger in the OS temp
        // directory because a print failed.
        await fs.rm(jobFile, { force: true }).catch(() => {});
      }
    },
  };
}

/**
 * The print queues Windows can see, for the settings picker.
 *
 * Nobody knows what the printer will be called until its driver is installed
 * on the till, so the operator chooses from this list instead of typing a name
 * that would fail silently if it were a character out.
 */
export async function listWindowsPrinters(
  deps: { run?: SpoolerRunFn; scriptPath?: string } = {},
): Promise<string[]> {
  const run = deps.run ?? realRun;
  const result = await run({
    exe: "powershell.exe",
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      deps.scriptPath ?? defaultSpoolerScriptPath(),
      "-List",
    ],
    timeoutMs: DEFAULT_SPOOLER_TIMEOUT_MS,
  });
  if (result.code !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
