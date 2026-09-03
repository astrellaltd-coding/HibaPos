// Maintenance gate (C-05, Batch 2.1).
//
// A restore replaces `db/custom.db` underneath a running server. Disconnecting
// Prisma is not enough on its own: any request that arrives between the
// disconnect and the reconnect makes Prisma reopen the file — which, during
// the swap, may be a half-written database. This gate makes the rest of the
// API refuse service for the few seconds the swap takes, so there is no
// request in flight to reconnect onto a partial file.
//
// Module-level state is deliberate and sufficient: the deployment model is a
// single Bun process on one till (IMPLEMENTATION_PLAN.md:15). If HibaPOS ever
// runs multi-process, this has to become a lock the processes share — a
// lockfile next to the database, or a row in it.

export class RestoreInProgressError extends Error {
  constructor() {
    super("Une restauration est déjà en cours.");
    this.name = "RestoreInProgressError";
  }
}

let restoreStartedAt: number | null = null;

/** True while a restore holds the gate. */
export function isRestoreInProgress(): boolean {
  return restoreStartedAt !== null;
}

/** Seconds the current restore has been running, or null. */
export function restoreElapsedSeconds(): number | null {
  return restoreStartedAt === null
    ? null
    : Math.max(0, Math.round((Date.now() - restoreStartedAt) / 1000));
}

/**
 * Claim the gate. Throws if a restore is already running, which is what stops
 * two concurrent restores from interleaving their file swaps.
 */
export function beginRestore(): void {
  if (restoreStartedAt !== null) throw new RestoreInProgressError();
  restoreStartedAt = Date.now();
}

/** Release the gate. Safe to call when it is not held. */
export function endRestore(): void {
  restoreStartedAt = null;
}
