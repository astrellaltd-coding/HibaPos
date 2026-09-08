import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// The product options dialog must start from the line being edited every time
// it OPENS.
//
// THE BUG THIS GUARDS, reported from the till on 2026-09-08. `pos-view.tsx`
// rendered the dialog unconditionally, so it mounted once and was reused for
// every product and every edit; its `useState(initial…)` calls ran on the first
// mount of the session and never again. Re-seeding was left to
// `setTimeout(reset, 200)` on CLOSE, and that closure captured the `editItem` of
// the render that closed the dialog. So the first open after adding a product
// showed NOTHING selected, and the first open after confirming an edit showed
// the selection as it had been BEFORE that edit. Closing and reopening appeared
// to fix it, because that second close finally captured the current line.
//
// WHY IT IS NOT COSMETIC. `cartAddons` in the dialog is built from the DISPLAYED
// selection and handed straight to `updateItem`. Confirming from a stale view
// therefore wrote the stale supplements onto the line — dropping ones the
// customer had asked for, or restoring ones they had removed — and moved the
// line price with them. The store was never wrong; the display was, and the
// display is the payload.
//
// THE FIX, AND WHY THE KEY MUST BE A COUNTER. The dialog is now remounted per
// open, via a `key` that `pos-view.tsx` bumps on every path that opens it. A key
// derived from the product id or the cart line's uid would NOT do: adding the
// same product twice, or editing the same line twice — which is exactly the
// reported sequence — reuses the instance and shows the previous open's state.
//
// WHY A SOURCE-LEVEL GUARD. This repository has no component-test tooling — no
// testing-library, no jsdom, no happy-dom — so nothing here can mount the dialog
// and open it twice. This is the treatment `deployment.test.ts` gives the
// PowerShell scripts and `touch-and-labels.test.ts` gives touch targets: read
// the file, assert the invariant, fail the build when it breaks. It CANNOT prove
// the dialog behaves correctly at runtime. It proves the broken mechanism has
// not come back and the one that replaced it has not been quietly undone. Run
// against the pre-fix files all four assertions below fail, which is the only
// reason to trust them.

const REPO_ROOT = process.cwd();
const DIALOG = "src/components/pos/product-options-dialog-v2.tsx";
const VIEW = "src/features/catalog/pos-view.tsx";

/** A file with its comments removed.
 *
 *  The timer assertion below failed on its first run against the comment that
 *  EXPLAINS the timer it forbids — the trap `touch-and-labels.test.ts` records
 *  about cheap matchers, in a smaller shape. Only whole-line and block comments
 *  go: taking `//` to end of line anywhere would cut a string literal that
 *  contains one, and a `setTimeout` sitting after real code on a line is worth
 *  failing on anyway. */
function code(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/** The initialiser expression of every `useState` in a file.
 *
 *  Written as a scanner rather than a regex because the first attempt,
 *  `useState(?:<[^>]*>)?\(`, matched none of them: the generic here is
 *  `useState<Record<string, string[]>>(…)` and `[^>]*` stops at the FIRST `>`,
 *  inside `Record<string`. That is `touch-and-labels.test.ts`'s recorded lesson
 *  — a cheap matcher bakes its own error into the guard — met twice while
 *  writing this file. So: skip a generic by counting `<` and `>`, then take the
 *  balanced parenthesised argument. */
function useStateInits(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  for (;;) {
    i = src.indexOf("useState", i);
    if (i < 0) return out;
    let j = i + "useState".length;
    if (src[j] === "<") {
      let depth = 0;
      for (; j < src.length; j++) {
        if (src[j] === "<") depth++;
        else if (src[j] === ">" && --depth === 0) { j++; break; }
      }
    }
    if (src[j] !== "(") { i = j; continue; }
    let depth = 0;
    const start = j + 1;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")" && --depth === 0) { out.push(src.slice(start, j)); j++; break; }
    }
    i = j;
  }
}

describe("the product options dialog starts fresh on every open", () => {
  it("is mounted with a key", () => {
    const m = /<ProductOptionsDialog\b[^>]*?\bkey=\{([A-Za-z0-9_]+)\}/.exec(code(VIEW));
    expect(
      m,
      `${VIEW}: <ProductOptionsDialog> has no key={…}. Without one React reuses the ` +
        "instance across opens and it shows the previous open's selection.",
    ).toBeTruthy();
  });

  it("gives it a fresh key on every path that opens it", () => {
    const view = code(VIEW);
    const key = /<ProductOptionsDialog\b[^>]*?\bkey=\{([A-Za-z0-9_]+)\}/.exec(view)?.[1];
    expect(key, "no key identifier to check").toBeTruthy();

    // `const [optionsSeq, setOptionsSeq] = useState(0)` → the setter for the key.
    const decl = new RegExp(`\\[\\s*${key}\\s*,\\s*([A-Za-z0-9_]+)\\s*\\]`).exec(view);
    expect(decl, `${VIEW}: key \`${key}\` is not a useState value, so nothing can bump it.`).toBeTruthy();

    const bumps = (view.match(new RegExp(`\\b${decl![1]}\\(`, "g")) ?? []).length;
    const opens = (view.match(/setOptionsOpen\(true\)/g) ?? []).length;
    expect(opens, `${VIEW}: no call opens the dialog — has it been renamed?`).toBeGreaterThan(1);
    expect(
      bumps,
      `${VIEW}: the dialog is opened ${opens} ways but its key is bumped ${bumps} times. ` +
        "Every path that opens it must give it a fresh key, or that path shows the previous open's state.",
    ).toBeGreaterThanOrEqual(opens);
  });

  it("seeds its state from the item being edited, not from constants", () => {
    const inits = useStateInits(code(DIALOG)).join(" | ");
    for (const ref of ["initialSelected", "initialAddons", "editItem"]) {
      expect(
        inits.includes(ref),
        `${DIALOG}: no useState initialiser reads \`${ref}\`. Remounting only helps if the ` +
          "initialisers are what carry the edited line into the dialog.",
      ).toBe(true);
    }
  });

  it("does not re-seed on a timer, which is what captured a stale editItem", () => {
    expect(
      code(DIALOG).includes("setTimeout"),
      `${DIALOG}: a setTimeout is back. Re-seeding after a delay reads the props of the ` +
        "render that scheduled it, which is exactly how the stale selection arose.",
    ).toBe(false);
  });
});
