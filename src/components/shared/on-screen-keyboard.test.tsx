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

describe("L-213 — the letters", () => {
  const html = render();

  it("renders every letter of the alphabet", () => {
    for (const c of "abcdefghijklmnopqrstuvwxyz") {
      expect(html, `the letter ${c} is not on the rendered keyboard`).toContain(`>${c}</button>`);
    }
  });

  it("renders the accents a French name and address need", () => {
    for (const c of ["é", "è", "ê", "à", "ù", "ç", "ô", "î"]) {
      expect(html, `${c} is not on the rendered keyboard`).toContain(`>${c}</button>`);
    }
  });

  it("renders a space, a backspace, Entrée and a way out", () => {
    expect(html).toContain(">Espace</button>");
    expect(html).toContain(">Entrée</button>");
    expect(html).toContain('aria-label="Effacer"');
    expect(html).toContain('aria-label="Fermer le clavier"');
  });

  it("renders MAJUSCULES when shift is held, and says it is pressed", () => {
    const shifted = render({ shifted: true });
    expect(shifted).toContain(">D</button>");
    expect(shifted).toContain(">É</button>");
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
