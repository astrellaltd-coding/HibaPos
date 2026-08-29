// Audit logging service.
import { db } from "@/lib/db";

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
    // Audit logging must never break the main flow.
    console.error("[audit] failed", e);
  }
}
