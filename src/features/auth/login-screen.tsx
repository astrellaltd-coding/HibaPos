"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimation } from "framer-motion";
import { ArrowLeft, ArrowRight, Calculator, Check, ChefHat, CircleHelp, Delete, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

type LoginProfile = {
  id: string;
  username: string;
  name: string;
  role: "SUPER_ADMIN" | "MANAGER" | "CASHIER";
};

const ROLE_STYLE: Record<LoginProfile["role"], { label: string; description: string }> = {
  SUPER_ADMIN: {
    label: "Administrateur",
    description: "Accès complet au système",
  },
  MANAGER: {
    label: "Gérant",
    description: "Gestion des ventes et commandes",
  },
  CASHIER: {
    label: "Caissier",
    description: "Gestion des ventes et commandes",
  },
};

function getProfileIcon(role: LoginProfile["role"]) {
  if (role === "SUPER_ADMIN") return UserRound;
  if (role === "CASHIER") return ChefHat;
  return Calculator;
}

function extractLockedUntil(body: unknown): Date | null {
  if (body && typeof body === "object" && "lockedUntil" in body) {
    const value = (body as { lockedUntil?: unknown }).lockedUntil;
    if (typeof value === "string") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

export function LoginScreen() {
  const { fetchUser } = useAppStore();
  const [profiles, setProfiles] = useState<LoginProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [selected, setSelected] = useState<LoginProfile | null>(null);
  const [step, setStep] = useState<1 | 2>(1);

  const pinRef = useRef("");
  const [pin, setPin] = useState("");
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [success, setSuccess] = useState(false);
  const [fading, setFading] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [needsSeed, setNeedsSeed] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const shakeControls = useAnimation();

  const clearTimers = useCallback(() => {
    if (submitTimer.current) clearTimeout(submitTimer.current);
    if (failureTimer.current) clearTimeout(failureTimer.current);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (finishTimer.current) clearTimeout(finishTimer.current);
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [profilesResponse, seedResponse] = await Promise.all([
          api.get<LoginProfile[]>("/api/auth/profiles"),
          api.get<{ initialized: boolean }>("/api/seed"),
        ]);
        if (cancelled) return;
        setProfiles(profilesResponse);
        setSelected(profilesResponse.find((profile) => profile.role === "MANAGER") ?? profilesResponse[0] ?? null);
        setNeedsSeed(!seedResponse.initialized);
      } catch {
        // The empty state remains visible if the profile request fails.
      } finally {
        if (!cancelled) setLoadingProfiles(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const expiry = lockedUntil.getTime();
    const tick = () => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (timestamp >= expiry) {
        setLockedUntil(null);
        setError(null);
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const secondsLeft = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil.getTime() - now) / 1000))
    : 0;
  const locked = secondsLeft > 0;
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  const triggerFailure = useCallback(() => {
    setFailed(true);
    void shakeControls.start({
      x: [0, -10, 10, -7, 7, -4, 0],
      transition: { duration: 0.45, ease: "easeInOut" },
    });

    if (failureTimer.current) clearTimeout(failureTimer.current);
    failureTimer.current = setTimeout(() => {
      pinRef.current = "";
      setPin("");
      setFailed(false);
    }, 500);
  }, [shakeControls]);

  const doLogin = useCallback(
    async (pinValue: string) => {
      if (!selected) return;
      setLoading(true);
      setError(null);

      try {
        await api.post("/api/auth/login", {
          username: selected.username.toLowerCase(),
          pin: pinValue,
        });
        setLoading(false);
        setSuccess(true);
        fadeTimer.current = setTimeout(() => setFading(true), 400);
        finishTimer.current = setTimeout(() => void fetchUser(), 900);
      } catch (requestError) {
        if (requestError instanceof ApiError) {
          setError(requestError.message);
          const lockDate = extractLockedUntil(requestError.body);
          if (lockDate) {
            setLockedUntil(lockDate);
            setNow(Date.now());
          }
        } else {
          setError("Erreur de connexion");
        }
        setLoading(false);
        triggerFailure();
      }
    },
    [fetchUser, selected, triggerFailure],
  );

  const pressDigit = useCallback(
    (digit: string) => {
      if (locked || loading || success || !selected || pinRef.current.length >= 6) return;
      const nextPin = pinRef.current + digit;
      pinRef.current = nextPin;
      setPin(nextPin);
      setError(null);

      if (nextPin.length === 6) {
        submitTimer.current = setTimeout(() => void doLogin(nextPin), 350);
      }
    },
    [doLogin, loading, locked, selected, success],
  );

  const backspace = useCallback(() => {
    if (locked || loading || success) return;
    if (submitTimer.current) clearTimeout(submitTimer.current);
    const nextPin = pinRef.current.slice(0, -1);
    pinRef.current = nextPin;
    setPin(nextPin);
    setError(null);
  }, [loading, locked, success]);

  const submitPin = useCallback(() => {
    if (locked || loading || success || pinRef.current.length !== 6) return;
    if (submitTimer.current) clearTimeout(submitTimer.current);
    void doLogin(pinRef.current);
  }, [doLogin, loading, locked, success]);

  const chooseProfile = useCallback(
    (profile: LoginProfile) => {
      clearTimers();
      setSelected(profile);
      setStep(2);
      setPin("");
      pinRef.current = "";
      setError(null);
      setFailed(false);
      setSuccess(false);
      setFading(false);
      setLockedUntil(null);
    },
    [clearTimers],
  );

  const backToProfiles = useCallback(() => {
    clearTimers();
    setStep(1);
    setPin("");
    pinRef.current = "";
    setError(null);
    setFailed(false);
    setSuccess(false);
    setFading(false);
    setLockedUntil(null);
  }, [clearTimers]);

  const initializeDatabase = useCallback(async () => {
    setSeeding(true);
    try {
      await api.post("/api/seed");
      const profilesResponse = await api.get<LoginProfile[]>("/api/auth/profiles");
      setProfiles(profilesResponse);
       setSelected(profilesResponse.find((profile) => profile.role === "MANAGER") ?? profilesResponse[0] ?? null);
      setNeedsSeed(false);
      toast.success("Base initialisée");
    } catch {
      toast.error("Échec de l'initialisation");
    } finally {
      setSeeding(false);
    }
  }, []);

  const managerProfiles = profiles.filter((profile) => profile.role === "MANAGER");
  const adminProfile = profiles.find((profile) => profile.role === "SUPER_ADMIN") ?? null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key >= "0" && event.key <= "9" && step === 2) pressDigit(event.key);
      else if (event.key === "Backspace" && step === 2) backspace();
      else if (event.key === "Escape" && step === 2) backToProfiles();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [backspace, backToProfiles, pressDigit, step]);

  return (
    <main className="flex min-h-[100svh] items-center justify-center overflow-y-auto bg-[var(--shell-bg)] p-2 sm:p-5 lg:p-7">
      <motion.div
        animate={{ opacity: fading ? 0 : 1, scale: fading ? 0.98 : 1 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="mx-auto grid h-[calc(100vh-2rem)] w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/80 bg-white p-2 shadow-2xl shadow-amber-950/10 md:h-[calc(100vh-3rem)] md:grid-cols-[1.08fr_0.92fr] md:grid-rows-1"
      >
        <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-5 sm:px-8 lg:px-10" aria-label="Choix du profil">
          <div className="mb-5 flex shrink-0 items-start justify-start pt-4">
            <Image
              src="/Images/hibafood logo2.png"
              alt="HibaPOS"
              width={1200}
              height={480}
              className="h-auto w-[150px] object-contain"
              priority
            />
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {needsSeed ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-start pt-2">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
                <p className="text-sm text-amber-800">Base de données vide. Initialisez les données de démonstration.</p>
                <Button onClick={initializeDatabase} disabled={seeding} className="mt-4 gap-2">
                  {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                  Initialiser
                </Button>
              </div>
            </div>
          ) : loadingProfiles ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-start pt-2">
              <div className="flex justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            </div>
          ) : managerProfiles.length === 0 ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-start pt-2">
              <p className="py-12 text-center text-sm text-[var(--text-warm-grey)]">Aucun utilisateur actif.</p>
            </div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {step === 1 ? (
                <motion.div
                  key="profiles"
                  className="absolute inset-0 z-10 flex flex-col items-center justify-start overflow-y-auto px-1 pt-2"
                  initial={{ x: "-100%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: "-100%", opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <div className="w-full max-w-[520px] text-left">
                    <p className="flex items-center gap-2 text-sm font-semibold text-[var(--brand-accent)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-accent)]" />
                      Bienvenue !
                    </p>
                    <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-[var(--heading-warm)] sm:text-5xl">
                      Bon retour <span aria-hidden="true">👋</span>
                    </h1>
                    <p className="mt-3 max-w-[360px] text-base leading-6 text-[var(--text-warm-grey)]">
                      Accédez à votre espace de travail
                      <br />
                      et gérez votre activité en toute simplicité.
                    </p>
                  </div>

                  <div className="mb-5 mt-6 flex w-full max-w-[520px] items-center gap-3 border-t border-[var(--card-warm-border)] pt-5 text-[var(--brand-accent)]">
                    <UserRound className="h-6 w-6" />
                    <p className="text-sm font-bold">Choisissez votre profil</p>
                  </div>

                  <div className="grid w-full max-w-[300px] grid-cols-1 gap-4">
                    {managerProfiles.map((profile) => {
                      const style = ROLE_STYLE[profile.role];
                      const isSelected = selected?.id === profile.id;
                      return (
                        <motion.button
                          key={profile.id}
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => chooseProfile(profile)}
                          className={cn(
                            "group relative flex min-h-[245px] flex-col items-center justify-start overflow-hidden rounded-[16px] border bg-white px-5 py-6 text-center shadow-[0_14px_35px_rgba(124,83,46,0.08)] transition-all",
                            isSelected
                              ? "border-[var(--brand-accent)] shadow-[0_12px_28px_rgba(242,125,11,0.1)]"
                              : "border-[var(--card-warm-border)] hover:border-[#f7b36c] hover:shadow-md",
                          )}
                        >
                          <span className="pointer-events-none absolute -left-8 -top-8 h-32 w-32 rounded-full bg-[radial-gradient(#f6d7b5_1px,transparent_1px)] [background-size:8px_8px] opacity-50" />
                          <span className="relative mt-1 flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[8px] border-[var(--card-warm-bg)] bg-[var(--brand-accent)] text-white shadow-sm">
                            {(() => {
                              const ProfileIcon = getProfileIcon(profile.role);
                              return <ProfileIcon className="h-9 w-9" strokeWidth={2.2} />;
                            })()}
                          </span>
                          <span className="relative mt-3 min-w-0">
                            <span className="block truncate text-lg font-bold text-[var(--heading-login)]">{style.label}</span>
                            <span className="mt-1 block truncate text-xs text-[var(--text-login-muted)]">
                              {style.description}
                            </span>
                          </span>
                          <span className="relative mt-auto flex h-11 w-full items-center justify-center gap-4 rounded-full bg-[#ff8316] text-sm font-bold text-white shadow-[0_8px_18px_rgba(242,125,11,0.2)]">
                            Continuer
                            <ArrowRight className="h-5 w-5" />
                          </span>
                          {isSelected && (
                            <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-accent)] text-white shadow-md">
                              <Check className="h-4 w-4" />
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="otp"
                  className="absolute inset-0 z-10 flex flex-col items-center justify-start overflow-y-auto pt-2"
                  initial={{ x: "100%", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: "100%", opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <div className="mb-2 flex items-center gap-3 text-[var(--brand-accent)]">
                    <LockKeyhole className="h-5 w-5" />
                    <p className="text-sm font-bold uppercase tracking-[0.18em]">Authentification</p>
                  </div>
                  <h2 className="text-center text-3xl font-bold tracking-tight text-[var(--heading-login)] sm:text-4xl">Entrez votre code</h2>
                  <p className="mt-2 text-center text-sm text-[var(--text-login-muted)]">Saisissez votre code personnel pour continuer</p>

                  <motion.div animate={shakeControls} className="mb-8 mt-9 flex justify-center gap-5">
                    {Array.from({ length: 6 }).map((_, index) => {
                      const filled = index < pin.length;
                      const active = index === pin.length && !locked && !loading && !success;
                      return (
                        <motion.div
                          key={index}
                          animate={filled ? { scale: [1, 1.18, 1] } : { scale: 1 }}
                          transition={{ duration: 0.25 }}
                          className={cn(
                             "h-6 w-6 rounded-full border-2 transition-colors duration-200",
                            success
                              ? "border-emerald-500 bg-emerald-500"
                              : failed
                                ? "border-red-500 bg-red-500"
                                : filled
                                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]"
                                  : active
                                    ? "border-[var(--brand-accent)]"
                                    : "border-[#eadfd4] bg-transparent",
                          )}
                        />
                      );
                    })}
                  </motion.div>

                  {locked ? (
                    <p className="mb-3 text-center text-sm font-medium text-red-600">
                      Compte verrouillé — réessayez dans {minutes}:{seconds}
                    </p>
                  ) : error ? (
                    <p className="mb-3 text-center text-sm font-medium text-red-600">{error}</p>
                  ) : (
                    <p className="mb-3 h-5 text-center text-xs text-[var(--text-login-muted)]">La connexion démarre automatiquement.</p>
                  )}

                  <div className="mx-auto grid max-w-[280px] grid-cols-3 gap-2.5">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                      <Button
                        key={digit}
                        type="button"
                        variant="outline"
                        disabled={locked || loading || success}
                        className="h-16 rounded-xl border-[#f5cba7] bg-white text-2xl font-semibold hover:border-[var(--brand-accent)] hover:bg-[#fff3e4] hover:text-[var(--brand-accent)] active:scale-95"
                        onClick={() => pressDigit(digit)}
                      >
                        {digit}
                      </Button>
                    ))}
                    <Button type="button" disabled={locked || loading || success || !pin} className="h-16 rounded-xl border-0 bg-[#fff0df] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-white active:scale-95" onClick={backspace} aria-label="Supprimer le dernier chiffre">
                      <Delete className="h-6 w-6" />
                    </Button>
                    <Button type="button" variant="outline" disabled={locked || loading || success} className="h-16 rounded-xl border-[#f5cba7] bg-white text-2xl font-semibold hover:border-[var(--brand-accent)] hover:bg-[#fff3e4] hover:text-[var(--brand-accent)] active:scale-95" onClick={() => pressDigit("0")}>
                      0
                    </Button>
                    <Button type="button" disabled={locked || loading || success || pin.length !== 6} className="h-16 rounded-xl border-0 bg-[#fff0df] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-white active:scale-95" onClick={submitPin} aria-label="Valider le code">
                      <ArrowRight className="h-6 w-6" />
                    </Button>
                  </div>

                  <div className="mt-8 flex justify-center border-t border-[var(--card-warm-border)] pt-6">
                    <button
                      type="button"
                      onClick={backToProfiles}
                      disabled={success}
                      className="flex items-center gap-3 text-sm font-medium text-[var(--text-login-muted)] transition-colors hover:text-[var(--brand-accent)] disabled:opacity-50"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand-accent)] text-white">
                        <ArrowLeft className="h-4 w-4" />
                      </span>
                      Changer de profil
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
          </div>

          {step === 1 && (
            <div className="mx-auto mt-5 flex w-full max-w-[300px] items-start gap-3 rounded-xl border border-[var(--card-warm-border)] bg-white/60 px-4 py-3 text-left text-xs text-[var(--text-warm-grey)]">
              <CircleHelp className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="leading-5">
                <span className="block font-semibold text-[var(--heading-login)]">Besoin d'aide ?</span>
                Contactez votre{" "}
                {adminProfile ? (
                  <button
                    type="button"
                    onClick={() => chooseProfile(adminProfile)}
                    className="font-semibold text-[var(--brand-accent)] underline decoration-[#f7b36c] underline-offset-2 transition-colors hover:text-[#d96c08]"
                  >
                    administrateur
                  </button>
                ) : (
                  "administrateur"
                )}
              </span>
            </div>
          )}
        </section>

        <section
          className="relative order-2 h-full min-h-[280px] overflow-hidden rounded-[24px] md:order-none md:min-h-0"
          aria-label="Visuel Hiba Food"
        >
          <Image
            src="/Images/loginpicture.png"
            alt="Hiba Food"
            fill
            className="object-cover"
            priority
            sizes="(max-width: 768px) 100vw, 46vw"
          />
        </section>
      </motion.div>
    </main>
  );
}
