import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { nextReceiptNumber } from "@/lib/services/sequence";
import { renderReceipt } from "@/lib/services/receipt";
import { getSettings } from "@/lib/services/settings";
import { appendFiscalEvent, incrementGrandTotal } from "@/lib/services/fiscal";
import { computeLinePricing, resolveVatRate } from "@/lib/services/pricing";
import { sum2, addToVatBreakdown, apportion, type VatBreakdown } from "@/lib/money";
import { buildVentePayload, buildOrderAuditDetails } from "@/lib/services/sale-journal";
import { TX_CHECKOUT } from "@/lib/tx-options";

// Server-authoritative checkout intent schema.
// The client sends ONLY intent: product ids, option ids, addon ids, quantities.
// The server recomputes all prices from the database.
const checkoutIntentSchema = z.object({
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "LIVRAISON"]).default("DINE_IN"),
  tableLabel: z.string().max(40).optional().nullable(),
  customerId: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string(),
        quantity: z.number().int().min(1),
        notes: z.string().optional().nullable(),
        optionIds: z.array(z.string()).default([]),
        addons: z.array(
          z.object({ addonId: z.string(), quantity: z.number().int().min(1).default(1) })
        ).default([]),
      })
    )
    .min(1, "La commande est vide"),
  discount: z
    .object({
      type: z.enum(["PERCENT", "AMOUNT"]),
      value: z.number().int().min(0), // cents (AMOUNT) or percent×100 (PERCENT) — see server calc
      approvedById: z.string().optional(), // legacy — only honored for MANAGER+/SUPER_ADMIN callers
      // Accepted and ignored since Batch 4.4b: the only gate that read it was
      // the CASHIER arm removed below. Kept on the wire so an in-flight client
      // is not rejected, and because Batch 4.4c decides what replaces it.
      approvalToken: z.string().optional(),
    })
    .optional(),
  notes: z.string().max(500).optional().nullable(),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "CARD", "VOUCHER"]),
        amount: z.number().int().min(1), // cents (min 1 cent)
        tendered: z.number().int().min(0).optional(), // cents
      })
    )
    .min(1, "Au moins un paiement"),
});

export const GET = withAuth(async (req) => {
  const url = new URL(req.url);
  const shiftId = url.searchParams.get("shiftId");
  const statusRaw = url.searchParams.get("status");
  // Validate status against the OrderStatus enum before casting —
  // an invalid value previously threw PrismaClientValidationError → 500.
  const STATUS_ENUM = z.enum(["COMPLETED", "REFUNDED", "CANCELLED", "PENDING"]);
  const statusParse = statusRaw ? STATUS_ENUM.safeParse(statusRaw) : null;
  if (statusRaw && !statusParse?.success) {
    return NextResponse.json(
      { error: `Statut invalide : ${statusRaw} (valeurs acceptées : COMPLETED, REFUNDED, CANCELLED, PENDING)` },
      { status: 400 },
    );
  }
  const status = statusParse?.data;
  // Guard: `Number("") === 0` — an empty `limit=` param previously produced
  // `take: 0` (empty list). Default to 50 for non-positive/NaN values.
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  // Server-side search (Phase 11b — replaces client-side over-filtering).
  // Matches order number, table label, or cashier name (case-insensitive contains).
  const q = url.searchParams.get("q")?.trim() ?? "";

  const orders = await db.order.findMany({
    where: {
      ...(shiftId ? { shiftId } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { number: { in: q.split(/\s+/).map(Number).filter(Number.isFinite) } },
              { tableLabel: { contains: q } },
              { cashier: { name: { contains: q } } },
              { customer: { name: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      items: true,
      payments: true,
      cashier: { select: { name: true, username: true } },
      customer: { select: { name: true } },
      shift: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json(orders);
});

export const POST = withAuth(async (req, { user }) => {
  const body = await parseJson(req);
  const parsed = checkoutIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Commande invalide" },
      { status: 400 }
    );
  }
  const { items, payments, orderType, tableLabel, customerId, notes, discount } = parsed.data;

  // Require an open shift.
  const shift = await db.shift.findFirst({
    where: { status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
  if (!shift) {
    return NextResponse.json(
      { error: "Aucune caisse ouverte. Ouvrez une caisse d'abord." },
      { status: 409 }
    );
  }

  // --- Server-authoritative price computation ---
  let subtotal = 0;
  let itemCount = 0;
  const orderItemsData: {
    productId: string | null;
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    vatRate: number;
    optionsJson: string | null;
    addOnsJson: string | null;
    notes: string | null;
  }[] = [];

  for (const itemIntent of items) {
    const product = await db.product.findUnique({
      where: { id: itemIntent.productId },
      include: {
        category: {
          include: {
            optionGroups: { include: { choices: true } },
            addOns: true,
            parent: {
              include: {
                optionGroups: { include: { choices: true } },
                addOns: true,
              },
            },
          },
        },
        options: { include: { choices: true } },
        productAddons: { include: { addon: true } },
      },
    });
    if (!product || !product.active || !product.available) {
      return NextResponse.json(
        { error: `Produit introuvable ou indisponible : ${itemIntent.productId}` },
        { status: 400 }
      );
    }

    // Server-authoritative line pricing (pure function — see services/pricing.ts).
    const lineResult = computeLinePricing(itemIntent, product, orderType);
    if ("error" in lineResult) {
      return NextResponse.json({ error: lineResult.error }, { status: 400 });
    }
    subtotal += lineResult.lineTotal;
    itemCount += itemIntent.quantity;

    orderItemsData.push({
      productId: product.id,
      productName: product.name,
      unitPrice: lineResult.unitPrice,
      quantity: itemIntent.quantity,
      lineTotal: lineResult.lineTotal,
      // L-16/L-17 (Batch 3.1c): the effective rate, which may come from the
      // product's category. Snapshotted here on purpose — OrderItem.vatRate is
      // what every report reads, so a later category edit cannot restate a
      // sale that has already been made.
      vatRate: resolveVatRate(product),
      optionsJson: lineResult.optionsJson,
      addOnsJson: lineResult.addOnsJson,
      notes: itemIntent.notes ?? null,
    });
  }

  // Compute discount server-side (all values in cents)
  let discountTotal = 0;
  if (discount) {
    if (discount.type === "PERCENT") {
      // Percent discount: subtotal * value / 100 — round to nearest cent.
      discountTotal = Math.round((subtotal * Math.min(discount.value, 100)) / 100);
    } else {
      // Amount discount: clamped to subtotal (can't discount more than the order).
      discountTotal = Math.min(discount.value, subtotal);
    }
  }

  // Record the discount approver above the configured threshold.
  const discountPercent = subtotal > 0 ? (discountTotal / subtotal) * 100 : 0;
  const settings = await getSettings();
  const threshold = settings.discountApprovalThreshold ?? 20;
  let discountApproverId: string | null = null;
  // Batch 4.4b removed the CASHIER arm of this gate along with the role
  // (DD-07). It required a fresh signed manager approval token above the
  // threshold; with no cashier account it could never fire, and every caller
  // now takes the branch below. `discount.approvalToken` is consequently
  // ignored here — it already was for MANAGER and SUPER_ADMIN, so no caller's
  // behaviour changes. The token machinery itself is kept, not deleted: the
  // refund route still verifies one, and Batch 4.4c reuses Batch 4.1's
  // lockout for the step-up PIN that replaces this (DD-19).
  //
  // What this leaves is self-approval with no keystroke: above the threshold
  // the caller is recorded as their own approver. That is the gap DD-19 was
  // answered to close, and Batch 4.4c is where it closes.
  if (discountPercent > threshold) {
    discountApproverId = user.id;
  }

  // Validate payments cover the total exactly (cents).
  const totalAfterDiscount = subtotal - discountTotal;
  const paidTotal = sum2(payments.map((p) => p.amount));
  if (paidTotal !== totalAfterDiscount) {
    return NextResponse.json(
      {
        error: `Paiement incorrect : ${(paidTotal / 100).toFixed(2)} € ≠ ${(totalAfterDiscount / 100).toFixed(2)} €`,
      },
      { status: 400 }
    );
  }

  // Livraison validation: customer must exist and have name+phone+address
  if (orderType === "LIVRAISON") {
    if (!customerId) {
      return NextResponse.json(
        { error: "Un client est obligatoire pour une livraison." },
        { status: 400 }
      );
    }
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer || !customer.name || !customer.phone || !customer.address) {
      return NextResponse.json(
        { error: "Le client doit avoir un nom, un téléphone et une adresse pour la livraison." },
        { status: 400 }
      );
    }
  }

  // --- Transaction: numbering + order + receipt + audit all atomic ---
  // C-15 (Batch 2.3): an explicit budget. Prisma's default is 5 s and this
  // body performs 8+ sequential writes — exceeding it rolls back the sale
  // AFTER the customer has paid, which is the worst moment to fail.
  const order = await db.$transaction(async (tx) => {
    const number = await nextReceiptNumber(tx);

    // VAT on net-of-discount amounts, with the discount distributed across the
    // lines EXACTLY (M-13, Batch 3.2). Each line used to round on its own —
    // `Math.round(lineTotal × (1 − discountRatio))` — so `Σ netLineTotal` need
    // not equal `total − discount`, and the stored `vatTotal` could sit a cent
    // or two off the order it belongs to. `apportion` gives every line its
    // floor and hands the leftover cents to the largest remainders, so the
    // parts always sum to the whole and the split is deterministic.
    const vatBreakdown: VatBreakdown = {};
    const lineNets = apportion(orderItemsData.map((i) => i.lineTotal), totalAfterDiscount);
    orderItemsData.forEach((item, idx) => {
      addToVatBreakdown(vatBreakdown, lineNets[idx], item.vatRate);
    });
    const vatTotal = sum2(Object.values(vatBreakdown).map((v) => v.vat));

    const created = await tx.order.create({
      data: {
        number,
        shiftId: shift.id,
        cashierId: user.id,
        customerId: customerId ?? null,
        status: "COMPLETED",
        orderType,
        tableLabel: tableLabel ?? null,
        subtotal,
        vatTotal,
        discountTotal,
        // C-13 (Batch 3.5): the approval was verified above and then thrown
        // away. Persisted here so a manager can be shown which discounts they
        // authorised, and a dispute can be settled from the data.
        discountApprovedById: discountApproverId,
        total: totalAfterDiscount,
        notes: notes ?? null,
        itemCount,
        completedAt: new Date(),
      },
    });

    for (const item of orderItemsData) {
      await tx.orderItem.create({
        data: {
          orderId: created.id,
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          vatRate: item.vatRate,
          optionsJson: item.optionsJson,
          addOnsJson: item.addOnsJson,
          notes: item.notes,
        },
      });
    }

    for (const p of payments) {
      await tx.payment.create({
        data: {
          orderId: created.id,
          method: p.method,
          amount: p.amount,
          tendered: p.tendered ?? null,
          change: p.tendered ? p.tendered - p.amount : null,
          cashierId: user.id,
        },
      });
    }

    // Auto-link table: if dine-in with a tableLabel matching a Table, set it OCCUPIED.
    if (orderType === "DINE_IN" && tableLabel) {
      const table = await tx.table.findUnique({ where: { label: tableLabel } });
      if (table) {
        await tx.table.update({
          where: { id: table.id },
          data: { status: "OCCUPIED", currentOrderId: created.id },
        });
      }
    }

    const orderWithRelations = await tx.order.findUnique({
      where: { id: created.id },
      include: {
        items: true,
        payments: true,
        cashier: { select: { name: true, username: true } },
        customer: { select: { name: true } },
        shift: { select: { number: true } },
      },
    });

    // Persist receipt snapshot for fiscal immutability (inside the same transaction)
    const receiptText = renderReceipt(orderWithRelations as unknown as import("@/types/api").OrderDto, settings as import("@/types/api").SettingsDto);
    await tx.receipt.create({
      data: {
        orderId: created.id,
        content: receiptText,
        receiptNumber: number,
        printStatus: "PENDING",
        reprintCount: 0,
      },
    });

    // --- Fiscal journal (JFP) — ISCA sécurisation/inaltérabilité ---
    // Append a hash-chained VENTE event + update the perpetual grand total,
    // atomically with the order so the journal can never desync from sales.
    const payCash = sum2(payments.filter((p) => p.method === "CASH").map((p) => p.amount));
    const payCard = sum2(payments.filter((p) => p.method === "CARD").map((p) => p.amount));
    const payVoucher = sum2(payments.filter((p) => p.method === "VOUCHER").map((p) => p.amount));
    // C-13 (Batch 3.5): both payloads are built by the shared helpers in
    // services/sale-journal.ts, so the tests exercise this code rather than a
    // reimplementation of it.
    const saleJournal = {
      orderNumber: number,
      total: totalAfterDiscount,
      subtotal,
      vatTotal,
      discountTotal,
      discountApprovedById: discountApproverId,
      itemCount,
      orderType,
      payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
      cashierId: user.id,
    };
    const ev = await appendFiscalEvent(tx, {
      type: "VENTE",
      userId: user.id,
      factice: settings.factice ?? false,
      orderId: created.id,
      shiftId: shift.id,
      data: buildVentePayload(saleJournal),
    });
    await tx.order.update({ where: { id: created.id }, data: { fiscalEventId: ev.id } });
    await incrementGrandTotal(tx, {
      total: totalAfterDiscount,
      vatTotal,
      cash: payCash,
      card: payCard,
      voucher: payVoucher,
    });

    // Audit inside transaction
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: "ORDER_CREATED",
        entity: "Order",
        entityId: created.id,
        details: JSON.stringify(buildOrderAuditDetails(saleJournal)),
      },
    });

    return orderWithRelations;
  }, TX_CHECKOUT);

  return NextResponse.json(order, { status: 201 });
});
