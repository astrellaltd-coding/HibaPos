import { describe, it, expect } from "vitest";
import {
  PIN_HASH_MAX_CONCURRENT,
  PIN_HASH_MAX_QUEUED,
  ScryptBusyError,
  isScryptBusyError,
  pinHashQueueState,
  runPinDerivation,
} from "@/lib/pin-hash-queue";

// C-09, Batch 4.2 — the bound on PIN key derivation.
//
// Moving scrypt off the event loop is necessary and not sufficient: async
// derivations still hold ~128 MiB each and still occupy the shared thread
// pool, and nothing in the auth routes limits how many a caller can start.
// This queue is the limit. The tests drive it with cheap fake tasks rather
// than real scrypt — the queue does not know or care what it is running, and
// filling it with 35 genuine derivations would cost minutes.

/** A task that only resolves when its returned `finish` is called. */
function pendingTask() {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { task: () => gate, finish };
}

describe("pin-hash-queue", () => {
  it("starts at rest", () => {
    expect(pinHashQueueState()).toEqual({ running: 0, queued: 0 });
  });

  it("runs at most PIN_HASH_MAX_CONCURRENT derivations at once", async () => {
    let inFlight = 0;
    let peak = 0;
    /** Finishers for the tasks currently running — refilled as waiters start. */
    let gates: Array<() => void> = [];
    const tick = () => new Promise((r) => setTimeout(r, 0));

    const runs = Array.from({ length: PIN_HASH_MAX_CONCURRENT + 3 }, () =>
      runPinDerivation(() => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        return new Promise<void>((resolve) => {
          gates.push(() => {
            inFlight -= 1;
            resolve();
          });
        });
      }),
    );

    // Let every acquire() settle, then check nothing beyond the cap started.
    await tick();
    expect(peak).toBe(PIN_HASH_MAX_CONCURRENT);
    expect(pinHashQueueState()).toEqual({
      running: PIN_HASH_MAX_CONCURRENT,
      queued: 3,
    });

    // Drain in rounds: release everything in flight, let the waiters that
    // inherit those permits start, repeat. `peak` is re-checked afterwards,
    // so a round that admitted too many would be caught.
    while (gates.length) {
      const round = gates;
      gates = [];
      for (const finish of round) finish();
      await tick();
    }
    await Promise.all(runs);
    expect(peak).toBe(PIN_HASH_MAX_CONCURRENT);
    expect(pinHashQueueState()).toEqual({ running: 0, queued: 0 });
  });

  it("refuses a derivation once the queue is full, before running anything", async () => {
    const started: number[] = [];
    const finishers: Array<() => void> = [];
    const accepted: Array<Promise<void>> = [];

    const capacity = PIN_HASH_MAX_CONCURRENT + PIN_HASH_MAX_QUEUED;
    for (let i = 0; i < capacity; i++) {
      const { task, finish } = pendingTask();
      finishers.push(finish);
      accepted.push(
        runPinDerivation(() => {
          started.push(i);
          return task();
        }),
      );
    }
    await new Promise((r) => setTimeout(r, 10));
    expect(pinHashQueueState()).toEqual({
      running: PIN_HASH_MAX_CONCURRENT,
      queued: PIN_HASH_MAX_QUEUED,
    });

    // One past capacity: rejected, and the task body never ran.
    let ran = false;
    await expect(
      runPinDerivation(async () => {
        ran = true;
      }),
    ).rejects.toBeInstanceOf(ScryptBusyError);
    expect(ran).toBe(false);
    expect(started.length).toBe(PIN_HASH_MAX_CONCURRENT);

    for (const f of finishers) f();
    await Promise.all(accepted);
    expect(pinHashQueueState()).toEqual({ running: 0, queued: 0 });
  });

  it("releases the permit when the task throws", async () => {
    await expect(
      runPinDerivation(async () => {
        throw new Error("scrypt exploded");
      }),
    ).rejects.toThrow("scrypt exploded");
    expect(pinHashQueueState()).toEqual({ running: 0, queued: 0 });
    // And the queue still works afterwards.
    await expect(runPinDerivation(async () => 42)).resolves.toBe(42);
  });

  it("identifies its own busy error and nothing else", () => {
    expect(isScryptBusyError(new ScryptBusyError())).toBe(true);
    expect(isScryptBusyError(new Error("busy"))).toBe(false);
    expect(isScryptBusyError(null)).toBe(false);
  });
});
