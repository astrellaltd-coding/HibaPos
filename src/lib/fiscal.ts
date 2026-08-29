// Fiscal journal core — pure functions for ISCA compliance (art. 286-I-3° bis CGI).
// No database access here: these helpers are split out so they can be unit-tested
// without a Prisma client. The DB-bound appendFiscalEvent/verifyFiscalChain live
// in src/lib/services/fiscal.ts and import from this module.
import { createHash } from "node:crypto";

export type FiscalEventType =
  | "VENTE"
  | "ANNULATION"
  | "REMBOURSEMENT"
  | "CLOTURE_Z"
  | "CLOTURE_M"
  | "CLOTURE_A"
  | "OUVERTURE_TIROIR"
  | "REIMPRESSION"
  | "SESSION_OPEN"
  | "SESSION_CLOSE"
  | "SESSION_LOCK"
  | "ARCHIVE_GENEREE";

/** Deterministic JSON serialization: object keys sorted recursively, no
 *  insignificant whitespace. The same logical payload always yields the same
 *  string so hashes are reproducible for chain verification. */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return JSON.stringify(value);
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
export function verifyEvents(
  events: {
    sequence: number;
    type: string;
    timestamp: Date;
    dataJson: string;
    previousHash: string | null;
    hash: string;
  }[],
): ChainVerifyResult {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const lastSequence = sorted.length ? sorted[sorted.length - 1].sequence : 0;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const expectedPrev = i === 0 ? null : sorted[i - 1].hash;
    if (e.previousHash !== expectedPrev) {
      return { ok: false, eventsChecked: i, firstBreakAt: e.sequence, lastSequence };
    }
    const recomputed = computeEventHash(
      e.previousHash,
      e.sequence,
      e.type as FiscalEventType,
      e.timestamp,
      e.dataJson,
    );
    if (recomputed !== e.hash) {
      return { ok: false, eventsChecked: i, firstBreakAt: e.sequence, lastSequence };
    }
  }
  return { ok: true, eventsChecked: sorted.length, firstBreakAt: null, lastSequence };
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
