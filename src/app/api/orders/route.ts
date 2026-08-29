import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { nextReceiptNumber } from "@/lib/services/sequence";
import { renderReceipt } from "@/lib/services/receipt";
import { getSettings } from "@/lib/services/settings";
import { appendFiscalEvent, incrementGrandTotal } from "@/lib/services/fiscal";
import { sum2, addToVatBreakdown } from "@/lib/money";
import { verifyApprovalToken, ApprovalError } from "@/lib/approvals";

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
      approvalToken: z.string().optional(), // recommended: signed single-use token from /api/auth/approve
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

    // Sub-categories are folders: products inherit options/add-ons from the parent category.
    const effectiveCategory = product.category?.parent ?? product.category;

    // Determine base price by order type
    let basePrice = product.price;
    if (orderType === "TAKEAWAY" && product.pickupPrice != null) {
      basePrice = product.pickupPrice;
    } else if (orderType === "LIVRAISON" && product.deliveryPrice != null) {
      basePrice = product.deliveryPrice;
    }

    // Merge category options + product options for validation.
    // Products marked `inheritCategoryGlobals=false` skip the category-level
    // groups/add-ons entirely and only use their own.
    const allOptions = [
      ...(product.inheritCategoryGlobals ? (effectiveCategory?.optionGroups ?? []) : []),
      ...(product.options ?? []),
    ];

    // Validate and apply options
    let optionsModifier = 0;
    const chosenOptions: { group: string; choice: string; priceModifier: number }[] = [];
    const selectedOptionIds = new Set(itemIntent.optionIds);

    for (const group of allOptions) {
      const selectedInGroup = group.choices.filter((c: { id: string }) => selectedOptionIds.has(c.id));
      if (group.required && selectedInGroup.length === 0) {
        return NextResponse.json(
          { error: `Option obligatoire manquante : ${group.name}` },
          { status: 400 }
        );
      }
      if (!group.multiple && selectedInGroup.length > 1) {
        return NextResponse.json(
          { error: `Une seule sélection autorisée pour : ${group.name}` },
          { status: 400 }
        );
      }
      for (const choice of selectedInGroup) {
        // Pick the modifier appropriate to the orderType, mirroring the
        // serializer in catalog/products/route.ts exactly:
        //   - A choice carrying an ABSOLUTE price (CategoryOptionChoice
        //     pickupPrice / deliveryPrice — e.g. the "Taille" size group)
        //     REPLACES the mode's base price. The effective modifier is
        //     (absolute − modeBase), NOT the raw absolute value.
        //   - Otherwise use the mode-specific modifier, falling back to the
        //     default priceModifier.
        const c = choice as {
          priceModifier: number;
          pickupPriceModifier?: number | null;
          deliveryPriceModifier?: number | null;
          pickupPrice?: number | null;
          deliveryPrice?: number | null;
          name: string;
        };
        let modifier = c.priceModifier;
        if (c.pickupPrice != null) {
          // Absolute choice price (category-level only). deliveryPrice
          // defaults to the pickup absolute when unset (serializer parity).
          const absPickup = c.pickupPrice;
          const absDelivery = c.deliveryPrice != null ? c.deliveryPrice : absPickup;
          if (orderType === "TAKEAWAY") {
            modifier = absPickup - basePrice;
          } else if (orderType === "LIVRAISON") {
            modifier = absDelivery - basePrice;
          } else {
            // DINE_IN: serializer relativizes against the dine-in base.
            modifier = absPickup - product.price;
          }
        } else if (orderType === "TAKEAWAY" && c.pickupPriceModifier != null) {
          modifier = c.pickupPriceModifier;
        } else if (orderType === "LIVRAISON" && c.deliveryPriceModifier != null) {
          modifier = c.deliveryPriceModifier;
        }
        optionsModifier += modifier;
        chosenOptions.push({ group: group.name, choice: choice.name, priceModifier: modifier });
      }
    }

    // Merge category addon IDs + product addon IDs for validation.
    // Products marked `inheritCategoryGlobals=false` skip the category-level
    // add-ons entirely and only use their own ProductAddon relations.
    const categoryAddonIds = new Set(
      product.inheritCategoryGlobals
        ? (effectiveCategory?.addOns ?? []).map((a: { id: string }) => a.id)
        : []
    );
    const productAddonIds = new Set(product.productAddons.map((pa) => pa.addonId));
    const availableAddonIds = new Set([...categoryAddonIds, ...productAddonIds]);

    // Build a lookup map for all valid add-ons.
    const addonMap = new Map<string, { id: string; name: string; price: number; active: boolean }>();
    if (product.inheritCategoryGlobals) {
      for (const a of effectiveCategory?.addOns ?? []) {
        addonMap.set(a.id, a);
      }
    }
    for (const pa of product.productAddons) {
      addonMap.set(pa.addon.id, pa.addon);
    }

    // Validate and apply addons
    let addonsTotal = 0;
    const chosenAddons: { id: string | null; name: string; price: number }[] = [];

    for (const aIntent of itemIntent.addons) {
      if (!availableAddonIds.has(aIntent.addonId)) {
        return NextResponse.json(
          { error: `Supplément non disponible pour ce produit : ${aIntent.addonId}` },
          { status: 400 }
        );
      }
      const addon = addonMap.get(aIntent.addonId);
      if (!addon || !addon.active) {
        return NextResponse.json(
          { error: `Supplément introuvable ou inactif : ${aIntent.addonId}` },
          { status: 400 }
        );
      }
      addonsTotal += addon.price * aIntent.quantity;
      chosenAddons.push({ id: addon.id, name: addon.name, price: addon.price });
    }

    const unitPrice = basePrice + optionsModifier;
    const lineTotal = (unitPrice + addonsTotal) * itemIntent.quantity;
    subtotal += lineTotal;
    itemCount += itemIntent.quantity;

    orderItemsData.push({
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity: itemIntent.quantity,
      lineTotal,
      vatRate: product.vatRate,
      optionsJson: chosenOptions.length ? JSON.stringify(chosenOptions) : null,
      addOnsJson: chosenAddons.length ? JSON.stringify(chosenAddons) : null,
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

  // Enforce discount approval threshold.
  const discountPercent = subtotal > 0 ? (discountTotal / subtotal) * 100 : 0;
  const settings = await getSettings();
  const threshold = settings.discountApprovalThreshold ?? 20;
  let discountApproverId: string | null = null;
  if (discountPercent > threshold + 0.01 && user.role === "CASHIER") {
    // Cashier exceeded threshold — require a fresh signed manager approval token.
    const approvalToken = discount?.approvalToken;
    if (!approvalToken) {
      return NextResponse.json(
        { error: `Remise supérieure au seuil (${threshold}%) — token d'approbation manager requis.` },
        { status: 400 },
      );
    }
    try {
      const result = verifyApprovalToken(approvalToken, {
        action: "DISCOUNT",
        amount: discountTotal,
      });
      discountApproverId = result.approverId;
    } catch (e) {
      const status = e instanceof ApprovalError ? e.status : 500;
      const message = e instanceof Error ? e.message : "Token d'approbation invalide.";
      return NextResponse.json({ error: message }, { status });
    }
    // Sanity-check the approver is still active and a MANAGER+.
    const approver = await db.user.findUnique({
      where: { id: discountApproverId, active: true },
      select: { role: true },
    });
    if (!approver || (approver.role !== "MANAGER" && approver.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Approbateur invalide ou non autorisé." }, { status: 403 });
    }
  } else if (discountPercent > threshold && (user.role === "MANAGER" || user.role === "SUPER_ADMIN")) {
    // A manager/super-admin approver can self-approve their own discount.
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
  const order = await db.$transaction(async (tx) => {
    const number = await nextReceiptNumber(tx);

    // VAT on net-of-discount amounts (distribute discount pro-rata per line).
    // All values are cents; the ratio multiplication may produce a fractional
    // cent — round to the nearest integer cent.
    const vatBreakdown: Record<number, { ht: number; vat: number; ttc: number }> = {};
    const discountRatio = subtotal > 0 ? discountTotal / subtotal : 0;
    for (const item of orderItemsData) {
      const netLineTotal = Math.round(item.lineTotal * (1 - discountRatio));
      addToVatBreakdown(vatBreakdown, netLineTotal, item.vatRate);
    }
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
    const ev = await appendFiscalEvent(tx, {
      type: "VENTE",
      userId: user.id,
      factice: settings.factice ?? false,
      orderId: created.id,
      shiftId: shift.id,
      data: {
        orderNumber: number,
        total: totalAfterDiscount,
        subtotal,
        vatTotal,
        discountTotal,
        itemCount,
        orderType,
        payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
        cashierId: user.id,
      },
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
        details: JSON.stringify({ number, total: totalAfterDiscount, items: itemCount, payments: payments.length }),
      },
    });

    return orderWithRelations;
  });

  return NextResponse.json(order, { status: 201 });
});
