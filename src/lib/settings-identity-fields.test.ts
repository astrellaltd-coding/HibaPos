import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SUPER_ADMIN_ONLY_SETTINGS } from "@/lib/services/settings-authz";

// L-252 — every identity setting the ticket prints has a field in Réglages.
//
// L-249 added `restaurantWebsite` on 2026-09-30: stored, validated, printed
// under the footer, SUPER_ADMIN-only — and given no input. Step 2 of the
// go-live (« set the four settings ») could not be done on the till.
//
// A source assertion, because the runner has no DOM: it reads the screen's
// source for the `update("<key>"` call each field makes. It derives the list
// from `SUPER_ADMIN_ONLY_SETTINGS` rather than repeating it, so the next
// `restaurant*` setting is covered without anyone remembering this file.

const view = readFileSync(path.join(process.cwd(), "src/features/admin/settings-view.tsx"), "utf8");
const identity = SUPER_ADMIN_ONLY_SETTINGS.filter((k) => k.startsWith("restaurant"));

describe("Réglages has a field for every identity setting (L-252)", () => {
  it("covers the six identity settings, the website included", () => {
    expect(identity).toContain("restaurantWebsite");
    expect(identity.length).toBe(6);
  });

  it.each(identity)("%s is editable on the settings screen", (key) => {
    expect(view).toContain(`update("${key}"`);
  });
});
