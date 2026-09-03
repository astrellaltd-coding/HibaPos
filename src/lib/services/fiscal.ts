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
import { type VatBreakdown } from "@/lib/money";
import { aggregateOrders, AGGREGATE_INCLUDE } from "@/lib/services/aggregate";
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
    include: AGGREGATE_INCLUDE,
  });

  // C-10 (Batch 3.2). This function used to be a near-copy of
  // computeShiftReport with one difference that mattered: it summed payments
  // GROSS and never subtracted refunds. So the moment a period contained a
  // single refund, the sealed MonthlyClose could not equal the sum of its own
  // ZReport rows — and a sealed document cannot be corrected. Both now call
  // the same function, so they cannot disagree.
  const agg = aggregateOrders(orders, { topProductsLimit: 20 });

  return {
    salesTotal: agg.salesTotal,
    salesCount: agg.salesCount,
    vatTotal: agg.vatTotal,
    cashTotal: agg.cashTotal,
    cardTotal: agg.cardTotal,
    voucherTotal: agg.voucherTotal,
    discountsTotal: agg.discountsTotal,
    totalRefunded: agg.totalRefunded,
    vatBreakdown: agg.vatBreakdown,
    topProducts: agg.topProducts,
  };
}

// ---------------------------------------------------------------------------
// Monthly / annual clôtures (sealed + chained)
// ---------------------------------------------------------------------------

/**
 * M-01 (Batch 3.6) — periods must be sealed in order, with no gaps.
 *
 * The chain links each close to the one with the highest *period*, and
 * `verifyCloses` walks the rows sorted by period. Seal 2026-03 and then
 * 2026-01 and January is chained to March: verification reports a break at
 * the first row, and because a sealed close can be neither edited nor
 * deleted, that break is permanent. Reproduced on a copy of the production
 * database before this guard was written — `{ok:false, firstBreakAt:1}`,
 * against `{ok:true}` for the same two months sealed in order.
 *
 * DD-05, decided by the operator on 2026-09-04: **refuse**, rather than
 * chaining by insertion order. Refusing keeps `verifyCloses` correct as it
 * stands, needs no schema change, and — because gaps are impossible — leaves
 * period order and seal order permanently identical.
 *
 * The rule is "exactly the next period", not merely "later than the last
 * one". Allowing any later period would let January → March through, leaving
 * February unsealable forever, which is the same hole in a smaller shape.
 *
 * The FIRST close is unconstrained: a restaurant adopting the feature in
 * December must not be made to seal eleven earlier months first.
 */
function assertNextPeriod(latest: string | null, period: string, expected: string, kind: "mois" | "exercice") {
  if (latest === null) return; // nothing sealed yet — any period may start the chain
  if (period === expected) return;
  throw new Error(
    `Clôture hors séquence : le prochain ${kind} à clôturer est ${expected}, pas ${period}. ` +
      `Les clôtures doivent être scellées dans l'ordre, sans trou.`,
  );
}

/** The period that must follow `YYYY-MM`. */
export function nextMonthlyPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export async function closeMonth(
  year: number,
  month: number,
  sealedById: string,
  factice = false,
) {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const existing = await db.monthlyClose.findUnique({ where: { period } });
  if (existing) throw new Error(`Clôture mensuelle déjà effectuée pour ${period}`);

  // M-01: refuse anything but the next period in sequence. Checked before the
  // aggregation so a rejected attempt costs nothing and writes nothing.
  const latestMonth = await db.monthlyClose.findFirst({
    orderBy: { period: "desc" },
    select: { period: true },
  });
  assertNextPeriod(
    latestMonth?.period ?? null,
    period,
    latestMonth ? nextMonthlyPeriod(latestMonth.period) : period,
    "mois",
  );

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

  // M-01: same rule for the annual chain — the next exercice, or the first one.
  const latestYear = await db.annualClose.findFirst({
    orderBy: { period: "desc" },
    select: { period: true, year: true },
  });
  assertNextPeriod(
    latestYear?.period ?? null,
    period,
    latestYear ? String(latestYear.year + 1) : period,
    "exercice",
  );

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
    `Intégrité : le condensat SHA-256 de ce fichier est calculé sur ses octets exacts,`,
    `tels qu'ils ont été écrits. Il est reproductible par un tiers avec un outil standard :`,
    ``,
    `    sha256sum hibapos-archive-${year}.json`,
    `    sha256sum -c hibapos-archive-${year}.json.sha256`,
    ``,
    `La valeur de référence est consignée dans le journal fiscal (événement`,
    `ARCHIVE_GENEREE) et dans le fichier .sha256 joint. Toute altération postérieure`,
    `du fichier est détectable en recalculant le condensat et en le comparant à celle-ci.`,
    `Le condensat n'est volontairement PAS inclus dans ce fichier : un condensat placé`,
    `à l'intérieur des octets qu'il couvre ne peut pas être vérifié directement.`,
    ``,
    `Chaînage : les enregistrements "fiscalEvents" forment un journal inaltérable dont`,
    `chaque entrée contient le hash (SHA-256) de la précédente. Les "monthlyCloses" et le`,
    `présent exercice ("annualClose" si scellé) forment leurs propres chaînes de clôtures.`,
    ``,
    `Lisibilité : ce fichier reste exploitable indépendamment du logiciel HibaPOS.`,
    `Conservation légale : 6 ans (7 si exercice décalé).`,
  ].join("\n");

/**
 * Build the annual archive payload. Reads only — writes nothing, anywhere.
 *
 * M-02 (Batch 3.3): generation used to create the `FiscalArchive` row and
 * journal the event inside a transaction, and the route wrote the file
 * afterwards. A failed write left a row that blocked regeneration with a 409
 * while the download route told the operator to regenerate — an unrecoverable
 * dead end. Building is now separate from recording so the caller can write
 * the file FIRST and record only what actually reached the disk. Same
 * ordering principle as the restore in Batch 2.1: nothing irreversible until
 * everything that can fail has succeeded.
 *
 * C-04 (Batch 3.3): the checksum is the SHA-256 of the exact bytes written,
 * so `sha256sum` reproduces it. It is deliberately NOT a field inside the
 * file — a checksum placed inside the bytes it covers cannot be checked
 * directly, which is why the previous version (hash of the canonical form,
 * embedded in the JSON) was not reproducible by a third party at all.
 */
export async function buildAnnualArchive(year: number) {
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
    version: 2,
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

  const json = JSON.stringify(payload, null, 2);
  const bytes = Buffer.from(json, "utf8");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const filename = `hibapos-archive-${year}.json`;

  return {
    json,
    checksum,
    sizeBytes: bytes.byteLength,
    filename,
    // A standard `sha256sum` manifest, so `sha256sum -c` verifies the archive
    // with no HibaPOS-specific knowledge at all.
    checksumFilename: `${filename}.sha256`,
    checksumFileContent: `${checksum}  ${filename}\n`,
    notice: ARCHIVE_NOTICE(year),
  };
}

/**
 * Record an archive that is ALREADY on disk: the row plus its journal entry.
 * Call only after the file has been written successfully (M-02).
 */
export async function recordAnnualArchive(
  year: number,
  generatedById: string,
  file: { filename: string; checksum: string; sizeBytes: number },
) {
  return db.$transaction(async (tx) => {
    const archive = await tx.fiscalArchive.create({
      data: { year, filename: file.filename, checksum: file.checksum, sizeBytes: file.sizeBytes, generatedById },
    });
    const ev = await appendFiscalEvent(tx, {
      type: "ARCHIVE_GENEREE",
      userId: generatedById,
      data: { year, archiveId: archive.id, checksum: file.checksum, sizeBytes: file.sizeBytes },
      archiveId: archive.id,
    });
    // Return the UPDATED row: the one created above still has a null
    // fiscalEventId, and a caller that trusted it would think the archive was
    // unjournalled.
    return tx.fiscalArchive.update({
      where: { id: archive.id },
      data: { fiscalEventId: ev.id },
    });
  }, TX_FISCAL);
}
