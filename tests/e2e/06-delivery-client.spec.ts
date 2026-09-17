import { test, expect } from "@playwright/test";

// L-214 — THE OWNER'S COMPLAINT, DRIVEN END TO END.
//
// « the client Input when delivery is set » — reported 2026-09-17, and the
// reason it needed a browser to prove is that neither half of the defect was
// visible from an API:
//
//   * A client with an address and NO PHONE enabled « Encaisser ». The route
//     tests could see the 400 that followed; nothing could see that the till
//     offered the sale in the first place. There was no cart-panel test at all.
//   * A client with no address disabled « Encaisser » and explained itself in a
//     `title=` tooltip — on a touchscreen, where nothing hovers. A source test
//     can assert the tooltip is gone; only a browser can show that words are
//     now on the screen instead.
//
// So this spec asks the questions a cashier asks: may I cash this up, and if
// not, does the screen tell me why and let me fix it?
//
// The sale is never completed. Everything here is the TILL's half — what it
// offers and what it says — and the route's half is `orders-route.test.ts`,
// which now covers the missing phone it never did.
test.use({ channel: "msedge" });

const ENCAISSER = 'button:has-text("Encaisser")';

/** Put the one seeded product in the cart and switch to Livraison. */
async function startDelivery(page: import("@playwright/test").Page) {
  await page.goto("/#/pos");
  await expect(page.getByText("E2E Tacos")).toBeVisible({ timeout: 30_000 });
  await page.getByText("E2E Tacos").click();
  await expect(page.locator(ENCAISSER)).toBeEnabled();
  await page.getByRole("button", { name: "Livraison", exact: true }).click();
}

test.describe("L-214 — the client box on a delivery", () => {
  test("says a client is needed, in words, and will not cash up without one", async ({ page }) => {
    await startDelivery(page);

    // Sur place it was cashable; a delivery is not, and the screen SAYS SO.
    // This sentence is `deliveryBlockReason`'s — the same one the server would
    // return, which is the point of there being one function.
    await expect(page.getByText("Un client est obligatoire pour une livraison.")).toBeVisible();
    await expect(page.locator(ENCAISSER)).toBeDisabled();
  });

  test("REFUSES THE CLIENT IT USED TO HAPPILY MAKE: a name with no phone", async ({ page }) => {
    await startDelivery(page);
    await page.getByRole("button", { name: "Client" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The dialog now knows what kind of order this is.
    await expect(dialog.getByText("Livraison : choisissez un client livrable, ou complétez sa fiche.")).toBeVisible();

    await dialog.getByRole("button", { name: "Créer un nouveau client" }).click();
    await page.locator("#customer-picker-nom").fill("Sans Téléphone");

    // THE DEFECT, AT THE MOMENT IT USED TO HAPPEN. The old form's Créer button
    // lit up here — a name was all it asked for — and the client it made was
    // refused by the server after the cash had been taken. It now names both
    // missing fields and stays disabled.
    await expect(
      dialog.getByText("Informations manquantes pour la livraison : le téléphone et l'adresse."),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Créer" })).toBeDisabled();

    // The address alone is what the old till checked, so this is the exact
    // half-complete client that passed every check the cashier could see.
    await page.locator("#customer-picker-adresse").fill("12 rue de Paris");
    await expect(
      dialog.getByText("Informations manquantes pour la livraison : le téléphone."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Créer" }),
      "Créer is enabled for a client with no phone — the server will refuse this sale",
    ).toBeDisabled();

    await page.locator("#customer-picker-telephone").fill("0612131415");
    await expect(dialog.getByRole("button", { name: "Créer" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Créer" }).click();

    // Created, selected, and the order can now be cashed up.
    await expect(dialog).toBeHidden();
    await expect(page.locator(ENCAISSER)).toBeEnabled();
    await expect(page.getByText("Informations manquantes")).toHaveCount(0);
  });

  test("lets the cashier REPAIR a client without leaving the caisse", async ({ page }) => {
    // The other half of the finding, and the operator's decision of 2026-09-17.
    // A regular whose record has no phone was a dead end on a delivery: the
    // card in the POS is read-only and editing lives in Réglages → Clients,
    // which means walking away from the caisse with a queue waiting.
    //
    // The client is made here through the SUR-PLACE form on purpose — a name is
    // all that asks for, which is exactly how an unrepairable regular gets into
    // the address book in the first place.
    await page.goto("/#/pos");
    await expect(page.getByText("E2E Tacos")).toBeVisible({ timeout: 30_000 });
    await page.getByText("E2E Tacos").click();
    await page.getByRole("button", { name: "Client" }).click();

    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Créer un nouveau client" }).click();
    const name = `Regulier ${Date.now()}`;
    await page.locator("#customer-picker-nom").fill(name);
    // Sur place, a name IS enough — and must stay enough.
    await expect(dialog.getByRole("button", { name: "Créer" })).toBeEnabled();
    await dialog.getByRole("button", { name: "Créer" }).click();
    await expect(dialog).toBeHidden();

    // Now the same order becomes a delivery. The client is already attached and
    // is not deliverable.
    await page.getByRole("button", { name: "Livraison", exact: true }).click();
    await expect(
      page.getByText("Informations manquantes pour la livraison : le téléphone et l'adresse."),
    ).toBeVisible();
    await expect(page.locator(ENCAISSER)).toBeDisabled();

    // Repair it from here.
    await page.getByRole("button", { name: name.slice(0, 20) }).first().click();
    dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: `Modifier ${name}` }).click();
    await page.locator("#customer-picker-telephone").fill("0698765432");
    await page.locator("#customer-picker-adresse").fill("3 avenue du Test");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();

    // AND THE CART BELIEVES IT. This is why the edit invalidates
    // `["customer", id]` and not only the list: without that the cart goes on
    // holding the old record and « Encaisser » stays dead after the cashier has
    // just fixed the thing blocking it.
    await expect(page.getByText("Informations manquantes")).toHaveCount(0);
    await expect(page.locator(ENCAISSER)).toBeEnabled();
  });

  test("shows the ADDRESS in the list, so a deliverable client can be told apart", async ({ page }) => {
    // The list printed `téléphone · email` and never the address, so on a
    // delivery there was no way to see which of the regulars could be delivered
    // to at all.
    await startDelivery(page);
    await page.getByRole("button", { name: "Client" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("12 rue de Paris").first()).toBeVisible();
  });
});
