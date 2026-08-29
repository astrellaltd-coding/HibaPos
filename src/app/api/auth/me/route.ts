import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null }, { status: 200 });
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, name: true, role: true, active: true, createdAt: true },
  });
  if (!user || !user.active) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({ user });
}
