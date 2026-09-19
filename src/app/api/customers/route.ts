import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { customerSchema } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const customers = await db.customer.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q } },
            { phone: { contains: q } },
            { email: { contains: q } },
            // L-221: the town is searchable. It is the reason the operator
            // chose a column over a second box folded into `address` — « which
            // of my clients are in Villeurbanne » is not a question free text
            // can answer.
            { city: { contains: q } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { _count: { select: { orders: true } } },
  });
  return NextResponse.json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      city: c.city,
      notes: c.notes,
      createdAt: c.createdAt,
      orderCount: c._count.orders,
    })),
  );
});

export const POST = withAuth(async (req, { user }) => {
  const body = await parseJson(req);
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalide" }, { status: 400 });
  }
  const data = { ...parsed.data, email: parsed.data.email || null };
  const customer = await db.customer.create({ data });
  await audit("CUSTOMER_CREATED", "Customer", customer.id, { name: customer.name }, user.id);
  return NextResponse.json(customer, { status: 201 });
});
