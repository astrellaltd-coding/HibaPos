"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// M-22 (2026-09-05), Batch 5.7d — the App Router fallback the audit found
// missing.
//
// `ErrorBoundary` is a React class component, so it only ever catches errors
// thrown while RENDERING its own subtree on the client. Anything Next.js
// itself raises — a failed route segment, an error during hydration, a server
// component that threw — never reaches it, and without this file the operator
// sees Next's own unstyled English error page or a blank screen.
//
// This is the outermost net. The two inside it are the shell-level boundary
// and, since this batch, a per-view one; between them, a crash in Réglages
// leaves the POS usable, and a crash in the framework at least leaves the
// operator a French sentence and a button.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The till has no remote logging, so the console is where a crash is
    // recoverable from at all — `digest` is the id Next puts in the server log.
    console.error("Unhandled application error:", error, error.digest);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-[var(--shell-bg)] p-6 text-foreground">
      <div className="flex max-w-md flex-col items-center rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-8 w-8" />
        </div>

        <h2 className="mb-2 text-xl font-bold text-foreground">
          L&apos;application a rencontré une erreur
        </h2>

        <div className="mb-6 rounded-xl bg-amber-50/70 p-4 text-left text-xs leading-relaxed text-amber-950">
          <p className="mb-1 font-semibold">Ce qui s&apos;est passé :</p>
          <p className="mb-2 text-muted-foreground">
            Une erreur est survenue en dehors des écrans de caisse.
          </p>
          <p className="mb-1 font-semibold">Prochaines étapes :</p>
          <p className="text-muted-foreground">
            Vos ventes enregistrées et votre caisse ouverte sont intactes — rien
            n&apos;est perdu. Réessayez, puis rechargez si l&apos;erreur persiste.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="min-h-[48px] flex-1" onClick={reset}>
            Réessayer
          </Button>
          <Button
            className="min-h-[48px] flex-1 gap-2 font-semibold"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
            Recharger l&apos;application
          </Button>
        </div>
      </div>
    </div>
  );
}
