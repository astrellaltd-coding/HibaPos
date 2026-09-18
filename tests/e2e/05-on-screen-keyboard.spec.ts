import { test, expect } from "@playwright/test";
import { closeAnyOpenShift } from "./helpers";

// L-213 — THE WIRING, in a real browser.
//
// THE FIRST BROWSER-LEVEL SPEC IN THIS SUITE, and it is one on purpose. Every
// other spec here is API-level, which is the right shape for a money path. This
// one cannot be: what it has to prove is that a tap on a drawn button arrives in
// a React `useState`, and no API call can show that.
//
// WHY THE UNIT TESTS ARE NOT ENOUGH, in the plan's own words (method 4): « A
// unit test on an extracted rule proves the rule, not that anything calls it —
// this project has shipped that gap three times. » `src/lib/osk.test.ts` proves
// which pad a field gets and what a key does to a string. It cannot prove:
//
//   1. that the value written through the prototype's own setter makes React's
//      `onChange` fire — and on a CONTROLLED input, if it does not, React
//      re-renders with its old state and the DOM value SNAPS BACK. So every
//      `toHaveValue` below is a test of the wiring and not of the string;
//   2. that a key tap does not dismiss the dialog being typed into, which is
//      Radix's behaviour and had to be guarded in `dialog.tsx`;
//   3. that the panel is clickable at all while a modal dialog holds
//      `pointer-events: none` on the body.
//
// All three are silent failures. Each one would leave a keyboard that looks
// perfect in a screenshot and types nothing.

// THE BROWSER IS THE ONE WINDOWS ALREADY HAS, and that is not a shortcut.
//
// Playwright's own Chromium was never downloaded on this machine — `ls
// %LOCALAPPDATA%\ms-playwright` is empty — which is the real reason every other
// spec here is API-level: a browser spec would have failed on `browserType.
// launch` and nobody had written one to find out. `channel: "msedge"` uses the
// Edge that is present on every Windows install, so this spec needs no 150 MB
// download on a developer's machine and none on the till's either. It is the
// same Chromium engine the restaurant actually runs the caisse in — Brave —
// which is the engine whose `pointer-events` and `input`-event behaviour these
// assertions depend on.
test.use({ channel: "msedge" });

const KEYBOARD = '[data-osk-root]';
/**
 * A key, BY ITS LABEL rather than its text.
 *
 * `:text-is("a")` worked until the refinement of 2026-09-17 put a corner mark
 * inside each key that hides accents — the « a » key's text content became
 * « aà », and an exact-text selector matched nothing. Every key now carries an
 * `aria-label` of exactly the character it types, which is also what a screen
 * reader should say instead of reading the mark aloud.
 */
const letter = (c: string) => `${KEYBOARD} button[aria-label="${c}"]`;

test.describe("L-213 — the on-screen keyboard", () => {
  // The house pattern (T-11): leave no till open. This spec opens the
  // « Ouvrir la caisse » dialog to reach the opening-float field and dismisses
  // it with Escape rather than submitting, so it should never open one — but a
  // spec that fails halfway must not cost the next run a 409.
  test.afterAll(async ({ request }) => {
    await closeAnyOpenShift(request);
  });

  test("types into a POS field, and the letters STAY there", async ({ page }) => {
    await page.goto("/#/pos");

    const search = page.locator("#pos-search-input");
    await expect(search).toBeVisible({ timeout: 30_000 });

    // No field has focus yet, so there must be no keyboard on the screen.
    await expect(page.locator(KEYBOARD)).toHaveCount(0);

    await search.click();
    await expect(page.locator(KEYBOARD)).toBeVisible();

    for (const c of ["t", "a", "c", "o"]) await page.locator(letter(c)).click();
    // THE ASSERTION THAT MATTERS. `posSearch` is Zustand state and this input
    // is controlled by it. Had the `input` event not reached React, the value
    // here would be "" — not "taco".
    await expect(search).toHaveValue("taco");

    // And the app AGREED it was typed: the grid filtered on it. `prepare-db.ts`
    // seeds exactly one product, « E2E Tacos », so a match is proof the value
    // reached the query and not merely the input.
    //
    // (This assertion was first written as « Aucun produit trouvé », on the
    // assumption that a search for `taco` finds nothing — true of the LIVE
    // France catalogue, which has an empty Tacos category (L-215), and false of
    // this suite's disposable database. The test caught the conflation.)
    await expect(page.getByText("E2E Tacos")).toBeVisible();

    await page.locator(letter("Majuscule")).click();
    await page.locator(letter("S")).click();
    await expect(search).toHaveValue("tacoS");

    // One-shot shift: the letter after it is lower case again.
    await page.locator(letter("a")).click();
    await expect(search).toHaveValue("tacoSa");

    await page.locator(`${KEYBOARD} button[aria-label="Effacer"]`).click();
    await expect(search).toHaveValue("tacoS");

    await page.locator(`${KEYBOARD} button[aria-label="Fermer le clavier"]`).click();
    await expect(page.locator(KEYBOARD)).toHaveCount(0);
    // Closing the keyboard must not clear what was typed.
    await expect(search).toHaveValue("tacoS");
  });

  test("a key tap does NOT close the dialog it is typing into", async ({ page }) => {
    // Radix closes a modal layer on any pointer-down outside it, and the
    // keyboard is outside it by design. Without the guard in `dialog.tsx` the
    // first letter a cashier tapped into a client's name would shut the client
    // box — and the unit tests cannot see that.
    await page.goto("/#/customers");

    await page.getByRole("button", { name: "Nouveau client" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const name = page.locator("#cust-name");
    await name.click();
    await expect(page.locator(KEYBOARD)).toBeVisible();

    for (const c of ["d", "u", "p"]) await page.locator(letter(c)).click();

    await expect(dialog, "the dialog closed when a key was tapped").toBeVisible();
    await expect(name).toHaveValue("dup");

    // AN ACCENT, BY LONG PRESS, INSIDE A DIALOG — the case that actually
    // happens: « Chèvre », « Noëlle », a street called « L'Église ». It also
    // proves the variants popover is reachable while Radix holds
    // `pointer-events: none` on the body, which the panel overrides but the
    // popover inherits from it.
    const eKey = await page.locator(letter("e")).boundingBox();
    if (!eKey) throw new Error("the e key has no box");
    await page.mouse.move(eKey.x + eKey.width / 2, eKey.y + eKey.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.locator(`${KEYBOARD} button[aria-label="Insérer è"]`).click();
    await expect(name).toHaveValue("dupè");
    await expect(dialog, "the dialog closed during a long press").toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("gives the OPENING FLOAT digits, and a full stop rather than a comma", async ({ page }) => {
    // The fiscal half of the finding. « Fond de caisse initial (€) » and
    // « Espèces comptées (€) » are the two fields that made this High: both are
    // `type="number"`, both are on the path of a Z report, and neither had any
    // way to be filled in by touch.
    await page.goto("/#/shifts");

    await page.getByRole("button", { name: "Ouvrir la caisse" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const float = page.locator("#open-float");
    await float.click();
    await expect(page.locator(KEYBOARD)).toBeVisible();

    // A number pad, not letters.
    await expect(page.locator(letter("a"))).toHaveCount(0);
    await expect(page.locator(letter("0"))).toBeVisible();

    // The field arrives with a default in it; clear it the way a cashier would.
    for (let i = 0; i < 10; i++) await page.locator(`${KEYBOARD} button[aria-label="Effacer"]`).click();
    await expect(float).toHaveValue("");

    // A COMMA WOULD HAVE EMPTIED THE BOX. HTML sanitises an invalid value on a
    // number input to the empty string, so the separator drawn here is a full
    // stop — and this is the assertion that says so out loud.
    await expect(page.locator(`${KEYBOARD} button[aria-label="Virgule"]`)).toHaveText(".");
    await expect(page.locator(`${KEYBOARD} button:text-is(",")`)).toHaveCount(0);

    for (const d of ["5", "0"]) await page.locator(letter(d)).click();
    await expect(float).toHaveValue("50");

    // THE SEPARATOR WAITS FOR ITS FIRST DIGIT, and says so.
    //
    // This is the defect this spec found. `50.` is not a valid floating-point
    // number, so the field reported `""` for it and the two digits after the
    // point landed on nothing — `50.00` came out as `00`. A cashier counting
    // the drawer would have sealed a Z report on a figure with the pounds
    // missing. The key now holds instead of inserting, and shows it the way
    // `Maj` does rather than appearing to do nothing.
    const separator = page.locator(`${KEYBOARD} button[aria-label="Virgule"]`);
    await separator.click();
    await expect(separator).toHaveAttribute("aria-pressed", "true");
    await expect(float, "the field must not go empty while the separator waits").toHaveValue("50");

    await page.locator(letter("0")).click();
    await expect(float).toHaveValue("50.0");
    await expect(separator).toHaveAttribute("aria-pressed", "false");
    await page.locator(letter("0")).click();
    await expect(float).toHaveValue("50.00");

    // A second separator is REFUSED rather than blanking the figure.
    await page.locator(`${KEYBOARD} button[aria-label="Virgule"]`).click();
    await expect(float).toHaveValue("50.00");

    // Dismissed, not submitted: this spec opens no shift.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("A LONG PRESS ON A LETTER GIVES ITS ACCENTS, and a short press does not", async ({ page }) => {
    // The operator's instruction, 2026-09-17: « all the e special are under a
    // long press on I and like that ». It bought back a whole row — the accents
    // had ten keys of their own — and it can only be proved in a browser,
    // because what is being tested is a timer between pointerdown and pointerup.
    await page.goto("/#/pos");
    const search = page.locator("#pos-search-input");
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.click();
    await expect(page.locator(KEYBOARD)).toBeVisible();

    // A SHORT press is still just the letter. This is the half a long press
    // breaks if the key types on pointerdown, which is why it moved to
    // pointerup.
    await page.locator(letter("e")).click();
    await expect(search).toHaveValue("e");

    const box = await page.locator(letter("e")).boundingBox();
    if (!box) throw new Error("the e key has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();

    // The accents appeared…
    await expect(page.locator(`${KEYBOARD} button[aria-label="Insérer é"]`)).toBeVisible();
    await expect(page.locator(`${KEYBOARD} button[aria-label="Insérer è"]`)).toBeVisible();
    // …and the long press did NOT also type a second « e ».
    await expect(search, "the long press typed the base letter as well").toHaveValue("e");

    await page.locator(`${KEYBOARD} button[aria-label="Insérer è"]`).click();
    await expect(search).toHaveValue("eè");
    // Choosing one puts the accents away again.
    await expect(page.locator(`${KEYBOARD} button[aria-label="Insérer é"]`)).toHaveCount(0);
  });

  test("the numpad is on the RIGHT of the letters, and types", async ({ page }) => {
    // « lets make the numpad on the right like a real keyboard » — 2026-09-17.
    // A house number and a telephone number are most of what is typed here
    // after the name.
    await page.goto("/#/pos");
    const search = page.locator("#pos-search-input");
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.click();

    const a = await page.locator(letter("a")).boundingBox();
    const one = await page.locator(letter("1")).boundingBox();
    if (!a || !one) throw new Error("a key has no box");
    expect(one.x, "the numpad is not to the right of the letters").toBeGreaterThan(a.x);

    for (const d of ["1", "2"]) await page.locator(letter(d)).click();
    await expect(search).toHaveValue("12");
  });

  test("ON A REAL TOUCHSCREEN, an accent does not dismiss the dialog either", async ({ page }) => {
    // THE TILL IS A TOUCHSCREEN, AND TOUCH TAKES A DIFFERENT PATH THROUGH RADIX.
    //
    // For a mouse, Radix decides a dismissal during `pointerdown`. For TOUCH it
    // defers to the following `click` — by which point the accent button has
    // been unmounted however carefully the unmount is timed. So the mouse tests
    // above cannot see the case the restaurant will actually hit, and this one
    // is the reason `isFromOsk` treats a detached node as its own rather than
    // relying on the popover staying mounted.
    //
    // Driven through CDP because Playwright's `touchscreen` can tap but cannot
    // HOLD, and a hold is the whole interaction.
    const cdp = await page.context().newCDPSession(page);
    await page.goto("/#/customers");
    await page.getByRole("button", { name: "Nouveau client" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const name = page.locator("#cust-name");
    await name.click();
    await expect(page.locator(KEYBOARD)).toBeVisible();

    const box = await page.locator(letter("e")).boundingBox();
    if (!box) throw new Error("the e key has no box");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await page.waitForTimeout(700);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    const accent = page.locator(`${KEYBOARD} button[aria-label="Insérer é"]`);
    await expect(accent, "a long touch did not open the accents").toBeVisible();

    const a = await accent.boundingBox();
    if (!a) throw new Error("the accent has no box");
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
    });

    // THE ACCENTS STAY UP WHILE THE FINGER IS DOWN, which is what a phone does
    // and the reason the accent button types on `pointerdown` but closes on
    // `pointerup`. Asserted here because nothing else can fail for it: the
    // dialog survives either way thanks to `isFromOsk`, so without this the
    // split would be untested code kept on a hunch.
    await expect(name, "the letter did not go in on touch-down").toHaveValue("é");
    await expect(accent, "the accents vanished before the finger lifted").toBeVisible();

    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(accent, "the accents stayed up after the finger lifted").toBeHidden();

    await expect(name).toHaveValue("é");
    await expect(dialog, "choosing an accent by TOUCH dismissed the dialog").toBeVisible();

    await page.keyboard.press("Escape");
  });

  test("shows NOTHING until a field that takes typing has focus", async ({ page }) => {
    await page.goto("/#/pos");
    await expect(page.locator("#pos-search-input")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(KEYBOARD)).toHaveCount(0);

    // A button is not a field.
    await page.getByRole("button").first().click();
    await expect(page.locator(KEYBOARD)).toHaveCount(0);
  });
});
