"use client";

import { useEffect } from "react";

export type Shortcut = {
  key: string;
  handler: () => void;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  allowInInput?: boolean;
};

/** The four fields the matcher reads off a keydown event. */
export type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "shiftKey" | "altKey"
>;

/** The two fields the matcher reads off an event target. */
type TargetLike = { tagName?: string; isContentEditable?: boolean } | null;

/**
 * Is the keystroke going into a text field? Shortcuts stay out of the way
 * there unless they set `allowInInput`.
 */
export function isEditableTarget(target: TargetLike): boolean {
  if (!target) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable === true
  );
}

/**
 * C-20, Batch 5.1 — the coercion that was missing.
 *
 * `ctrl`/`shift`/`alt` are optional on a Shortcut, so an unset one is
 * `undefined`, while the event always carries a real boolean. The shipped
 * matcher compared them directly — `undefined !== false` is true for every
 * shortcut on every keystroke, so the loop `continue`d every time and not one
 * shortcut had ever fired since the initial commit. `!!` is the whole fix.
 *
 * The contract is strict in both directions: an unset modifier means the key
 * must be pressed *without* it, so Shift+F9 does not check out and Ctrl+F9
 * does not either.
 */
export function matchesShortcut(
  s: Shortcut,
  e: ShortcutEvent,
  inField: boolean,
): boolean {
  if (!!s.ctrl !== e.ctrlKey) return false;
  if (!!s.shift !== e.shiftKey) return false;
  if (!!s.alt !== e.altKey) return false;
  if (inField && !s.allowInInput) return false;
  // Compare case-insensitively for letters
  return e.key.toLowerCase() === s.key.toLowerCase();
}

/** First shortcut in registration order that matches, or null. */
export function findShortcut(
  shortcuts: Shortcut[],
  e: ShortcutEvent,
  inField: boolean,
): Shortcut | null {
  for (const s of shortcuts) {
    if (matchesShortcut(s, e, inField)) return s;
  }
  return null;
}

/**
 * Register global keyboard shortcuts.
 * Shortcuts are ignored when a modifier (ctrl/shift/alt) is pressed unless
 * explicitly required, and when the focus is in an input/textarea/select
 * unless `allowInInput` is set.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inField = isEditableTarget(e.target as HTMLElement | null);
      const hit = findShortcut(shortcuts, e, inField);
      if (hit) {
        e.preventDefault();
        hit.handler();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
