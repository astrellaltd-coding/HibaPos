"use client";

/**
 * L-213 — an on-screen keyboard for a till with no keyboard.
 *
 * WHAT THE OWNER ASKED FOR, 2026-09-17: the France till has a wired keyboard
 * and he wants to work by touch. What he had not yet hit is that the DAY CANNOT
 * BE CLOSED without that keyboard — « Espèces comptées » and « Fond de caisse
 * initial » are typed boxes with no pad beside them, so the nightly fiscal seal
 * needs hardware the machine was chosen not to need.
 *
 * WHY IT IS OURS AND NOT WINDOWS'. The operator's decision, 2026-09-17. TabTip
 * only auto-shows when no keyboard is connected — one is — `--kiosk` hides the
 * taskbar button that would summon it by hand (L-212), and it disappears
 * entirely under Tauri v2, which has no browser chrome to host it. Buttons we
 * draw need no Windows setting, cannot be hidden by a launch flag, survive the
 * native-app move untouched, and are the only one of the two a test can see.
 * That is also what `CLAUDE.md` asks for: where a fix has two reasonable forms,
 * take the one that survives becoming a Windows native app.
 *
 * ONE LISTENER, NOT NINETY-FOUR PROPS. The operator chose « every typed field
 * in the app », and there are 94 of them across 27 files. So this mounts once
 * in the root layout and watches `focusin`: any field that qualifies gets a pad
 * and a field added next year gets one without anybody remembering to come
 * back here. Nothing is passed down and no call site changes.
 *
 * IT NEVER OWNS A FIELD. Inherited from L-133, which added the step-up PIN
 * keypad beside its field rather than in place of it: « The field is untouched,
 * so a keyboard still works. This is added beside it, so a finger does too. »
 * Every tap here goes through the field's own native value setter and a
 * bubbling `input` event, which is exactly what a keystroke does — so React's
 * `onChange` fires, the component's state is the one source of truth, and a
 * failure in this file leaves the wired keyboard working as it does today.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Delete, X } from "lucide-react";
import {
  AZERTY_ROWS,
  NUMERIC_ROWS,
  OSK_BACKSPACE,
  OSK_ENTER,
  OSK_ROOT_ATTR,
  applyKey,
  armsSeparator,
  decimalSeparatorFor,
  layoutFor,
  resolveKey,
  shiftChar,
  supportsSelection,
  variantsFor,
  type FieldFacts,
  type OskLayout,
} from "@/lib/osk";

/* ────────────────────────────────────────────────────────────────────────────
 * THE PANEL — pure, and therefore testable.
 *
 * Split out from the shell below for one reason: `bun test` has no DOM, so the
 * only way to assert what the keyboard actually renders is
 * `renderToStaticMarkup`, the technique `payment-line.test.tsx` established.
 * This half takes a layout and a callback and renders buttons; the half below
 * it is the part that needs a browser, and is covered by the e2e spec.
 * ──────────────────────────────────────────────────────────────────────────── */

/** 44 px is an invariant here (L-131), and a key is a touch target like any other. */
const KEY = "h-11 min-h-[44px] min-w-[44px] text-base font-medium";

/** How long a finger must rest on a key before its accents appear. */
const LONG_PRESS_MS = 420;

/**
 * ONE KEY, and the only place a long press is understood.
 *
 * IT INSERTS ON `pointerup`, NOT `pointerdown`, and that moved for the long
 * press: a key that has already typed by the time the finger has rested on it
 * cannot then offer anything else. `preventDefault` stays on `pointerdown`,
 * because that is what keeps focus — and the caret — in the field being typed
 * into. The pointer sequence continues after it, so `pointerup` still arrives.
 */
function Key({
  label,
  value,
  variants = [],
  open = false,
  onPress,
  onInsert = undefined,
  onOpenVariants,
  onCloseVariants,
  className,
  children,
  ...rest
}: {
  label?: string;
  value: string;
  variants?: string[];
  open?: boolean;
  onPress: (v: string) => void;
  /** Types WITHOUT closing the accents. Defaults to `onPress`; only a key
   *  that owns a popover needs the distinction. */
  onInsert?: (v: string) => void;
  onOpenVariants?: () => void;
  onCloseVariants?: () => void;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentProps<typeof Button>, "onPress" | "value" | "children">) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opened = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <div className={cn("relative", className)}>
      {open && variants.length > 0 && (
        /* The accents, above the key they belong to. Orange-edged so it reads
         * as the same family as the Entrée key and the panel's own top line. */
        <div className="absolute bottom-[calc(100%+4px)] left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-xl border-2 border-primary/70 bg-popover p-1 shadow-xl">
          {variants.map((v) => (
            <Button
              key={v}
              type="button"
              variant="outline"
              aria-label={`Insérer ${v}`}
              className={cn(KEY, "px-3 text-lg")}
              /* INSERTS ON DOWN, CLOSES ON UP, and the split is deliberate.
               * Closing on `pointerdown` unmounted this very button while the
               * event was still bubbling — `pointerdown` is discrete, so React
               * flushes the removal synchronously — and Radix then saw a click
               * from a node with no parents and dismissed the dialog being
               * typed into. Staying mounted until `pointerup` also matches what
               * a phone does: the accents stay up while the finger is down. */
              onPointerDown={(e) => {
                e.preventDefault();
                (onInsert ?? onPress)(v);
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                onCloseVariants?.();
              }}
            >
              {v}
            </Button>
          ))}
        </div>
      )}
      <Button
        type="button"
        aria-label={label}
        className={cn(KEY, "w-full px-0", className)}
        onPointerDown={(e) => {
          e.preventDefault();
          opened.current = false;
          if (variants.length > 0 && onOpenVariants) {
            timer.current = setTimeout(() => {
              opened.current = true;
              onOpenVariants();
            }, LONG_PRESS_MS);
          }
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          clear();
          if (opened.current) return; // the long press did the work
          if (open) {
            onCloseVariants?.();
            return;
          }
          onPress(value);
        }}
        onPointerLeave={clear}
        onPointerCancel={clear}
        {...rest}
      >
        {children ?? value}
        {variants.length > 0 && (
          /* THE MARK THAT SAYS THERE IS MORE HERE. A long press nobody can see
           * is L-211's silence in another costume — the characters would be
           * present, reachable and unfindable. */
          <span
            aria-hidden
            className="pointer-events-none absolute right-1 top-0.5 text-[9px] font-semibold leading-none text-primary/70"
          >
            {variants[0]}
          </span>
        )}
      </Button>
    </div>
  );
}

export function OnScreenKeyboardPanel({
  panelRef,
  layout,
  shifted,
  decimalSeparator,
  separatorArmed = false,
  onKey,
  onShift,
  onClose,
}: {
  /** L-213: the shell measures this node to publish `--osk-height`. */
  panelRef?: React.Ref<HTMLDivElement>;
  layout: Exclude<OskLayout, "none">;
  shifted: boolean;
  decimalSeparator: "," | ".";
  /** A separator waiting for its first decimal digit — see `armsSeparator`. */
  separatorArmed?: boolean;
  onKey: (key: string) => void;
  onShift: () => void;
  onClose: () => void;
}) {
  /** Which key currently has its accents showing, if any. */
  const [openVariants, setOpenVariants] = useState<string | null>(null);

  /** Every key press closes an open accent popover, whichever key opened it. */
  const press = (key: string) => {
    setOpenVariants(null);
    onKey(key);
  };

  /**
   * Type WITHOUT closing the accents. Only the accent buttons use it, and they
   * close themselves on `pointerup` instead — closing during `pointerdown`
   * unmounts the button mid-event and Radix then dismisses the dialog being
   * typed into. `isFromOsk` carries the other half of that story.
   */
  const insert = (key: string) => onKey(key);

  const digits = (
    <div className="grid grid-cols-3 gap-1.5">
      {NUMERIC_ROWS.flat().map((d) => (
        <Key
          key={d}
          value={d}
          label={d}
          onPress={press}
          variant="outline"
          className="text-lg font-semibold tabular-nums"
        />
      ))}
    </div>
  );

  return (
    <div
      ref={panelRef}
      {...{ [OSK_ROOT_ATTR]: "" }}
      role="group"
      aria-label="Clavier tactile"
      /**
       * `pointer-events-auto` is load-bearing, not tidiness. Radix puts
       * `pointer-events: none` on `document.body` while a modal dialog is
       * open, and this panel is portalled to the body — so without this
       * override every key in it is dead on exactly the screens that need it
       * most, the client picker among them.
       */
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[60] border-t-2 border-t-primary/70 bg-card/95 px-2 pb-2 pt-1.5 shadow-[0_-4px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl"
    >
      {layout === "alpha" ? (
        <div className="mx-auto flex max-w-4xl items-stretch gap-2">
          {/* THE LETTERS. Three rows since the refinement of 2026-09-17: the
            * digits moved to the pad on the right and the accents went under a
            * long press, which is two rows of a screen L-211 measured short. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {AZERTY_ROWS.map((row, i) => (
              <div key={i} className="flex justify-center gap-1.5">
                {i === 2 && (
                  <Key
                    value=""
                    label="Majuscule"
                    aria-pressed={shifted}
                    variant={shifted ? "default" : "outline"}
                    className="w-[4.5rem] shrink-0"
                    onPress={() => {
                      setOpenVariants(null);
                      onShift();
                    }}
                  >
                    Maj
                  </Key>
                )}
                {row.map((char) => {
                  const cased = shiftChar(char, shifted);
                  return (
                    <Key
                      key={char}
                      value={cased}
                      /* An EXACT label, because the corner mark is inside the
                       * button: a key for « a » reads « aà » as text content,
                       * which a screen reader would say and a selector would
                       * miss. The label is the letter and nothing else. */
                      label={cased}
                      variants={variantsFor(char, shifted)}
                      open={openVariants === char}
                      onInsert={insert}
                      onOpenVariants={() => setOpenVariants(char)}
                      onCloseVariants={() => setOpenVariants(null)}
                      onPress={press}
                      variant="outline"
                      className="flex-1"
                    />
                  );
                })}
                {i === 2 && (
                  /* BIGGER, on the operator's instruction. It is the key a
                   * cashier reaches for most after a mistyped name. */
                  <Key
                    value={OSK_BACKSPACE}
                    label="Effacer"
                    onPress={press}
                    variant="outline"
                    className="w-[6.5rem] shrink-0 border-primary/50 text-primary"
                  >
                    <Delete className="h-5 w-5" />
                  </Key>
                )}
              </div>
            ))}
            <div className="flex justify-center gap-1.5">
              <Key value="@" label="@" onPress={press} variant="outline" className="w-14 shrink-0" />
              <Key value="." label="." onPress={press} variant="outline" className="w-14 shrink-0" />
              <Key value=" " label="Espace" onPress={press} variant="outline" className="flex-1">
                Espace
              </Key>
              {/* BIGGER, and the one orange key on the board — it is the key
                * that means « done » on every field this opens over. */}
              <Key
                value={OSK_ENTER}
                label="Entrée"
                onPress={press}
                variant="default"
                className="w-[7.5rem] shrink-0 text-base font-semibold"
              >
                Entrée
              </Key>
            </div>
          </div>

          {/* THE NUMPAD, ON THE RIGHT, « like a real keyboard » — the
            * operator's instruction, 2026-09-17. A house number and a telephone
            * number are most of what is typed here after the name. */}
          <div className="flex shrink-0 flex-col gap-1.5">
            {digits}
            <div className="flex gap-1.5">
              <Key value="0" label="0" onPress={press} variant="outline" className="flex-1 text-lg font-semibold tabular-nums" />
              <Key
                value=""
                label="Fermer le clavier"
                onPress={() => onClose()}
                variant="ghost"
                className="w-11 shrink-0 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Key>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[340px]">
          <div className="mb-1.5">{digits}</div>
          <div className="mb-1.5 flex gap-1.5">
            {/* ARMED IS SHOWN, because a key that does nothing visible is the
              * defect this project keeps finding (L-211, L-214). On a
              * `type="number"` field the separator cannot go in until a decimal
              * digit follows it, so the key holds instead — and says so the
              * same way `Maj` does, by looking pressed. */}
            <Key
              value={decimalSeparator}
              label="Virgule"
              aria-pressed={separatorArmed}
              onPress={press}
              variant={separatorArmed ? "default" : "outline"}
              className="flex-1 text-lg font-semibold"
            />
            <Key value="0" label="0" onPress={press} variant="outline" className="flex-1 text-lg font-semibold tabular-nums" />
            <Key
              value={OSK_BACKSPACE}
              label="Effacer"
              onPress={press}
              variant="outline"
              className="flex-1 border-primary/50 text-primary"
            >
              <Delete className="h-5 w-5" />
            </Key>
          </div>
          <div className="flex gap-1.5">
            <Key
              value={OSK_ENTER}
              label="Entrée"
              onPress={press}
              variant="default"
              className="flex-1 text-base font-semibold"
            >
              Entrée
            </Key>
            <Key
              value=""
              label="Fermer le clavier"
              onPress={() => onClose()}
              variant="ghost"
              className="w-11 shrink-0 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Key>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * THE SHELL — the part that needs a browser.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Read the rules' inputs off a live node. The only DOM-reading in this file. */
function factsOf(el: Element): FieldFacts {
  const tag =
    el instanceof HTMLTextAreaElement ? "textarea" : el instanceof HTMLInputElement ? "input" : "other";
  const input = el as HTMLInputElement;
  return {
    tag,
    type: tag === "input" ? (input.getAttribute("type") ?? "").toLowerCase() : "",
    inputMode: (el.getAttribute("inputmode") ?? "").toLowerCase(),
    readOnly: tag !== "other" && (el as HTMLInputElement | HTMLTextAreaElement).readOnly,
    disabled: tag !== "other" && (el as HTMLInputElement | HTMLTextAreaElement).disabled,
    optOut: el.closest('[data-osk="off"]') !== null,
  };
}

export function OnScreenKeyboard() {
  const [layout, setLayout] = useState<OskLayout>("none");
  const [shifted, setShifted] = useState(false);
  /** A decimal separator waiting for its first digit — see `armsSeparator`. */
  const [separatorArmed, setSeparatorArmed] = useState(false);
  /**
   * The focused field's `type`, IN STATE rather than read off the ref at
   * render time. It decides which separator the panel draws, and a ref read
   * during render can be stale — `react-hooks/refs` refuses it, correctly: the
   * ref can change without a re-render, and a number field would then be drawn
   * a comma, which is the one character it cannot hold. Set on the same event
   * that sets the layout, so the two can never disagree.
   */
  const [fieldType, setFieldType] = useState("");
  const target = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  /** The field the operator closed the keyboard on, so it does not spring back. */
  const dismissed = useRef<Element | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);

  /**
   * PUBLISH THE PANEL'S HEIGHT so a dialog can get out of its way.
   *
   * FOUND BY THE E2E SPEC: three delivery tests timed out clicking « Créer »
   * because this panel was sitting on top of the dialog's buttons. A cashier
   * would have typed an address and been unable to reach the button that saves
   * it — and on the France till, which L-211 measured short of a third of the
   * pixels this layout wants, that is the normal case rather than a corner.
   *
   * MEASURED, not assumed: the alpha pad and the number pad are different
   * heights, and both change with the browser's font size. `globals.css` reads
   * `--osk-height` and centres a dialog in the space above the keyboard.
   * Cleared when no keyboard is shown, so nothing else has to know.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (layout === "none" || !panel.current) {
      root.style.removeProperty("--osk-height");
      return;
    }
    const publish = () => {
      const h = panel.current?.offsetHeight ?? 0;
      root.style.setProperty("--osk-height", `${h}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(panel.current);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--osk-height");
    };
  }, [layout]);

  useEffect(() => {
    const cancelHide = () => {
      if (hideTimer.current !== null) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      cancelHide();
      const next = layoutFor(factsOf(el));
      if (next === "none") {
        target.current = null;
        setLayout("none");
        return;
      }
      if (dismissed.current === el) return;
      dismissed.current = null;
      target.current = el as HTMLInputElement | HTMLTextAreaElement;
      setShifted(false);
      setSeparatorArmed(false);
      setFieldType(el instanceof HTMLInputElement ? (el.getAttribute("type") ?? "").toLowerCase() : "");
      setLayout(next);
      /**
       * The panel takes the bottom of a screen L-211 has already shown to be
       * short of vertical space, so the field is pulled into view rather than
       * left underneath it. `block: "center"` and not `"nearest"`: nearest
       * leaves a field that is merely *visible* exactly where it was, which on
       * that till is often behind the keyboard.
       */
      requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: "smooth" }));
    };

    /**
     * A tap on a key cannot reach here — the keys prevent the default on
     * `pointerdown`, so the field never blurs. This fires when focus genuinely
     * leaves: a dialog closing, another control taking over, the operator
     * tapping the page. The delay exists for the one case where focus lands on
     * another field a frame later, which `focusin` then cancels.
     */
    const onFocusOut = () => {
      cancelHide();
      hideTimer.current = setTimeout(() => {
        target.current = null;
        setLayout("none");
      }, 120);
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      cancelHide();
    };
  }, []);

  const handleKey = useCallback((rawKey: string) => {
    const el = target.current;
    if (!el) return;
    const type = el instanceof HTMLInputElement ? (el.getAttribute("type") ?? "").toLowerCase() : "";

    // A separator on a number field WAITS for its first decimal digit. The
    // reason is in `armsSeparator`: `50.` is not a value such a field can hold,
    // so writing it made the field report `""` and the next tap started over.
    if (armsSeparator(rawKey, type, el.value)) {
      setSeparatorArmed(true);
      return;
    }
    const key = resolveKey(rawKey, separatorArmed, decimalSeparatorFor(type));
    setSeparatorArmed(false);

    if (key === OSK_ENTER) {
      /**
       * Enter is DISPATCHED, not inserted. Several fields already act on it —
       * the payment dialog's « Montant libre » adds the line, the step-up
       * dialog submits — and those handlers are React's `onKeyDown`, which a
       * bubbling KeyboardEvent reaches. It deliberately does not submit a
       * form: browsers only do implicit submission from a real user gesture,
       * so a tap here can never post something nobody asked it to.
       */
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return;
    }

    const canSelect = supportsSelection(type);
    const before = {
      value: el.value,
      start: canSelect ? (el.selectionStart ?? el.value.length) : el.value.length,
      end: canSelect ? (el.selectionEnd ?? el.value.length) : el.value.length,
    };
    const after = applyKey(before, key, type);
    if (after === before || after.value === before.value) {
      setShifted(false);
      return;
    }

    /**
     * THE NATIVE SETTER, NOT `el.value = …`. React 19 tracks the last value it
     * wrote on the node; assigning through the property React has shadowed
     * makes the following `input` event look like a no-op and the state never
     * moves. Going through the prototype's own setter is what a real keystroke
     * does, and it is why every controlled field in this app works with this
     * keyboard without knowing it exists.
     */
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, after.value);
    else el.value = after.value;
    el.dispatchEvent(new Event("input", { bubbles: true }));

    if (canSelect) {
      try {
        el.setSelectionRange(after.start, after.end);
      } catch {
        // `setSelectionRange` throws on a field that does not support
        // selection. `supportsSelection` already rules those out; this is the
        // belt for a type nobody has thought of yet.
      }
    }
    setShifted(false);
  }, [separatorArmed]);

  const close = useCallback(() => {
    dismissed.current = target.current;
    target.current = null;
    setSeparatorArmed(false);
    setLayout("none");
  }, []);

  /**
   * NO `mounted` FLAG, and that is deliberate rather than an omission.
   *
   * The usual « am I on the client yet » state was here and `react-hooks/
   * set-state-in-effect` refused it, rightly. It was never needed: `layout`
   * starts at `"none"` and only leaves it on a `focusin`, which cannot happen
   * on a server. So the server render and the first client render both return
   * null — no hydration mismatch — and `document.body` is touched only on a
   * render that a real focus event caused.
   */
  if (layout === "none") return null;

  return createPortal(
    <OnScreenKeyboardPanel
      panelRef={panel}
      layout={layout}
      shifted={shifted}
      decimalSeparator={decimalSeparatorFor(fieldType)}
      separatorArmed={separatorArmed}
      onKey={handleKey}
      onShift={() => setShifted((s) => !s)}
      onClose={close}
    />,
    document.body,
  );
}
