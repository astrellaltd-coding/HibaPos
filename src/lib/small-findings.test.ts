import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { z } from "zod";
import { settingsSchema, cashMovementSchema } from "@/lib/validation";
import type { ApprovalPayload } from "@/lib/approvals";

// Batch 7.5 — the three small findings nobody owned.
//
// L-22  validation errors reached a French UI in English
// L-36 / DOC-13  `ApprovalPayload.amount` documented as euros, always cents
// DOC-14  vestigial euros-era rounding in a money path
//
// Two more were excluded and the reasons are in the batch: L-14 (archived
// 80-column receipts) must NOT be re-rendered and its population is deleted by
// Batch 8.0, and L-47's cause was never established — Batch 6.3 tried to
// reproduce it, could not, and falsified its own hypothesis.

const REPO_ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(REPO_ROOT, p), "utf8");

describe("L-22 — zod answers a French UI in French", () => {
  it("the message that started this is French now", () => {
    // Verbatim before the fix: "Too big: expected number to be <=48". That is
    // the string the operator actually saw (it is L-20's symptom), on the
    // screen that saves every other setting.
    const r = settingsSchema.safeParse({
      restaurantName: "HIBA FOOD",
      defaultVatRate: 10,
      receiptWidth: 80,
    });
    expect(r.success).toBe(false);
    const messages = r.success ? [] : r.error.issues.map((i) => i.message);
    const width = messages.find((m) => /48/.test(m));
    expect(width).toBeDefined();
    expect(width).not.toContain("Too big");
    expect(width).toContain("Trop grand");
  });

  it("no message from any shared schema is English", () => {
    // The generic English zod strings, by their opening words. If any survives,
    // some field is answering a French operator in English.
    const ENGLISH = ["Too big", "Too small", "Invalid input", "Required", "Expected"];
    const bad: string[] = [];
    const collect = (schema: z.ZodType, value: unknown) => {
      const r = schema.safeParse(value);
      if (!r.success) for (const i of r.error.issues) {
        if (ENGLISH.some((e) => i.message.startsWith(e))) bad.push(i.message);
      }
    };
    collect(settingsSchema, {});
    collect(settingsSchema, { restaurantName: "", defaultVatRate: 999, receiptWidth: 80 });
    collect(settingsSchema, { restaurantName: 1, defaultVatRate: "x", receiptWidth: "y" });
    collect(cashMovementSchema, {});
    collect(cashMovementSchema, { category: "NOPE", amount: 1.5, reason: "" });
    expect(bad).toEqual([]);
  });

  it("does not disturb the messages that were already French", () => {
    // Nineteen fields in `validation.ts` carry their own message. zod prefers a
    // field's message over the locale, so this fix must be additive — it is the
    // property that makes it safe to apply globally.
    const r = cashMovementSchema.safeParse({ category: "DEPENSE", amount: 100, reason: "" });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain("Motif requis");
  });

  it("covers schemas declared OUTSIDE validation.ts, which is why the locale is not imported there alone", () => {
    // Thirteen API routes declare inline schemas and never import
    // `validation.ts`. A locale wired only into that file would have left every
    // one of them in English. This is a schema built the way those routes build
    // theirs — from a bare `z` import — and it must still answer in French.
    const inline = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) , n: z.number().max(5) });
    const r = inline.safeParse({ day: "2026-09-07", n: 99 });
    expect(r.success).toBe(false);
    const m = r.success ? "" : r.error.issues[0].message;
    expect(m).not.toContain("Too big");
    expect(m).toContain("Trop grand");
  });

  it("is wired into BOTH entry points, and neither alone would do", () => {
    // `validation.ts` serves the shared schemas and the client forms;
    // `instrumentation.ts` runs once at server start and is what covers the
    // thirteen inline-schema routes. Losing either silently returns half the
    // application to English, which no other assertion here would notice.
    expect(read("src/lib/validation.ts")).toContain('import "@/lib/zod-locale"');
    expect(read("src/instrumentation.ts")).toContain('import "@/lib/zod-locale"');
    expect(read("src/lib/zod-locale.ts")).toContain("z.config(z.locales.fr())");
  });
});

describe("L-36 / DOC-13 — the approval amount is documented as what it carries", () => {
  it("says cents, not euros", () => {
    const src = read("src/lib/approvals.ts");
    const decl = src.split("\n").find((l) => l.includes("amount: number | null;"))!;
    expect(decl).toBeDefined();
    expect(decl.toLowerCase()).toContain("cents");
    // The lie itself, gone: the declaration must not end in a bare `// euros`.
    expect(/\/\/\s*euros\s*$/.test(decl)).toBe(false);
  });

  it("and the callers really do bind cents, so the comment is now true", () => {
    // Not a comment test alone: if a caller passed euros, correcting the
    // comment would have made the file MORE wrong. `step-up/route.ts` declares
    // the field as an integer, which euros could not be.
    const stepUp = read("src/app/api/auth/step-up/route.ts");
    expect(stepUp).toMatch(/amount:\s*z\.number\(\)\.int\(\)/);
    // …and the POS passes a variable that says what it is.
    expect(read("src/features/orders/orders-view.tsx")).toContain("amountCents");
  });

  it("the type still admits null, which is what an approval with no amount uses", () => {
    const p: ApprovalPayload = {
      approverId: "u", action: "REFUND", amount: null, exp: 0, nonce: "n",
    };
    expect(p.amount).toBeNull();
  });
});

describe("DOC-14 — the vestigial euros-era rounding is gone and the figure is unchanged", () => {
  it("the line total is exactly cents × quantity, add-ons included", () => {
    // The old expression was `Math.round((unit + addons) * qty * 100) / 100`,
    // which on integer cents is the identity — the figure was always right.
    // These are the cases that would have exposed it had it not been.
    const cases: [number, number, number][] = [
      [990, 150, 2],
      [1, 0, 99],
      [333, 167, 3],
      [0, 0, 1],
    ];
    for (const [unit, addons, qty] of cases) {
      const oldWay = Math.round((unit + addons) * qty * 100) / 100;
      const newWay = (unit + addons) * qty;
      expect({ unit, addons, qty, newWay }).toEqual({ unit, addons, qty, newWay: oldWay });
      expect(Number.isInteger(newWay)).toBe(true);
    }
  });

  it("the multiply-by-100-and-divide is no longer in the file", () => {
    const src = read("src/components/pos/product-options-dialog-v2.tsx");
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/\*\s*100\s*\)\s*\/\s*100/);
    expect(code).toContain("const lineTotal = (unitPrice + addonsTotal) * qty;");
  });
});
