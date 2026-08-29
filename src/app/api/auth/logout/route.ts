import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { audit } from "@/lib/services/audit";

export async function POST() {
  const session = await getSession();
  if (session) {
    await audit("LOGOUT", "User", session.userId, null, session.userId);
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
