// Who may write which setting — DD-26 and DD-27, as a pure rule.
//
// ── WHY THIS IS A MODULE AND NOT THREE LINES IN THE ROUTE ────────────────────
//
// L-101: `nav-config.ts:60` grants the MANAGER the Réglages screen — with a
// comment saying it was opened *because* that is where the printer is
// configured — while `PUT /api/settings` refused every non-SUPER_ADMIN. The
// screen rendered in full, « Enregistrer » was enabled, and pressing it
// answered « Réservé au super administrateur ». That blocked **R6.3** (FACTICE
// off) and **R6.4** (choose the print queue) for the only account that will be
// at the till in France; the one account that could is the developer's, in
// Tunisia (V-10).
//
// DD-26 settled it by splitting the route BY FIELD rather than by role, and
// DD-27 made FACTICE one-way once anything real has been sold. Both are in
// `docs/DECISIONS.md` and neither is a session's to reopen.
//
// It lives here, and not in `settings/route.ts`, for two reasons:
//
//   1. It is a rule about data, so it can be tested as one — every field, both
//      roles, without a request.
//   2. `api-authorization.test.ts` classifies a route by parsing any
//      `if (user.role !== …)` in the handler body. A field-level split is not
//      a blanket refusal, and writing one inline would make the route read as
//      `INLINE_SA` — which is precisely the kind of thing L-120 was about. The
//      route declares `["SUPER_ADMIN", "MANAGER"]` at the wrapper, which is
//      true: both roles may call it. What differs is what they may change.
//
// A unit test on this file proves the rule and NOT that anything calls it, so
// `settings-write.test.ts` drives the real route as both roles.

import type { SettingsInput } from "@/lib/validation";

export type SettingKey = keyof SettingsInput;

/**
 * DD-26 — the identity and fiscal-policy fields. SUPER_ADMIN only.
 *
 * The first six are who the restaurant IS on every ticket it prints. The last
 * four are the ones DD-26 singles out as not operational at all:
 * `discountApprovalThreshold` escapes every DD-19 step-up when set to 100, and
 * `businessDayCutoffHour` sets the edges of every sealed document — move it and
 * two closes can disagree about the same tickets.
 */
export const SUPER_ADMIN_ONLY_SETTINGS = [
  "restaurantName",
  "restaurantAddress",
  "restaurantPhone",
  "restaurantSiret",
  "restaurantTva",
  "footerNote",
  "currency",
  "defaultVatRate",
  "discountApprovalThreshold",
  "businessDayCutoffHour",
] as const satisfies readonly SettingKey[];

/**
 * DD-26 — the operational fields. The MANAGER runs the restaurant (DD-07) and
 * these are the settings that running it needs, `factice` included: turning the
 * simulation stamp off is R6.3 and it is their job.
 */
export const MANAGER_WRITABLE_SETTINGS = [
  "printerName",
  "printerConnection",
  "printerQueue",
  "printerHost",
  "printerPort",
  "printerEnabled",
  "openDrawerOnCash",
  "receiptWidth",
  "autoPrint",
  "factice",
] as const satisfies readonly SettingKey[];

const RESTRICTED = new Set<string>(SUPER_ADMIN_ONLY_SETTINGS);

/**
 * The keys whose value this write would actually CHANGE.
 *
 * Sending a field is not writing it. `settings-view.tsx:121` posts the whole
 * DTO on every save, so a MANAGER adjusting the printer also sends the SIRET —
 * unchanged. Authorising on *sent* keys would refuse them for a field they did
 * not touch, which is L-101 again with extra steps. Authorising on *changed*
 * keys is both the correct rule and the one that needs no client change: a
 * MANAGER still cannot smuggle an identity edit, because changing it makes it
 * changed.
 *
 * Compared by canonical JSON so `null` and `undefined`, and `9100` and `9100`,
 * do not read as edits.
 */
export function changedSettingKeys(
  current: SettingsInput,
  patch: Partial<SettingsInput>,
): SettingKey[] {
  const out: SettingKey[] = [];
  for (const key of Object.keys(patch) as SettingKey[]) {
    const before = JSON.stringify(current[key] ?? null);
    const after = JSON.stringify(patch[key] ?? null);
    if (before !== after) out.push(key);
  }
  return out;
}

export type WriteVerdict =
  | { ok: true }
  | { ok: false; refused: SettingKey[]; message: string };

/**
 * May `role` make this change?
 *
 * `journalHasRealSale` is passed in rather than read here, so this stays a pure
 * function: DD-27's condition is « the fiscal journal holds a non-factice
 * event », which is a database question the route answers.
 */
export function authorizeSettingsWrite(args: {
  role: string;
  changed: SettingKey[];
  factice?: { from: boolean; to: boolean };
  journalHasRealSale: boolean;
}): WriteVerdict {
  const { role, changed, factice, journalHasRealSale } = args;
  const isSuperAdmin = role === "SUPER_ADMIN";

  // DD-26 — the identity and fiscal-policy fields.
  if (!isSuperAdmin) {
    const refused = changed.filter((k) => RESTRICTED.has(k));
    if (refused.length > 0) {
      return {
        ok: false,
        refused,
        // Names the fields. « Réservé au super administrateur » on a screen
        // whose save button is enabled tells the operator nothing about which
        // of twenty fields is the problem.
        message:
          refused.length === 1
            ? `Ce réglage est réservé au super administrateur : ${refused[0]}`
            : `Ces réglages sont réservés au super administrateur : ${refused.join(", ")}`,
      };
    }
  }

  // DD-27 — FACTICE is one-way once anything real has been sold. Turning the
  // stamp back ON would print SIMULATION over genuine sales while the journal
  // row carries the flag, and neither the paper nor the record can be
  // corrected afterwards. Before the first real sale it toggles freely, which
  // is what this machine needs during testing. SUPER_ADMIN is the escape
  // hatch, deliberately.
  if (factice && !factice.from && factice.to && journalHasRealSale && !isSuperAdmin) {
    return {
      ok: false,
      refused: ["factice"],
      message:
        "Le mode SIMULATION ne peut pas être réactivé : le journal fiscal contient déjà des ventes réelles.",
    };
  }

  return { ok: true };
}
