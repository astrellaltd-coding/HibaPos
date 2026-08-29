// Technical logger — never throws; logs go to TechnicalLog table.
import { db } from "@/lib/db";

export type LogLevel = "INFO" | "WARN" | "ERROR";

export async function logTechnical(
  level: LogLevel,
  source: string,
  message: string,
  stackTrace?: string
): Promise<void> {
  try {
    await db.technicalLog.create({
      data: { level, source, message, stackTrace: stackTrace ?? null },
    });
  } catch {
    // Logging must never crash business flows.
    // If the DB is down, we have nowhere to log — swallow silently.
  }
}

export async function queryTechnicalLogs(opts?: {
  level?: LogLevel;
  source?: string;
  limit?: number;
}) {
  const limit = Math.min(opts?.limit ?? 100, 1000);
  return db.technicalLog.findMany({
    where: {
      ...(opts?.level ? { level: opts.level } : {}),
      ...(opts?.source ? { source: { contains: opts.source } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
