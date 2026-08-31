"use client";

import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught rendering error in POS:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-[var(--shell-bg)] p-6 text-foreground">
          <div className="flex max-w-md flex-col items-center rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-xl">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="h-8 w-8" />
            </div>

            <h2 className="mb-2 text-xl font-bold text-foreground">
              Une erreur inattendue est survenue
            </h2>

            <div className="mb-6 rounded-xl bg-amber-50/70 p-4 text-left text-xs leading-relaxed text-amber-950">
              <p className="font-semibold mb-1">Ce qui s&apos;est passé :</p>
              <p className="mb-2 text-muted-foreground">
                L&apos;affichage de ce module a rencontré un problème d&apos;exécution.
              </p>
              <p className="font-semibold mb-1">Pourquoi :</p>
              <p className="mb-2 font-mono text-[11px] text-destructive break-all">
                {this.state.error?.message || "Erreur interne de rendu."}
              </p>
              <p className="font-semibold mb-1">Prochaines étapes :</p>
              <p className="text-muted-foreground">
                Vos données de caisse et commandes enregistrées sont sécurisées. Vous pouvez réinitialiser la vue ou recharger l&apos;application.
              </p>
            </div>

            <div className="flex w-full flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="flex-1 min-h-[48px]"
                onClick={this.handleReset}
              >
                Réessayer la vue
              </Button>
              <Button
                className="flex-1 min-h-[48px] gap-2 font-semibold"
                onClick={this.handleReload}
              >
                <RefreshCw className="h-4 w-4" />
                Recharger l&apos;application
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
