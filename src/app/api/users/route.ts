import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { userSchema } from "@/lib/validation";
import { hashPin } from "@/lib/auth";
import { audit } from "@/lib/services/audit";

export const GET = withAuth(
  async () => {
    const users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
    });
    return NextResponse.json(users);
  },
  // DD-22 / L-33 (Batch 7.4b) — narrowed from `["SUPER_ADMIN", "MANAGER"]`.
  //
  // Since Batch 4.4b removed `CASHIER`, that pair admitted the ENTIRE role
  // model — no narrower than declaring no roles at all. This endpoint answered
  // 200 to a MANAGER whose navigation entry for the screen is deliberately
  // SUPER_ADMIN-only (DD-07), so the API contradicted the navigation.
  // `GET /api/logs` already answered 403 and is the shape this now matches.
  //
  // Verified before the change was proposed: **nothing in `src/` calls this as
  // a MANAGER**, so no screen breaks. The operator decided it (DD-22).
  { roles: ["SUPER_ADMIN"] },
);

export const POST = withAuth(async (req, { user }) => {
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Réservé au super administrateur" }, { status: 403 });
  }
  const body = await parseJson(req);
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const existing = await db.user.findUnique({ where: { username: parsed.data.username.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "Ce nom d'utilisateur existe déjà" }, { status: 409 });
  }
  const pinHash = await hashPin(parsed.data.pin);
  const created = await db.user.create({
    data: {
      username: parsed.data.username.toLowerCase(),
      name: parsed.data.name,
      role: parsed.data.role,
      pinHash,
      active: parsed.data.active,
    },
    select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
  });
  await audit("USER_CREATED", "User", created.id, { username: created.username, role: created.role }, user.id);
  return NextResponse.json(created, { status: 201 });
});
