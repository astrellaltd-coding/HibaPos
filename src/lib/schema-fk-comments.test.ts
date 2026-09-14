import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// L-145 (R9.8) — an id column with no foreign key says so, and why.
//
// THE FINDING: four id columns carried no FK and, **alone in this schema**, did
// not say so. Every other FK-less id reads « plain id, NO FK » with a
// justification, because in this schema the absence is a DECISION and not an
// oversight: a sealed document must outlive the rows it names, so
// `Refund.approvedById` and `DailyClose.sealedById` deliberately take no key
// that could refuse, cascade or null them.
//
// Measured on this tree there were **twelve**, not four, in four groups —
// FiscalEvent's eight, `AuditLog.entityId`, `FiscalArchive`'s two and
// `OrderItem.comboGroupId`. This test is what found them, and it is kept so the
// count cannot drift again: a thirteenth arrives with a comment or it arrives
// red.
//
// It reads `schema.prisma` because that is where the decision lives. There is
// no runtime behaviour to drive — the whole point is that nothing enforces
// these, which is why the reasoning has to be written down.

const SCHEMA = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const LINES = SCHEMA.split("\n");

/** The marker every documented FK-less id carries, in any of its spellings. */
const MARKERS = ["NO FK", "no FK", "Plain id", "plain id"];

type IdColumn = { model: string; column: string; line: number; documented: boolean };

/** Each model's name and the line range of its body. */
function modelBodies(): { name: string; from: number; to: number }[] {
  const out: { name: string; from: number; to: number }[] = [];
  let name: string | null = null;
  let from = 0;
  for (let i = 0; i < LINES.length; i++) {
    const open = /^model\s+(\w+)\s*\{/.exec(LINES[i]);
    if (open) {
      name = open[1];
      from = i;
      continue;
    }
    if (name && LINES[i].trim() === "}") {
      out.push({ name, from, to: i });
      name = null;
    }
  }
  return out;
}

function fkLessIdColumns(): IdColumn[] {
  const out: IdColumn[] = [];

  for (const { name: model, from: bodyStart, to: bodyEnd } of modelBodies()) {
    // THE WHOLE BODY. A windowed search missed relations declared far below
    // their column — `Product.categoryId` is forty-odd lines above its
    // `@relation` — and reported four foreign keys as FK-less.
    const body = LINES.slice(bodyStart, bodyEnd).join("\n");

    for (let i = bodyStart; i < bodyEnd; i++) {
    const decl = /^\s*(\w+Id)\s+String/.exec(LINES[i]);
    if (!decl) continue;
    const column = decl[1];

    // A real relation makes it a foreign key, and this test is not about those.
    if (body.includes(`fields: [${column}]`)) continue;

    // Walk UP past any contiguous run of id declarations and their trailing
    // comments, then read the block above it. A single comment covering a run
    // of eight columns — which is how `FiscalEvent` states it — documents all
    // eight, and a per-column check would report seven false positives.
    let top = i;
    while (top > bodyStart && /^\s*(\w+\s+\w+|\/\/)/.test(LINES[top - 1])) {
      const prev = LINES[top - 1];
      const isDecl = /^\s*\w+\s+(String|Int|Float|Boolean|DateTime)/.test(prev);
      const isComment = /^\s*\/\//.test(prev);
      if (!isDecl && !isComment) break;
      top -= 1;
    }
    const context = LINES.slice(Math.max(bodyStart, top - 2), i + 1).join("\n");
    out.push({
      model,
      column,
      line: i + 1,
      documented: MARKERS.some((m) => context.includes(m)),
    });
    }
  }
  return out;
}

describe("L-145 — every FK-less id column explains itself", () => {
  it("finds the FK-less ids at all, so this file is not vacuous", () => {
    const found = fkLessIdColumns();
    // Twelve when R9.8 measured it; the exact number is not the property, but
    // « we found some » is — a regex that stopped matching would otherwise make
    // every assertion below trivially true.
    expect(found.length, "no FK-less id columns found — the parse broke").toBeGreaterThan(8);
    const names = found.map((c) => `${c.model}.${c.column}`);
    // Three the audit named, one from each group, so a parse that quietly
    // stopped covering a model is caught.
    expect(names).toContain("FiscalEvent.orderId");
    expect(names).toContain("AuditLog.entityId");
    expect(names).toContain("OrderItem.comboGroupId");
  });

  it("leaves none of them undocumented", () => {
    const undocumented = fkLessIdColumns().filter((c) => !c.documented);
    expect(
      undocumented.map((c) => `${c.model}.${c.column} (schema.prisma:${c.line})`),
      "an id column carries no foreign key and does not say why — in this schema " +
        "that absence is a decision, and an undocumented one reads as an oversight",
    ).toEqual([]);
  });

  it("still documents the ones that were already right", () => {
    // The convention this batch extended rather than invented. If these lost
    // their notes the check above would go quiet about the wrong thing.
    const byName = new Map(fkLessIdColumns().map((c) => [`${c.model}.${c.column}`, c]));
    for (const name of [
      "Refund.approvedById",
      "DailyClose.sealedById",
      "Order.discountApprovedById",
      "OrderItem.comboProductId",
    ]) {
      expect({ name, documented: byName.get(name)?.documented }).toEqual({
        name,
        documented: true,
      });
    }
  });

  it("records what a null OrderItem.vatRate means, beside the column", () => {
    // L-129's other half. The rule lives in `money.ts` where the readers are,
    // and the column has to point at it — a reader looking at `vatRate Float?`
    // must not have to guess, which is exactly what the `?? 10` came from.
    const model = /model OrderItem \{[\s\S]*?\n\}/.exec(SCHEMA);
    expect(model, "OrderItem moved").not.toBeNull();
    expect(model![0]).toContain("L-129");
  });
});
