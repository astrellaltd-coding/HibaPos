import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { customerSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";
import { compareRegularsFirst, customerMatches, findPhoneTwin } from "@/lib/customer-match";

/**
 * L-265 — THE LIST, SEARCHED AND ORDERED BY ONE RULE (`lib/customer-match.ts`).
 *
 * This was a raw `contains` on each column, newest client first. Measured on a
 * scratch copy, 2026-10-15: « 0612345678 » and « 5678 » did not find a client
 * saved as « 06 12 34 56 78 », so a cashier who typed the number his own way
 * found nobody and created the regular again. The search now compares phone
 * DIGITS and text without case or accents, and the list puts the regulars
 * first — most orders, then the latest order — the operator's choice.
 *
 * Filtered in memory rather than in SQL, deliberately: digits-only matching
 * has no `contains` form over a column that stores the spaces, and the whole
 * book is a few hundred rows on one till. `lastOrderAt` is one grouped query,
 * not a column, so nothing in the schema changes.
 */
export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const [customers, lastOrders] = await Promise.all([
    db.customer.findMany({ include: { _count: { select: { orders: true } } } }),
    db.order.groupBy({
      by: ["customerId"],
      where: { customerId: { not: null } },
      _max: { createdAt: true },
    }),
  ]);
  const lastAt = new Map(lastOrders.map((o) => [o.customerId, o._max.createdAt]));
  const rows = customers
    .filter((c) => customerMatches(q, c))
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      city: c.city,
      notes: c.notes,
      createdAt: c.createdAt,
      orderCount: c._count.orders,
      lastOrderAt: lastAt.get(c.id) ?? null,
    }))
    .sort(compareRegularsFirst)
    .slice(0, 200);
  return NextResponse.json(rows);
});

export const POST = withAuth(async (req, { user }) => {
  const body = await parseJson(req);
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const data = { ...parsed.data, email: parsed.data.email || null };
  /**
   * L-265 — NO SILENT DUPLICATE. A number that already belongs to a client is
   * refused with that client named, so the screen can offer to choose them.
   * `allowDuplicatePhone` is the cashier's « créer quand même »: a family
   * landline is a real case, and the till must not refuse it outright.
   */
  const allowDuplicate = (body as { allowDuplicatePhone?: unknown } | null)?.allowDuplicatePhone === true;
  if (!allowDuplicate && data.phone) {
    const twin = findPhoneTwin(
      data.phone,
      await db.customer.findMany({ where: { phone: { not: null } }, select: { id: true, name: true, phone: true } }),
    );
    if (twin) {
      return NextResponse.json(
        {
          error: `Ce numéro est déjà celui de « ${twin.name} ».`,
          duplicateOf: { id: twin.id, name: twin.name },
        },
        { status: 409 },
      );
    }
  }
  const customer = await db.customer.create({ data });
  await audit("CUSTOMER_CREATED", "Customer", customer.id, { name: customer.name }, user.id);
  return NextResponse.json(customer, { status: 201 });
});
