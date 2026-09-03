import { describe, it, expect } from "vitest";
import net from "node:net";
import { EventEmitter } from "node:events";
import {
  DEFAULT_PRINTER_PORT,
  PrinterError,
  createTcpTransport,
} from "@/lib/services/printer-transport";

// C-03 (Batch 1.3) — the TCP transport. Exercised against a real loopback
// socket where that is deterministic, and against a fake socket for the
// failure paths that cannot be provoked reliably on a live network.

/** Minimal stand-in for net.Socket, so failure paths are deterministic. */
class FakeSocket extends EventEmitter {
  destroyed = false;
  timeoutMs = 0;
  written: Buffer[] = [];
  ended = false;
  writeError: Error | null = null;

  setTimeout(ms: number) {
    this.timeoutMs = ms;
    return this;
  }
  write(chunk: Buffer, cb?: (err?: Error | null) => void) {
    this.written.push(chunk);
    cb?.(this.writeError);
    return true;
  }
  end() {
    this.ended = true;
    queueMicrotask(() => this.emit("close"));
    return this;
  }
  destroy() {
    this.destroyed = true;
    return this;
  }
}

/** Start a throwaway server that records what a "printer" received. */
async function withMockPrinter(
  run: (port: number, received: () => Buffer) => Promise<void>,
): Promise<void> {
  const chunks: Buffer[] = [];
  const server = net.createServer((socket) => {
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  try {
    await run(port, () => Buffer.concat(chunks));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("createTcpTransport — delivery", () => {
  it("defaults to the JetDirect port", () => {
    expect(DEFAULT_PRINTER_PORT).toBe(9100);
    expect(createTcpTransport({ host: "192.168.1.50" }).describe()).toBe("192.168.1.50:9100");
  });

  it("delivers the job byte for byte", async () => {
    await withMockPrinter(async (port, received) => {
      const payload = Buffer.from([0x1b, 0x40, 0x48, 0x69, 0x0d, 0x0a]);
      await createTcpTransport({ host: "127.0.0.1", port }).send(payload);
      // Give the server loop a tick to drain the socket.
      await new Promise((r) => setTimeout(r, 50));
      expect(received().equals(payload)).toBe(true);
    });
  });

  it("resolves only once the bytes have been flushed", async () => {
    await withMockPrinter(async (port, received) => {
      const payload = Buffer.alloc(64 * 1024, 0x41); // larger than one segment
      await createTcpTransport({ host: "127.0.0.1", port }).send(payload);
      await new Promise((r) => setTimeout(r, 100));
      expect(received().length).toBe(payload.length);
    });
  });
});

describe("createTcpTransport — failure paths", () => {
  it("rejects with NOT_CONFIGURED when no host is set", async () => {
    const transport = createTcpTransport({ host: "" });
    await expect(transport.send(Buffer.from([0x00]))).rejects.toMatchObject({
      name: "PrinterError",
      code: "NOT_CONFIGURED",
    });
  });

  it("reports an unreachable printer rather than hanging", async () => {
    // Bind a port, then close it, so the connection is refused deterministically.
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const transport = createTcpTransport({ host: "127.0.0.1", port, timeoutMs: 1000 });
    await expect(transport.send(Buffer.from([0x1b, 0x40]))).rejects.toMatchObject({
      name: "PrinterError",
      code: "UNREACHABLE",
    });
  });

  it("rejects on socket timeout", async () => {
    const fake = new FakeSocket();
    const transport = createTcpTransport(
      { host: "10.0.0.9", timeoutMs: 25 },
      { connect: () => fake as unknown as net.Socket },
    );
    const sent = transport.send(Buffer.from([0x1b, 0x40]));
    fake.emit("timeout");
    await expect(sent).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(fake.destroyed).toBe(true);
  });

  it("rejects when the write itself fails", async () => {
    const fake = new FakeSocket();
    fake.writeError = new Error("EPIPE");
    const transport = createTcpTransport(
      { host: "10.0.0.9" },
      { connect: () => fake as unknown as net.Socket },
    );
    const sent = transport.send(Buffer.from([0x1b, 0x40]));
    fake.emit("connect");
    await expect(sent).rejects.toMatchObject({ code: "WRITE_FAILED" });
  });

  it("maps ETIMEDOUT to TIMEOUT and other socket errors to UNREACHABLE", async () => {
    for (const [errno, expected] of [
      ["ETIMEDOUT", "TIMEOUT"],
      ["ECONNREFUSED", "UNREACHABLE"],
      ["EHOSTUNREACH", "UNREACHABLE"],
    ] as const) {
      const fake = new FakeSocket();
      const transport = createTcpTransport(
        { host: "10.0.0.9" },
        { connect: () => fake as unknown as net.Socket },
      );
      const sent = transport.send(Buffer.from([0x1b, 0x40]));
      const err = new Error(errno) as NodeJS.ErrnoException;
      err.code = errno;
      fake.emit("error", err);
      await expect(sent).rejects.toMatchObject({ code: expected });
    }
  });

  it("carries an operator-facing French message for every failure code", () => {
    const codes = ["NOT_CONFIGURED", "UNREACHABLE", "TIMEOUT", "WRITE_FAILED"] as const;
    for (const code of codes) {
      const err = new PrinterError(code, "192.168.1.50:9100", "technical detail");
      expect(err.operatorMessage.length).toBeGreaterThan(10);
      // The cashier must never be shown a raw errno.
      expect(err.operatorMessage).not.toContain("ECONN");
    }
  });

  it("does not resolve after a failure has already been reported", async () => {
    const fake = new FakeSocket();
    const transport = createTcpTransport(
      { host: "10.0.0.9", timeoutMs: 25 },
      { connect: () => fake as unknown as net.Socket },
    );
    const sent = transport.send(Buffer.from([0x1b, 0x40]));
    fake.emit("timeout");
    fake.emit("close"); // a late close must not turn the rejection into success
    await expect(sent).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
