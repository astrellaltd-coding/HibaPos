import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  AZERTY_ROWS,
  NUMERIC_ROWS,
  OSK_BACKSPACE,
  OSK_ENTER,
  applyKey,
  armsSeparator,
  decimalSeparatorFor,
  isFromOsk,
  isNumericDraft,
  layoutFor,
  resolveKey,
  shiftChar,
  supportsSelection,
  type FieldFacts,
} from "@/lib/osk";

// L-213 — THE ON-SCREEN KEYBOARD'S RULES.
//
// The owner asked for a touch keyboard on 2026-09-17. The operator chose
// « buttons we draw » over Windows' own, and « every typed field » as the
// scope, both on the same day.
//
// WHAT THIS FILE CAN AND CANNOT PROVE. `bun test` has no DOM here — no jsdom,
// no happy-dom, no test renderer — so it proves the DECISIONS: which field gets
// which pad, what a key does to a value, and the two rules that exist to stop a
// money field being silently emptied. It cannot prove that a tap reaches a
// React `onChange`; that is the wiring, and it is in
// `tests/e2e/05-on-screen-keyboard.spec.ts`, against a real browser.

/** A `<input type="text">` with nothing unusual about it. */
function field(over: Partial<FieldFacts> = {}): FieldFacts {
  return { tag: "input", type: "text", inputMode: "", readOnly: false, disabled: false, optOut: false, ...over };
}

describe("L-213 — which field gets which pad", () => {
  it("gives a plain text field the letters", () => {
    expect(layoutFor(field())).toBe("alpha");
    expect(layoutFor(field({ type: "" }))).toBe("alpha"); // absent `type` is `text`
    expect(layoutFor(field({ type: "search" }))).toBe("alpha");
    expect(layoutFor(field({ type: "email" }))).toBe("alpha");
    expect(layoutFor(field({ tag: "textarea", type: "" }))).toBe("alpha");
  });

  it("gives the CAISSE MONEY FIELDS digits — the fiscal half of the finding", () => {
    // `Espèces comptées (€)` and `Fond de caisse initial (€)`, both
    // `type="number" inputMode="decimal"` in `shifts-view.tsx`. Sealing a Z
    // report needed a physical keyboard until this existed.
    expect(layoutFor(field({ type: "number", inputMode: "decimal" }))).toBe("numeric");
    // And on `type="number"` alone, in case a field forgets the hint.
    expect(layoutFor(field({ type: "number" }))).toBe("numeric");
  });

  it("reads inputMode BEFORE type, so a numeric password is digits", () => {
    // The step-up PIN is `type="password" inputMode="numeric"`. It opts out
    // (it has its own keypad), but the rule must not depend on that.
    expect(layoutFor(field({ type: "password", inputMode: "numeric" }))).toBe("numeric");
    expect(layoutFor(field({ type: "text", inputMode: "tel" }))).toBe("numeric");
    expect(layoutFor(field({ type: "password" }))).toBe("alpha");
  });

  it("shows NOTHING over a control that takes no typing", () => {
    for (const type of ["checkbox", "radio", "file", "range", "color", "date", "submit", "button", "hidden"]) {
      expect(layoutFor(field({ type })), `${type} should get no pad`).toBe("none");
    }
    expect(layoutFor(field({ tag: "other", type: "" }))).toBe("none");
  });

  it("shows nothing over a field that cannot be typed into anyway", () => {
    expect(layoutFor(field({ readOnly: true }))).toBe("none");
    expect(layoutFor(field({ disabled: true }))).toBe("none");
  });

  it("obeys data-osk=off — which is how the step-up PIN keeps its own keypad", () => {
    expect(layoutFor(field({ optOut: true }))).toBe("none");
    expect(layoutFor(field({ type: "number", optOut: true }))).toBe("none");
  });
});

describe("L-213 — a money field is never silently emptied", () => {
  // THE RULE THIS PROTECTS. HTML's value sanitisation gives `<input
  // type="number">` the EMPTY STRING for anything that is not a valid
  // floating-point number. So a tapped comma, or a second full stop, would not
  // beep — it would clear the box. The two boxes in question are the cash count
  // and the opening float.

  it("inserts a FULL STOP into a number field, never a comma", () => {
    expect(decimalSeparatorFor("number")).toBe(".");
  });

  it("inserts a COMMA everywhere else, because the till is French", () => {
    expect(decimalSeparatorFor("text")).toBe(",");
    expect(decimalSeparatorFor("")).toBe(",");
  });

  it("REFUSES a second separator instead of blanking the field", () => {
    const at = (value: string) => ({ value, start: value.length, end: value.length });
    const once = applyKey(at("12"), ".", "number");
    expect(once.value).toBe("12.");
    // The key that would have produced `12..` does nothing at all.
    const twice = applyKey(once, ".", "number");
    expect(twice.value).toBe("12.");
    expect(twice).toBe(once); // identity: the caller can see it was refused
  });

  it("lets a half-typed number through, or 1,5 could never be reached", () => {
    expect(isNumericDraft("")).toBe(true);
    expect(isNumericDraft("1")).toBe(true);
    expect(isNumericDraft("1.")).toBe(true);
    expect(isNumericDraft("-")).toBe(true);
    expect(isNumericDraft("24,50")).toBe(true);
    expect(isNumericDraft("1..")).toBe(false);
    expect(isNumericDraft("1.2.3")).toBe(false);
    expect(isNumericDraft("abc")).toBe(false);
  });

  it("still accepts the digits of a real cash count", () => {
    let s = { value: "", start: 0, end: 0 };
    for (const k of ["2", "4", "7", ".", "5", "0"]) s = applyKey(s, k, "number");
    expect(s.value).toBe("247.50");
    // …which is what `shifts-view.tsx` turns into cents.
    expect(Math.round(parseFloat(s.value.replace(",", ".")) * 100)).toBe(24750);
  });
});

describe("L-213 — the separator waits for its digit, or the pounds go missing", () => {
  // FOUND BY DRIVING A REAL BROWSER. The e2e spec tapped 5 0 . 0 0 into « Fond
  // de caisse initial » and the field held **`00`**. `50.` is not a valid
  // floating-point number, so `<input type="number">` reports `value === ""`
  // for it — and since every key recomputes from the field's own value, the
  // next tap read `""` and started again. No unit test here could have seen
  // it: the rule was right and the field was the thing that disagreed.

  it("ARMS the separator on a number field instead of inserting it", () => {
    expect(armsSeparator(".", "number", "50")).toBe(true);
    expect(armsSeparator(".", "number", "")).toBe(true);
  });

  it("does NOT arm on a field that can hold a trailing separator", () => {
    expect(armsSeparator(",", "text", "50")).toBe(false);
    expect(armsSeparator(",", "", "50")).toBe(false);
    // The number pad never draws a comma, so a comma cannot arm one either.
    expect(armsSeparator(",", "number", "50")).toBe(false);
  });

  it("refuses to arm a SECOND separator, which would swallow the next digit", () => {
    expect(armsSeparator(".", "number", "50.0")).toBe(false);
  });

  it("does not arm on a digit, a backspace or Entrée", () => {
    expect(armsSeparator("5", "number", "50")).toBe(false);
    expect(armsSeparator(OSK_BACKSPACE, "number", "50")).toBe(false);
    expect(armsSeparator(OSK_ENTER, "number", "50")).toBe(false);
  });

  it("collects the waiting separator with the next DIGIT, and nothing else", () => {
    expect(resolveKey("0", true, ".")).toBe(".0");
    expect(resolveKey("7", true, ",")).toBe(",7");
    expect(resolveKey(OSK_BACKSPACE, true, ".")).toBe(OSK_BACKSPACE);
    expect(resolveKey(OSK_ENTER, true, ".")).toBe(OSK_ENTER);
    expect(resolveKey("a", true, ".")).toBe("a");
    expect(resolveKey("0", false, ".")).toBe("0");
  });

  it("WALKS THE WHOLE CASH COUNT and every step is a value the field can hold", () => {
    // The sequence the e2e spec taps, run through the rules the component
    // applies — and the assertion is not only the answer, it is that no
    // intermediate is a value `<input type="number">` would report as empty.
    let s = { value: "", start: 0, end: 0 };
    let armed = false;
    const seen: string[] = [];
    for (const raw of ["5", "0", ".", "0", "0"]) {
      if (armsSeparator(raw, "number", s.value)) {
        armed = true;
        seen.push(s.value); // the field does not change on this tap
        continue;
      }
      s = applyKey(s, resolveKey(raw, armed, "."), "number");
      armed = false;
      seen.push(s.value);
    }
    expect(seen).toEqual(["5", "50", "50", "50.0", "50.00"]);
    for (const v of seen) {
      expect(v, `« ${v} » is not a value a number input can hold`).toMatch(/^\d+(\.\d+)?$/);
    }
    expect(Math.round(parseFloat(s.value) * 100)).toBe(5000);
  });
});

describe("L-213 — the caret, and the field types that have none", () => {
  it("knows which types support a selection at all", () => {
    // Not a nicety: `setSelectionRange` THROWS on a number input, and
    // `selectionStart` reads back null. Every caret path is guarded on this.
    expect(supportsSelection("text")).toBe(true);
    expect(supportsSelection("")).toBe(true);
    expect(supportsSelection("password")).toBe(true);
    expect(supportsSelection("search")).toBe(true);
    expect(supportsSelection("tel")).toBe(true);
    expect(supportsSelection("number")).toBe(false);
    expect(supportsSelection("email")).toBe(false);
  });

  it("inserts at the caret in a text field", () => {
    const s = applyKey({ value: "Duont", start: 2, end: 2 }, "p", "text");
    expect(s.value).toBe("Dupont");
    expect(s.start).toBe(3);
  });

  it("replaces a selection", () => {
    const s = applyKey({ value: "Dupond", start: 5, end: 6 }, "t", "text");
    expect(s.value).toBe("Dupont");
    expect(s.start).toBe(6);
  });

  it("EDITS A NUMBER FIELD AT ITS END whatever caret it is handed", () => {
    // A number input reports no caret, so a caller passing a stale 0 must not
    // put the digit at the front of the cash figure.
    const s = applyKey({ value: "247", start: 0, end: 0 }, "5", "number");
    expect(s.value).toBe("2475");
  });

  it("backspaces one character, or the selection when there is one", () => {
    expect(applyKey({ value: "Dupont", start: 6, end: 6 }, OSK_BACKSPACE, "text").value).toBe("Dupon");
    expect(applyKey({ value: "Dupont", start: 3, end: 6 }, OSK_BACKSPACE, "text").value).toBe("Dup");
    expect(applyKey({ value: "247", start: 0, end: 0 }, OSK_BACKSPACE, "number").value).toBe("24");
  });

  it("does nothing at the start of an empty field", () => {
    const empty = { value: "", start: 0, end: 0 };
    expect(applyKey(empty, OSK_BACKSPACE, "text")).toBe(empty);
  });

  it("never INSERTS Entrée — it is dispatched as a keydown instead", () => {
    const s = { value: "12", start: 2, end: 2 };
    expect(applyKey(s, OSK_ENTER, "number")).toBe(s);
  });
});

describe("L-213 — the French layout", () => {
  it("is AZERTY and carries the accents a French address needs", () => {
    expect(AZERTY_ROWS[1]?.slice(0, 6)).toEqual(["a", "z", "e", "r", "t", "y"]);
    const all = AZERTY_ROWS.flat();
    // Every letter of the alphabet, or a name cannot be typed.
    for (const c of "abcdefghijklmnopqrstuvwxyz") {
      expect(all, `the letter ${c} is missing from the keyboard`).toContain(c);
    }
    // The accents the live catalogue and address book actually contain —
    // `Chèvre Miel`, `Fromagère`, `Pêcheur`, `Végétarienne`, `L'american`.
    for (const c of ["é", "è", "ê", "à", "ç", "ô", "î", "'", "-", "@", "."]) {
      expect(all, `${c} is missing from the keyboard`).toContain(c);
    }
  });

  it("carries the digits, because a phone number and a house number are why it exists", () => {
    const all = AZERTY_ROWS.flat();
    for (const d of "0123456789") expect(all).toContain(d);
    expect(NUMERIC_ROWS.flat()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("shifts one letter at a time — Dupont, not DUPONT", () => {
    expect(shiftChar("d", true)).toBe("D");
    expect(shiftChar("d", false)).toBe("d");
    expect(shiftChar("é", true)).toBe("É");
    expect(shiftChar("1", true)).toBe("1");
  });
});

describe("L-213 — a key tap does not dismiss the dialog it is typing into", () => {
  it("answers « no » with no DOM, rather than throwing", () => {
    // Called from `dialog.tsx` and `alert-dialog.tsx`, which this runner
    // imports without a DOM. `Element` being undefined must not be a crash.
    expect(isFromOsk(null)).toBe(false);
    expect(isFromOsk({})).toBe(false);
  });

  it("IS WIRED INTO THE DIALOG PRIMITIVE — the rule is not enough on its own", () => {
    // Method 4 of the plan: a unit test on an extracted rule proves the rule,
    // not that anything calls it. Radix closes a modal layer on any
    // pointer-down outside it, and the keyboard is outside it by design — so
    // without this call site the first letter tapped into the client picker
    // closes the client picker, and no rule test would notice.
    const f = "src/components/ui/dialog.tsx";
    const src = readFileSync(path.join(process.cwd(), f), "utf8");
    expect(src, `${f} does not consult isFromOsk`).toContain("isFromOsk(e.detail.originalEvent.target)");
    expect(src, `${f} does not prevent the dismissal`).toContain("e.preventDefault()");
    // The call site's own handler must still run, or a dialog that already
    // listens for this event would lose its behaviour to this fix.
    expect(src, `${f} swallows a caller's own handler`).toContain("onPointerDownOutside?.(e)");
  });

  it("does NOT guard the alert dialog, which cannot be dismissed from outside", () => {
    // Found by the typechecker rather than assumed: Radix's
    // `AlertDialogContent` prevents the default on `onPointerDownOutside` and
    // `onInteractOutside` itself and forwards neither prop, so passing one is
    // a type error and there is nothing for a key tap to trip. This assertion
    // exists so the next session does not add a guard « for symmetry » and
    // reintroduce that error.
    const src = readFileSync(path.join(process.cwd(), "src/components/ui/alert-dialog.tsx"), "utf8");
    expect(src).not.toContain("isFromOsk");
    expect(src, "the reason this file needs no guard is no longer written down").toContain(
      "NEEDS NO KEYBOARD GUARD",
    );
  });

  it("IS MOUNTED, once, in the root layout", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("<OnScreenKeyboard />");
    expect(layout.match(/<OnScreenKeyboard \/>/g)?.length).toBe(1);
  });

  it("LEAVES THE STEP-UP PIN ALONE, which already has a keypad (L-133)", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/pos/step-up-pin-dialog.tsx"), "utf8");
    // ANCHORED TO A LINE OF ITS OWN, which is a JSX attribute and nothing else.
    // `toContain('data-osk="off"')` was written first and SURVIVED ITS OWN
    // REVERT: the attribute was deleted and the assertion went on passing,
    // because the comment three lines above it quotes the attribute by name.
    // A test that matches the prose explaining it is not testing the code.
    expect(src, "the opt-out attribute is not on the field").toMatch(/^\s*data-osk="off"\s*$/m);
    // And its own keypad is still there — this fix must not have replaced it.
    expect(src).toContain('aria-label="Pavé numérique"');
  });
});
