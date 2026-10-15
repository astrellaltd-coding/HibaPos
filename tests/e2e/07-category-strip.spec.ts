import { test, expect, type Page } from "@playwright/test";

// L-211 — every category is on screen at 100 %, at the till's width.
//
// Observed on the till 2026-09-17 and again 2026-10-15: the category strip was
// a horizontal scroller of fixed 88 px cards, ten of them needing about 988 px
// where a 1366 px screen with the 400 px order panel leaves about 908. Boissons
// sat off the right edge with nothing to say so, and the restaurant had been
// running the caisse at 75 % zoom to see it — which shrank everything else.
//
// The fix makes the cards share the width and wrap before any is cut. What is
// asserted is the property the cashier needs: every card's box lies inside the
// strip's box, and the strip does not scroll sideways. The ROW count is pinned
// too: wrapping alone would also keep every card inside, but fixed 88 px cards
// wrapped would spend a second row of the till's height on the strip — the
// cards must shrink first, and wrap only where even 64 px will not fit.

test.use({ channel: "msedge" });

/** Ten top-level categories, as on the till: « Tout » plus nine. */
const NEEDED = 9;

test.beforeAll(async ({ request }) => {
  const res = await request.get("/api/catalog/categories");
  const existing = ((await res.json()) as { parentId: string | null }[]).filter((c) => !c.parentId);
  for (let i = existing.length; i < NEEDED; i++) {
    const r = await request.post("/api/catalog/categories", {
      data: { name: `E2E Catégorie ${i + 1}`, color: "#f59e0b", sortOrder: 100 + i, active: true },
    });
    expect(r.ok(), `creating category ${i + 1}: ${r.status()}`).toBe(true);
  }
});

async function cardsInsideStrip(page: Page) {
  await page.goto("/#/pos");
  const strip = page.getByTestId("category-strip");
  await expect(strip).toBeVisible({ timeout: 30_000 });
  await expect(strip.getByRole("button")).toHaveCount(NEEDED + 1);
  const box = (await strip.boundingBox())!;
  const cards = await strip.getByRole("button").evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { label: e.textContent?.trim() ?? "", left: r.left, right: r.right, top: Math.round(r.top) };
    }),
  );
  const overflow = await strip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  return { box, cards, overflow };
}

/** The till's case first; then a common laptop; then the narrowest that wraps. */
async function assertAllInside(page: Page, width: number, height: number, rows: number) {
  await page.setViewportSize({ width, height });
  const { box, cards, overflow } = await cardsInsideStrip(page);
  expect(overflow, "the strip scrolls sideways again").toBe(false);
  for (const c of cards) {
    expect(c.left, `« ${c.label} » starts outside the strip`).toBeGreaterThanOrEqual(box.x - 0.5);
    expect(c.right, `« ${c.label} » ends outside the strip`).toBeLessThanOrEqual(box.x + box.width + 0.5);
  }
  expect(new Set(cards.map((c) => c.top)).size, `rows of category cards at ${width}px`).toBe(rows);
}

// Three tests written out rather than one in a loop: `readme-counts.test.ts`
// counts e2e tests as declared, and a loop would make the README's figure and
// the number Playwright runs disagree.
test("L-211 — at 1366×768, every category card is fully inside the strip, on one row", async ({ page }) => {
  await assertAllInside(page, 1366, 768, 1);
});

test("L-211 — at 1280×800, every category card is fully inside the strip, on one row", async ({ page }) => {
  await assertAllInside(page, 1280, 800, 1);
});

test("L-211 — at 1024×768, every category card is fully inside the strip (two rows)", async ({ page }) => {
  await assertAllInside(page, 1024, 768, 2);
});
