"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Terminal,
  RefreshCw,
  Loader2,
} from "lucide-react";

type LogsResponse = {
  lines: string[];
  total: number;
};

const LINE_OPTIONS = [
  { value: "100", label: "100 lignes" },
  { value: "300", label: "300 lignes" },
  { value: "1000", label: "1000 lignes" },
];

function lineClass(line: string): string {
  if (/\b(err(or)?|ERR)\b/i.test(line)) return "text-rose-400";
  if (/\bwarn(ing)?|Warn\b/i.test(line)) return "text-amber-400";
  return "text-zinc-300";
}

export function LogsView() {
  const [lines, setLines] = useState(300);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["logs", lines],
    queryFn: () =>
      api.get<LogsResponse>("/api/logs", { lines }),
  });

  return (
    <div className="flex h-full flex-col gap-5 p-5 lg:p-6">
      <PageHeader
        icon={Terminal}
        title="Logs techniques"
        description="Journal d'exécution du serveur"
        actions={
          <div className="flex items-center gap-2">
            <Select
              value={String(lines)}
              onValueChange={(v) => setLines(Number(v))}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LINE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex-1 overflow-y-auto scroll-thin rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-[11px] leading-relaxed max-h-[70vh]">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !data || data.lines.length === 0 ? (
            <div className="text-zinc-500">— Aucune ligne de log —</div>
          ) : (
            data.lines.map((line, idx) => (
              <div key={idx} className={`whitespace-pre-wrap break-words ${lineClass(line)}`}>
                {line || "\u00A0"}
              </div>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.lines.length ?? 0} ligne{(data?.lines.length ?? 0) > 1 ? "s" : ""}{" "}
          affichée{(data?.lines.length ?? 0) > 1 ? "s" : ""} sur{" "}
          {data?.total ?? 0}.
        </p>
      </div>
    </div>
  );
}
