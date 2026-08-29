"use client";

import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/format";

export function Money({
  amount,
  className,
  muted,
}: {
  amount: number;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span className={cn("tnum tabular-nums", muted && "text-muted-foreground", className)}>
      {formatEuro(amount)}
    </span>
  );
}
