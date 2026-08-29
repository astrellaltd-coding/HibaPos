// Audit logging service.
import { db } from "@/lib/db";
import { logTechnical } from "@/lib/services/technical-logger";

export async function audit(
  action: string,
  entity: string,
  entityId: string | null,
  details: Record<string, unknown> | null,
  userId: string | null,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (e) {
    // Audit logging must never break the main flow. Surface the
    // failure in the technical log view (SUPER_ADMIN) so silent
    // audit failures are at least visible to the operator.
    console.error("[audit] failed", e);
    void logTechnical(
      "ERROR",
      "audit",
      `audit() failed for action=${action} entity=${entity} entityId=${entityId ?? "-"}: ${e instanceof Error ? e.message : String(e)}`,
      e instanceof Error ? e.stack : undefined,
    );
  }
}
