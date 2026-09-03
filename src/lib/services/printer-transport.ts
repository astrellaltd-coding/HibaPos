// Printer transport (C-03, Batch 1.3).
//
// DD-01 chose raw TCP to port 9100 over the LAN as the primary transport.
// Everything above this file deals in bytes (escpos.ts), so the transport is
// the only piece that knows how they leave the machine — which is also why
// it is the only piece a future Tauri shell might replace. A Windows RAW
// spooler transport for a USB-attached printer would implement the same
// interface and drop in here without touching the command layer.

import net from "node:net";

/** Anything that can deliver a finished ESC/POS job to a printer. */
export type PrinterTransport = {
  /** Deliver the bytes. Resolves once they are flushed, rejects otherwise. */
  send(payload: Buffer): Promise<void>;
  /** Human-readable target, for logs and operator-facing error messages. */
  describe(): string;
};

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

  constructor(code: PrinterErrorCode, target: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PrinterError";
    this.code = code;
    this.target = target;
  }

  /** Operator-facing French message — this is what reaches the toast. */
  get operatorMessage(): string {
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
