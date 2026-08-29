"use client";

import { useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api-client";

const IDLE_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 30 * 1000; // 30s warning before lock

export function useAutoLock(
  enabled: boolean,
  onLock: () => void,
  onWarning?: (secondsLeft: number) => void
) {
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(async () => {
    try {
      await api.post("/api/auth/lock", {});
    } catch {
      // best-effort
    }
    onLock();
  }, [onLock]);

  const reset = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (!enabled) return;
    warningTimer.current = setTimeout(() => {
      onWarning?.(30);
    }, Math.max(0, IDLE_MS - WARNING_MS));
    idleTimer.current = setTimeout(() => {
      lock();
    }, IDLE_MS);
  }, [enabled, lock, onWarning]);

  useEffect(() => {
    if (!enabled) return;
    const events = ["mousedown", "keydown", "touchstart", "wheel"];
    const handler = () => reset();
    for (const e of events) window.addEventListener(e, handler, { passive: true });
    reset();
    return () => {
      for (const e of events) window.removeEventListener(e, handler);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };
  }, [enabled, reset]);
}
