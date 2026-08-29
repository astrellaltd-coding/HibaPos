"use client";

import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Shared report widgets extracted from shifts-view.tsx + reports-view.tsx
// (Phase 7a — pure cleanup, no behavior change).

type VatRow = { ht: number; vat: number; ttc: number };

export function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "primary" | "emerald" | "rose";
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "rose"
          ? "text-rose-600"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tnum tabular-nums", toneCls)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function VatBreakdownTable({
  breakdown,
}: {
  breakdown: Record<string, VatRow>;
}) {
  const rates = Object.keys(breakdown).sort((a, b) => Number(a) - Number(b));
  if (rates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
        Aucune vente sur cette période.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead>Taux TVA</TableHead>
            <TableHead className="text-right">Base HT</TableHead>
            <TableHead className="text-right">TVA</TableHead>
            <TableHead className="text-right">TTC</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rates.map((r) => {
            const row = breakdown[r];
            return (
              <TableRow key={r}>
                <TableCell className="font-medium">{Number(r).toFixed(1)} %</TableCell>
                <TableCell className="text-right">
                  <Money amount={row.ht} />
                </TableCell>
                <TableCell className="text-right">
                  <Money amount={row.vat} />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Money amount={row.ttc} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function TopProductsList({
  items,
}: {
  items: { name: string; quantity: number; total: number }[];
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
        Aucun produit vendu.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {items.map((p, i) => (
        <li
          key={`${p.name}-${i}`}
          className="flex items-center justify-between px-3 py-2 text-sm"
        >
          <span className="font-medium text-foreground">{p.name}</span>
          <span className="flex items-center gap-3 text-muted-foreground">
            <span className="tnum tabular-nums">×{p.quantity}</span>
            <Money amount={p.total} className="font-medium text-foreground" />
          </span>
        </li>
      ))}
    </ul>
  );
}
