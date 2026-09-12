# The 2026-09 audit — how this directory works

**A whole-project read-only audit of HibaPOS.** Six focused passes, each run in its own
session, each writing exactly one file here.

The six were written and run under the premise that **Tauri v2 planning came next**, and they
say so throughout. The operator's decision since: **the app is fixed and finished first**, and
packaging is planned against a complete app. The pass files are left as they were written —
they are evidence, and their framing is part of the record — but `FINDINGS.md` is written to
the corrected premise. It is a **work list for finishing the software**, not an input to a
packaging plan.

The prompts are in **`docs/AUDIT-PROMPTS.md`** — a preamble plus six pass bodies. Paste the
preamble and one body into a fresh session; repeat six times.

## The files

| File | Pass | The question it answers |
|---|---|---|
| `pass-1-money.md` | Money and the fiscal record | Can this software lose or invent a cent, or write a fiscal document it cannot stand behind? |
| `pass-2-security.md` | Auth, access control, secrets | Can somebody reach something they should not — including the one route that returns a secret on purpose? |
| `pass-3-data-model.md` | Data model, migrations, integrity | Does the schema mean what the code thinks, and can the startup migration gate be made to damage a database? |
| `pass-4-till-in-use.md` | The till, actually used | Used like a restaurant at 23:00, does it tell the truth and keep the money straight? |
| `pass-5-build-ops.md` | Build, dependencies, operations | What ships, and what happens when the disk is full or SQLite is locked? |
| `pass-6-test-quality.md` | Is the suite load-bearing? | Which of the 1382 tests would pass against the bug they are named for? |
| `FINDINGS.md` | *(written last)* | The consolidated, de-duplicated, re-numbered list — the one the remaining work is planned from, and the source of new § 7 rows. |

## Why six files and not one

Three reasons, and the first is the practical one.

1. **Six sessions appending to one file collide**, and some of these may be run in parallel.
2. **Each file is self-contained evidence** — what was checked, how, and what was concluded. It
   stays readable after the findings have been triaged out of it.
3. **Consolidation is real work, not clerical.** Six fresh sessions share no context, so two of
   them landing on the same defect from different angles is expected. Merging, de-duplicating
   and ranking is where that gets resolved — and where a finding that appeared minor in one
   pass and serious in another gets its true severity.

## What each pass may and may not do

**It may:** read anything; run `bun run test`, `typecheck`, `lint`, `build`; and — for the
passes that need it — build and run the app on a **proved scratch copy** of the database, with
both `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden and a marker read back from
`GET /api/auth/profiles` before any write.

**It may not:** edit any existing file, commit anything, run any script with `--apply`, apply a
migration, run any `db:*` command, or start a server against the repository's own database.

**It writes exactly one file: its own.** Uncommitted, deliberately — six commits of unreviewed
findings is worse than one commit after the operator has read them.

## Numbering

New findings continue the existing `L-` series (the last used is **L-88**). Nine findings are
already open in `REMEDIATION_PLAN.md` § 7 and must not be re-reported: L-84, L-82, L-81, L-75,
L-05, L-11, L-47, L-51, L-52. A rediscovery is one line — "already L-nn" — and no more.

Findings are **proposed**, never placed. Nothing in this directory edits `REMEDIATION_PLAN.md`;
the operator decides what becomes a row.

## Afterwards

Once the six are back and read, `FINDINGS.md` consolidates them into **two views of one list**
— by severity, which decides what gets done first, and by the file the work lands in, which
decides what gets done together. Findings fall into four groups: **fix first: money and the
fiscal record** · **fix before the app is called complete** · **fix with the batch that owns
the file** · **record and leave**, plus a small holding pen for anything whose correct fix
genuinely cannot be chosen until the install layout is decided.

That is a **seventh session** with its own prompt — *CONSOLIDATION*, at the end of
`docs/AUDIT-PROMPTS.md`, pasted alone without the preamble. It is not clerical. Four things
make it real work:

- **The numbering has already collided.** All six were told to continue from L-88, so five of
  them claim L-89, four claim L-100, and about ninety claimed slots describe far fewer real
  defects. Every id is reassigned in one sweep, with a mapping table — without it, every id in
  all six files points at the wrong row the moment `FINDINGS.md` exists.
- **Passes contradict each other.** Opposite conclusions about the same code are settled by
  reading the code, not by reporting both.
- **Promotion is verified.** Anything going into the top two groups is re-checked at its
  `file:line` first, because each of those rows is a session the operator will spend.
- **The Tauri framing is undone.** A defect a pass parked because packaging would "change it
  anyway" is re-judged on its merits; if it is broken now, it is on the list now.

---

**Nothing in this directory is evidence of French fiscal or legal compliance**, and no pass may
write that it is. The attestation regime is the operator's; `docs/attestation-conformite.md`
cites art. 441-1 of the code pénal, and a false attestation is a criminal offence.
