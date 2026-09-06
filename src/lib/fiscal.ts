// Fiscal journal core — pure functions for ISCA compliance (art. 286-I-3° bis CGI).
// No database access here: these helpers are split out so they can be unit-tested
// without a Prisma client. The DB-bound appendFiscalEvent/verifyFiscalChain live
// in src/lib/services/fiscal.ts and import from this module.
import { createHash, createHmac } from "node:crypto";

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

/**
 * The fingerprint of one journal entry. `previousHash` chains this event to its
 * predecessor; `sequence` guarantees ordering even under clock skew.
 *
 * DD-25 (Batch 3.9) added `key`. With it the fingerprint is HMAC-SHA-256 and
 * cannot be reproduced from the source code alone; without it the function is
 * byte-for-byte what it always was, so **every event written before the key was
 * armed still verifies unchanged**. That is not a courtesy: the journal in
 * existence today was written unkeyed, and a change that silently invalidated
 * it would destroy the very thing the chain exists to prove.
 *
 * The key is never defaulted here. `services/fiscal.ts` reads it from the
 * environment and passes it in, so this module stays pure and a test can pin
 * both modes without touching `process.env`.
 */
export function computeEventHash(
  previousHash: string | null,
  sequence: number,
  type: FiscalEventType,
  timestamp: Date,
  dataJson: string,
  key?: string | null,
): string {
  const material = `${previousHash ?? ""}|${sequence}|${type}|${timestamp.toISOString()}|${dataJson}`;
  return key
    ? createHmac("sha256", key).update(material).digest("hex")
    : createHash("sha256").update(material).digest("hex");
}

/** The fingerprint of a sealed clôture (daily/monthly/annual). Chained off the
 *  previous close of the same kind so each clôture sequence is independently
 *  verifiable. Keyed on the same terms as `computeEventHash` (DD-25). */
export function computeCloseHash(
  previousHash: string | null,
  period: string,
  timestamp: Date,
  dataJson: string,
  key?: string | null,
): string {
  const material = `${previousHash ?? ""}|${period}|${timestamp.toISOString()}|${dataJson}`;
  return key
    ? createHmac("sha256", key).update(material).digest("hex")
    : createHash("sha256").update(material).digest("hex");
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
  key?: string | null,
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
      key,
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

export function verifyEvents(events: ChainEventRow[], key?: string | null): ChainVerifyResult {
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const lastSequence = sorted.length ? sorted[sorted.length - 1].sequence : 0;
  const result = verifyEventsChunk(sorted, null, key);
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
  key?: string | null,
): ChainVerifyResult {
  const sorted = [...closes].sort((a, b) => a.period.localeCompare(b.period));
  const lastSequence = sorted.length ? sorted.length : 0;
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const expectedPrev = i === 0 ? null : sorted[i - 1].hash;
    if (c.previousHash !== expectedPrev) {
      return { ok: false, eventsChecked: i, firstBreakAt: i + 1, lastSequence };
    }
    const recomputed = computeCloseHash(c.previousHash, c.period, c.timestamp, c.dataJson, key);
    if (recomputed !== c.hash) {
      return { ok: false, eventsChecked: i, firstBreakAt: i + 1, lastSequence };
    }
  }
  return { ok: true, eventsChecked: sorted.length, firstBreakAt: null, lastSequence };
}
