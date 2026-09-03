// Fiscal journal service — DB-bound operations for ISCA compliance.
// Pure hashing/canonicalization lives in src/lib/fiscal.ts (testable without a DB).
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  canonicalize,
  computeEventHash,
  computeCloseHash,
  verifyEventsChunk,
  verifyCloses,
  type FiscalEventType,
  type ChainVerifyResult,
} from "@/lib/fiscal";
import { nextFiscalEventSequence } from "@/lib/services/sequence";
import { addToVatBreakdown, sum2, type VatBreakdown } from "@/lib/money";
import { TX_FISCAL } from "@/lib/tx-options";

type Tx = Prisma.TransactionClient;

type AppendOpts = {
  type: FiscalEventType;
  userId?: string | null;
  factice?: boolean;
  data: Record<string, unknown>;
  orderId?: string | null;
  refundId?: string | null;
  zReportId?: string | null;
  shiftId?: string | null;
  closeId?: string | null;
  archiveId?: string | null;
};

/** Append a hash-chained event to the fiscal journal. MUST be called inside the
 *  caller's `$transaction` so the sequence assignment + hash computation are
 *  atomic with the business operation (sale, refund, clôture…). SQLite's
 *  single-writer lock serializes concurrent appends, keeping the chain
 *  consistent. */
export async function appendFiscalEvent(tx: Tx, opts: AppendOpts) {
  const sequence = await nextFiscalEventSequence(tx);
  const previous =
    sequence > 1
      ? await tx.fiscalEvent.findUnique({
          where: { sequence: sequence - 1 },
          select: { hash: true },
        })
      : null;
  const previousHash = previous?.hash ?? null;
  const timestamp = new Date();
  const dataJson = canonicalize(opts.data);
  const hash = computeEventHash(previousHash, sequence, opts.type, timestamp, dataJson);
  return tx.fiscalEvent.create({
    data: {
      sequence,
      type: opts.type,
      orderId: opts.orderId ?? null,
      refundId: opts.refundId ?? null,
      zReportId: opts.zReportId ?? null,
      shiftId: opts.shiftId ?? null,
      closeId: opts.closeId ?? null,
      archiveId: opts.archiveId ?? null,
      userId: opts.userId ?? null,
      factice: opts.factice ?? false,
      timestamp,
      dataJson,
      previousHash,
      hash,
    },
  });
}

// ---------------------------------------------------------------------------
// Grand total perpétuel — cumulative since the beginning of time, never resets.
// ---------------------------------------------------------------------------

export async function ensureGrandTotal(tx: Tx): Promise<void> {
  await tx.grandTotal.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

/** Increment the perpetual grand total for a completed sale. Gross cumulative
 *  (never decremented by refunds). Call inside the checkout transaction. */
export async function incrementGrandTotal(
  tx: Tx,
  sale: { total: number; vatTotal: number; cash: number; card: number; voucher: number },
): Promise<void> {
  await ensureGrandTotal(tx);
  await tx.grandTotal.update({
    where: { id: "singleton" },
    data: {
      totalSales: { increment: sale.total },
      totalOrders: { increment: 1 },
      totalVat: { increment: sale.vatTotal },
      totalCash: { increment: sale.cash },
      totalCard: { increment: sale.card },
      totalVoucher: { increment: sale.voucher },
      lastUpdatedAt: new Date(),
    },
  });
}

/** Record a refund against the perpetual grand total (tracked separately, does
 *  not decrement gross sales — refunds are corrections). */
export async function addRefundToGrandTotal(tx: Tx, refundAmount: number): Promise<void> {
  await ensureGrandTotal(tx);
  await tx.grandTotal.update({
    where: { id: "singleton" },
    data: { totalRefunded: { increment: refundAmount }, lastUpdatedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Chain verification
// ---------------------------------------------------------------------------

/** Walk the whole fiscal journal and recompute every hash; report the first
 *  break (tamper detection). */
export async function verifyFiscalChain(chunkSize = 1000): Promise<ChainVerifyResult> {
  // M-31 (Batch 2.4): walked in pages instead of loading the whole journal.
  // The journal is append-only and grows for the life of the business, so a
  // `findMany` with no `take` was a memory ceiling that arrives silently —
  // and this runs on a till. Each page carries the previous page's last hash
  // forward, so the check stays continuous across the seam, and the actual
  // verification is the same `verifyEventsChunk` the unit tests exercise.
  let cursorSequence = 0;
  let previousHash: string | null = null;
  let eventsChecked = 0;
  let lastSequence = 0;

  for (;;) {
    const page = await db.fiscalEvent.findMany({
      where: { sequence: { gt: cursorSequence } },
      orderBy: { sequence: "asc" },
      take: chunkSize,
      select: {
        sequence: true,
        type: true,
        timestamp: true,
        dataJson: true,
        previousHash: true,
        hash: true,
      },
    });
    if (page.length === 0) break;

    const result = verifyEventsChunk(page, previousHash);
    eventsChecked += result.checked;
    if (result.lastSequence) lastSequence = result.lastSequence;

    if (!result.ok) {
      // Report the true tail sequence so the caller can see how far the
      // journal actually runs past the break.
      const tail = await db.fiscalEvent.findFirst({
        orderBy: { sequence: "desc" },
        select: { sequence: true },
      });
      return {
        ok: false,
        eventsChecked,
        firstBreakAt: result.firstBreakAt,
        lastSequence: tail?.sequence ?? lastSequence,
      };
    }

    previousHash = result.lastHash;
    cursorSequence = page[page.length - 1].sequence;
    if (page.length < chunkSize) break;
  }

  return { ok: true, eventsChecked, firstBreakAt: null, lastSequence };
}

export async function verifyMonthlyCloses(): Promise<ChainVerifyResult> {
  const closes = await db.monthlyClose.findMany({
    orderBy: { period: "asc" },
    select: { period: true, sealedAt: true, dataJson: true, previousHash: true, hash: true },
  });
  return verifyCloses(
    closes.map((c) => ({
      period: c.period,
      timestamp: c.sealedAt,
      dataJson: c.dataJson,
      previousHash: c.previousHash,
      hash: c.hash,
    })),
  );
}

export async function verifyAnnualCloses(): Promise<ChainVerifyResult> {
  const closes = await db.annualClose.findMany({
    orderBy: { period: "asc" },
    select: { period: true, sealedAt: true, dataJson: true, previousHash: true, hash: true },
  });
  return verifyCloses(
    closes.map((c) => ({
      period: c.period,
      timestamp: c.sealedAt,
      dataJson: c.dataJson,
      previousHash: c.previousHash,
      hash: c.hash,
    })),
  );
}

// ---------------------------------------------------------------------------
// Period aggregation (net of refund, pro-rata per line — mirrors reports.ts)
// ---------------------------------------------------------------------------

type PeriodAgg = {
  salesTotal: number; // cents
  salesCount: number;
  vatTotal: number; // cents
  cashTotal: number; // cents
  cardTotal: number; // cents
  voucherTotal: number; // cents
  discountsTotal: number; // cents
  totalRefunded: number; // cents
  vatBreakdown: VatBreakdown;
  topProducts: { name: string; quantity: number; total: number }[]; // total in cents
};

async function aggregatePeriod(from: Date, to: Date): Promise<PeriodAgg> {
  const orders = await db.order.findMany({
    where: { createdAt: { gte: from, lt: to }, status: { in: ["COMPLETED", "REFUNDED"] } },
    include: { items: true, refunds: true, payments: true },
  });

  let salesTotal = 0;
  let discountsTotal = 0;
  let totalRefunded = 0;
  let salesCount = 0;
  const vatBreakdown: VatBreakdown = {};
  const productAgg: Record<string, { name: string; quantity: number; total: number }> = {};

  for (const order of orders) {
    const orderRefundsTotal = sum2(order.refunds.map((r) => r.amount));
    totalRefunded = totalRefunded + orderRefundsTotal;
    // Fully refunded orders are excluded from sales totals + count.
    if (orderRefundsTotal >= order.total) continue; // exact integer compare (cents)

    salesCount += 1;
    const refundRatio = order.total > 0 ? Math.min(1, orderRefundsTotal / order.total) : 0;
    const netTotal = order.total - orderRefundsTotal;
    salesTotal = salesTotal + netTotal;
    discountsTotal = discountsTotal + order.discountTotal;

    const discountRatio = order.subtotal > 0 ? order.discountTotal / order.subtotal : 0;
    for (const item of order.items) {
      const netLineTotal = Math.round(
        item.lineTotal * (1 - discountRatio) * (1 - refundRatio)
      );
      const vatRate = item.vatRate ?? 10;
      addToVatBreakdown(vatBreakdown, netLineTotal, vatRate);
      const key = item.productName;
      productAgg[key] ??= { name: item.productName, quantity: 0, total: 0 };
      productAgg[key].quantity += item.quantity;
      productAgg[key].total = productAgg[key].total + netLineTotal;
    }
  }

  const payments = orders.flatMap((o) => o.payments);
  const cashTotal = sum2(payments.filter((p) => p.method === "CASH").map((p) => p.amount));
  const cardTotal = sum2(payments.filter((p) => p.method === "CARD").map((p) => p.amount));
  const voucherTotal = sum2(payments.filter((p) => p.method === "VOUCHER").map((p) => p.amount));
  const vatTotal = sum2(Object.values(vatBreakdown).map((v) => v.vat));
  const topProducts = Object.values(productAgg)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 20);

  return {
    salesTotal,
    salesCount,
    vatTotal,
    cashTotal,
    cardTotal,
    voucherTotal,
    discountsTotal,
    totalRefunded,
    vatBreakdown,
    topProducts,
  };
}

// ---------------------------------------------------------------------------
// Monthly / annual clôtures (sealed + chained)
// ---------------------------------------------------------------------------

export async function closeMonth(
  year: number,
  month: number,
  sealedById: string,
  factice = false,
) {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const existing = await db.monthlyClose.findUnique({ where: { period } });
  if (existing) throw new Error(`Clôture mensuelle déjà effectuée pour ${period}`);

  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);
  const agg = await aggregatePeriod(from, to);

  return db.$transaction(async (tx) => {
    const prev = await tx.monthlyClose.findFirst({
      orderBy: { period: "desc" },
      select: { hash: true },
    });
    const previousHash = prev?.hash ?? null;
    const timestamp = new Date();
    const dataPayload = {
      period,
      year,
      month,
      ...agg,
    };
    const dataJson = canonicalize(dataPayload);
    const hash = computeCloseHash(previousHash, period, timestamp, dataJson);

    const close = await tx.monthlyClose.create({
      data: {
        period,
        year,
        month,
        salesTotal: agg.salesTotal,
        salesCount: agg.salesCount,
        vatTotal: agg.vatTotal,
        cashTotal: agg.cashTotal,
        cardTotal: agg.cardTotal,
        voucherTotal: agg.voucherTotal,
        discountsTotal: agg.discountsTotal,
        vatBreakdownJson: JSON.stringify(agg.vatBreakdown),
        topProductsJson: JSON.stringify(agg.topProducts),
        dataJson,
        sealedAt: timestamp,
        sealedById,
        previousHash,
        hash,
      },
    });

    const ev = await appendFiscalEvent(tx, {
      type: "CLOTURE_M",
      userId: sealedById,
      factice,
      data: { period, closeId: close.id, salesTotal: agg.salesTotal, salesCount: agg.salesCount, vatTotal: agg.vatTotal },
      closeId: close.id,
    });
    await tx.monthlyClose.update({ where: { id: close.id }, data: { fiscalEventId: ev.id } });
    return tx.monthlyClose.findUniqueOrThrow({ where: { id: close.id } });
  }, TX_FISCAL);
}

export async function closeYear(year: number, sealedById: string, factice = false) {
  const period = String(year);
  const existing = await db.annualClose.findUnique({ where: { period } });
  if (existing) throw new Error(`Clôture annuelle déjà effectuée pour ${period}`);

  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);
  const agg = await aggregatePeriod(from, to);

  return db.$transaction(async (tx) => {
    const prev = await tx.annualClose.findFirst({
      orderBy: { period: "desc" },
      select: { hash: true },
    });
    const previousHash = prev?.hash ?? null;
    const timestamp = new Date();
    const dataPayload = { period, year, ...agg };
    const dataJson = canonicalize(dataPayload);
    const hash = computeCloseHash(previousHash, period, timestamp, dataJson);

    const close = await tx.annualClose.create({
      data: {
        period,
        year,
        salesTotal: agg.salesTotal,
        salesCount: agg.salesCount,
        vatTotal: agg.vatTotal,
        cashTotal: agg.cashTotal,
        cardTotal: agg.cardTotal,
        voucherTotal: agg.voucherTotal,
        discountsTotal: agg.discountsTotal,
        vatBreakdownJson: JSON.stringify(agg.vatBreakdown),
        topProductsJson: JSON.stringify(agg.topProducts),
        dataJson,
        sealedAt: timestamp,
        sealedById,
        previousHash,
        hash,
      },
    });

    const ev = await appendFiscalEvent(tx, {
      type: "CLOTURE_A",
      userId: sealedById,
      factice,
      data: { period, closeId: close.id, salesTotal: agg.salesTotal, salesCount: agg.salesCount, vatTotal: agg.vatTotal },
      closeId: close.id,
    });
    await tx.annualClose.update({ where: { id: close.id }, data: { fiscalEventId: ev.id } });
    return tx.annualClose.findUniqueOrThrow({ where: { id: close.id } });
  }, TX_FISCAL);
}

// ---------------------------------------------------------------------------
// Annual fiscal archive (open format + SHA-256 + French notice) — 1e
// ---------------------------------------------------------------------------

const ARCHIVE_NOTICE = (year: number) =>
  [
    `Archive fiscale annuelle — HibaPOS France`,
    `Exercice : ${year}`,
    ``,
    `Ce document est une archive fiscale au format ouvert (JSON) produite conformément`,
    `à l'article 286-I-3° bis du CGI (conditions ISCA : Inaltérabilité, Sécurisation,`,
    `Conservation, Archivage). Elle fige les données d'encaissement de l'exercice ${year}`,
    `et leur donne date certaine.`,
    ``,
    `Intégrité : le champ "checksum" (SHA-256) est calculé sur la forme canonique du`,
    `contenu (clés triées, sans le champ checksum lui-même). Toute altération postérieure`,
    `est détectable en recalculant le condensat.`,
    ``,
    `Chaînage : les enregistrements "fiscalEvents" forment un journal inaltérable dont`,
    `chaque entrée contient le hash (SHA-256) de la précédente. Les "monthlyCloses" et le`,
    `présent exercice ("annualClose" si scellé) forment leurs propres chaînes de clôtures.`,
    ``,
    `Lisibilité : ce fichier reste exploitable indépendamment du logiciel HibaPOS.`,
    `Conservation légale : 6 ans (7 si exercice décalé).`,
  ].join("\n");

export async function generateAnnualArchive(year: number, generatedById: string) {
  const existing = await db.fiscalArchive.findUnique({ where: { year } });
  if (existing) throw new Error(`Archive déjà générée pour ${year}`);

  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);
  const [fiscalEvents, orders, zReports, monthlyCloses, annualClose, grandTotal] =
    await Promise.all([
      db.fiscalEvent.findMany({
        where: { timestamp: { gte: from, lt: to } },
        orderBy: { sequence: "asc" },
      }),
      db.order.findMany({
        where: { createdAt: { gte: from, lt: to } },
        include: {
          items: true,
          payments: true,
          refunds: true,
          receipt: true,
          cashier: { select: { name: true, username: true } },
          shift: { select: { number: true } },
        },
        orderBy: { number: "asc" },
      }),
      db.zReport.findMany({ where: { generatedAt: { gte: from, lt: to } }, orderBy: { number: "asc" } }),
      db.monthlyClose.findMany({ where: { year }, orderBy: { period: "asc" } }),
      db.annualClose.findUnique({ where: { period: String(year) } }),
      db.grandTotal.findUnique({ where: { id: "singleton" } }),
    ]);

  const payload = {
    format: "hibapos-fiscal-archive",
    version: 1,
    year,
    generatedAt: new Date().toISOString(),
    notice: ARCHIVE_NOTICE(year),
    grandTotalSnapshot: grandTotal,
    annualClose: annualClose,
    fiscalEvents,
    orders,
    zReports,
    monthlyCloses,
  };
  // Checksum over the canonical payload WITHOUT the checksum field.
  const checksum = createHash("sha256").update(canonicalize(payload)).digest("hex");
  const fullPayload = { ...payload, checksum };
  const json = JSON.stringify(fullPayload, null, 2);
  const sizeBytes = Buffer.byteLength(json, "utf8");
  const filename = `hibapos-archive-${year}.json`;

  await db.$transaction(async (tx) => {
    const archive = await tx.fiscalArchive.create({
      data: { year, filename, checksum, sizeBytes, generatedById },
    });
    const ev = await appendFiscalEvent(tx, {
      type: "ARCHIVE_GENEREE",
      userId: generatedById,
      data: { year, archiveId: archive.id, checksum, sizeBytes },
      archiveId: archive.id,
    });
    await tx.fiscalArchive.update({ where: { id: archive.id }, data: { fiscalEventId: ev.id } });
  }, TX_FISCAL);

  return { json, checksum, sizeBytes, filename, notice: ARCHIVE_NOTICE(year) };
}
