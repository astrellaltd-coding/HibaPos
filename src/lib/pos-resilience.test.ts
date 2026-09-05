import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { classifyMeBody, classifyMeError, nextSession } from "@/lib/session-policy";
import { isModalOpen, findShortcut, type Shortcut } from "@/hooks/use-keyboard-shortcuts";
import { operatorChanged } from "@/store/app-store";
import type { UserDto } from "@/types/api";

// M-20, M-21, M-22 and L-42 (2026-09-05), Batch 5.7d — POS resilience.
//
// ── HOW THIS BATCH WAS VALIDATED, SAID UP FRONT ──────────────────────────────
// All three of 5.7d's inherited criteria were *Manual*, and **L-47 blocks
// every one of them**: the in-app browser pane renders the login screen even
// with a valid session, so no authenticated view can be driven there. Batch
// 5.4 hit exactly this and set the precedent — convert the criterion into
// automated coverage over the REAL module rather than dropping it, and say so.
// That is what this file is. Where a claim can only be made about source text
// rather than behaviour, it says which it is.

const SRC = path.join(process.cwd(), "src");

/** Every .ts/.tsx under src/ — the sweep technique from `role-model.test.ts`. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}
const read = (...p: string[]) => readFileSync(path.join(SRC, ...p), "utf8");

const ALICE = { id: "u1", username: "alice", name: "Alice", role: "MANAGER" } as UserDto;
const BOB = { id: "u2", username: "bob", name: "Bob", role: "MANAGER" } as UserDto;

describe("M-21 — a blip must not end the session, and must not take the cart", () => {
  it("reads a 401 as a real sign-out", () => {
    expect(classifyMeError({ status: 401 })).toEqual({ kind: "signed-out" });
    expect(classifyMeError({ status: 403 })).toEqual({ kind: "signed-out" });
  });

  it("reads everything else as unreachable, not as signed out", () => {
    // A network failure throws a TypeError from `fetch` with no status at all;
    // a proxy or a crash gives a 5xx. Neither is the server saying "you are
    // out", and the old code could not tell them apart from one.
    expect(classifyMeError(new TypeError("Failed to fetch"))).toEqual({ kind: "unreachable" });
    expect(classifyMeError({ status: 500 })).toEqual({ kind: "unreachable" });
    expect(classifyMeError({ status: 502 })).toEqual({ kind: "unreachable" });
    expect(classifyMeError(undefined)).toEqual({ kind: "unreachable" });
  });

  it("reads an explicit `{ user: null }` as a real sign-out", () => {
    // The server stating there is no session is not an ambiguity.
    expect(classifyMeBody({ user: null })).toEqual({ kind: "signed-out" });
    expect(classifyMeBody({ user: ALICE })).toEqual({ kind: "signed-in", user: ALICE });
  });

  it("THE DEFECT: a transient failure keeps the operator AND the cart", () => {
    // The half the audit's row missed. `next = null` reached
    // `operatorChanged(someone, null) → true → clearForOperatorChange()`, so a
    // blip destroyed the in-progress sale that Batch 5.4 built persistence for.
    const out = nextSession(ALICE, { kind: "unreachable" }, operatorChanged);
    expect(out.user).toBe(ALICE);
    expect(out.clearCart).toBe(false);
    expect(out.settled).toBe(false);
  });

  it("still ends the session, and clears the cart, on a real sign-out", () => {
    // CONTROL. Failing towards "keep the session" must not become "never let
    // go" — a revoked cookie has to eject, and C-23's guard has to fire.
    const out = nextSession(ALICE, { kind: "signed-out" }, operatorChanged);
    expect(out.user).toBeNull();
    expect(out.clearCart).toBe(true);
    expect(out.settled).toBe(true);
  });

  it("still clears the cart when a DIFFERENT operator arrives", () => {
    // C-23's other arm, unchanged by this batch and asserted so it stays that
    // way: cashier B must not inherit cashier A's open ticket.
    expect(nextSession(ALICE, { kind: "signed-in", user: BOB }, operatorChanged).clearCart).toBe(true);
  });

  it("does NOT clear the cart on an ordinary refresh of the same session", () => {
    // The case C-23 was careful about: null → someone on page load, and
    // someone → the same someone on a re-poll. Neither is an operator change.
    expect(nextSession(null, { kind: "signed-in", user: ALICE }, operatorChanged).clearCart).toBe(false);
    expect(nextSession(ALICE, { kind: "signed-in", user: ALICE }, operatorChanged).clearCart).toBe(false);
  });

  it("is what the store actually runs", () => {
    // Source: the store is a zustand module wired to `fetch`, and the point of
    // extracting the policy was that the rule be testable — this checks the
    // extraction was not left dangling with the old catch still in place.
    const store = read("store", "app-store.ts");
    expect(store).toContain("classifyMeError(e)");
    expect(store).toContain("nextSession(get().user, probe, operatorChanged)");
    expect(store).toContain("if (outcome.clearCart)");
    // The old shape, gone: every failure folded to null.
    expect(store).not.toContain("} catch {\n      next = null;\n    }");
  });
});

describe("L-42 — no shortcut fires while a modal is open", () => {
  const doc = (matches: boolean) => ({ querySelector: () => (matches ? {} : null) });

  it("detects an open Radix modal", () => {
    expect(isModalOpen(doc(true))).toBe(true);
    expect(isModalOpen(doc(false))).toBe(false);
  });

  it("is safe when there is no document at all", () => {
    // The hook runs in a "use client" module that is still imported on the
    // server. A throw here would break rendering, not just the shortcut.
    expect(isModalOpen(null)).toBe(false);
    expect(isModalOpen(undefined)).toBe(false);
    expect(isModalOpen({} as unknown as { querySelector: (s: string) => unknown })).toBe(false);
  });

  it("looks for BOTH modal roles", () => {
    // AlertDialog uses `role="alertdialog"`; a selector that only knew
    // `dialog` would leave the confirm dialogs unprotected.
    const hook = read("hooks", "use-keyboard-shortcuts.ts");
    expect(hook).toContain('[role="dialog"][data-state="open"]');
    expect(hook).toContain('[role="alertdialog"][data-state="open"]');
  });

  it("suppresses BEFORE matching, so the keystroke reaches the dialog", () => {
    // Source, and the ordering is the point: checking after `preventDefault`
    // would stop the dialog seeing the key even though the shortcut did not
    // run. What this asserts is that the guard is the first statement.
    const hook = read("hooks", "use-keyboard-shortcuts.ts");
    const guard = hook.indexOf("if (isModalOpen(");
    const match = hook.indexOf("const hit = findShortcut(");
    const prevent = hook.indexOf("e.preventDefault();");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(match);
    expect(guard).toBeLessThan(prevent);
  });

  it("leaves the matcher itself alone — F5 still matches when nothing is open", () => {
    // CONTROL. C-20 (Batch 5.1) was that not one shortcut had ever fired; this
    // batch must not re-break that by suppressing everything.
    const shortcuts: Shortcut[] = [{ key: "F5", handler: () => {} }];
    const hit = findShortcut(shortcuts, { key: "F5", ctrlKey: false, shiftKey: false, altKey: false }, false);
    expect(hit).not.toBeNull();
  });

  it("registers no Escape shortcut anywhere — Radix keeps it", () => {
    // The recorded decision, asserted rather than merely commented: Escape
    // stays Radix's alone, because Radix already closes the top-most dialog
    // and handles stacking, and a second `window` handler would double-fire or
    // have to reimplement that ordering. Walks every source file rather than
    // trusting one, the technique `role-model.test.ts` uses.
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith("pos-resilience.test.ts")) continue;
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        if (/key:\s*"Escape"/.test(line)) offenders.push(`${path.relative(SRC, file)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("M-20 — a failed catalogue is not an empty category", () => {
  it("reads the failure of BOTH catalogue queries", () => {
    const view = read("features", "catalog", "pos-view.tsx");
    expect(view).toContain("isError: catError");
    expect(view).toContain("isError: prodError");
    expect(view).toContain("const catalogueFailed = catError || prodError;");
  });

  it("checks the failure BEFORE the empty test — which is the whole finding", () => {
    // A failed fetch leaves `visibleProducts` empty, so an error branch placed
    // after the empty one can never be reached. Ordering, asserted on source.
    const view = read("features", "catalog", "pos-view.tsx");
    const failed = view.indexOf("catalogueFailed ? (");
    const empty = view.indexOf("visibleProducts.length === 0 ? (");
    expect(failed).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(-1);
    expect(failed).toBeLessThan(empty);
  });

  it("says something different from the empty state, and offers a retry", () => {
    const view = read("features", "catalog", "pos-view.tsx");
    expect(view).toContain("Catalogue indisponible");
    expect(view).toContain("ce n'est pas une catégorie vide");
    expect(view).toContain("refetchProducts()");
    expect(view).toContain("refetchCategories()");
    // …and the real empty state survives, so this did not replace it.
    expect(view).toContain("Aucun produit dans cette catégorie");
  });
});

describe("M-22 — one broken view must not blank the till", () => {
  it("ships an App Router error boundary, which did not exist", () => {
    // `ErrorBoundary` is a React class and only catches client renders of its
    // own subtree. Anything Next itself raises never reached it.
    expect(existsSync(path.join(SRC, "app", "error.tsx"))).toBe(true);
    const err = read("app", "error.tsx");
    expect(err.startsWith('"use client"')).toBe(true);
    expect(err).toContain("export default function");
    expect(err).toContain("reset");
  });

  it("wraps the view area in its own boundary, inside the shell's", () => {
    const shell = read("components", "shared", "app-shell.tsx");
    // Two boundaries, not one: the outer keeps its job, the inner is new.
    expect(shell.match(/<ErrorBoundary/g)?.length).toBe(2);
    expect(shell).toContain('<ErrorBoundary variant="inline" label={view} key={view}>');
  });

  it("puts the per-view boundary INSIDE the Topbar, not around it", () => {
    // The finding was that a crash in any view blanked the whole till. If the
    // new boundary sat above `<Topbar />` it would change nothing.
    const shell = read("components", "shared", "app-shell.tsx");
    const topbar = shell.indexOf("<Topbar />");
    const inner = shell.indexOf('<ErrorBoundary variant="inline"');
    expect(topbar).toBeGreaterThan(-1);
    expect(inner).toBeGreaterThan(topbar);
  });

  it("gives the boundary an inline variant, so it does not fill the screen", () => {
    // A per-view boundary rendering `h-screen` would blank the till anyway —
    // the exact symptom, reintroduced by the fix.
    const boundary = read("components", "shared", "error-boundary.tsx");
    expect(boundary).toContain('variant?: "screen" | "inline"');
    expect(boundary).toContain('this.props.variant === "inline"');
    expect(boundary).toContain("h-full min-h-[16rem]");
    // The shell-level one still fills the screen: there is nothing left to keep.
    expect(boundary).toContain("h-screen w-full");
  });
});
