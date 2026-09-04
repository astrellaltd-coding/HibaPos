import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams, parseJson } from "@/lib/api-handler";
import { customerSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export const GET = withAuthParams(async (_req, { params }) => {
  const customer = await db.customer.findUnique({
    where: { id: params.id },
    include: { _count: { select: { orders: true } } },
  });
  if (!customer) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  return NextResponse.json({
    ...customer,
    orderCount: customer._count.orders,
    _count: undefined,
  });
});

// M-25 (Batch 4.4): PUT and DELETE carried no role check at all, so any
// authenticated caller could rewrite or deactivate any customer record. GET
// stays open — the customers view is available to every role (`nav-config.ts`)
// and reading a customer is what it is for. Only the writes are gated.
export const PUT = withAuthParams(async (req, { user, params }) => {
  const body = await parseJson(req);
  const parsed = customerSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const data = { ...parsed.data, email: parsed.data.email === "" ? null : parsed.data.email };
  const customer = await db.customer.update({ where: { id: params.id }, data });
  await audit("CUSTOMER_UPDATED", "Customer", customer.id, { name: customer.name }, user.id);
  return NextResponse.json(customer);
}, { roles: ["SUPER_ADMIN", "MANAGER"] });

export const DELETE = withAuthParams(async (_req, { user, params }) => {
  // Soft-delete: check for historical orders, then set active=false
  const orderCount = await db.order.count({ where: { customerId: params.id } });
  if (orderCount > 0) {
    return NextResponse.json(
      { error: "Impossible de supprimer : ce client a des commandes historiques. Archivez-le plutôt." },
      { status: 409 }
    );
  }
  // Soft-delete for consistency
  await db.customer.update({ where: { id: params.id }, data: { active: false } });
  await audit("CUSTOMER_DEACTIVATED", "Customer", params.id, null, user.id);
  return NextResponse.json({ ok: true });
}, { roles: ["SUPER_ADMIN", "MANAGER"] });
