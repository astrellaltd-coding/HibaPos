import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { hashPin, revokeAllUserSessions } from "@/lib/auth";
import { z } from "zod";
import { audit } from "@/lib/services/audit";
import { refuseUserSelfEdit } from "@/lib/services/account-policy";

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  role: z.enum(["SUPER_ADMIN", "MANAGER", "CASHIER"]).optional(),
  pin: z.string().regex(/^\d{6}$/).optional(),
  active: z.boolean().optional(),
});

export const PUT = withAuthParams(async (req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN" && user.id !== params.id) {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  // M-23 (Batch 4.3) — a caller may not rewrite their own credentials.
  // Rule and rationale in `account-policy.ts`; kept out of the handler so it
  // can be tested without standing up a request.
  const refusal = refuseUserSelfEdit({
    callerId: user.id,
    callerRole: user.role,
    targetId: params.id,
    pin: parsed.data.pin,
    active: parsed.data.active,
  });
  if (refusal) {
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  }

  // Only super admin can change roles.
  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.pin) data.pinHash = await hashPin(parsed.data.pin);
  if (parsed.data.role !== undefined && user.role === "SUPER_ADMIN") data.role = parsed.data.role;

  const updated = await db.user.update({
    where: { id: params.id },
    data,
    select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
  });
  // Revoke all sessions for this user if deactivated or PIN changed — the
  // signed cookie alone would otherwise remain valid for its full 12h TTL.
  if (parsed.data.active === false || parsed.data.pin) {
    await revokeAllUserSessions(params.id);
  }
  await audit("USER_UPDATED", "User", updated.id, { fields: Object.keys(data) }, user.id);
  return NextResponse.json(updated);
});

export const DELETE = withAuthParams(async (_req, { user, params }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  if (user.id === params.id) {
    return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, { status: 400 });
  }
  // Prevent deleting the last super admin.
  const admins = await db.user.count({ where: { role: "SUPER_ADMIN", active: true } });
  const target = await db.user.findUnique({ where: { id: params.id } });
  if (target?.role === "SUPER_ADMIN" && admins <= 1) {
    return NextResponse.json({ error: "Impossible : c'est le dernier super administrateur" }, { status: 400 });
  }
  // Soft-delete: deactivate instead of removing
  await db.user.update({
    where: { id: params.id },
    data: { active: false },
  });
  // Revoke all active sessions for the deactivated user.
  await revokeAllUserSessions(params.id);
  await audit("USER_DEACTIVATED", "User", params.id, { username: target?.username }, user.id);
  return NextResponse.json({ ok: true });
});
