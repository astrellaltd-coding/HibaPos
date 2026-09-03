// Log retention (M-29, Batch 2.4).
//
// Nothing ever removed a row from `TechnicalLog` or `AuditLog`, and technical
// logs are written into the same SQLite file as the fiscal data — so a log
// table that grows without bound competes for the same write lock as a
// checkout. Only expired sessions were pruned, opportunistically at login.
//
// THE LINE THAT MUST NOT BE CROSSED
// ---------------------------------
// `FiscalEvent` is append-only by design and is NEVER pruned here. The
// journal is the thing the whole fiscal architecture exists to protect; a
// retention job that touched it would be the deletion path the attestation
// says does not exist. The same goes for orders, receipts, payments and Z
// reports. This module only ever deletes from the two log tables named
// below, and the tests assert that the fiscal counts are unchanged.

import { db } from "@/lib/db";
import { logTechnical } from "@/lib/services/technical-logger";

/**
 * Technical logs are operational noise — backup results, printer failures,
 * stack traces. Ninety days is long enough to investigate a problem
 * somebody noticed last quarter.
 */
const DEFAULT_TECHNICAL_LOG_DAYS = 90;

/**
 * Audit logs are NOT pruned by default.
 *
 * They record who approved a discount, who refunded, who restored a backup.
 * That is evidence, and its useful life is a business and legal question
 * rather than a disk-space one — so the default keeps everything and an
 * operator has to opt in explicitly. They also grow slowly: a restaurant
 * generates a few hundred rows a day at most.
 */
const DEFAULT_AUDIT_LOG_DAYS = 0; // 0 = keep forever

function envDays(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function technicalLogRetentionDays(): number {
  return envDays("TECHNICAL_LOG_RETENTION_DAYS", DEFAULT_TECHNICAL_LOG_DAYS);
}

export function auditLogRetentionDays(): number {
  return envDays("AUDIT_LOG_RETENTION_DAYS", DEFAULT_AUDIT_LOG_DAYS);
}

export type LogPruneResult = {
  technicalLogsDeleted: number;
  auditLogsDeleted: number;
  sessionsDeleted: number;
};

/**
 * Prune the bounded tables. Never throws — this runs as housekeeping after a
 * Z close and must not be able to fail one.
 *
 * A retention of 0 disables pruning for that table entirely.
 */
export async function pruneLogs(now: Date = new Date()): Promise<LogPruneResult> {
  const result: LogPruneResult = {
    technicalLogsDeleted: 0,
    auditLogsDeleted: 0,
    sessionsDeleted: 0,
  };

  const cutoff = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    const days = technicalLogRetentionDays();
    if (days > 0) {
      const { count } = await db.technicalLog.deleteMany({
        where: { createdAt: { lt: cutoff(days) } },
      });
      result.technicalLogsDeleted = count;
    }
  } catch {
    // Housekeeping only.
  }

  try {
    const days = auditLogRetentionDays();
    if (days > 0) {
      const { count } = await db.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff(days) } },
      });
      result.auditLogsDeleted = count;
    }
  } catch {
    // Housekeeping only.
  }

  try {
    // Expired sessions were only cleared opportunistically at login, so a
    // till that nobody logs out of accumulates them indefinitely.
    const { count } = await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
    result.sessionsDeleted = count;
  } catch {
    // Housekeeping only.
  }

  const total =
    result.technicalLogsDeleted + result.auditLogsDeleted + result.sessionsDeleted;
  if (total > 0) {
    await logTechnical(
      "INFO",
      "log-retention",
      `Pruned ${result.technicalLogsDeleted} technical log(s), ${result.auditLogsDeleted} audit log(s), ${result.sessionsDeleted} expired session(s).`,
    );
  }

  return result;
}
