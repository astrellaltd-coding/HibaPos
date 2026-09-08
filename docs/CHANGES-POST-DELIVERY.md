# Changes after the delivery baseline

**What this file is for.** From 2026-09-08 the application is being installed on
a real till. Anything changed after that baseline is recorded here, in one place,
so that if a screen misbehaves in the restaurant there is a single short list of
what moved — rather than a `git log` to reverse-engineer under pressure.

**This is NOT the remediation record.** `REMEDIATION_PLAN.md` and
`REMEDIATION_RECORD.md` govern fiscal and data-integrity work and keep their own
protocol. This file is for the smaller, later, mostly cosmetic work: UI tweaks,
labels, spacing, a small feature. **If a change touches money, VAT, the fiscal
journal, the hash chains, closes, archives, backups or authentication, it does
not belong here — it is a batch, and it goes through the plan.**

---

## THE BASELINE

| | |
|---|---|
| Commit | `a260b70` — the last commit before any post-delivery change |
| Tests | **1007 pass, 0 fail** · e2e **13 passed** |
| Production database | `d09369c09dd9b4515c78af31118e8dc47516e74c0ab4d41e2bc4d93c5e54b16b`, 704 512 bytes |
| Migrations | 10 applied, none pending |
| Fiscal counters | 20 / 3 / 2 / 2 — **and § 6's reset takes them to 0/0/0/0** |
| Fiscal chains | all four `ok`, unkeyed until § 6e |

**Every entry below must be reversible on its own.** One change, one commit, one
row here. That is the whole point: a row you can revert without unpicking four
others.

---

## HOW TO ADD A ROW

Append to the table. Do not rewrite earlier rows — if something later turns out
to be wrong, add a new row that says so and points at the old one. Same rule as
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
| — | *No post-delivery changes yet. The baseline above is current.* | | | `a260b70` | 1007 | | |

---

## RULES FOR THIS PHASE, AND THEY ARE NOT NEGOTIABLE

1. **The till is live, or about to be.** After § 6f every sale is real and the
   journal is append-only. A change that touches a fiscal path is a batch, with
   the plan's revert protocol, not a row here.
2. **Never write to `db/custom.db`.** Validate on a scratch copy with **both**
   `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden. The catalogue in that file
   is real work and exists nowhere else.
3. **`bun run test` before every commit.** 1007 is the number to beat; if it
   drops, the change is wrong or a test needs writing, and neither is fixed by
   deleting an assertion.
4. **Three tests pin numbers that move when you work** — `readme-counts.test.ts`
   (the README's counts, and it counts loop-generated tests as *expansions*, so a
   new `it()` inside a `for` must be declared there), `plan-freshness.test.ts`
   and `touch-and-labels.test.ts`. When one fails, **the number is the thing to
   check, not the assertion.**
5. **Touch targets are 44 px minimum** (Batches 7.6 and 7.7). A standing guard
   enforces it at the call sites; do not lower a height to make something fit.
6. **No line any ticket renderer emits may exceed the paper** (1.3b, 1.3c, and
   BOFiP § 50 forbids truncation). `services/ticket-layout.ts` is shared by all
   three renderers — change it there or not at all.
7. **`.zscripts/*.ps1` must stay pure ASCII with a UTF-8 BOM, and no backtick
   inside an expanding `@"…"@` here-string.** All three are test-enforced, and
   all three were learned by a script failing on the till side of the wire.
8. **A deploy needs `bun run build`.** The launcher refuses without
   `.next/BUILD_ID` (refusal 5), which is louder than it used to be but still a
   stopped till. Update the running install with `.zscripts\update.ps1 -Apply`,
   which backs up, migrates, builds and restarts in that order.

---

## IF SOMETHING BREAKS ON THE TILL

1. **`C:\HibaPOS\data\logs\server.log`, last line.** The launcher's five
   refusals all name themselves there.
2. **This file's table, newest row first.** That is what it is for.
3. `git log --oneline a260b70..HEAD` — the same list, unsummarised.
4. **Reverting:** each row's *Revert* column, one at a time, newest first.
5. **The fiscal state is not part of this.** `GET /api/fiscal/verify` must answer
   all four chains `ok` before and after any revert. If it does not, stop and
   read the plan — that is not a UI problem.
