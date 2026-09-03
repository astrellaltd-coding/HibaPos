import { NextResponse } from "next/server";

/**
 * GET /api — liveness probe.
 *
 * C-27 (Batch 3.4) replaced the `{"message":"Hello, world!"}` scaffold stub
 * that shipped here. Kept rather than deleted because Batch 1.4's launcher
 * needs a way to know the server is accepting requests before it opens the
 * kiosk window, and a 200 from this route is exactly that signal.
 *
 * Deliberately unauthenticated and deliberately uninformative: it answers
 * "is this process listening", nothing more. It does NOT touch the database
 * (an unauthenticated endpoint must not be a way to probe or load it) and it
 * reports no version, build or environment detail, since anything it returns
 * is readable by anyone who can reach the port.
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "hibapos", time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
