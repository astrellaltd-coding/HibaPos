/**
 * L-213 — the on-screen keyboard's RULES, with no DOM in sight.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM THE COMPONENT. `bun test` runs with no
 * DOM: there is no jsdom, no happy-dom and no test renderer in this project,
 * and `payment-line.test.tsx` says why in its own header — adding one is a
 * dependency decision rather than a batch's. So every decision the keyboard
 * makes lives here, as functions over plain values, and the component does
 * nothing but read those values off a real element and write the answer back.
 * What a DOM-free test can then prove is everything except the wiring, and the
 * wiring is proved in `tests/e2e/05-on-screen-keyboard.spec.ts` against a real
 * browser.
 *
 * THE DESIGN RULE, INHERITED FROM L-133. The step-up PIN dialog's keypad says
 * it best: « The field is untouched, so a keyboard still works. This is added
 * beside it, so a finger does too. » This keyboard never replaces typing and
 * never owns a field's state. It appends taps to whatever is already there, and
 * if it failed outright the wired keyboard would go on working exactly as now.
 */

/** Which pad a field wants, or none at all. */
export type OskLayout = "numeric" | "alpha" | "none";

/** Marks the keyboard's own subtree. Lives here so `dialog.tsx` can read it
 *  without importing the component and dragging it into every bundle. */
export const OSK_ROOT_ATTR = "data-osk-root";

/**
 * Did this pointer event start inside the keyboard?
 *
 * Radix's dismissable layer closes a modal dialog on any `pointerdown`
 * outside it, and the keyboard IS outside it — portalled to the body, because
 * it belongs to the screen rather than to whichever dialog is open. Without
 * this, the first key a cashier taps in the client picker closes the client
 * picker. `dialog.tsx` consults it. `alert-dialog.tsx` does NOT and must not:
 * Radix makes an alert dialog undismissable from outside on its own and
 * forwards neither outside-interaction prop, so passing one is a type error.
 *
 * Guarded on `Element` existing so it can be called from a DOM-free test,
 * where the honest answer is « no ».
 */
export function isFromOsk(node: unknown): boolean {
  if (typeof Element === "undefined") return false;
  if (!(node instanceof Element)) return false;
  return node.closest(`[${OSK_ROOT_ATTR}]`) !== null;
}

/** Sentinel keys. Anything else is the literal text to insert.
 *
 *  DELIBERATELY READABLE, and not the control characters they stand for.
 *  They were written once as the two-character escapes for backspace and
 *  carriage return, and both were RESOLVED INTO THE REAL CONTROL CHARACTERS
 *  on the way to disk: the carriage return ended the line and the file no
 *  longer parsed. A sentinel that survives being copied is worth more than
 *  one that looks like the key it names. Both are tested before any
 *  insertion, so neither can ever be typed into a field. */
export const OSK_BACKSPACE = "__osk_backspace__";
export const OSK_ENTER = "__osk_enter__";

/**
 * Everything the rules need to know about the focused element. The component
 * fills this in from the live node; a test fills it in by hand.
 */
export interface FieldFacts {
  tag: "input" | "textarea" | "other";
  /** `type` attribute, lower-cased. Absent counts as `text`, as in HTML. */
  type: string;
  /** `inputmode` attribute, lower-cased, or `""`. */
  inputMode: string;
  readOnly: boolean;
  disabled: boolean;
  /** `data-osk="off"` on the field or on any ancestor. */
  optOut: boolean;
}

/**
 * Field types that take no typed text at all, so no pad should appear over
 * them. `date` is on the list because the browser's own picker is better than
 * anything here, and `color` because it is a swatch.
 */
const NOT_TEXT_ENTRY = new Set([
  "checkbox",
  "radio",
  "file",
  "range",
  "color",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "submit",
  "reset",
  "button",
  "image",
  "hidden",
]);

/** `inputmode` values that mean « digits », whatever the `type` says. */
const NUMERIC_INPUT_MODES = new Set(["numeric", "decimal", "tel"]);

/**
 * Which pad, if any, a field should get.
 *
 * `inputMode` is consulted BEFORE `type`, which is what makes the step-up PIN
 * field (`type="password" inputMode="numeric"`) a number pad rather than a
 * letter one — though that particular field opts out anyway, having had its
 * own keypad since L-133.
 */
export function layoutFor(f: FieldFacts): OskLayout {
  if (f.optOut || f.readOnly || f.disabled) return "none";
  if (f.tag === "textarea") return "alpha";
  if (f.tag !== "input") return "none";

  const type = f.type === "" ? "text" : f.type;
  if (NOT_TEXT_ENTRY.has(type)) return "none";

  if (NUMERIC_INPUT_MODES.has(f.inputMode)) return "numeric";
  if (type === "number" || type === "tel") return "numeric";
  return "alpha";
}

/**
 * Whether `setSelectionRange` may be called on this field.
 *
 * NOT a nicety. On `<input type="number">` reading `selectionStart` gives
 * `null` and calling `setSelectionRange` throws `InvalidStateError` — the
 * specification only supports selection on text, search, url, tel and
 * password. Every caret path in this file is guarded by this function, and the
 * component collapses the caret to the end of the value when it returns false.
 */
export function supportsSelection(type: string): boolean {
  const t = type === "" ? "text" : type;
  return t === "text" || t === "search" || t === "url" || t === "tel" || t === "password";
}

/**
 * The decimal separator to INSERT for a given field.
 *
 * A French till shows « 24,50 » and the app's own parsers all call
 * `.replace(",", ".")` before `parseFloat`, so a comma is what the operator
 * expects to see. It cannot be typed into `<input type="number">`, though:
 * HTML's value sanitisation gives a number input the empty string for anything
 * that is not a valid floating-point number, so a tapped comma would silently
 * BLANK the field — and the two fields this matters most for are « Espèces
 * comptées » and « Fond de caisse initial », where a silently emptied box is
 * the beginning of a wrong Z report. So a number field gets a full stop, which
 * every reader in this project already accepts.
 */
export function decimalSeparatorFor(type: string): "," | "." {
  return type === "number" ? "." : ",";
}

/**
 * Whether a string is a value a number input will KEEP rather than blank.
 *
 * Deliberately a *draft* test and not a validity test: `"1."`, `"-"` and `""`
 * are all halfway to a number and must be allowed through, or the operator
 * cannot tap their way to `1.5`. Both separators are accepted here so the
 * function can be asked about a value that has not been normalised yet.
 */
export function isNumericDraft(value: string): boolean {
  return /^-?\d*(?:[.,]\d*)?$/.test(value);
}

/**
 * Should this separator WAIT for its first decimal digit instead of going in?
 *
 * FOUND BY DRIVING A REAL BROWSER, not by reasoning — the e2e spec tapped
 * `5 0 . 0 0` into « Fond de caisse initial » and the field ended up holding
 * **`00`**. The mechanism: `50.` is not a valid floating-point number, so
 * `<input type="number">` reports `value === ""` for it however it was written.
 * Each key here recomputes from the field's own value, so the next tap read
 * `""` instead of `50.` and started again from nothing. A cashier counting the
 * drawer would have sealed a Z report on a figure with the pounds missing.
 *
 * A physical keyboard survives this because the browser keeps its own raw text
 * for the control while `value` reads empty. Nothing exposes that buffer, so
 * the keyboard does the equivalent: the separator is ARMED rather than
 * inserted, and goes in together with the first digit after it — `50` then
 * `50.0` then `50.00`, every one of them a value the field can actually hold.
 *
 * The other two ways out were rejected. Keeping a private draft reproduces the
 * browser's buffer but React then re-renders the field to `""` for one tap, so
 * the figure BLINKS BLANK on a cash field. Changing these inputs away from
 * `type="number"` would fix it more deeply and is not this item's to do: it
 * changes how two fiscal fields validate, which is the operator's call.
 */
export function armsSeparator(key: string, type: string, value: string): boolean {
  if (type !== "number") return false;
  if (key !== decimalSeparatorFor(type)) return false;
  // A second separator is refused rather than armed — `commit` would reject it
  // anyway, and arming it would swallow the next digit.
  return !value.includes(".");
}

/**
 * What a tapped key actually inserts, once an armed separator is accounted for.
 *
 * Only a DIGIT collects the waiting separator. Anything else — a backspace,
 * Entrée — leaves it behind, which is why the caller disarms after every key.
 */
export function resolveKey(key: string, armed: boolean, separator: "," | "."): string {
  if (!armed) return key;
  return /^[0-9]$/.test(key) ? separator + key : key;
}

/** A field's text and caret, which is all a key press acts on. */
export interface EditState {
  value: string;
  start: number;
  end: number;
}

/**
 * Apply one key to one field.
 *
 * Returns a NEW state, or the state unchanged when the key would do damage —
 * a second decimal point in a money field being the case that matters. The
 * caller can compare identity to learn nothing happened.
 */
export function applyKey(state: EditState, key: string, type: string): EditState {
  const canSelect = supportsSelection(type);
  // A field with no selection support is edited at its end, always: reading a
  // caret from it gives null, so pretending otherwise would put the character
  // in an arbitrary place.
  const start = canSelect ? clamp(state.start, state.value.length) : state.value.length;
  const end = canSelect ? clamp(state.end, state.value.length) : state.value.length;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);

  if (key === OSK_ENTER) return state; // dispatched as a keydown, never inserted
  if (key === OSK_BACKSPACE) {
    if (hi > lo) return commit(state, state.value.slice(0, lo) + state.value.slice(hi), lo, type);
    if (lo === 0) return state;
    return commit(state, state.value.slice(0, lo - 1) + state.value.slice(lo), lo - 1, type);
  }

  const next = state.value.slice(0, lo) + key + state.value.slice(hi);
  return commit(state, next, lo + key.length, type);
}

/**
 * Take the proposed value, or refuse it.
 *
 * The refusal exists for one reason: a number input given a value it considers
 * invalid reports the empty string, so `"12"` + `"."` + `"."` would clear a
 * cash figure rather than beep. Refusing the key leaves `12.` on screen, which
 * is what a physical keyboard does too.
 */
function commit(prev: EditState, value: string, caret: number, type: string): EditState {
  if (type === "number" && !isNumericDraft(value)) return prev;
  return { value, start: caret, end: caret };
}

function clamp(n: number, max: number): number {
  if (!Number.isFinite(n) || n < 0) return max;
  return Math.min(n, max);
}

/**
 * THE AZERTY PANEL.
 *
 * A French restaurant's keyboard, in the order a French keyboard has it, so
 * nobody has to hunt. The digit row is not decoration: the two fields this was
 * built for are a client's phone number and « 12 rue de Paris », and both are
 * mostly digits.
 *
 * Accented letters get their own row rather than a long-press, because a
 * long-press is invisible and this is a keyboard for people who have never
 * seen it before. `Chèvre`, `Café`, `L'Église` — all of it is in the catalogue
 * and in the address book already.
 */
export const AZERTY_ROWS: readonly (readonly string[])[] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
  ["w", "x", "c", "v", "b", "n", "'", "-"],
  ["é", "è", "ê", "à", "ù", "ç", "ô", "î", "@", "."],
];

/** The number pad, in telephone order — the order every other pad in this app uses. */
export const NUMERIC_ROWS: readonly (readonly string[])[] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

/**
 * Whether a tapped letter should come out capital.
 *
 * `Maj` is one-shot, like a real shift: it applies to the next letter and then
 * releases. A name is `Dupont`, not `DUPONT`, and a cashier who has to turn
 * shift off again will not.
 */
export function shiftChar(char: string, shifted: boolean): string {
  return shifted ? char.toLocaleUpperCase("fr-FR") : char;
}
