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
  { roles: ["SUPER_ADMIN", "MANAGER"] },
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
  const created = await db.user.create({
    data: {
      username: parsed.data.username.toLowerCase(),
      name: parsed.data.name,
      role: parsed.data.role,
      pinHash: hashPin(parsed.data.pin),
      active: parsed.data.active,
    },
    select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
  });
  await audit("USER_CREATED", "User", created.id, { username: created.username, role: created.role }, user.id);
  return NextResponse.json(created, { status: 201 });
});
