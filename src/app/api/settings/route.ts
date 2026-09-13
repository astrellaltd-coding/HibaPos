import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import { db } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/services/settings";
import { authorizeSettingsWrite, changedSettingKeys } from "@/lib/services/settings-authz";
import { settingsSchema, type SettingsInput } from "@/lib/validation";
import { audit } from "@/lib/services/audit";

// M-19s (Batch 4.4b): this read was open to any authenticated role while the
// `PUT` below was SUPER_ADMIN-only. It returns the SIRET, the TVA number, the
// address, the printer configuration and the discount approval threshold, so
// read and write now agree. With one operational role this changes no
// observable behaviour — both surviving roles are named — which is the point:
// it removes a latent inconsistency rather than a live leak. Batch 4.4's
// measurement is why this could not be done before: `discount-dialog.tsx`,
// `payment-dialog.tsx`, `receipt-dialog.tsx` and `orders-view.tsx` all read
// this route from views that were CASHIER-visible.
//
// R8.1 (2026-09-13): they still agree, by a different route. DD-26 opened the
// WRITE to the MANAGER field by field, so both verbs now admit both roles and
// the asymmetry moved inside the write, where `settings-authz.ts` holds it.
export const GET = withAuth(
  async () => {
    const settings = await getSettings();
    return NextResponse.json(settings);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);

// PUT — R8.1 (2026-09-13), closing L-93 and L-101.
//
// ── WHAT CHANGED, AND WHY THE SHAPE IS THIS SHAPE ────────────────────────────
//
// L-101: the whole route was SUPER_ADMIN. `nav-config.ts:60` gives the MANAGER
// this screen with an enabled save button, so the only account that will be at
// the till in France got a 403 — and R6.3 (FACTICE off) and R6.4 (choose the
// print queue) are both this route. DD-26 splits it BY FIELD instead: the
// wrapper admits both roles, and `settings-authz.ts` decides per field. Hiding
// the screen was explicitly rejected — it leaves those two rows reachable only
// from the developer's account in Tunisia (V-10).
//
// L-93: the route parsed with `settingsSchema` and handed the PARSED object to
// `saveSettings`, which does `{ ...current, ...input }`. Zod's `.default()`
// does not leave an absent key absent — it MATERIALISES it — so a body that
// merely omitted `factice` arrived as a present `false` and overwrote the
// stored `true`, performing R6.3 by accident. The same mechanism turned
// `printerConnection` back to `"network"` and undid the decision R6.4 rests on.
//
// **`.partial()` does not fix that** — measured on this zod 4: a partial parse
// of `{ printerQueue: "…" }` still materialises ten defaults, `factice` among
// them. So the route now keeps only the keys the client ACTUALLY SENT, taken
// from the raw body, and writes only those. A key that was not sent is not
// written, whatever the schema would have supplied for it.
//
// The two default tables were reconciled in the same commit and are now pinned
// against each other key by key (`settings-defaults-agree.test.ts`), so this
// route is no longer the only thing standing between them.
export const PUT = withAuth(
  async (req, { user }) => {
    const body = await parseJson(req);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
    }

    // Validate with the full schema's rules but without requiring every field:
    // this is a save of what the form holds, and since Batch 3.1d that form can
    // legitimately post a subset.
    const parsed = settingsSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalide" },
        { status: 400 },
      );
    }

    // ONLY what the client sent. `parsed.data` carries materialised defaults
    // for everything it did not — that is L-93 — so the raw body's own keys are
    // the authority on what this request is asking to change.
    const sent = new Set(Object.keys(body as Record<string, unknown>));
    const patch: Partial<SettingsInput> = {};
    const writable = patch as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed.data)) {
      if (sent.has(key)) writable[key] = value;
    }

    const current = await getSettings();
    const changed = changedSettingKeys(current, patch);
    if (changed.length === 0) {
      // Nothing to do, and nothing to authorise: a save that changes nothing is
      // not a write. Returns the settings so the form still refreshes.
      return NextResponse.json(current);
    }

    // DD-27's condition, asked only when it can matter.
    const turningFacticeOn = changed.includes("factice") && patch.factice === true;
    const journalHasRealSale = turningFacticeOn
      ? (await db.fiscalEvent.count({ where: { factice: false } })) > 0
      : false;

    const verdict = authorizeSettingsWrite({
      role: user.role,
      changed,
      factice: changed.includes("factice")
        ? { from: current.factice, to: patch.factice === true }
        : undefined,
      journalHasRealSale,
    });
    if (!verdict.ok) {
      // Journalled like any other refusal (L-151), and with the fields named —
      // a settings 403 that does not say WHICH field is how L-101 stayed
      // invisible for as long as it did.
      await audit(
        "SETTINGS_WRITE_REFUSED",
        "Setting",
        null,
        { refused: verdict.refused, attempted: changed, role: user.role },
        user.id,
      );
      return NextResponse.json({ error: verdict.message, fields: verdict.refused }, { status: 403 });
    }

    const settings = await saveSettings(patch);
    await audit("SETTINGS_UPDATED", "Setting", null, { keys: changed }, user.id);
    return NextResponse.json(settings);
  },
  { roles: ["SUPER_ADMIN", "MANAGER"] },
);
