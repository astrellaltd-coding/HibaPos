import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PrinterError,
  createWindowsRawTransport,
  listWindowsPrinters,
  type SpoolerRunFn,
} from "@/lib/services/printer-transport";

// L-70 (Batch 1.3d) — the Windows RAW spooler transport.
//
// Same shape as `printer-transport.test.ts`: the process runner is injected,
// so every path here is deterministic and no printer, spooler or Windows is
// needed. What the fake runner does that a FakeSocket could not is READ THE
// STAGED FILE — which is the only place the actual bytes exist, and therefore
// the only way to test what is SENT rather than what was intended.

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "hibapos-spool-test-"));

/** Records the invocation and, optionally, the bytes staged for it. */
function fakeRun(
  result: { code: number; stdout?: string; stderr?: string } | { throws: Error },
) {
  const calls: {
    exe: string;
    args: string[];
    timeoutMs: number;
    staged: Buffer | null;
    stagedPath: string;
  }[] = [];
  const run: SpoolerRunFn = async ({ exe, args, timeoutMs }) => {
    const i = args.indexOf("-InputFile");
    const stagedPath = i >= 0 ? args[i + 1] : "";
    calls.push({
      exe,
      args,
      timeoutMs,
      // Read it HERE: the transport deletes the file as soon as it returns.
      staged: stagedPath && existsSync(stagedPath) ? readFileSync(stagedPath) : null,
      stagedPath,
    });
    if ("throws" in result) throw result.throws;
    return { code: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
  return { run, calls };
}

describe("createWindowsRawTransport — the happy path", () => {
  it("stages the payload byte-for-byte and hands the path to the helper", async () => {
    const { run, calls } = fakeRun({ code: 0, stdout: "OK 9" });
    // Deliberately includes control bytes and a CP1252 high byte: an encoding
    // step anywhere in this path would corrupt exactly these.
    const payload = Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x10, 0xe9, 0x80, 0x0a, 0x00]);

    const t = createWindowsRawTransport(
      { printerName: "SUNSO WTP-800", tmpDir: tmp(), scriptPath: "C:/x/print-raw.ps1" },
      { run },
    );
    await t.send(payload);

    expect(calls).toHaveLength(1);
    expect(calls[0].staged).not.toBeNull();
    expect(Buffer.compare(calls[0].staged as Buffer, payload)).toBe(0);
    expect(calls[0].exe).toBe("powershell.exe");
    expect(calls[0].args).toContain("-PrinterName");
    expect(calls[0].args[calls[0].args.indexOf("-PrinterName") + 1]).toBe("SUNSO WTP-800");
    expect(calls[0].args).toContain("C:/x/print-raw.ps1");
    // -NoProfile and -NonInteractive: a till must never wait on a prompt.
    expect(calls[0].args).toContain("-NoProfile");
    expect(calls[0].args).toContain("-NonInteractive");
  });

  it("deletes the staged job afterwards — a receipt is a fiscal document", async () => {
    const { run, calls } = fakeRun({ code: 0 });
    const t = createWindowsRawTransport({ printerName: "P", tmpDir: tmp() }, { run });
    await t.send(Buffer.from("ticket"));
    expect(existsSync(calls[0].stagedPath)).toBe(false);
  });

  it("deletes the staged job even when the print FAILED", async () => {
    const { run, calls } = fakeRun({ code: 4, stdout: "ERR step=-5 win32=6" });
    const t = createWindowsRawTransport({ printerName: "P", tmpDir: tmp() }, { run });
    await expect(t.send(Buffer.from("ticket"))).rejects.toBeInstanceOf(PrinterError);
    expect(existsSync(calls[0].stagedPath)).toBe(false);
  });

  it("uses a fresh unguessable filename each time", async () => {
    const { run, calls } = fakeRun({ code: 0 });
    const t = createWindowsRawTransport({ printerName: "P", tmpDir: tmp() }, { run });
    await t.send(Buffer.from("a"));
    await t.send(Buffer.from("b"));
    expect(calls[0].stagedPath).not.toBe(calls[1].stagedPath);
  });
});

describe("createWindowsRawTransport — failures the cashier has to survive", () => {
  it("exit 2 (queue not found) is UNREACHABLE and names the queue", async () => {
    const { run } = fakeRun({ code: 2, stdout: "ERR step=-2 win32=1801" });
    const t = createWindowsRawTransport({ printerName: "Sunso", tmpDir: tmp() }, { run });
    const err = await t.send(Buffer.from("x")).catch((e) => e);
    expect(err).toBeInstanceOf(PrinterError);
    expect(err.code).toBe("UNREACHABLE");
    expect(err.connection).toBe("usb");
    expect(err.operatorMessage).toContain("Sunso");
    // The USB advice, not the network one.
    expect(err.operatorMessage).toContain("Windows");
    expect(err.operatorMessage).not.toContain("réseau");
  });

  it("exit 3 (spooler refused the job) is WRITE_FAILED", async () => {
    const { run } = fakeRun({ code: 3, stdout: "ERR step=-3 win32=5" });
    const t = createWindowsRawTransport({ printerName: "P", tmpDir: tmp() }, { run });
    const err = await t.send(Buffer.from("x")).catch((e) => e);
    expect(err.code).toBe("WRITE_FAILED");
  });

  it("exit 4 (short or refused write) is WRITE_FAILED", async () => {
    const { run } = fakeRun({ code: 4, stdout: "ERR step=-6 written=3 expected=9" });
    const t = createWindowsRawTransport({ printerName: "P", tmpDir: tmp() }, { run });
    const err = await t.send(Buffer.from("x")).catch((e) => e);
    expect(err.code).toBe("WRITE_FAILED");
  });

  it("a timeout from the runner becomes TIMEOUT, with USB advice", async () => {
    const { run } = fakeRun({ throws: new Error("TIMEOUT") });
    const t = createWindowsRawTransport({ printerName: "P", tmpDir: tmp() }, { run });
    const err = await t.send(Buffer.from("x")).catch((e) => e);
    expect(err.code).toBe("TIMEOUT");
    expect(err.operatorMessage).toContain("USB");
  });

  it("a runner that cannot start at all is WRITE_FAILED, not a crash", async () => {
    const { run } = fakeRun({ throws: new Error("ENOENT powershell.exe") });
    const t = createWindowsRawTransport({ printerName: "P", tmpDir: tmp() }, { run });
    const err = await t.send(Buffer.from("x")).catch((e) => e);
    expect(err).toBeInstanceOf(PrinterError);
    expect(err.code).toBe("WRITE_FAILED");
  });

  it("an empty queue name is NOT_CONFIGURED and never spawns anything", async () => {
    const { run, calls } = fakeRun({ code: 0 });
    const t = createWindowsRawTransport({ printerName: "   ", tmpDir: tmp() }, { run });
    const err = await t.send(Buffer.from("x")).catch((e) => e);
    expect(err.code).toBe("NOT_CONFIGURED");
    expect(err.operatorMessage).toContain("Choisissez");
    // The point of the guard: no process, and no file left behind.
    expect(calls).toHaveLength(0);
  });

  it("describe() names the queue, so a log line says which printer failed", () => {
    const t = createWindowsRawTransport({ printerName: "SUNSO WTP-800" });
    expect(t.describe()).toBe("SUNSO WTP-800");
  });
});

describe("PrinterError keeps the two connections' advice apart", () => {
  // The regression this guards: one shared message told a USB user to check a
  // network cable. `connection` defaults to "network", so every pre-1.3d
  // construction is byte-identical to what it was.
  it("defaults to the network wording when nothing is passed", () => {
    const e = new PrinterError("UNREACHABLE", "192.168.1.50:9100", "x");
    expect(e.connection).toBe("network");
    expect(e.operatorMessage).toContain("réseau");
  });

  it("NOT_CONFIGURED names the IP field on network and the picker on USB", () => {
    expect(new PrinterError("NOT_CONFIGURED", "", "").operatorMessage).toContain("adresse IP");
    expect(
      new PrinterError("NOT_CONFIGURED", "", "", { connection: "usb" }).operatorMessage,
    ).toContain("imprimante Windows");
  });

  it("TIMEOUT names the right cable in each mode", () => {
    expect(new PrinterError("TIMEOUT", "p", "").operatorMessage).toContain("câble réseau");
    expect(
      new PrinterError("TIMEOUT", "p", "", { connection: "usb" }).operatorMessage,
    ).toContain("câble USB");
  });
});

describe("listWindowsPrinters", () => {
  it("splits the helper's lines and drops the blanks", async () => {
    const { run, calls } = fakeRun({
      code: 0,
      stdout: "HibaPOS Loopback\r\nSUNSO WTP-800\r\n\r\nMicrosoft Print to PDF\r\n",
    });
    const names = await listWindowsPrinters({ run, scriptPath: "C:/x/print-raw.ps1" });
    expect(names).toEqual(["HibaPOS Loopback", "SUNSO WTP-800", "Microsoft Print to PDF"]);
    expect(calls[0].args).toContain("-List");
  });

  it("returns an empty list rather than throwing when the helper fails", async () => {
    const { run } = fakeRun({ code: 1, stderr: "not windows" });
    expect(await listWindowsPrinters({ run })).toEqual([]);
  });
});
