import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { verifyPin } from "@/lib/auth";
import { z } from "zod";
import { audit } from "@/lib/services/audit";
import { issueApprovalToken, type ApprovalAction } from "@/lib/approvals";
import { clientIp } from "@/lib/http-rate-limit";
import { rateLimit } from "@/lib/rate-limit";

const approveSchema = z.object({
  pin: z.string().min(6).max(10),
  action: z.enum(["DISCOUNT", "REFUND"]).default("DISCOUNT"),
  amount: z.number().min(0).optional(),
  ttlSec: z.number().int().min(5).max(300).optional(),
});

const RL_PER_CALLER_MAX = 5;
const RL_PER_CALLER_WINDOW = 60_000; // 5 attempts/min
const RL_PER_CALLER_LONG_MAX = 15;
const RL_PER_CALLER_LONG_WINDOW = 15 * 60_000; // 15 per 15 min

/**
 * POST /api/auth/approve
 * Validates a manager/super-admin PIN for a sensitive operation.
 * Requires the caller to be authenticated. Issues a signed, single-use
 * approval token bound to (action, amount?) — rendered invalid after use
 * or after ttlSec (default 60s). Also enforces per-IP+caller rate limits
 * to prevent online PIN brute-forcing.
 */
export const POST = withAuth(async (req: NextRequest, { user: caller }) => {
  const body = await parseJson(req);
  const parsed = approveSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "PIN requis (6–10 caractères)." },
      { status: 400 },
    );
  }
  const { pin, action, amount, ttlSec } = parsed.data as {
    pin: string;
    action: ApprovalAction;
    amount?: number;
    ttlSec?: number;
  };

  // Per-IP+caller rate-limit (brute-force wall).
  const ip = clientIp(req);
  const keyShort = `approve:${ip}:${caller.id}`;
  const keyLong = `${keyShort}:long`;

  const rlShort = rateLimit(keyShort, RL_PER_CALLER_MAX, RL_PER_CALLER_WINDOW);
  if (!rlShort.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, rlShort.retryAfterSec)) },
      },
    );
  }
  const rlLong = rateLimit(
    keyLong,
    RL_PER_CALLER_LONG_MAX,
    RL_PER_CALLER_LONG_WINDOW,
  );
  if (!rlLong.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, rlLong.retryAfterSec)) },
      },
    );
  }

  // Find any active manager/super-admin with this PIN.
  // Query one at a time (constant-time PIN verify per hash);
  // managers list is bounded (≤ dozen).
  const managers = await db.user.findMany({
    where: {
      active: true,
      role: { in: ["MANAGER", "SUPER_ADMIN"] },
    },
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      pinHash: true,
      failedAttempts: true,
      lockedUntil: true,
    },
  });

  let approver: (typeof managers)[number] | null = null;
  for (const u of managers) {
    if (!u.pinHash) continue;
    if (u.lockedUntil && u.lockedUntil > new Date()) continue;
    if (verifyPin(pin, u.pinHash)) {
      approver = u;
      break;
    }
  }

  if (!approver) {
    await audit(
      "MANAGER_APPROVAL_FAILED",
      "User",
      caller.id,
      { reason: "PIN invalide", action },
      caller.id,
    );
    return NextResponse.json(
      { error: "PIN manager invalide." },
      { status: 403 },
    );
  }

  // Prevent self-approval.
  if (approver.id === caller.id) {
    return NextResponse.json(
      { error: "Auto-approbation interdite." },
      { status: 403 },
    );
  }

  const approvalToken = issueApprovalToken({
    approverId: approver.id,
    action,
    amount,
    ttlSec,
  });

  await audit(
    "MANAGER_APPROVAL_GRANTED",
    "User",
    approver.id,
    { requesterId: caller.id, requesterName: caller.name, action, amount },
    approver.id,
  );

  return NextResponse.json({
    id: approver.id,
    name: approver.name,
    role: approver.role,
    approvalToken,
    action,
    amount: amount ?? null,
    expSec: (ttlSec ?? 60),
  });
});