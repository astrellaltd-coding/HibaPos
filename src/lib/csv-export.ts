// CSV export utilities for dashboard and reports.
import type { DashboardDto } from "@/types/api";
import { formatEuro, formatDateTime } from "@/lib/format";

const METHOD_LABELS: Record<string, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  VOUCHER: "Bon",
};

function csvEscape(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Export dashboard data as a CSV summary (KPIs + top products + recent orders). */
export function exportDashboardCSV(data: DashboardDto): string {
  const rows: (string | number)[][] = [];

  // Header
  rows.push(["HibaPOS France — Tableau de bord"]);
  rows.push(["Généré le", formatDateTime(new Date())]);
  rows.push([]);

  // KPIs
  rows.push(["INDICATEURS DU JOUR"]);
  rows.push(["Ventes du jour", formatEuro(data.todaySales)]);
  rows.push(["Commandes", data.todayOrders]);
  rows.push(["Articles vendus", data.todayItems]);
  rows.push(["Ticket moyen", formatEuro(data.avgTicket)]);
  rows.push(["Ventes espèces", formatEuro(data.cashSales)]);
  rows.push(["Ventes carte", formatEuro(data.cardSales)]);
  rows.push([]);

  // Comparison
  if (data.comparison) {
    rows.push(["COMPARAISON"]);
    rows.push(["Ventes cette semaine", formatEuro(data.comparison.thisWeekSales)]);
    rows.push(["Commandes cette semaine", data.comparison.thisWeekOrdersCount]);
    rows.push(["Ventes semaine dernière", formatEuro(data.comparison.lastWeekSales)]);
    rows.push(["Commandes semaine dernière", data.comparison.lastWeekOrdersCount]);
    if (data.comparison.weekVsLastWeekPct !== null) {
      rows.push(["Évolution semaine (%)", `${data.comparison.weekVsLastWeekPct >= 0 ? "+" : ""}${data.comparison.weekVsLastWeekPct}%`]);
    }
    rows.push([]);
  }

  // Top products
  rows.push(["PRODUITS LES PLUS VENDUS"]);
  rows.push(["Rang", "Produit", "Quantité", "Chiffre"]);
  data.topProducts.forEach((p, i) => {
    rows.push([i + 1, p.name, p.quantity, formatEuro(p.total)]);
  });
  rows.push([]);

  // Top categories
  if (data.topCategories && data.topCategories.length > 0) {
    rows.push(["VENTES PAR CATÉGORIE"]);
    rows.push(["Catégorie", "Chiffre", "Quantité"]);
    data.topCategories.forEach((c) => {
      rows.push([c.name, formatEuro(c.revenue), c.quantity]);
    });
    rows.push([]);
  }

  // Payment breakdown
  rows.push(["RÉPARTITION DES PAIEMENTS"]);
  rows.push(["Méthode", "Montant", "Nombre"]);
  data.paymentBreakdown.forEach((p) => {
    rows.push([METHOD_LABELS[p.method] ?? p.method, formatEuro(p.amount), p.count]);
  });
  rows.push([]);

  // Recent orders
  rows.push(["COMMANDES RÉCENTES"]);
  rows.push(["N°", "Date", "Type", "Table", "Articles", "Total", "Paiement", "Caissier", "Statut"]);
  data.recentOrders.forEach((o) => {
    rows.push([
      o.number,
      formatDateTime(o.createdAt),
      o.orderType === "DINE_IN" ? "Sur place" : "À emporter",
      o.tableLabel ?? "",
      o.itemCount,
      formatEuro(o.total),
      o.payments.map((p) => METHOD_LABELS[p.method] ?? p.method).join(" + "),
      o.cashier?.name ?? "",
      o.status === "COMPLETED" ? "Terminée" : o.status === "REFUNDED" ? "Remboursée" : o.status,
    ]);
  });

  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

/** Trigger a CSV file download in the browser. */
export function downloadCSV(csv: string, filename: string): void {
  // Add BOM for Excel UTF-8 compatibility
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
