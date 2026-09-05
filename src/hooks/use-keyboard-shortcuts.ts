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

/** The minimum of `document` this module needs, so the rule can be tested
 *  without a DOM. */
type DocumentLike = { querySelector: (sel: string) => unknown };

/** Radix marks an open modal's content with `role` and `data-state="open"`.
 *  Both roles, because AlertDialog uses the second. */
const OPEN_MODAL_SELECTOR =
  '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]';

/**
 * Is a modal dialog open? — L-42 (Batch 5.7d).
 *
 * THE FINDING. Every POS shortcut fired while a dialog was open, because this
 * hook listens on `window` and Radix does not stop keydown propagating. With
 * « Encaissement » open, a stray **F5 set the order type to LIVRAISON
 * underneath it**: `setOrderType` reprices every cart line and `PaymentDialog`
 * reads `orderType` at submit time, so the total on screen changed and the
 * checkout was then refused 400. F2 and F3 did the same more quietly, moving
 * between dine-in and takeaway prices; F8 stacked the discount dialog on top
 * of the payment dialog. Nothing was mis-journalled — the server recomputes
 * from what it is sent — so the sale was BLOCKED, not booked wrong.
 *
 * THE DECISION, recorded because the finding said it is feature design rather
 * than a coercion: **every shortcut is suppressed while any modal is open.**
 * The alternative — a per-dialog allow-list — was rejected as the more
 * dangerous default. A shortcut wrongly suppressed costs one mouse click; a
 * shortcut wrongly fired changes the sale being paid, and the operator's next
 * keystroke is the one that takes the money.
 *
 * **Escape stays Radix's alone** and is deliberately not routed through this
 * hook: Radix already closes the top-most dialog on Escape and handles
 * stacking, and a second handler on `window` would either double-fire or have
 * to reimplement that ordering.
 */
export function isModalOpen(doc: DocumentLike | null | undefined): boolean {
  if (!doc || typeof doc.querySelector !== "function") return false;
  return doc.querySelector(OPEN_MODAL_SELECTOR) !== null;
}

/**
 * Register global keyboard shortcuts.
 * Shortcuts are ignored when a modifier (ctrl/shift/alt) is pressed unless
 * explicitly required, when the focus is in an input/textarea/select unless
 * `allowInInput` is set, and — L-42 — whenever a modal dialog is open.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // L-42: checked FIRST and before `preventDefault`, so a suppressed
      // keystroke reaches the dialog exactly as it would have with no
      // shortcuts registered at all.
      if (isModalOpen(typeof document === "undefined" ? null : document)) return;
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
