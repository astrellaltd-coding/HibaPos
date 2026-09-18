import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OnScreenKeyboardPanel } from "@/components/shared/on-screen-keyboard";

// L-213 — THE KEYBOARD, RENDERED.
//
// `renderToStaticMarkup` for the same reason `payment-line.test.tsx` gives: it
// is already a dependency, it needs no DOM and no test renderer, and adding
// either is a dependency decision rather than a batch's. What it proves is what
// is on the screen — the keys, their touch size, and that the panel can be
// reached at all while a modal dialog is open. What it cannot prove is a tap
// arriving in a React state, which is `tests/e2e/05-on-screen-keyboard.spec.ts`.

function render(props: Partial<Parameters<typeof OnScreenKeyboardPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <OnScreenKeyboardPanel
      layout="alpha"
      shifted={false}
      decimalSeparator=","
      onKey={() => {}}
      onShift={() => {}}
      onClose={() => {}}
      {...props}
    />,
  );
}

/** Each key's visible text, tags stripped — a key is `a<span>à</span>` now that
 *  a letter with accents carries a corner mark, so `>a</button>` no longer
 *  matches anything. Strips the mark's own span so the key reads as its letter. */
function keyTexts(html: string): string[] {
  return (html.match(/<button[^>]*>([\s\S]*?)<\/button>/g) ?? []).map((b) =>
    b
      .replace(/<span[^>]*text-\[9px\][^>]*>[\s\S]*?<\/span>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}

describe("L-213 — the letters", () => {
  const html = render();

  it("renders every letter of the alphabet", () => {
    const texts = keyTexts(html);
    for (const c of "abcdefghijklmnopqrstuvwxyz") {
      expect(texts, `the letter ${c} is not on the rendered keyboard`).toContain(c);
    }
  });

  it("RENDERS THE NUMPAD BESIDE THEM — the operator's « like a real keyboard »", () => {
    // The digit ROW is gone; the digits are a 3-wide block on the right. Both
    // halves matter: the capability must survive the row's removal.
    const texts = keyTexts(html);
    for (const d of "0123456789") {
      expect(texts, `${d} is not reachable from the letter keyboard`).toContain(d);
    }
  });

  it("MARKS THE KEYS THAT HIDE ACCENTS, so a long press is findable", () => {
    // The row of é è ê à ù ç ô î is gone and those characters now live under a
    // long press. A long press nobody can see is L-211's silence in another
    // costume — the characters would be present, reachable and unfindable. So
    // each such key carries its first variant as a small corner mark.
    expect(html, "the é mark is not on the e key").toContain(">é</span>");
    expect(html, "the à mark is not on the a key").toContain(">à</span>");
    expect(html, "the î mark is not on the i key").toContain(">î</span>");
    expect(html, "the ç mark is not on the c key").toContain(">ç</span>");
    // …and a letter with no accents carries no mark to mislead anyone.
    const marks = html.match(/<span[^>]*text-\[9px\][^>]*>([^<]*)<\/span>/g) ?? [];
    expect(marks.length).toBe(8); // a c e i n o u y — and nothing else
  });

  it("does NOT render the accents as keys of their own any more", () => {
    // The row they used to occupy is what paid for the numpad and the shorter
    // panel. If they come back, so does the row.
    const texts = keyTexts(html);
    for (const c of ["é", "è", "ê", "à", "ù", "ç", "ô", "î"]) {
      expect(texts, `${c} is back as a key of its own — that costs a row`).not.toContain(c);
    }
  });

  it("renders a space, a backspace, Entrée and a way out", () => {
    expect(html).toContain(">Espace</button>");
    expect(html).toContain(">Entrée</button>");
    expect(html).toContain('aria-label="Effacer"');
    expect(html).toContain('aria-label="Fermer le clavier"');
    // @ and . stay real keys: an email and a street address need them and
    // neither is worth a long press.
    const texts = keyTexts(html);
    expect(texts).toContain("@");
    expect(texts).toContain(".");
  });

  it("GIVES ENTRÉE AND EFFACER MORE ROOM, on the operator's instruction", () => {
    const wide = html.match(/<button[^>]*w-\[[0-9.]+rem\][^>]*>/g) ?? [];
    expect(wide.length, "no key is wider than a letter — Entrée and Effacer were asked to be").toBeGreaterThanOrEqual(3);
    // Entrée is the widest thing on the board after the space bar.
    expect(html).toMatch(/<button[^>]*w-\[7\.5rem\][^>]*>[\s\S]*?Entrée/);
    expect(html).toMatch(/<button[^>]*w-\[6\.5rem\][^>]*aria-label="Effacer"/);
  });

  it("CARRIES THE ORANGE, which is the app's own primary", () => {
    // « maybe a little bit of orange touch » — the operator, 2026-09-17.
    // `--primary` is the amber this product is built around (globals.css).
    expect(html, "the panel has no orange edge").toContain("border-t-primary/70");
    expect(html, "Effacer is not picked out").toContain("border-primary/50");
    // Entrée uses the primary BUTTON variant rather than an outline, which is
    // the orange fill itself.
    expect(html).toMatch(/<button[^>]*bg-primary[^>]*>[\s\S]*?Entrée/);
  });

  it("renders MAJUSCULES when shift is held, and says it is pressed", () => {
    const shifted = render({ shifted: true });
    const texts = keyTexts(shifted);
    expect(texts).toContain("D");
    expect(shifted, "a shifted long press must offer É, not é").toContain(">É</span>");
    expect(shifted).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });
});

describe("L-213 — the number pad", () => {
  const html = render({ layout: "numeric" });

  it("renders the ten digits and no letters", () => {
    for (const d of "0123456789") expect(html).toContain(`>${d}</button>`);
    expect(html).not.toContain(">Espace</button>");
    expect(html).not.toContain(">a</button>");
  });

  it("renders the separator it was handed, and not the other one", () => {
    // `shifts-view.tsx`'s cash fields are `type="number"`, where a comma is
    // sanitised to the empty string — so the panel is told which to draw
    // rather than deciding for itself.
    expect(html).toContain(">,</button>");
    const forNumber = render({ layout: "numeric", decimalSeparator: "." });
    expect(forNumber).toContain(">.</button>");
    expect(forNumber).not.toContain(">,</button>");
  });
});

describe("L-213 — it works on a till, and inside a dialog", () => {
  it("gives every key a 44 px touch target (L-131)", () => {
    for (const layout of ["alpha", "numeric"] as const) {
      const html = render({ layout });
      const buttons = html.match(/<button[^>]*>/g) ?? [];
      expect(buttons.length).toBeGreaterThan(10);
      for (const b of buttons) {
        expect(b, `a key is under the 44 px invariant: ${b.slice(0, 120)}`).toMatch(/min-h-\[44px\]/);
      }
    }
  });

  it("KEEPS ITS POINTER EVENTS while a modal dialog is open", () => {
    // Radix puts `pointer-events: none` on the body for a modal dialog, and
    // this panel is portalled to the body. Without the override every key is
    // dead on exactly the screens that need it most — the client picker being
    // the one the owner reported.
    expect(render()).toContain("pointer-events-auto");
  });

  it("marks its own subtree, which is how a dialog tells a key from a click outside", () => {
    expect(render()).toContain("data-osk-root");
  });

  it("sits at the bottom, above the dialog layer", () => {
    const html = render();
    expect(html).toContain("fixed");
    expect(html).toContain("bottom-0");
    // Radix's content and overlay are both z-50; a keyboard under them is a
    // keyboard nobody can reach.
    expect(html).toContain("z-[60]");
  });

  it("is a labelled group, so it is not an anonymous pile of buttons", () => {
    expect(render()).toContain('aria-label="Clavier tactile"');
  });

  it("makes every key type=button, so none of them submits a form", () => {
    // The same reason L-133 gives for its keypad: these live inside dialogs
    // that contain forms, and a key that submits one is a sale nobody rang.
    for (const layout of ["alpha", "numeric"] as const) {
      const buttons = (render({ layout }).match(/<button[^>]*>/g) ?? []).filter(
        (b) => !b.includes('type="button"'),
      );
      expect(buttons, `a key is not type=button: ${buttons[0]}`).toEqual([]);
    }
  });
});
