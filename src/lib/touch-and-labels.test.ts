import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "fs";
import path from "path";

// L-09 and L-10 (Batch 7.6) — touch targets and label association, as standing
// assertions over the source rather than as a one-off audit.
//
// WHY OVER THE SOURCE. Both findings came from a manual pass ("Phase 10"), both
// were then found to have decayed, and a second manual pass would decay the same
// way. This is the treatment `deployment.test.ts` gives the PowerShell scripts
// and `role-model.test.ts` gives the removed role: read the files, assert the
// invariant, fail the build when it breaks.
//
// WHAT IT PROVES, AND WHAT IT DOES NOT. It proves the source declares no
// undersized target and leaves no control unnamed. It cannot prove the rendered
// page: a parent with `overflow-hidden`, a transform, or a competing utility can
// still shrink something at runtime. **Confirming the till actually reads well
// is an [OWNER] check at the commissioning session**, and the runbook carries it.
//
// THE PARSER IS THE POINT. Two measurements during this batch were wrong before
// this existed: a line-based grep reported 10 nameless icon buttons (it missed
// `aria-label` on an adjacent line — the real count was 0), and a non-greedy
// regex reported 33 nameless inputs (it stopped at the first `>`, which inside
// `onChange={(e) => …}` is the arrow — the real count was 5). So this reads
// whole JSX elements, tracking braces, quotes and nesting. A cheaper matcher
// here would bake those same errors into the guard.

const REPO_ROOT = process.cwd();

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    // R9.1: `.test.tsx` excluded. Every check in this file is about what a
    // screen reader meets on a SCREEN, and a component test is not one — its
    // `id="…"` occurrences are assertions about a screen, counted here as if
    // they were the screen. `receipt-printable.test.tsx` (L-97) is what found
    // this; the two component tests that predate it declare no ids, so the
    // case had simply never arisen. The scope narrows, no check does.
    if (full.endsWith(".test.tsx")) return [];
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/**
 * Source with `//` comment lines blanked — R9.10.
 *
 * `elements()` below matches text, and a comment that NAMES a component is
 * indistinguishable from one that uses it: `elements(src, "Input")` matched
 * `<Input>` written inside a sentence explaining why the primitive is 44 px,
 * and reported the prose as a nameless control.
 *
 * Blanked rather than removed, so every byte offset — and therefore every line
 * number in a failure message — still points at the real file.
 */
function withoutLineComments(src: string): string {
  return src
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? " ".repeat(l.length) : l))
    .join("\n");
}

/** Every `<Name …>` element in `src`, as whole tags. */
function elements(rawSrc: string, name: string): { at: number; tag: string }[] {
  const src = withoutLineComments(rawSrc);
  const out: { at: number; tag: string }[] = [];
  let i = 0;
  for (;;) {
    i = src.indexOf("<" + name, i);
    if (i < 0) return out;
    const next = src[i + 1 + name.length];
    if (next && /[A-Za-z0-9_-]/.test(next)) { i += 1; continue; }  // <Inputs…>, not <Input
    let j = i + 1 + name.length, depth = 0, quote: string | null = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === quote && src[j - 1] !== "\\") quote = null; }
      else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) { out.push({ at: i, tag: src.slice(i, j + 1) }); break; }
    }
    i = j + 1;
  }
}

const FILES = tsxFiles(path.join(REPO_ROOT, "src"));
const rel = (f: string) => path.relative(REPO_ROOT, f).split(path.sep).join("/");
const lineOf = (src: string, at: number) => src.slice(0, at).split("\n").length;

// Tailwind's scale, in CSS pixels. h-11 is 44, h-12 is 48.
const PX_PER_STEP = 4;

describe("L-09 — every touch target is at least 44px", () => {
  it("no Button declares a height or width below 44px without rescuing it", () => {
    // 44 is WCAG 2.5.5's floor. This codebase's own Phase 10 convention was 48,
    // which is what `min-h-[48px]` scattered through cart-panel.tsx means; the
    // three sites this batch fixed are where that convention lapsed.
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const { at, tag } of elements(src, "Button")) {
        for (const axis of ["h", "w"] as const) {
          const m = new RegExp(`\\b${axis}-(\\d+)\\b`).exec(tag);
          if (!m) continue;
          if (Number(m[1]) * PX_PER_STEP >= 44) continue;
          const rescue = new RegExp(`min-${axis}-\\[(4[4-9]|[5-9]\\d)px\\]`).test(tag);
          if (!rescue) offenders.push(`${rel(file)}:${lineOf(src, at)} — ${axis}-${m[1]} (${Number(m[1]) * PX_PER_STEP}px)`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the Button primitive's own size variants are all at least 44px (L-64)", () => {
    // The check above reads CALL SITES, and 103 of 144 Buttons declare no
    // height at all — they take the variant's. So until Batch 7.7 raised these,
    // the guard above could pass while most of the application was undersized.
    // That gap is why L-64 existed and why this assertion sits beside it.
    const src = readFileSync(path.join(REPO_ROOT, "src/components/ui/button.tsx"), "utf8");
    const block = src.slice(src.indexOf("size: {"), src.indexOf("}", src.indexOf("size: {")));
    const offenders: string[] = [];
    for (const m of block.matchAll(/(\w+):\s*"([^"]*)"/g)) {
      const [, variant, classes] = m;
      const size = /\b(?:h|size)-(\d+)\b/.exec(classes);
      if (!size) { offenders.push(`${variant}: declares no height`); continue; }
      if (Number(size[1]) * PX_PER_STEP < 44) {
        offenders.push(`${variant}: ${size[0]} is ${Number(size[1]) * PX_PER_STEP}px`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  // ── L-131 (R9.10) — THE GUARD READS MORE THAN `<Button>` ───────────────────
  //
  // Three targets under 44 px, and **this file could see none of them**: it
  // reads `<Button>` call sites and the `Button` primitive's variants, so a
  // `DialogPrimitive.Close`, an `<Input>` and a raw `<input>` were all outside
  // it. Measured with `getBoundingClientRect()` on the running build:
  //
  //   dialog close « × »   **16 × 16 px** — every dialog in the product
  //   the `Input` primitive   36 px — and it is the STEP-UP PIN field, which
  //                           gates every refund and every discount over 20 %
  //   the discount amount     40 px, and no accessible name either
  //
  // This is the same widening L-64 made when it turned out 103 of 144 Buttons
  // declared no height at all and took the variant's.

  it("the Input primitive is at least 44px — it is the step-up PIN field", () => {
    // A SHARED primitive, so one class decides the size of every text field in
    // the product. The one that matters most is the PIN dialog's.
    const src = readFileSync(path.join(REPO_ROOT, "src/components/ui/input.tsx"), "utf8");
    const m = /\bh-(\d+)\b/.exec(src);
    expect(m, "input.tsx declares no height at all").not.toBeNull();
    expect(
      Number(m![1]) * PX_PER_STEP,
      `the shared Input primitive is ${Number(m![1]) * PX_PER_STEP}px`,
    ).toBeGreaterThanOrEqual(44);
  });

  it("every dialog's close button is at least 44px", () => {
    // A `DialogPrimitive.Close`, not a `<Button>` — which is exactly why the
    // check at the top of this file never saw it. The ICON stays 16 px; the
    // target is what has to be 44.
    // THE ELEMENT, not the name. `indexOf("DialogPrimitive.Close")` found the
    // name in the comment above the component and sliced prose — the same
    // self-matching shape as the comment problem `withoutLineComments` fixes.
    //
    // Scoped to `DialogContent`, because the FIRST `DialogPrimitive.Close` in
    // the file is the bare `DialogClose` re-export — a pass-through with no
    // classes of its own, which is correct and is not the button anybody taps.
    // The one that renders the cross lives inside `DialogContent`.
    const whole = readFileSync(path.join(REPO_ROOT, "src/components/ui/dialog.tsx"), "utf8");
    const from = whole.indexOf("function DialogContent(");
    expect(from, "DialogContent moved").toBeGreaterThan(0);
    const src = whole.slice(from);
    const found = elements(src, "DialogPrimitive.Close");
    expect(found.length, "the dialog close moved out of DialogContent").toBeGreaterThan(0);
    const tag = found[0].tag;
    for (const axis of ["h", "w"] as const) {
      const m = new RegExp(`\\b${axis}-(\\d+)\\b`).exec(tag);
      expect(m, `the dialog close declares no ${axis}`).not.toBeNull();
      expect(
        Number(m![1]) * PX_PER_STEP,
        `the dialog close is ${Number(m![1]) * PX_PER_STEP}px on ${axis}`,
      ).toBeGreaterThanOrEqual(44);
    }
  });

  /**
   * Undersized raw controls that R9.10 found, reviewed and left — L-131.
   *
   * The widened sweep turned up eleven. One was on the TILL during service —
   * the POS search field at 36 px — and was fixed. These ten are not: they are
   * the catalogue and settings screens, which the operator uses deliberately,
   * away from the counter, and which the audit's own pass structure treats
   * separately from « the till in use ».
   *
   * **They are listed rather than excluded by a rule**, so each one is a
   * decision somebody can disagree with, and so the list can only shrink — the
   * check below fails if an entry stops being undersized, the same discipline
   * `touch-and-labels.test.ts` already applies to its own exemptions (« If an
   * icon-only Button without a name is ever legitimate again, add the skip back
   * WITH a test that fails when it becomes unnecessary »).
   *
   * Six are NATIVE CHECKBOXES at `h-4 w-4`, which is the browser's own size.
   * Making the box 44 px would change how the settings screen looks rather than
   * how it is hit; the durable answer is a 44 px hit area around each one,
   * which is a layout change per site and not this batch's.
   */
  const KNOWN_UNDERSIZED = [
    "src/components/catalog/combo-slots-editor.tsx — <input> h-4: native checkbox",
    "src/features/admin/first-run-keys-card.tsx — <input> h-4: native checkbox",
    "src/features/admin/settings-view.tsx — <input> h-4: native checkbox ×4",
    "src/features/catalog/categories-view.tsx — <input> h-8: option-choice price field",
    "src/features/catalog/categories-view.tsx — <button> h-3 ×2: remove-image cross on a thumbnail",
    "src/features/catalog/products-view.tsx — <button> h-8: inline row action",
  ];

  it("no RAW input or button declares a height below 44px", () => {
    // The third shape the old guard could not see: a bare `<input>` or
    // `<button>` written inline rather than through a primitive. The discount
    // amount field was one, at 40 px.
    //
    // Ten known offenders are allowed through by FILE — see `KNOWN_UNDERSIZED`
    // above — and the test below fails when that list stops matching reality,
    // so it cannot quietly grow.
    const allowedFiles = new Set(KNOWN_UNDERSIZED.map((e) => e.split(" — ")[0]));
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const name of ["input", "button", "textarea", "select"]) {
        for (const { at, tag } of elements(src, name)) {
          for (const axis of ["h", "w"] as const) {
            const m = new RegExp(`\\b${axis}-(\\d+)\\b`).exec(tag);
            if (!m) continue;
            if (Number(m[1]) * PX_PER_STEP >= 44) continue;
            // Same rescue the Button check allows.
            if (new RegExp(`min-${axis}-\\[(4[4-9]|[5-9]\\d)px\\]`).test(tag)) continue;
            // `w-` on a full-width field is not a touch target problem; only a
            // height below the floor is. A narrow `w-` with a tall `h-` is a
            // deliberate shape, e.g. a quantity stepper.
            if (axis === "w") continue;
            if (allowedFiles.has(rel(file))) continue;
            offenders.push(
              `${rel(file)}:${lineOf(src, at)} — <${name}> ${axis}-${m[1]} (${Number(m[1]) * PX_PER_STEP}px)`,
            );
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("the known-undersized list only ever shrinks", () => {
    // An exemption that outlives its reason is worse than no exemption: it
    // reads as « reviewed » forever. Every file on that list must STILL carry
    // an undersized control, or the entry goes.
    const stale: string[] = [];
    for (const entry of KNOWN_UNDERSIZED) {
      const file = entry.split(" — ")[0];
      const full = FILES.find((f) => rel(f) === file);
      if (!full) {
        stale.push(`${file}: gone — remove this entry`);
        continue;
      }
      const src = readFileSync(full, "utf8");
      let undersized = false;
      for (const name of ["input", "button", "textarea", "select"]) {
        for (const { tag } of elements(src, name)) {
          const m = /\bh-(\d+)\b/.exec(tag);
          if (m && Number(m[1]) * PX_PER_STEP < 44) undersized = true;
        }
      }
      if (!undersized) stale.push(`${file}: no longer undersized — remove this entry`);
    }
    expect(stale, stale.join("\n")).toEqual([]);
  });

  it("does NOT exempt anything on the till's own screens", () => {
    // The distinction the list rests on. If a POS or checkout screen ever
    // appears on it, the reason given above stops being true.
    const onTheTill = KNOWN_UNDERSIZED.filter((e) =>
      /\/(pos|checkout|shifts)\//.test(e) || /topbar|cart-panel/.test(e),
    );
    expect(onTheTill, "a till screen was exempted from the 44px floor").toEqual([]);
  });

  it("finds raw elements at all, so the check above is not vacuous", () => {
    // The same guard `parses enough Buttons` provides for the first check.
    let found = 0;
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const name of ["input", "button"]) found += elements(src, name).length;
    }
    expect(found, "no raw inputs or buttons parsed — the sweep would pass empty").toBeGreaterThan(
      10,
    );
  });

  it("parses enough Buttons for the check above to mean something", () => {
    // Without this the loop could pass over an empty set — the vacuous shape
    // `plan-freshness.test.ts` had to close twice.
    const total = FILES.reduce((n, f) => n + elements(readFileSync(f, "utf8"), "Button").length, 0);
    expect(total).toBeGreaterThan(100);
  });
});

describe("L-10 — every control has a name a screen reader can read", () => {
  it("every Label is associated with a control, or names a group that points back", () => {
    // `htmlFor` for a single control; `id` + `aria-labelledby` on a container
    // for a group of buttons or cards, where `htmlFor` would point at nothing.
    //
    // An `id` ALONE is not enough, and that was a hole in this test until a
    // revert found it: stripping `role="group" aria-labelledby=…` off a
    // container left the label's `id` in place, the association broken, and
    // every assertion here still green. A group label must also be pointed at.
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const { at, tag } of elements(src, "Label")) {
        if (/htmlFor=/.test(tag)) continue;
        const id = /\bid="([^"]+)"/.exec(tag);
        if (!id) {
          offenders.push(`${rel(file)}:${lineOf(src, at)} — no htmlFor and no id`);
          continue;
        }
        if (!src.includes(`aria-labelledby="${id[1]}"`)) {
          offenders.push(`${rel(file)}:${lineOf(src, at)} — id="${id[1]}" is referenced by no aria-labelledby`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every Input has a name — an id, an aria-label, or at least a placeholder", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const { at, tag } of elements(src, "Input")) {
        if (/aria-label|aria-labelledby|\bid=|placeholder/.test(tag)) continue;
        offenders.push(`${rel(file)}:${lineOf(src, at)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every icon-only Button has an accessible name", () => {
    // `size="icon"` renders a square with no text, so without a name a screen
    // reader announces "button" and nothing else.
    //
    // AMENDED 2026-09-11 (Phase 5 / R5.2). There used to be a
    // `rel(file).endsWith("ui/calendar.tsx")` skip here, exempting that file's
    // day button — which took its name from the day number `react-day-picker`
    // passed through `{...props}`. `ui/calendar.tsx` was one of the 27
    // orphaned interface files R5.2 deleted, so the skip could never fire
    // again: a dead branch and a comment describing a file that no longer
    // exists. **Nothing asserted the skip was still needed**, so the suite
    // stayed green either way and the deletion's own gate could not see it.
    // Removed rather than left, so the exemption list is only ever things that
    // exist. If an icon-only Button without a name is ever legitimate again,
    // add the skip back WITH a test that fails when it becomes unnecessary.
    const offenders: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      for (const { at, tag } of elements(src, "Button")) {
        if (!/size="icon"/.test(tag)) continue;
        if (/aria-label|aria-labelledby|title=/.test(tag)) continue;
        offenders.push(`${rel(file)}:${lineOf(src, at)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("sweeps the real screens, and enough of them", () => {
    // The guard on the exclusion above: a glob that quietly matched nothing —
    // or started skipping real files — would make every check in this file
    // vacuous, which is L-124's shape and the reason this line exists.
    expect(FILES.length).toBeGreaterThan(50);
    expect(FILES.filter((f) => f.endsWith(".test.tsx"))).toEqual([]);
    expect(FILES.some((f) => rel(f) === "src/components/pos/receipt-dialog.tsx")).toBe(true);
  });

  it("the ids these associations point at are unique within their file", () => {
    // An id used twice makes the association ambiguous and silently wrong —
    // worse than the missing association it replaced.
    const dupes: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      const seen = new Map<string, number>();
      for (const m of src.matchAll(/\bid="([^"{}]+)"/g)) {
        seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
      }
      for (const [id, n] of seen) if (n > 1) dupes.push(`${rel(file)} — id="${id}" ×${n}`);
    }
    expect(dupes, dupes.join("\n")).toEqual([]);
  });
});
