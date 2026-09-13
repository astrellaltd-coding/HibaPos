import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth, parseJson } from "@/lib/api-handler";
import { z } from "zod";
import { getSettings } from "@/lib/services/settings";
import { computeLinePricing, resolveVatRate } from "@/lib/services/pricing";
import { priceComboItem, COMBO_MENU_INCLUDE, type MenuWithSlots } from "@/lib/services/combo-checkout";
import { sum2 } from "@/lib/money";
import { consumeStepUpToken } from "@/lib/services/step-up";
import { discountNeedsStepUp } from "@/lib/discount-policy";
import { checkTenderComposition, TENDER_METHODS } from "@/lib/tender-policy";
import { MAX_ITEM_QUANTITY } from "@/lib/order-limits";
import {
  createOrderInTransaction,
  CheckoutError,
  isShiftStillOpen,
  SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE,
} from "@/lib/services/checkout";
import type { SettingsDto } from "@/types/api";

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
        // M-16 (Batch 5.7c): an upper bound. There was none, so a client
        // could ask for any quantity a 32-bit int holds and the server would
        // price it. 99 is a till bound, not a business rule — the largest
        // quantity ever sold on this install is 2, and 81 of 82 lines are 1.
        // The message is French on purpose. **L-22** is that zod's own
        // English text ("Too big: expected number to be <=99") reaches the
        // operator untranslated; that finding stays with Batch 7.1, but a
        // bound added HERE must not enlarge it.
        quantity: z
          .number()
          .int()
          .min(1)
          .max(MAX_ITEM_QUANTITY, `Quantité maximale : ${MAX_ITEM_QUANTITY} par ligne.`),
        notes: z.string().optional().nullable(),
        optionIds: z.array(z.string()).default([]),
        // L-127 (R8.5): bounded, for M-16's reason. The item quantity a few
        // fields up carries `.max(MAX_ITEM_QUANTITY)` and this did not —
        // measured, a quantity of 100 000 booked a 150 011,90 € line into the
        // fiscal journal. Same bound, same French message.
        addons: z.array(
          z.object({
            addonId: z.string(),
            quantity: z
              .number()
              .int()
              .min(1)
              .max(MAX_ITEM_QUANTITY, `Quantité maximale : ${MAX_ITEM_QUANTITY} par supplément.`)
              .default(1),
          })
        ).default([]),
        // Batch 5.9 — a menu composé, one entry per seat, IN SLOT ORDER.
        //
        // Intent only, like everything else this schema accepts: the server
        // re-reads every reference price, re-resolves every rate and re-runs
        // the allocation from the catalogue. A basket cannot choose what a
        // component is worth any more than it can choose its own tax.
        //
        // The seat count is not bounded here because it is not a free number:
        // `priceComboItem` requires exactly as many components as the menu has
        // seats, so the menu's own configuration is the bound.
        components: z
          .array(
            z.object({
              slotId: z.string(),
              productId: z.string(),
              optionIds: z.array(z.string()).default([]),
              addons: z
                .array(z.object({ addonId: z.string(), quantity: z.number().int().min(1).default(1) }))
                .default([]),
              notes: z.string().optional().nullable(),
            })
          )
          .optional(),
      })
    )
    .min(1, "La commande est vide"),
  discount: z
    .object({
      type: z.enum(["PERCENT", "AMOUNT"]),
      // M-12 (Batch 5.7c). This comment said "percent×100 (PERCENT)" and was
      // WRONG: the branch below computes `subtotal * min(value, 100) / 100`,
      // i.e. a PLAIN percent. A client that believed the comment and sent 2500
      // for 25 % would have been clamped to 100 and given the whole order
      // away. The code is right and the comment was corrected — not the other
      // way round — because the UI has only ever sent AMOUNT, so no caller
      // depends on the documented reading.
      value: z.number().int().min(0), // cents when AMOUNT; a plain 0-100 percent when PERCENT
      approvedById: z.string().optional(), // legacy — only honored for MANAGER+/SUPER_ADMIN callers
      // DD-19, Batch 4.4c: the caller's own step-up confirmation, issued by
      // `POST /api/auth/step-up` and bound to (this caller, DISCOUNT, this
      // amount in cents). Required above `discountApprovalThreshold`.
      //
      // It REPLACES the manager `approvalToken` this schema accepted and
      // ignored between Batches 4.4b and 4.4c (operator decision,
      // 2026-09-04). A checkout that still sends the old field is now
      // refused above the threshold rather than silently self-approved,
      // which is the point of the batch.
      stepUpToken: z.string().optional(),
    })
    .optional(),
  notes: z.string().max(500).optional().nullable(),
  // L-89 / L-90 (R8.2) — the till's key for ONE checkout attempt.
  //
  // Optional, deliberately: a client that does not send one checks out exactly
  // as it did before, which is what keeps this from being a breaking change
  // for the e2e suite and for whatever the Tauri build later grows. When it IS
  // sent, the sale is written at most once however many times this request
  // arrives — a double-tap on « Valider » booked it twice, and `GrandTotal` is
  // never decremented, so that second sale was permanent.
  //
  // Bounded and pattern-free on purpose: it is an opaque token the server never
  // parses. The length cap is so a client cannot use it as storage.
  idempotencyKey: z.string().min(8).max(100).optional().nullable(),
  payments: z
    .array(
      z.object({
        // DD-14 (Batch 5.7b): `OFFERT` joins the three paid tenders, and
        // `amount` relaxes from `min(1)` to `min(0)` — an « offert » line
        // carries nothing by definition. The guarantee that relaxation gives
        // up (a PAID line must carry a real amount) is not lost: it moves to
        // `checkTenderComposition`, which the handler runs below, alongside
        // the two rules that stop this tender inflating revenue.
        //
        // `.min(1, "Au moins un paiement")` on the ARRAY is untouched and must
        // stay: an offert sale sends exactly one line, so a checkout with no
        // payments at all is still refused here.
        method: z.enum(TENDER_METHODS),
        amount: z.number().int().min(0), // cents; only OFFERT may be 0
        tendered: z.number().int().min(0).optional(), // cents
      })
        // L-128 (R8.5) — `tendered` below `amount` printed a NEGATIVE change
        // onto a sealed ticket. Measured: amount 1190, tendered 500 →
        // `Payment.change = -690`, receipt « Reçu 5,00 € — Rendu -6,90 € ».
        //
        // REFUSED, not clamped, and the audit says why: it lands on an
        // immutable document. `Math.max(0, …)` would print « Rendu 0,00 € »
        // over a bill that was never covered, and nothing would ever say so.
        // A refusal reaches the cashier while the customer is still there.
        .refine((pay) => pay.tendered == null || pay.tendered >= pay.amount, {
          message: "Le montant reçu ne peut pas être inférieur au montant réglé.",
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
  //
  // DD-13 (Batch 5.6). This list used to name four values; the enum now holds
  // two, so `?status=CANCELLED` and `?status=PENDING` answer **400 instead of
  // an empty list**. That is a deliberate narrowing of the API contract, not a
  // side effect: a filter that accepts a status no row can hold is the same
  // claim the enum was making, and keeping it would need a cast past the
  // generated type — reopening exactly the 500 this check was added to close.
  // The app itself never sent either value: `StatusFilter` in orders-view.tsx
  // has always offered only ALL / COMPLETED / REFUNDED, so nothing in the
  // product changes. Keep this list derived from the enum, not from habit.
  const STATUS_ENUM = z.enum(["COMPLETED", "REFUNDED"]);
  const statusParse = statusRaw ? STATUS_ENUM.safeParse(statusRaw) : null;
  if (statusRaw && !statusParse?.success) {
    return NextResponse.json(
      { error: `Statut invalide : ${statusRaw} (valeurs acceptées : ${STATUS_ENUM.options.join(", ")})` },
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
  const { items, payments, orderType, tableLabel, customerId, notes, discount, idempotencyKey } =
    parsed.data;

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

  // L-94 (R8.5): read BEFORE the loop, because `defaultVatRate` is what a
  // supplement's own rate falls back to and the loop needs it per line. It was
  // read after the loop for the discount threshold; one read serves both.
  const settings = await getSettings();

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
    // Batch 5.9: set on the lines of a menu composé, null on every other.
    comboGroupId?: string | null;
    comboName?: string | null;
    comboPrice?: number | null;
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
        // Batch 5.9. Always fetched, because whether this product is a menu is
        // not knowable until it has been read, and reading it twice to find out
        // would be a second query per line on the hottest path in the app.
        ...COMBO_MENU_INCLUDE,
      },
    });
    if (!product || !product.active || !product.available) {
      return NextResponse.json(
        { error: `Produit introuvable ou indisponible : ${itemIntent.productId}` },
        { status: 400 }
      );
    }

    // ---- a menu composé explodes into one line per component (Batch 5.9d) ----
    //
    // WHY IT CANNOT STAY ONE LINE. `OrderItem` carries exactly one `vatRate`,
    // and every report, Z close and archive reads that column. A menu contains
    // items at two rates the moment it leaves the premises — a sealed drink is
    // 5,5 % à emporter and 10 % sur place (L-68) — so one line could only ever
    // book one of them. The forfait is divided by
    // `docs/politique-ventilation-tva.md` and each component books its share at
    // its own rate.
    if (product.isCombo) {
      const combo = await priceComboItem({
        menu: product as unknown as MenuWithSlots,
        components: itemIntent.components ?? [],
        quantity: itemIntent.quantity,
        orderType,
        groupId: crypto.randomUUID(),
      });
      if ("error" in combo) {
        return NextResponse.json({ error: combo.error }, { status: 400 });
      }
      for (const line of combo.lines) subtotal += line.lineTotal;
      // ONE article, not one per component. The menu is what the customer
      // bought and what the ticket's « N articles » counts.
      itemCount += itemIntent.quantity;
      orderItemsData.push(...combo.lines);
      continue;
    }

    // A basket may not attach a composition to something that is not a menu:
    // it would be silently ignored, and a silently ignored field on a checkout
    // is how a client and a server come to disagree about what was sold.
    if (itemIntent.components && itemIntent.components.length > 0) {
      return NextResponse.json(
        { error: `${product.name} n'est pas un menu composé.` },
        { status: 400 },
      );
    }

    // Server-authoritative line pricing (pure function — see services/pricing.ts).
    // L-94 (R8.5): the line's own rate, and the food rate a supplement falls
    // back to. Computed once and used both for the partition inside
    // `computeLinePricing` and for the row pushed below, so the two cannot
    // disagree about what rate this line carries.
    const hostVatRate = resolveVatRate(product, orderType);
    const lineResult = computeLinePricing(itemIntent, product, orderType, undefined, {
      defaultVatRate: settings.defaultVatRate,
      hostVatRate,
    });
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
      //
      // L-68 (Batch 3.12): and it depends on the ORDER TYPE. A sealed bottle or
      // can is 10 % sur place and 5,5 % à emporter et en livraison, so the same
      // product books at two different rates. This is the ONLY call site that
      // decides what is booked — the client sends a `vatRate` and it is ignored
      // here on purpose, which is why a tampered basket cannot choose its own
      // tax. `orderType` is the same value already driving `computeLinePricing`
      // twelve lines above.
      vatRate: hostVatRate,
      optionsJson: lineResult.optionsJson,
      addOnsJson: lineResult.addOnsJson,
      notes: itemIntent.notes ?? null,
    });

    // L-94 (R8.5) — a supplement whose rate differs from its host's is booked
    // as its OWN line, because `OrderItem` carries exactly one rate. Empty for
    // every sale this catalogue can currently make: all 21 add-ons sit on
    // Pizzas and Sandwichs at 10, which is also `defaultVatRate`. That is the
    // operator's decision of 2026-09-13 — fold while the rates agree, split
    // when they do not — so an ordinary ticket is unchanged.
    //
    // `productId` is null: a supplement is not a product, and pointing at the
    // HOST product would make `topProducts` count it as a sale of the dish.
    for (const extra of lineResult.separateAddOns) {
      subtotal += extra.lineTotal;
      orderItemsData.push({
        productId: null,
        productName: extra.name,
        unitPrice: extra.price,
        quantity: extra.quantity,
        lineTotal: extra.lineTotal,
        vatRate: extra.vatRate,
        optionsJson: null,
        addOnsJson: null,
        notes: `Supplément — ${product.name}`,
      });
    }
  }

  // Compute discount server-side (all values in cents)
  let discountTotal = 0;
  if (discount) {
    if (discount.type === "PERCENT") {
      // Percent discount: `value` is a PLAIN percent, 0-100 (M-12, Batch 5.7c
      // corrected the schema comment that claimed percent×100). Clamped at 100
      // so it can never exceed the order.
      discountTotal = Math.round((subtotal * Math.min(discount.value, 100)) / 100);
    } else {
      // Amount discount: clamped to subtotal (can't discount more than the order).
      discountTotal = Math.min(discount.value, subtotal);
    }
  }

  // Record the discount approver above the configured threshold.
  const threshold = settings.discountApprovalThreshold ?? 20;
  let discountApproverId: string | null = null;
  // DD-19, Batch 4.4c. Above the threshold the caller must have re-entered
  // their OWN PIN at `/api/auth/step-up` and must present the token it
  // issued, bound to this exact discount in cents. Until this batch the
  // caller was silently recorded as their own approver with no keystroke —
  // which is what let a passer-by at an unattended till apply a 100 %
  // discount.
  //
  // The trigger is `discountNeedsStepUp`, the same function the client
  // consults, so the rule that PROMPTS and the rule that RECORDS an approver
  // cannot drift apart. The amount bound is the SERVER's `discountTotal`
  // (clamped to the subtotal), not the value the request asked for: the
  // token must cover the discount that actually lands in the journal.
  //
  // Decided here, CONSUMED further down. The token is single-use, so burning
  // it before the payment and livraison checks would make a mistyped payment
  // cost the operator a second PIN entry for a sale that was never refused
  // on its own merits.
  const needsStepUp = discountNeedsStepUp(discountTotal, subtotal, threshold);

  const totalAfterDiscount = subtotal - discountTotal;

  // DD-14 (Batch 5.7b). The give-away tender's own rules, decided BEFORE the
  // step-up token is consumed further down — a checkout refused for a
  // malformed tender must not cost the operator a PIN entry, which is L-41's
  // shape and the mistake Batch 5.5 note 4 caught in its own code.
  //
  // Deliberately separate from the equality check below, which is older, owns
  // a different question, and still runs on every checkout including this one.
  const tender = checkTenderComposition(payments, totalAfterDiscount);
  if (!tender.ok) {
    return NextResponse.json({ error: tender.message }, { status: 400 });
  }

  // Validate payments cover the total exactly (cents). An offert sale passes
  // this unchanged: one OFFERT line of 0 against a total of 0.
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

  // L-41 (Batch 5.7c). Re-read the till RIGHT HERE, immediately before the
  // token is spent. The lookup near the top of this handler happened before
  // every product was priced — one database read each — so a Z close landing
  // during that work left the operator's single-use PIN consumed for a sale
  // the transaction was about to refuse anyway.
  //
  // This does not close the race and is not meant to: only the assertion
  // INSIDE the transaction can (C-15, Batch 4.7), and it is still there as the
  // guarantee. What this removes is the window that was costing a PIN entry.
  if (needsStepUp && !(await isShiftStillOpen(shift.id))) {
    return NextResponse.json({ error: SHIFT_CLOSED_DURING_CHECKOUT_MESSAGE }, { status: 409 });
  }

  // Consume the step-up confirmation (DD-19). Last check before the sale is
  // written, and the last one that can refuse it: everything above is cheap
  // validation of the request, and the token is single-use.
  if (needsStepUp) {
    const stepUp = await consumeStepUpToken({
      token: discount?.stepUpToken,
      callerId: user.id,
      action: "DISCOUNT",
      amount: discountTotal,
    });
    if (!stepUp.ok) {
      return NextResponse.json({ error: stepUp.message }, { status: stepUp.status });
    }
    discountApproverId = stepUp.approverId;
  }

  // --- Transaction: numbering + order + receipt + audit all atomic ---
  // C-15 (Batch 4.7): the body lives in services/checkout.ts so the shift-state
  // race has something to test. It re-asserts that this shift is still OPEN as
  // its first statement — the lookup above ran outside any transaction and can
  // be stale by the time the sale is written.
  let order;
  try {
    order = await createOrderInTransaction({
      shiftId: shift.id,
      cashierId: user.id,
      customerId: customerId ?? null,
      orderType,
      tableLabel: tableLabel ?? null,
      notes: notes ?? null,
      subtotal,
      discountTotal,
      totalAfterDiscount,
      discountApprovedById: discountApproverId,
      itemCount,
      items: orderItemsData,
      payments,
      settings: settings as unknown as SettingsDto,
      idempotencyKey: idempotencyKey ?? null,
    });
  } catch (e) {
    if (e instanceof CheckoutError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return NextResponse.json(order, { status: 201 });
});
