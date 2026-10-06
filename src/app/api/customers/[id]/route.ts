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

/**
 * L-260 — DELETING A CLIENT ERASES THEM. The operator's decision, 2026-10-06.
 *
 * This was a « soft-delete »: it set `active: false`, which no list reads, so a
 * « deleted » client stayed on both screens with every detail still stored; and
 * it refused outright for anyone who had ever ordered. L-248 rests on the
 * opposite — « a deletion request genuinely erases someone » — and was only
 * true on paper.
 *
 * NOTHING FISCAL DEPENDS ON THE ROW, measured before writing this: the sealed
 * `Receipt.content` holds no client data since L-248, the `VENTE` payload never
 * did (`sale-journal.ts`), and `Order` keeps only `customerId`, which no seal or
 * hash covers. `onDelete: SetNull` empties that link; the order — amounts, VAT,
 * payment, ticket — is untouched and the journal stays verifiable.
 *
 * THE AUDIT LOG IS SCRUBBED TOO. `CUSTOMER_CREATED` and `CUSTOMER_UPDATED` store
 * the name; leaving them would keep the person after the erasure. Their
 * `details` are emptied — the record that a client was created, when and by
 * whom, stays — and the deletion itself is logged without the name.
 */
export const DELETE = withAuthParams(async (_req, { user, params }) => {
  const existing = await db.customer.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const unlinked = await db.$transaction(async (tx) => {
    const orders = await tx.order.count({ where: { customerId: params.id } });
    await tx.customer.delete({ where: { id: params.id } });
    await tx.auditLog.updateMany({
      where: { entity: "Customer", entityId: params.id },
      data: { details: null },
    });
    return orders;
  });
  await audit("CUSTOMER_ERASED", "Customer", params.id, { ordersUnlinked: unlinked }, user.id);
  return NextResponse.json({ ok: true, ordersUnlinked: unlinked });
}, { roles: ["SUPER_ADMIN", "MANAGER"] });
