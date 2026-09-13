import { NextResponse } from "next/server";
import { withAuth, parseJson } from "@/lib/api-handler";
import {
  secretsAwaitingRecord,
  acknowledgeSecrets,
  unacknowledgedSecrets,
  chainKeyArmed,
  secretStorePath,
} from "@/lib/services/secret-store";
import { audit } from "@/lib/services/audit";

// GET /api/setup/secrets — the keys this install generated and nobody has
// written down yet. POST — mark them written down.
//
// ── THIS IS THE ONE PLACE A SECRET VALUE IS DELIBERATELY SHOWN ──────────────
// Every other rule in this project is that a secret is never printed, never
// logged and never returned: « a secret in an error message is a secret in a
// log » (Batch 7.3). This route breaks that on purpose, and the reason is in
// `fiscal-key.ts`'s own words — a key « must NOT be stored only on the till
// whose data it protects ». A `BACKUP_ENCRYPTION_KEY` that exists nowhere but
// the machine it protects is not a backup key, and a `FISCAL_CHAIN_KEY` lost
// with its machine leaves a journal nobody can ever verify.
//
// So the value has to reach a person once. What that costs is bounded:
//
//   * SUPER_ADMIN only, declaratively — the till's operator cannot reach it.
//   * `cache-control: no-store`, so it is not written into a disk cache.
//   * Only secrets still AWAITING a record are returned. After POST, this
//     route answers with nothing to show and cannot be used to read a key back.
//   * Both the SHOWING and the acknowledgement write an audit row, NAMES only
//     and never values. L-151 (audit pass 2) found the asymmetry: the harmless
//     confirmation was journalled and the disclosure itself was not, so the one
//     event worth reconstructing later — who saw the key, and when — was the
//     one nothing recorded. A read that returns nothing pending writes no row,
//     so the screen being open does not fill the log.
//
// What it does NOT do is make the key secret again. It is in
// `<dataDir>/db/secrets.json` on that machine, which is where the application
// has to be able to read it from. « Shown once » is a prompt to record it
// elsewhere, not a security property, and saying otherwise would be a lie in a
// place that cannot afford one.
export const GET = withAuth(
  async (_req, { user }) => {
    const pending = secretsAwaitingRecord();
    // NAMES, never values — the same rule the POST below follows. Only when
    // something was actually disclosed: an empty read is not a disclosure.
    if (pending.length > 0) {
      await audit(
        "SECRETS_VIEWED",
        "Secret",
        null,
        { names: pending.map((p) => p.name) },
        user.id,
      );
    }
    return NextResponse.json(
      {
        pending,
        storedAt: secretStorePath(),
        // Deliberately separate from `pending`: the screen needs to know
        // whether anything is outstanding even when it chooses not to show it.
        unacknowledged: unacknowledgedSecrets(),
        // Reported, not inferred: a key armed AND recorded is absent from
        // `unacknowledged`, and so is one that was never armed.
        chainArmed: chainKeyArmed(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  },
  { roles: ["SUPER_ADMIN"] },
);

export const POST = withAuth(
  async (req, { user }) => {
    const body = (await parseJson(req)) as { names?: unknown } | null;
    const names = Array.isArray(body?.names) ? body!.names.filter((n): n is string => typeof n === "string") : [];
    if (names.length === 0) {
      return NextResponse.json(
        { error: "Indiquez les clés confirmées comme enregistrées." },
        { status: 400 },
      );
    }
    const { remaining } = acknowledgeSecrets(names);
    // NAMES, never values.
    await audit("SECRETS_ACKNOWLEDGED", "Secret", null, { names, remaining }, user.id);
    return NextResponse.json({ remaining });
  },
  { roles: ["SUPER_ADMIN"] },
);
