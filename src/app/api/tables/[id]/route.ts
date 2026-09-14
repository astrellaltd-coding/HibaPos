import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { audit } from "@/lib/services/audit";

const updateSchema = z.object({
  label: z.string().min(1).max(30).optional(),
  seats: z.number().int().min(1).max(20).optional(),
  zone: z.string().max(40).optional().nullable(),
  status: z.enum(["FREE", "OCCUPIED", "RESERVED"]).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(280).optional().nullable(),
  currentOrderId: z.string().optional().nullable(),
});

export const PUT = withAuthParams(async (req, { user, params }) => {
  const body = await parseJson(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const table = await db.table.update({ where: { id: params.id }, data: parsed.data });
  await audit("TABLE_UPDATED", "Table", table.id, parsed.data, user.id);
  return NextResponse.json(table);
});

export const DELETE = withAuthParams(async (_req, { user, params }) => {
  // L-183 — the inline guard here was pure duplication: this handler ALREADY
  // declares `{ roles: ["SUPER_ADMIN", "MANAGER"] }` below, and DD-07 leaves
  // exactly those two roles, so the check refused nobody the wrapper had not
  // already refused. **The audit's L-183 named seven; this was an eighth of the
  // same shape** and is why the fix swept for the pattern rather than the list.
  await db.table.delete({ where: { id: params.id } });
  await audit("TABLE_DELETED", "Table", params.id, null, user.id);
  return NextResponse.json({ ok: true });
}, { roles: ["SUPER_ADMIN", "MANAGER"] });
