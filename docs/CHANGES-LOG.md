# Change log — final tweaks, and everything after go-live

**Where we are.** The application is **not yet delivered**. Delivery is the
evening of **2026-09-08**, and `docs/mise-en-service.md` is the sequence. This
file starts now, during the final tweaks, and carries on past go-live — because
the reason for keeping it is the same either side: if a screen misbehaves in the
restaurant, there should be one short list of what moved, not a `git log` to
reverse-engineer under pressure.

**This is NOT the remediation record.** `REMEDIATION_PLAN.md` and
`REMEDIATION_RECORD.md` govern fiscal and data-integrity work and keep their own
protocol. This file is for the smaller, later work: UI tweaks, labels, spacing, a
small feature. **If a change touches money, VAT, the fiscal journal, the hash
chains, closes, archives, backups or authentication, it does not belong here — it
is a batch, and it goes through the plan.**

---

## THE BASELINE

| | |
|---|---|
| Commit | **`ec162b4`** — the tip of `main` when this file was added. Anything after it is a change and needs a row below. |
| Tests | **1007 pass, 0 fail** · e2e **13 passed** |
| Production database | `d09369c09dd9b4515c78af31118e8dc47516e74c0ab4d41e2bc4d93c5e54b16b`, 704 512 bytes |
| Migrations | 10 applied, none pending |
| Fiscal counters | 20 / 3 / 2 / 2 — all of it **development** trading data (plan warning 4), which **§ 6's reset deletes** |
| Fiscal chains | all four `ok`, and **unkeyed** — `FISCAL_CHAIN_KEY` is armed in § 6e and on no machine before it |

**Every entry below must be reversible on its own.** One change, one commit, one
row here. That is the whole point: a row you can revert without unpicking four
others.

---

## THE LINE THAT CHANGES EVERYTHING: § 6f

The rules below are stricter after one moment, and it is worth being explicit
about which side of it you are on.

**Before § 6f** — where we are now. The trading data in the database is the
developer's own test data and § 6 deletes all of it. A mistake here costs test
data, which is why exercising the fiscal flows was safe enough to do repeatedly
during remediation. **It does not license careless writes to the live database:**
the *catalogue* in that same file is real, irreplaceable work, and every batch in
Stage 3 worked on a scratch copy for that reason.

**After § 6f** — FACTICE goes off and every sale is real. The journal is
append-only, the chain is keyed, and clearing it is precisely the deletion
`docs/attestation-conformite.md` states is impossible. From that moment a change
to any fiscal path is a batch with the plan's full revert protocol, and nothing
here.

---

## HOW TO ADD A ROW

Append to the table. Do not rewrite earlier rows — if something later turns out
to be wrong, add a new row saying so and pointing at the old one. Same rule as
the record: **corrections are appended, never edits.**

Fields, and none is optional:

- **Date** — ISO.
- **What** — one sentence a non-programmer would understand.
- **Why** — who asked, and for what. "Looked nicer" is a legitimate why; write it.
- **Files** — every file touched.
- **Commit** — the sha. Fill it in *after* committing; do not leave `(pending)`.
- **Tests** — the count after the change, and whether any test was added.
- **Revert** — how to undo just this, in one line. If you cannot write that
  line, the change is too big for this file and wants a batch.
- **Risk** — what it could break that a test would not catch. Say **none** only
  when you have thought about it, not as a default.

---

## CHANGES

| Date | What | Why | Files | Commit | Tests | Revert | Risk |
|---|---|---|---|---|---|---|---|
| 2026-09-08 | The − and + buttons on each cart line are drawn smaller: a 32 px box centred inside the same 44 px touch area. | Operator, reviewing the cart on localhost the afternoon before delivery: they looked too big beside the line text. | `src/components/pos/cart-panel.tsx` | `PLACEHOLDER_SHA` | 1007 pass, 0 fail · no test added | `git revert PLACEHOLDER_SHA` — one file, two className strings and a wrapping `<span>`; nothing depends on it. | None to money: `onClick` and `aria-label` are byte-identical, so quantities and totals cannot move. The tap area is unchanged at 44 px, but the *visible* box is now 12 px smaller than the area that responds — it looks smaller than it is, which is worth one [OWNER] look on the real till screen. |

---

## RULES FOR THIS PHASE, AND THEY ARE NOT NEGOTIABLE

1. **Delivery is tonight, so the cost of a broken screen is a bad first
   impression in front of the owner.** That is a real cost even before the
   journal goes live. Small, reversible, tested.
2. **Never write to `db/custom.db`.** Validate on a scratch copy with **both**
   `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden, and prove which database the
   server has open by reading a marker back from the pre-auth
   `GET /api/auth/profiles` before the first write. The catalogue in that file is
   real work and exists nowhere else.
3. **`bun run test` before every commit.** 1007 is the number to beat; if it
   drops, the change is wrong or a test needs writing, and neither is fixed by
   deleting an assertion.
4. **Three tests pin numbers that move when you work** — `readme-counts.test.ts`
   (the README's counts, and it counts loop-generated tests as declared
   *expansions*, so a new `it()` inside a `for` must be declared there),
   `plan-freshness.test.ts` and `touch-and-labels.test.ts`. When one fails, **the
   number is the thing to check, not the assertion.**
5. **Touch targets are 44 px minimum** (Batches 7.6 and 7.7). A standing guard
   enforces it at the call sites; do not lower a height to make something fit.
6. **No line any ticket renderer emits may exceed the paper** (1.3b, 1.3c, and
   BOFiP § 50 forbids truncation). `services/ticket-layout.ts` is shared by all
   three renderers — change it there or not at all.
7. **`.zscripts/*.ps1` must stay pure ASCII with a UTF-8 BOM, and carry no
   backtick inside an expanding `@"…"@` here-string.** All three are
   test-enforced, and all three were learned by a script failing at the far end
   of a wire.
8. **A deploy needs `bun run build`.** The launcher refuses without
   `.next/BUILD_ID` (refusal 5) — louder than it used to be, but still a stopped
   till. Once the till is installed, update it with
   `.zscripts\update.ps1 -Apply`, which backs up, migrates, builds and restarts
   in that order.
9. **Anything changed after the till is installed has to reach the till.** A
   commit on this machine changes nothing in the restaurant. Either it lands
   before § 0b's clone, or it goes through `update.ps1` afterwards.

---

## IF SOMETHING BREAKS

1. **`C:\HibaPOS\data\logs\server.log`, last line.** The launcher's five
   refusals all name themselves there. On this machine, the same information is
   in the terminal running the dev server.
2. **This file's table, newest row first.** That is what it is for.
3. `git log --oneline ec162b4..HEAD` — the same list, unsummarised.
4. **Reverting:** each row's *Revert* column, one at a time, newest first.
5. **The fiscal state is not part of this.** `GET /api/fiscal/verify` must answer
   all four chains `ok` before and after any revert. If it does not, stop and
   read the plan — that is not a UI problem.
