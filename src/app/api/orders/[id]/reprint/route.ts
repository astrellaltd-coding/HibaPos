import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuthParams } from "@/lib/api-handler";
import { appendFiscalEvent } from "@/lib/services/fiscal";
import { getSettings } from "@/lib/services/settings";

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
      const fresh = await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          reprintCount: { increment: 1 },
          printStatus: "PRINTED",
          printedAt: new Date(),
        },
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

    return NextResponse.json(
      {
        id: updated.id,
        content: copieContent,
        reprintCount: updated.reprintCount,
        createdAt: updated.createdAt,
      },
      { status: 201 }
    );
  },
  // Cashier should not silently reprint archived tickets — a MANAGER+ audit trail
  // is enforced. Cashier reprints can be wired later if business rules require.
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
