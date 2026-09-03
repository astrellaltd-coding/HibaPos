import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams } from "@/lib/api-handler";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";
import { printReceiptText } from "@/lib/services/printer";

export const POST = withAuthParams(
  async (_req, { user, params }) => {
    const orderId = params.id;

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { receipt: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
    }

    const receipt = order.receipt;
    if (!receipt) {
      return NextResponse.json({ error: "Aucun reçu trouvé pour cette commande." }, { status: 404 });
    }

    const settings = await getSettings();

    // Transactionally increment reprintCount and append [COPIE] to content copy
    const updated = await db.$transaction(async (tx) => {
      // printStatus is set from the actual print outcome after the
      // transaction — a REIMPRESSION must be journalled even if the paper
      // never comes out, but the receipt must not claim to have printed.
      const fresh = await tx.receipt.update({
        where: { id: receipt.id },
        data: { reprintCount: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "RECEIPT_REPRINTED",
          entity: "Receipt",
          entityId: receipt.id,
          details: JSON.stringify({ orderId, orderNumber: order.number, reprintCount: fresh.reprintCount }),
        },
      });

      // --- Fiscal journal (JFP) — réimpression tracée (ISCA traçabilité) ---
      await appendFiscalEvent(tx, {
        type: "REIMPRESSION",
        userId: user.id,
        factice: settings.factice ?? false,
        orderId: order.id,
        data: {
          orderNumber: order.number,
          receiptId: receipt.id,
          reprintCount: fresh.reprintCount,
        },
      });

      return fresh;
    });

    const copieContent = receipt.content + "\n\n[COPIE — Tirage N° " + updated.reprintCount + "]";

    // Physically print the copy (C-03, Batch 1.3). The drawer is NOT kicked
    // on a reprint: nothing is being tendered, so there is no reason to open
    // the till — a reprint that opened the drawer would be a way around the
    // traced manual-open path.
    const outcome = await printReceiptText(copieContent);
    await db.receipt.update({
      where: { id: receipt.id },
      data: outcome.ok
        ? { printStatus: "PRINTED", printedAt: new Date() }
        : { printStatus: "FAILED" },
    });

    return NextResponse.json(
      {
        id: updated.id,
        content: copieContent,
        reprintCount: updated.reprintCount,
        createdAt: updated.createdAt,
        printed: outcome.ok,
        ...(outcome.ok ? {} : { printMessage: outcome.message }),
      },
      { status: 201 }
    );
  },
  // Cashier should not silently reprint archived tickets — a MANAGER+ audit trail
  // is enforced. Cashier reprints can be wired later if business rules require.
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
