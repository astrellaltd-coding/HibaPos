// Bounded queue for PIN key-derivation — C-09, Batch 4.2.
//
// `hashPin` / `verifyPinDetail` derive a 64-byte key with scrypt at
// N=2^17, r=8, p=1. Those parameters are correct for a 6-digit PIN (10^6
// keyspace) and are deliberately expensive: ~390 ms and ~128 MiB per call on
// the developer's machine. Batch 4.2 moved the derivation off the event loop
// with the async `crypto.scrypt`, which is necessary and not sufficient —
// async scrypt runs on the libuv thread pool, and nothing bounds how many
// calls are in flight at once. Unbounded, an unauthenticated caller on the
// restaurant LAN can hold hundreds of 128 MiB derivations open (every wrong
// username at login burns one by design) and exhaust the machine's memory,
// or saturate the whole thread pool so that file reads queue behind PIN
// guesses.
//
// So every derivation passes through here. Two run at a time; up to
// MAX_QUEUED more wait; anything beyond that is refused immediately with
// `ScryptBusyError`, which the auth routes turn into a 503 with `Retry-After`
// instead of letting the request sit. Refusing is the point: a till that says
// "réessayez dans un instant" on the login screen is working; a till whose
// Node process is thrashing 8 GiB of scrypt buffers is not.
//
// MAX_CONCURRENT is 2, not the pool's width. The pool defaults to four
// threads and is shared with file I/O, so filling it with scrypt would stall
// static asset reads and any fs work the request path does. Two also caps the
// derivation memory at ~256 MiB, which the POS all-in-one can absorb.
//
// Scope: this covers PIN hashing only. `backup.ts` derives its own scrypt key
// with the same parameters and does NOT pass through here — it runs once per
// backup, from an authenticated operator action, and coupling it to the auth
// queue would buy nothing.

/** Simultaneous derivations. Half the default thread pool; ~256 MiB peak. */
export const PIN_HASH_MAX_CONCURRENT = 2;

/** Derivations allowed to wait for a slot before callers are refused. */
export const PIN_HASH_MAX_QUEUED = 32;

/** French message shown when the queue is full. */
export const PIN_HASH_BUSY_MESSAGE =
  "Trop de vérifications de code PIN en cours. Réessayez dans un instant.";

/** `Retry-After` for the 503. The queue drains in ~7 s at worst. */
export const PIN_HASH_BUSY_RETRY_AFTER_SEC = 5;

/** Thrown by `runPinDerivation` when the queue is full. */
export class ScryptBusyError extends Error {
  constructor() {
    super(PIN_HASH_BUSY_MESSAGE);
    this.name = "ScryptBusyError";
  }
}

/** Type guard — the routes catch this one error and rethrow everything else,
 *  so a genuine crypto failure is never reported to the till as "busy". */
export function isScryptBusyError(e: unknown): e is ScryptBusyError {
  return e instanceof ScryptBusyError;
}

let running = 0;
const waiters: Array<() => void> = [];

/** Depth of the queue right now. Exported for tests and diagnostics. */
export function pinHashQueueState(): { running: number; queued: number } {
  return { running, queued: waiters.length };
}

/** Take a slot, or throw if the queue is already full.
 *
 *  A waiter is resolved by `release()`, which hands its own permit over
 *  without decrementing `running` — so the count can never be observed low
 *  between the release and the resumed caller, and the pool cannot be
 *  oversubscribed by a caller that arrives in that gap. */
async function acquire(): Promise<void> {
  if (running < PIN_HASH_MAX_CONCURRENT) {
    running += 1;
    return;
  }
  if (waiters.length >= PIN_HASH_MAX_QUEUED) throw new ScryptBusyError();
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next(); // transfer the permit; `running` stays as it is
  else running -= 1;
}

/** Run one key derivation under the concurrency bound.
 *
 *  Throws `ScryptBusyError` *before* starting the task when the queue is
 *  full — the caller has done no work at that point and can answer 503. */
export async function runPinDerivation<T>(task: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await task();
  } finally {
    release();
  }
}
