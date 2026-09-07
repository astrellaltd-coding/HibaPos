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
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/** Every `<Name …>` element in `src`, as whole tags. */
function elements(src: string, name: string): { at: number; tag: string }[] {
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
    // reader announces "button" and nothing else. The one exception is
    // ui/calendar.tsx's day button, which takes its name from the day number
    // react-day-picker passes through {...props} — a real name, not a gap.
    const offenders: string[] = [];
    for (const file of FILES) {
      if (rel(file).endsWith("ui/calendar.tsx")) continue;
      const src = readFileSync(file, "utf8");
      for (const { at, tag } of elements(src, "Button")) {
        if (!/size="icon"/.test(tag)) continue;
        if (/aria-label|aria-labelledby|title=/.test(tag)) continue;
        offenders.push(`${rel(file)}:${lineOf(src, at)}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
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
