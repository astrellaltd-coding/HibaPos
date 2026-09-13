import { describe, it, expect, beforeEach } from "vitest";
import { signInAs, callJson, clearCookies } from "@/lib/route-harness";
import { db } from "@/lib/db";
import { hashPin } from "@/lib/auth";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/services/settings";
import type { SettingsInput } from "@/lib/validation";

// R8.1 — L-93 and L-101, driven over the real route.
//
// L-101: `PUT /api/settings` refused every non-SUPER_ADMIN, while
// `nav-config.ts:60` gives the MANAGER the Réglages screen with an enabled save
// button. R6.3 (FACTICE off) and R6.4 (choose the print queue) are both this
// route, and the MANAGER is the only account that will be at the till in
// France. DD-26 splits the route by field; DD-27 makes FACTICE one-way.
//
// L-93: an omitted key was materialised by the schema and written over the
// stored value, so a save that merely LEFT OUT `factice` performed R6.3.
//
// WHY DRIVEN. `settings-authz.ts` is a pure rule with its own unit tests, and
// a unit test on an extracted rule proves the rule and NOT that anything calls
// it — this project has shipped that gap three times (§ 2 step 4). Every
// assertion below goes through the exported handler, a real session and the
// real database.

const PIN = "424242";
let manager: { id: string; username: string; role: "MANAGER" };
let admin: { id: string; username: string; role: "SUPER_ADMIN" };

const PUT = async () => (await import("@/app/api/settings/route")).PUT;

async function put(body: unknown) {
  return callJson<{ error?: string; fields?: string[] } & Partial<SettingsInput>>(await PUT(), {
    method: "PUT",
    url: "http://localhost/api/settings",
    body,
  });
}

beforeEach(async () => {
  clearCookies();
  await db.auditLog.deleteMany();
  await db.fiscalEvent.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();

  const stamp = `${Date.now()}-${Math.random()}`;
  const m = await db.user.create({
    data: { username: `r81-mgr-${stamp}`, name: "Resp", role: "MANAGER", pinHash: await hashPin(PIN) },
  });
  const a = await db.user.create({
    data: { username: `r81-sa-${stamp}`, name: "Admin", role: "SUPER_ADMIN", pinHash: await hashPin(PIN) },
  });
  manager = { id: m.id, username: m.username, role: "MANAGER" };
  admin = { id: a.id, username: a.username, role: "SUPER_ADMIN" };
});

describe("L-101 — the MANAGER can do R6.3 and R6.4", () => {
  it("lets a MANAGER choose the Windows print queue (R6.4)", async () => {
    await signInAs(manager);
    const res = await put({ printerQueue: "SUNSO WTP-800", printerConnection: "usb" });
    expect(res.status, `MANAGER refused: ${res.body.error}`).toBe(200);
    expect((await getSettings()).printerQueue).toBe("SUNSO WTP-800");
  });

  it("lets a MANAGER turn FACTICE off (R6.3)", async () => {
    // The row this whole batch exists to unblock. `factice` starts true — that
    // is DEFAULT_SETTINGS and it is what this install stores.
    await saveSettings({ factice: true });
    await signInAs(manager);

    const res = await put({ factice: false });
    expect(res.status, `MANAGER refused: ${res.body.error}`).toBe(200);
    expect((await getSettings()).factice).toBe(false);
  });

  it("still refuses a MANAGER the identity fields, and says which", async () => {
    await signInAs(manager);
    const res = await put({ restaurantSiret: "01234567891011" });
    expect(res.status).toBe(403);
    expect(res.body.fields).toEqual(["restaurantSiret"]);
    // The old answer was « Réservé au super administrateur » with no field
    // named, on a screen with twenty of them.
    expect(res.body.error).toContain("restaurantSiret");
    expect((await getSettings()).restaurantSiret).toBe(DEFAULT_SETTINGS.restaurantSiret);
  });

  it("refuses the whole request when one restricted field rides along", async () => {
    // All-or-nothing: a request that would half-apply is worse than one that
    // does not apply, because the operator's screen then disagrees with the
    // database and nothing says so.
    await signInAs(manager);
    const res = await put({ printerQueue: "SUNSO WTP-800", defaultVatRate: 20 });
    expect(res.status).toBe(403);
    expect(res.body.fields).toEqual(["defaultVatRate"]);
    const after = await getSettings();
    expect(after.printerQueue, "the allowed field must not have been written").toBe(
      DEFAULT_SETTINGS.printerQueue,
    );
    expect(after.defaultVatRate).toBe(DEFAULT_SETTINGS.defaultVatRate);
  });

  it("lets a SUPER_ADMIN write the identity fields", async () => {
    await signInAs(admin);
    const res = await put({ restaurantSiret: "01234567891011", defaultVatRate: 20 });
    expect(res.status, `SUPER_ADMIN refused: ${res.body.error}`).toBe(200);
    const after = await getSettings();
    expect(after.restaurantSiret).toBe("01234567891011");
    expect(after.defaultVatRate).toBe(20);
  });

  it("accepts the whole-DTO save the settings screen actually sends", async () => {
    // `settings-view.tsx:121` posts every field on every save. Authorising on
    // SENT keys rather than CHANGED keys would refuse a MANAGER adjusting the
    // printer, because the SIRET rides along unchanged — which is L-101 again
    // wearing a different hat. This is the test that says the fix works for the
    // client that exists, not only for a hand-built minimal body.
    const whole = { ...(await getSettings()), printerQueue: "SUNSO WTP-800" };
    await signInAs(manager);
    const res = await put(whole);
    expect(res.status, `MANAGER refused a whole-DTO save: ${res.body.error}`).toBe(200);
    expect((await getSettings()).printerQueue).toBe("SUNSO WTP-800");
  });

  it("refuses a MANAGER who changes an identity field inside a whole-DTO save", async () => {
    // The other half of the rule above: unchanged means unwritten, but changed
    // means changed, whatever else the body carries.
    const whole = { ...(await getSettings()), printerQueue: "Q", restaurantName: "Autre Chose" };
    await signInAs(manager);
    const res = await put(whole);
    expect(res.status).toBe(403);
    expect(res.body.fields).toEqual(["restaurantName"]);
  });
});

describe("L-93 — an omitted key is not a written key", () => {
  // ── THE STORED VALUE MUST DIFFER FROM THE SCHEMA DEFAULT ───────────────────
  //
  // Measured the hard way. The first draft of these two stored `factice: true`
  // and `printerConnection: "usb"` — which, AFTER the defaults were reconciled
  // in this same commit, are exactly what the schema materialises. So the
  // revert « write the whole parsed object » spread the default over a stored
  // value equal to it, changed nothing, and **all 62 tests passed**. The tests
  // were asserting a no-op.
  //
  // L-93 needs two things at once: a key absent from the body, AND a stored
  // value the schema default would overwrite. Store the OPPOSITE of the
  // default, and the assertion has something to catch.

  it("does not turn SIMULATION back on because the body left factice out", async () => {
    // Stored `false` — the post-R6.3 state, and the opposite of the schema
    // default. An omitted key must not drag it back to `true`, which would
    // stamp SIMULATION over sales that are already real.
    await saveSettings({ factice: false });
    await signInAs(admin);

    const res = await put({ printerQueue: "SUNSO WTP-800" });
    expect(res.status).toBe(200);
    expect((await getSettings()).factice, "an omitted key was written — this is L-93").toBe(false);
  });

  it("does not turn FACTICE off because the body left it out either", async () => {
    // The other direction, and the one the audit reproduced: before the
    // defaults were reconciled the schema said `false`, so an omitted key
    // performed R6.3 — the act that makes every later sale a real fiscal
    // document. Kept as a distinct test because the two directions fail for
    // different reasons and a single one of them can pass by accident.
    await saveSettings({ factice: true });
    await signInAs(admin);

    const res = await put({ printerQueue: "SUNSO WTP-800" });
    expect(res.status).toBe(200);
    expect((await getSettings()).factice).toBe(true);
  });

  it("does not put printerConnection back by omission", async () => {
    // The same mechanism, the other field, and the one R6.4 rests on. Stored
    // `"network"` because the schema default is now `"usb"`: the value that
    // would be overwritten has to be the one the default does not already say.
    await saveSettings({ printerConnection: "network" });
    await signInAs(admin);

    const res = await put({ printerName: "Sunso WTP-801" });
    expect(res.status).toBe(200);
    expect((await getSettings()).printerConnection).toBe("network");
  });

  it("writes only the keys that changed, and audits exactly those", async () => {
    await saveSettings({ printerQueue: "OLD", autoPrint: false });
    await signInAs(admin);

    const whole = { ...(await getSettings()), printerQueue: "NEW" };
    const res = await put(whole);
    expect(res.status).toBe(200);

    const rows = await db.auditLog.findMany({ where: { action: "SETTINGS_UPDATED" } });
    expect(rows.length).toBe(1);
    expect(JSON.parse(rows[0].details ?? "{}").keys, "the audit row must name the real change").toEqual([
      "printerQueue",
    ]);
  });

  it("treats a save that changes nothing as nothing, without a 403", async () => {
    // A MANAGER re-saving the form untouched sends every restricted field. It
    // must neither be refused nor recorded as a change.
    const whole = await getSettings();
    await signInAs(manager);

    const res = await put(whole);
    expect(res.status).toBe(200);
    expect(await db.auditLog.count({ where: { action: "SETTINGS_UPDATED" } })).toBe(0);
  });
});

describe("DD-27 — FACTICE is one-way once anything real has been sold", () => {
  /** One non-factice row is all DD-27's condition asks about. */
  async function sellSomethingReal() {
    await db.fiscalEvent.create({
      data: {
        sequence: 1,
        type: "VENTE",
        factice: false,
        dataJson: "{}",
        hash: "x".repeat(64),
      },
    });
  }

  it("lets a MANAGER turn it back on while the journal holds nothing real", async () => {
    // Before the first real sale it toggles freely in both directions, which is
    // what this machine needs during testing.
    await saveSettings({ factice: false });
    await signInAs(manager);

    const res = await put({ factice: true });
    expect(res.status, `refused too early: ${res.body.error}`).toBe(200);
    expect((await getSettings()).factice).toBe(true);
  });

  it("refuses a MANAGER turning it back on once a real sale exists", async () => {
    await saveSettings({ factice: false });
    await sellSomethingReal();
    await signInAs(manager);

    const res = await put({ factice: true });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("SIMULATION");
    expect((await getSettings()).factice, "SIMULATION was re-enabled over real sales").toBe(false);
  });

  it("still lets a SUPER_ADMIN do it — the escape hatch is deliberate", async () => {
    await saveSettings({ factice: false });
    await sellSomethingReal();
    await signInAs(admin);

    const res = await put({ factice: true });
    expect(res.status, `the escape hatch is gone: ${res.body.error}`).toBe(200);
    expect((await getSettings()).factice).toBe(true);
  });

  it("never blocks turning it OFF, which is the direction R6.3 needs", async () => {
    // A guard that refused both directions would block the row this batch
    // exists to unblock. Asserted with a real sale present, which is the state
    // where the ON direction is refused.
    await saveSettings({ factice: true });
    await sellSomethingReal();
    await signInAs(manager);

    const res = await put({ factice: false });
    expect(res.status, `R6.3 blocked: ${res.body.error}`).toBe(200);
    expect((await getSettings()).factice).toBe(false);
  });

  it("journals the refusal with the field named", async () => {
    await saveSettings({ factice: false });
    await sellSomethingReal();
    await signInAs(manager);

    await put({ factice: true });
    const rows = await db.auditLog.findMany({ where: { action: "SETTINGS_WRITE_REFUSED" } });
    expect(rows.length).toBe(1);
    expect(rows[0].userId).toBe(manager.id);
    expect(JSON.parse(rows[0].details ?? "{}").refused).toEqual(["factice"]);
  });
});
