# The next session — L-218, then L-221 + L-222

**Rewritten 2026-09-18.** This file held prompts for *R8.0, R9.6 + R8.1, then Phase 6*. **All
three of those closed on 2026-09-13**, and the file went on pointing at them for five days —
which is exactly the failure it exists to prevent. The old prompts are in git history.

One prompt per session. Paste the block between the rules, and nothing else.

**Both sessions below are FINDINGS work, not plan rows.** § 6 holds nothing that is a session's
and § 7 is closed to new rows, so each is done as its own item with its own commit and its own
entry in `REMEDIATION_DONE.md` — the shape L-191, L-213, L-214, L-216, L-217, L-219 and L-220
all used.

---

## SESSION A — L-218, small, its own commit

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` § 1 and § 2, then **L-218** in
`docs/audit/FINDINGS.md`.

**A migration rehearsal reported success and applied nothing.** Running

```
DATABASE_URL="file:/c/Users/…/db-snapshots/…/custom.db" bunx prisma migrate deploy
```

from Git Bash printed the migration's folder name and then **« All migrations have been
successfully applied »** — and afterwards the copy still held 18 migrations and no new table,
as did production. The same command with `file:C:/Users/…` applied it correctly, and
`migrate status` had been saying « Following migration have not yet been applied » the whole
time. It was caught only because the fingerprint diff came out **empty** — every table
identical, including the one that should have appeared.

**The plan knows both halves and joins them nowhere.** § 2 warns that Git Bash rewrites a
leading-slash argument and to use `MSYS_NO_PATHCONV=1`, but says it about request bodies and
shell arguments, not `DATABASE_URL`. `CLAUDE.md` warns that a bare `migrate deploy` prints the
same green banner whichever migration it ran. This is that banner lying for a third reason
neither note covers.

**Do this:**

1. **Reproduce it before fixing it.** Copy `db/custom.db` to `../db-snapshots/l218-check/`,
   run `migrate status` against it with the `/c/…` form and with the `C:/…` form, and record
   what each says. If the two forms now agree, say so and stop — the finding would be wrong and
   that is worth more than a fix.
2. **One line in § 2's rehearsal method**: give `DATABASE_URL` a Windows-form path, `C:/…`,
   never `/c/…`. It belongs where the method is, beside the `MSYS_NO_PATHCONV=1` note it sits
   next to.
3. **Then decide, and bring the decision rather than taking it**: should the REHEARSAL half go
   through `scripts/apply-migration.ts` too? That script names the migration it actually applied
   and verifies the result instead of trusting an exit code, which is why `CLAUDE.md` makes it
   the hand-over command. A rehearsal through the same script would have refused rather than
   congratulated itself. It is a real change to `scripts/` and to the method, so it is the
   operator's call.

**Mind the plan's ceiling**: 39 992 of 40 960 bytes, 968 left. A line in § 2 fits; a paragraph
may not.

Three gates, commit, push, `REMEDIATION_DONE.md` entry, stop.

---

## SESSION B — L-221 + L-222, one workflow, a decision first

HibaPOS France. Read `CLAUDE.md`, then `REMEDIATION_PLAN.md` in full, then **L-221 and L-222**
in `docs/audit/FINDINGS.md`.

**Reported by the restaurant's owner on 2026-09-18**, at the caisse, trying a livraison. Two
halves of one workflow:

- **L-221 — there is no VILLE field anywhere.** A client's whole location is one free-text
  `address` string, and the only thing saying a town belongs in it is a placeholder.
- **L-222 — the delivery ticket says « Type : Livraison » and nothing about who or where.**
  `OrderDto.customer` is `{ name: string }` alone, both order routes select only the name, and
  `renderReceipt` prints no customer at all. **The driver gets a ticket with no destination.**

**DO NOT START WITH CODE. L-222 needs a decision that is not a layout question.**
`Receipt.content` is the SEALED document (R9.1 — « the customer's paper IS the sealed
`Receipt.content` »), the journal is append-only, and `docs/attestation-conformite.md` states
deletion is impossible. **A name, a telephone number and a home address in it are permanently
undeletable.** Bring the operator two shapes, in plain language with a worked example, per
`decision-briefs-plain-language.md`:

- **(a)** the address goes into the sealed receipt — one document, as today;
- **(b)** a delivery ALSO prints a non-fiscal « bon de livraison » carrying the address, and the
  sealed ticket is unchanged. More work, and the only shape that keeps a customer's home out of
  an immutable fiscal record.

**And L-221 has its own fork**: a second box composing into the existing `address` string (no
migration, cannot be sorted on), or a real `city` column (a migration, and every reader —
`customerSchema`, `CustomerDto`, both forms, the list, the API — in the same commit).

**READ DD-15's TOMBSTONE FIRST.** `prisma/schema.prisma:462` still carries the comment from the
`postalCode` column that was DELETED for having « ZERO references in `src/` — not in
`customerSchema`, not in `CustomerDto`, not in the delivery form ». A location column added
without its readers is that column again.

**Whatever is decided, it has to reach `missingForDelivery`** (`src/lib/delivery-customer.ts`):
if a town is required for a delivery it belongs in that rule beside name, phone and address, or
the till will accept a client the driver cannot find. That function is called by the cart panel,
the client picker and `POST /api/orders` — L-214 made it the single rule precisely so the three
cannot drift again.

**No test renders a LIVRAISON ticket and reads it.** Every delivery test asserts the order is
accepted or refused. Add one, and prove it red first.

If the migration route is chosen: rehearse it on a copy with a fingerprint diff, hand over
`bun scripts/apply-migration.ts --apply --expect <path>`, and **do not apply it** — except that
restarting the app applies pending migrations itself (PREP-4), so say so plainly rather than
being surprised by it as this session was.

Three gates, commit, push, `REMEDIATION_DONE.md` entry, stop.

---

## What is NOT next, and why

- **Phase 6** — R6.1 reset, R6.2 arm the chain key, R6.3 FACTICE off. All `OPERATOR`, in that
  order, and the order is not a preference. Nothing a session does.
- **A category-level default for option counts** — « every sandwich includes 3 sauces » is eight
  separate edits today. **Declined by the operator on 2026-09-18**; L-220's row records it as a
  closed question, not an outstanding one.
- **L-211's measurement** — nobody has read `innerWidth`, `innerHeight` or `devicePixelRatio` on
  the France till, so « the keyboard is two rows shorter » is an improvement of unknown
  sufficiency. It needs someone at that machine, not a session.
- **Tauri v2** — still the shipping form, still without a plan. What runs in France is the
  development build. Where a fix has two reasonable forms, take the one that survives becoming
  a Windows native app.
