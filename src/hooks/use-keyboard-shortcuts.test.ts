import { describe, it, expect } from "vitest";
import {
  matchesShortcut,
  findShortcut,
  isEditableTarget,
  type Shortcut,
  type ShortcutEvent,
} from "@/hooks/use-keyboard-shortcuts";

// C-20, Batch 5.1 — every POS keyboard shortcut was dead.
//
// `ctrl`/`shift`/`alt` are optional on a Shortcut, so an unset one is
// `undefined`; the event always carries a real boolean. The shipped matcher
// compared them with `!==` and no coercion, so `undefined !== false` was true
// on line 32 for every shortcut on every keystroke and the loop `continue`d
// before it ever looked at the key. Measured before the fix: of the ten
// presses below, zero fired — including Shift+? for the help dialog, which
// died on the *ctrl* line before reaching its own. Dead since commit be9113e.
//
// A note on what these tests can and cannot prove. The old code refused
// everything, so only the tests that assert a shortcut FIRES can fail against
// it. The ones asserting a shortcut is REFUSED are regression assertions:
// they pass on the broken code too, and they exist to stop a future
// over-correction — a matcher that only enforces a modifier when it is
// explicitly required — not to demonstrate this fix. They are grouped apart
// below and named as such.

// The registrations as they stand at pos-view.tsx:125-145. Keep in step with
// that array: these tests are the contract between the hook and the till.
const TILL_SHORTCUTS: Shortcut[] = [
  { key: "F1", handler: () => {} },
  { key: "F2", handler: () => {} },
  { key: "F3", handler: () => {} },
  { key: "F4", handler: () => {} },
  { key: "F5", handler: () => {} },
  { key: "F8", handler: () => {} },
  { key: "F9", handler: () => {} },
  { key: "?", shift: true, handler: () => {} },
  { key: "/", handler: () => {} },
  { key: "/", shift: true, handler: () => {} },
];

function press(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
): ShortcutEvent {
  return {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
  };
}

describe("C-20 — the till's shortcuts fire", () => {
  // The seven function keys the help dialog teaches, each pressed bare.
  it.each(["F1", "F2", "F3", "F4", "F5", "F8", "F9"])(
    "%s fires with no modifier held",
    (key) => {
      expect(findShortcut(TILL_SHORTCUTS, press(key), false)?.key).toBe(key);
    },
  );

  it("Shift+? opens the help dialog", () => {
    // Both layouts produce "?" with shift held: US QWERTY as Shift+vk 0xBF,
    // French AZERTY as Shift+vk 0xBC. So `shift: true` is right for both.
    const hit = findShortcut(TILL_SHORTCUTS, press("?", { shift: true }), false);
    expect(hit).not.toBeNull();
    expect(hit?.key).toBe("?");
    expect(hit?.shift).toBe(true);
  });

  it("/ focuses search on a QWERTY keyboard and on the numeric keypad", () => {
    // Unshifted "/" — vk 0xBF bare on US QWERTY, VK_DIVIDE on any keypad.
    const hit = findShortcut(TILL_SHORTCUTS, press("/"), false);
    expect(hit?.key).toBe("/");
    expect(hit?.shift).toBeUndefined();
  });

  it("/ focuses search on the French AZERTY keyboard, where it is Shift+:", () => {
    // Windows VkKeyScanEx against layout 0000040C reports "/" as vk 0xBF with
    // SHIFT, so the restaurant's own keyboard delivers key "/" *and*
    // shiftKey true. Without the second registration this press is refused.
    const hit = findShortcut(TILL_SHORTCUTS, press("/", { shift: true }), false);
    expect(hit?.key).toBe("/");
    expect(hit?.shift).toBe(true);
  });

  it("Shift and the two slash entries do not steal each other's press", () => {
    // QWERTY Shift+/ emits "?" -> help. AZERTY Shift+: emits "/" -> search.
    // `?` is registered first, so this pins the order as well as the keys.
    expect(findShortcut(TILL_SHORTCUTS, press("?", { shift: true }), false)?.key).toBe("?");
    expect(findShortcut(TILL_SHORTCUTS, press("/", { shift: true }), false)?.key).toBe("/");
  });

  it("a shortcut that requires ctrl fires when ctrl is held", () => {
    const s: Shortcut = { key: "p", ctrl: true, handler: () => {} };
    expect(matchesShortcut(s, press("p", { ctrl: true }), false)).toBe(true);
  });

  it("allowInInput lets a shortcut through while typing in a field", () => {
    const s: Shortcut = { key: "F9", allowInInput: true, handler: () => {} };
    expect(matchesShortcut(s, press("F9"), true)).toBe(true);
  });

  it("matches letter keys case-insensitively", () => {
    const s: Shortcut = { key: "P", ctrl: true, handler: () => {} };
    expect(matchesShortcut(s, press("p", { ctrl: true }), false)).toBe(true);
  });
});

// --- Regression assertions -------------------------------------------------
// Everything below passes against the pre-batch code, because that code
// refused every keystroke. They hold the *other* edge of the contract: an
// unset modifier means the key must be pressed without it. Their value is
// against a future matcher that goes lenient, not against C-20.

describe("C-20 regression — an unset modifier is a requirement, not a wildcard", () => {
  it("refuses Shift+F9 — checkout does not take a shift", () => {
    expect(findShortcut(TILL_SHORTCUTS, press("F9", { shift: true }), false)).toBeNull();
  });

  it("refuses Ctrl+F9", () => {
    expect(findShortcut(TILL_SHORTCUTS, press("F9", { ctrl: true }), false)).toBeNull();
  });

  it("refuses Alt+F9", () => {
    expect(findShortcut(TILL_SHORTCUTS, press("F9", { alt: true }), false)).toBeNull();
  });

  it("refuses a bare ? — the help dialog requires shift", () => {
    expect(findShortcut(TILL_SHORTCUTS, press("?"), false)).toBeNull();
  });

  it("refuses a ctrl-requiring shortcut pressed without ctrl", () => {
    const s: Shortcut = { key: "p", ctrl: true, handler: () => {} };
    expect(matchesShortcut(s, press("p"), false)).toBe(false);
  });

  it("refuses an alt-requiring shortcut pressed without alt", () => {
    const s: Shortcut = { key: "p", alt: true, handler: () => {} };
    expect(matchesShortcut(s, press("p"), false)).toBe(false);
  });
});

describe("C-20 regression — shortcuts stay out of text fields", () => {
  it("refuses every till shortcut while the focus is in a field", () => {
    for (const s of TILL_SHORTCUTS) {
      const e = press(s.key, { shift: s.shift });
      expect(matchesShortcut(s, e, true)).toBe(false);
    }
  });

  it("treats input, textarea, select and contenteditable as fields", () => {
    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" })).toBe(true);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("treats a button, a plain div and a null target as not fields", () => {
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: false })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

// --- Drift guard -----------------------------------------------------------
// TILL_SHORTCUTS above is a hand-kept copy: pos-view.tsx registers its
// shortcuts inside a component, with handlers closed over React state, so a
// DOM-free test cannot import the real array. Without this check the AZERTY
// test would keep passing after someone deleted the registration it exists to
// protect. So read the source and hold the two lists to each other.

describe("C-20 — the registration in pos-view.tsx matches this file's fixture", () => {
  it("registers exactly the ten shortcuts these tests assert", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/features/catalog/pos-view.tsx", "utf8");

    // `\bkey:` does not match the help dialog's `keys:` rows.
    const found = [...src.matchAll(/\bkey:\s*"([^"]*)"(\s*,\s*shift:\s*true)?/g)].map(
      (m) => (m[2] ? `${m[1]}+shift` : m[1]),
    );
    const expected = TILL_SHORTCUTS.map((s) => (s.shift ? `${s.key}+shift` : s.key));

    expect(found).toEqual(expected);
    // Named explicitly: this is the entry the French keyboard depends on.
    expect(found).toContain("/+shift");
  });

  it("focuses the search box the topbar actually renders", async () => {
    // The F1 and "/" handlers were live from the moment the matcher was fixed
    // and still focused nothing: pos-view held its own `searchInputRef` that
    // was never attached to an element, while the real input is the topbar's.
    // Both files now import POS_SEARCH_INPUT_ID, so the only way to break the
    // wiring again without a type error is to drop the id from the input.
    const { readFileSync } = await import("node:fs");
    const { POS_SEARCH_INPUT_ID } = await import("@/store/app-store");
    const topbar = readFileSync("src/components/shared/topbar.tsx", "utf8");
    const posView = readFileSync("src/features/catalog/pos-view.tsx", "utf8");

    expect(POS_SEARCH_INPUT_ID).toBeTruthy();
    expect(topbar).toContain("id={POS_SEARCH_INPUT_ID}");
    expect(posView).toContain("document.getElementById(POS_SEARCH_INPUT_ID)");
    // The orphan is gone, not merely bypassed.
    expect(posView).not.toContain("searchInputRef");
  });
});
