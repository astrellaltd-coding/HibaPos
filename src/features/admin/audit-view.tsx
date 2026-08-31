"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuditLogDto } from "@/types/api";
import { formatDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ScrollText,
  RefreshCw,
  Loader2,
  History,
  Search,
} from "lucide-react";

type ActionTone = "slate" | "amber" | "emerald" | "rose" | "muted";

function actionTone(action: string): ActionTone {
  const a = action.toUpperCase();
  if (a.startsWith("DELETE")) return "rose";
  if (a.startsWith("USER_")) return "rose";
  if (a.startsWith("ORDER_")) return "amber";
  if (a.startsWith("SHIFT_")) return "emerald";
  if (a.startsWith("LOGIN")) return "slate";
  return "muted";
}

const TONE_CLASS: Record<ActionTone, string> = {
  slate: "bg-slate-500/15 text-slate-600 border-slate-500/30",
  amber: "bg-primary/15 text-primary border-primary/30",
  emerald: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rose: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  muted: "bg-muted text-muted-foreground border-border",
};

function prettyDetails(raw: string | null): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

function truncatedDetails(raw: string | null): string {
  if (!raw) return "—";
  const text = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw;
  return text;
}

export function AuditView() {
  const [filter, setFilter] = useState("");
  // Debounced filter → server-side action filtering (Phase 11b — the API
  // already supports ?action= contains; replaces fetch-200-then-filter).
  const [debouncedFilter, setDebouncedFilter] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter.trim()), 350);
    return () => clearTimeout(t);
  }, [filter]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["audit", 200, debouncedFilter],
    queryFn: () =>
      api.get<AuditLogDto[]>("/api/audit", {
        limit: 200,
        ...(debouncedFilter ? { action: debouncedFilter } : {}),
      }),
  });

  const logs = data ?? [];

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={ScrollText}
        title="Journal d'audit"
        description="Traçabilité des actions"
        actions={
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Actualiser
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer par action…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aucune entrée"
          description={
            filter
              ? "Aucune action ne correspond à votre filtre."
              : "Le journal d'audit est vide."
          }
        />
      ) : (
        <div className="max-h-[60vh] overflow-y-auto scroll-thin rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date / heure</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entité</TableHead>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Détails</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => {
                const tone = actionTone(l.action);
                const details = prettyDetails(l.details);
                const hasDetails = !!l.details;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateTime(l.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={TONE_CLASS[tone]}
                        variant="outline"
                      >
                        {l.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {l.entity}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.user?.name ?? "Système"}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      {hasDetails ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help font-mono text-xs text-muted-foreground">
                              {truncatedDetails(l.details)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="left"
                            className="max-w-md whitespace-pre-wrap bg-zinc-950 font-mono text-[11px] text-zinc-200"
                          >
                            {details}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {logs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {logs.length} entrée{logs.length > 1 ? "s" : ""} affichée
          {logs.length > 1 ? "s" : ""}.
        </p>
      )}
    </div>
  );
}
