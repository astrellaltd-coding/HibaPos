import { Loader2 } from "lucide-react";

export function ViewLoader({ label = "Chargement du module..." }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[300px] w-full flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-card/60 p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
      <p className="text-sm font-medium text-muted-foreground animate-pulse">{label}</p>
    </div>
  );
}
