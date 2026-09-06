// Fiscal journal core — pure functions for ISCA compliance (art. 286-I-3° bis CGI).
// No database access here: these helpers are split out so they can be unit-tested
// without a Prisma client. The DB-bound appendFiscalEvent/verifyFiscalChain live
// in src/lib/services/fiscal.ts and import from this module.
import { createHash } from "node:crypto";

export type FiscalEventType =
  | "VENTE"
  | "ANNULATION"
  | "REMBOURSEMENT"
  // M-05 (Batch 5.5): money in or out of the drawer for a reason that is not a
  // sale — a float top-up, a drop to the safe, a supplier payment, a counting
  // correction. Journalled because the drawer is what the Z report reconciles;
  // it touches no revenue, no VAT and not the perpetual GrandTotal.
  | "MOUVEMENT_CAISSE"
  | "CLOTURE_Z"
  // DD-23 (Batch 3.8): the sealed TRADING-DAY close. `CLOTURE_Z` seals one
  // caisse and keeps that job; this seals the day above it, on the cut-off
  // clock, beside the monthly and annual closes that already exist.
  | "CLOTURE_J"
  | "CLOTURE_M"
  | "CLOTURE_A"
  | "OUVERTURE_TIROIR"
  | "REIMPRESSION"
  | "SESSION_OPEN"
  | "SESSION_CLOSE"
  | "SESSION_LOCK"
  | "ARCHIVE_GENEREE"
  // C-22 (Batch 2.1): a restore replaces the whole database and a backup
  // deletion destroys a recovery path. Both are journalled, because the
  // attestation claims no path exists to delete or modify sealed records.
  | "RESTAURATION"
  | "SUPPRESSION_SAUVEGARDE";

/** Deterministic JSON serialization: object keys sorted recursively, no
 *  insignificant whitespace. The same logical payload always yields the same
 *  string so hashes are reproducible for chain verification. */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return JSON.stringify(value);
  // C-04 (Batch 3.3): a Date MUST serialise as its instant. Without this
  // branch it fell through to the generic object case below, where
  // `Object.keys(date)` is `[]` — so every Date became `{}` and two payloads
  // seven years apart produced an identical hash. The archive's own notice
  // promised that any later alteration was detectable; every timestamp in it
  // could be changed without moving the checksum.
  //
  // Safe to add in place rather than versioning the canonicaliser: verified
  // before the change that no stored `dataJson` contains a Date (the two
  // payload fields that could — backup.ts:734 and :921 — already call
  // .toISOString()), and that no MonthlyClose, AnnualClose or FiscalArchive
  // row existed. An Invalid Date has no meaningful instant, so it takes the
  // same "null" as a non-finite number.
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? JSON.stringify(value.toISOString()) : "null";
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k])).join(",") + "}";
  }
  return "null";
}

/** SHA-256 of the canonical event fields. `previousHash` chains this event to
 *  its predecessor; `sequence` guarantees ordering even under clock skew. */
export function computeEventHash(
  previousHash: string | null,
  sequence: number,
  type: FiscalEventType,
  timestamp: Date,
  dataJson: string,
): string {
  return createHash("sha256")
    .update(`${previousHash ?? ""}|${sequence}|${type}|${timestamp.toISOString()}|${dataJson}`)
    .digest("hex");
}

/** SHA-256 of a sealed clôture (monthly/annual). Chained off the previous close
 *  of the same kind so the clôture sequence is independently verifiable. */
export function computeCloseHash(
  previousHash: string | null,
  period: string,
  timestamp: Date,
  dataJson: string,
): string {
  return createHash("sha256")
    .update(`${previousHash ?? ""}|${period}|${timestamp.toISOString()}|${dataJson}`)
    .digest("hex");
}

export type ChainVerifyResult = {
  ok: boolean;
  eventsChecked: number;
  firstBreakAt: number | null;
  lastSequence: number;
};

/** Pure chain verification — walks a chronologically-ordered event list and
 *  recomputes each hash, returning the first break. Used by verifyFiscalChain
 *  (DB) and by unit tests (no DB needed). */
export type ChainEventRow = {
  sequence: number;
  type: string;
  timestamp: Date;
  dataJson: string;
  previousHash: string | null;
  hash: string;
};

/**
 * Verify one contiguous slice of the chain, continuing from `previousHash`.
 *
 * Split out so the whole journal does not have to be in memory at once
 * (M-31): the database walker pages through and carries `lastHash` from one
 * page into the next. `verifyEvents` below is the same algorithm applied to
 * a single in-memory slice, which is what the unit tests exercise — there is
 * deliberately only ONE implementation of the check.
 */
export function verifyEventsChunk(
  events: ChainEventRow[],
  previousHash: string | null,
): {
  ok: boolean;
  checked: number;
  firstBreakAt: number | null;
  lastHash: string | null;
  lastSequence: number;
} {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  let prev = previousHash;
  let lastSequence = 0;

  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.previousHash !== prev) {
      return { ok: false, checked: i, firstBreakAt: e.sequence, lastHash: prev, lastSequence };
    }
    const recomputed = computeEventHash(
      e.previousHash,
      e.sequence,
      e.type as FiscalEventType,
      e.timestamp,
      e.dataJson,
    );
    if (recomputed !== e.hash) {
      return { ok: false, checked: i, firstBreakAt: e.sequence, lastHash: prev, lastSequence };
    }
    prev = e.hash;
    lastSequence = e.sequence;
  }

  return {
    ok: true,
    checked: sorted.length,
    firstBreakAt: null,
    lastHash: prev,
    lastSequence,
  };
}

export function verifyEvents(events: ChainEventRow[]): ChainVerifyResult {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const lastSequence = sorted.length ? sorted[sorted.length - 1].sequence : 0;
  const result = verifyEventsChunk(sorted, null);
  return {
    ok: result.ok,
    eventsChecked: result.checked,
    firstBreakAt: result.firstBreakAt,
    lastSequence,
  };
}


/** Pure verification of a clôture (close) sequence — monthly or annual. */
export function verifyCloses(
  closes: { period: string; timestamp: Date; dataJson: string; previousHash: string | null; hash: string }[],
): ChainVerifyResult {
  const sorted = [...closes].sort((a, b) => a.period.localeCompare(b.period));
  const lastSequence = sorted.length ? sorted.length : 0;
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const expectedPrev = i === 0 ? null : sorted[i - 1].hash;
    if (c.previousHash !== expectedPrev) {
      return { ok: false, eventsChecked: i, firstBreakAt: i + 1, lastSequence };
    }
    const recomputed = computeCloseHash(c.previousHash, c.period, c.timestamp, c.dataJson);
    if (recomputed !== c.hash) {
      return { ok: false, eventsChecked: i, firstBreakAt: i + 1, lastSequence };
    }
  }
  return { ok: true, eventsChecked: sorted.length, firstBreakAt: null, lastSequence };
}
