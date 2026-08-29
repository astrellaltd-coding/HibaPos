"use client";

import { useEffect } from "react";

type Shortcut = {
  key: string;
  handler: () => void;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  allowInInput?: boolean;
};

/**
 * Register global keyboard shortcuts.
 * Shortcuts are ignored when a modifier (ctrl/shift/alt) is pressed unless
 * explicitly required, and when the focus is in an input/textarea/select
 * unless `allowInInput` is set.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      for (const s of shortcuts) {
        if (s.ctrl !== e.ctrlKey) continue;
        if (s.shift !== e.shiftKey) continue;
        if (s.alt !== e.altKey) continue;
        if (inField && !s.allowInInput) continue;
        // Compare case-insensitively for letters
        if (e.key.toLowerCase() === s.key.toLowerCase()) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
