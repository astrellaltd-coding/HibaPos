import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// PLAN FRESHNESS — the staleness this project keeps producing, made into a test.
//
// REWRITTEN 2026-09-10 for the consolidated plan. The previous version guarded
// `REMEDIATION_PLAN.md` + `REMEDIATION_RECORD.md`, which were retired that day
// into `REMEDIATION_PLAN.md` (outstanding work) + `REMEDIATION_DONE.md`
// (finished work). The rot it guards against is unchanged and so is the
// argument for guarding it mechanically:
//
// TWICE a stage completed and left findings pointing at batches that had
// finished without doing them — nine rows after Stage 6, four more after
// Stage 7. A row whose owner reads "6.1" beside a COMPLETED Batch 6.1 reads as
// *done*, and none of them was. Both times it was found by a manual sweep,
// which is the kind of check that works until somebody is in a hurry.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It reads the two files as text and
// checks their **internal consistency**. It cannot tell whether a finding is
// genuinely fixed, whether the task it names is the right one, or whether any
// prose is true. It closes four specific, mechanical, recurring kinds of lie
// and nothing else.

const ROOT = process.cwd();
const PLAN = path.join(ROOT, "REMEDIATION_PLAN.md");
const DONE = path.join(ROOT, "REMEDIATION_DONE.md");

// Line endings are normalised on read. Git checks these files out with CRLF on
// Windows, which leaves a carriage return on the last cell of every table row —
// enough to defeat a trailing-pipe strip, and enough to make "none" not equal
// "none". That is the same failure both earlier versions of this file had: a
// parser narrower than the data it guards.
const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const plan = () => read(PLAN);
const done = () => read(DONE);

/** The status values § 6 declares. A typo'd status is how an item quietly
 *  stops being tracked by anything. */
const ALLOWED_STATUS = new Set([
  "TODO",
  "IN PROGRESS",
  "DONE",
  "BLOCKED",
  "OPERATOR",
  "ASK FIRST",
]);

/** Every task the plan declares: `| **R0.1** | `TODO` | … |` → id → status. */
function taskStatuses(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /^\| \*\*(R[0-9]+\.[0-9]+)\*\* \| `([^`]+)` \|/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.set(m[1], m[2].trim());
  return out;
}

/**
 * The open-findings register in § 7: id → the text of its OWNER cell.
 *
 * The old parser read `line.startsWith("| **")` and thereby skipped four
 * unbolded rows, two of which were exactly the rot it existed to catch. So a
 * row is anything whose first cell is an audit ID, bold optional.
 */
const FINDING_ROW = /^\| \*{0,2}([A-Z]+-[0-9]+[a-z]?)\*{0,2} \|/;

function openFindings(src: string): Map<string, string> {
  const start = src.indexOf("## 7. OPEN FINDINGS");
  const end = src.indexOf("## 8. EXTERNAL");
  const out = new Map<string, string>();
  if (start < 0 || end < 0) return out;
  for (const line of src.slice(start, end).split("\n")) {
    const m = FINDING_ROW.exec(line);
    if (!m) continue;
    const cells = line.split(" | ");
    out.set(m[1], cells[cells.length - 1].replace(/\|\s*$/, "").trim());
  }
  return out;
}

/** Task ids named in an owner cell — "R2.1", "R0.1, R0.2", "none". */
function tasksNamedIn(owner: string): string[] {
  return [...owner.matchAll(/\bR[0-9]+\.[0-9]+\b/g)].map((m) => m[0]);
}

/** Rows that deliberately have no owner. */
const isUnowned = (owner: string) => /^none$/i.test(owner.trim());

describe("plan freshness — the plan and the done file may not disagree", () => {
  it("parses both files at all, so a silent zero cannot pass this suite", () => {
    // Every check below is a loop. If the parsing broke they would all pass
    // over an empty set, which is the classic vacuous test. Counts are PINNED
    // rather than `> 0`: the previous parser skipped four rows and `> 0` was
    // satisfied by the nine it could see.
    const src = plan();
    // Both counts are edited only after measuring what actually moved against
    // the previous commit, never adjusted to make a run go green.
    //
    // 2026-09-10, Phase 2, in two steps:
    //   21 → 20 tasks, 16 findings — R2.1 done; L-76 closed, L-82 opened.
    //   20 → 18 tasks, 16 → 15 findings — R2.2 and R2.3 done; L-77 and L-78
    //   closed, L-83 opened.
    //   18 → 16 tasks, 15 → 16 findings — R3.1 and R3.2 done; L-84 opened, and
    //   nothing closed: L-69 stays open until the OPERATOR applies R3.3.
    //   2026-09-11, Phase 4: 16 → 13 tasks (R4.1, R4.2, R4.3 done) and findings
    //   16 → 16 — L-79, L-80, L-71 closed with them; L-85, L-86, L-87 opened.
    //   2026-09-11, later the same day: findings 16 → 13, tasks unchanged at 13
    //   — L-85, L-86 and L-87 fixed (R4.5/R4.6/R4.7) on the operator's
    //   instruction. They were opened and closed without ever having a task row.
    //   2026-09-11, both operator items applied: tasks 13 → 11 (R3.3, R4.4) and
    //   findings 13 → 11 (L-69, L-39 closed with them). Phases 2, 3 and 4 are
    //   now complete; what is left is Phase 0, Phase 5 and Phase 6.
    //   2026-09-11, Phase 5: tasks 11 → 8 (R5.1, R5.2, R5.3), findings unchanged
    //   at 11 — Phase 5 had no findings of its own. Phases 2-5 are complete;
    //   Phase 0 and Phase 6 remain, neither started.
    //   2026-09-11, Phase 0: tasks 8 → 5 (R0.2, R0.3, R0.4), findings 11 → 10
    //   (L-46 closed with them). Only Phase 6's five OPERATOR rows remain.
    //   2026-09-11, Phase 7 OPENED on the operator's instruction: tasks 5 → 7
    //   (R7.1 seals the give-away figures into the Z report — L-83; R7.2 renames
    //   the two « Coca » products — L-82). This count goes UP because real work
    //   was added, which is the one direction that is not a weakened assertion.
    //   FINDINGS STAY AT 10: L-83 and L-82 were given an OWNER, not closed. They
    //   leave § 7 when they are fixed, and this number drops to 8 then — not now.
    //   2026-09-11, R7.1 done: tasks 7 → 6 and findings 10 → 9 — L-83 closed and
    //   left § 7 with it, which is the drop the line above predicted, half of it.
    //   The other half is L-82, which stays: R7.2 is the operator's and is not
    //   done. Phase 7 therefore still has a row, and this is 6 rather than 5.
    //   2026-09-11, R7.2 done and PHASE 7 COMPLETE: tasks 6 → 5 — the whole
    //   Phase 7 section left § 6, so what remains is Phase 6's five OPERATOR
    //   rows and nothing else. Findings stay at 9 because two moved in opposite
    //   directions in the same commit: L-82 closed (no product shares a name
    //   any more) and **L-88 opened** (the day-close slip prints no give-away
    //   line, though `DailyClose` seals one). A count that does not move is the
    //   case this pin is weakest at, so: 9 is L-88·L-84·L-81·L-75·L-05·L-11·
    //   L-47·L-51·L-52, and L-82 is gone from that list.
    //   2026-09-12, THE 2026-09 AUDIT PHASED: tasks 5 → 24. Phases 8 (6 rows),
    //   9 (10) and 10 (3) were added, one row per BATCH — the file a fix lands
    //   in — from `docs/audit/FINDINGS.md`'s View B. Like Phase 7's rise this
    //   goes UP because real work was added, which is the one direction that is
    //   not a weakened assertion. R8.1 (L-93·L-101) blocks R6.3 and R6.4, so
    //   Phase 6 cannot close first.
    //   FINDINGS STAY AT 9, deliberately. The audit's own 94 (L-89 … L-182) are
    //   NOT in § 7 and must not be: ninety-four rows at that table's density is
    //   ~37 KB against a 40 960-byte ceiling, so placing them would break the
    //   thing the ceiling protects. They live in FINDINGS.md; § 6 carries their
    //   ids and nothing else. If a session ever moves them into § 7, this number
    //   and the ceiling assertion below both have to be re-argued, not just
    //   re-typed.
    //   2026-09-12, same day, execution order settled: tasks 24 → 25. R8.0 was
    //   split out of R9.7 — L-124 is one `.gitattributes` line and without it a
    //   FRESH CLONE of this repository has a failing suite before any work
    //   starts, so it is its own row and it runs first. § 9 moved to
    //   docs/DECISIONS.md in the same commit: the twenty-five rows had left the
    //   plan 37 bytes under the ceiling, which is not headroom, it is a trap.
    //   2026-09-12, R8.0 DONE: tasks 25 → 24. `.gitattributes` now pins `*
    //   text=auto eol=lf`, so a fresh clone checks out LF and the suite is green
    //   from a clone — measured both ways on real clones of this repository:
    //   1 381 pass / 1 fail before (`restore-swap.test.ts:202`, `Received: -1`),
    //   1 382 / 0 after. FINDINGS STAY AT 9: L-124 was never in § 7, it is an
    //   audit finding and it lives in `docs/audit/FINDINGS.md`. Phase 8 is six
    //   rows again, which is what § 1 has said all along.
    //   2026-09-13, R9.6 DONE: tasks 24 → 23. The authorization map now tells a
    //   guard from a no-op — `INLINE` 14 split into INLINE_SA 6, INLINE_ANY 7
    //   and INLINE_SELF 1, no gate moved — and both wrappers journal a 403.
    //   Phase 9 is nine batches now, not ten.
    //   FINDINGS STAY AT 9 for the third time, and here is the reason it is not
    //   laziness: R9.6 opened **L-183** and **L-184**. Neither goes in § 7. They
    //   are audit-sequence ids and they live in `docs/audit/FINDINGS.md`, in a
    //   new *Found after the audit* section that exists precisely so the audit's
    //   94 stay L-89 … L-182 — a closed, dated set that CLAUDE.md, this plan and
    //   the pass files all refer to by that range. If a session ever moves an
    //   audit-sequence id into § 7, this number and the ceiling assertion below
    //   both have to be re-argued, not just re-typed.
    //   2026-09-13, R8.1 DONE: tasks 23 → 22. Phase 8 is five batches now. The
    //   two settings default tables agree and are pinned against each other,
    //   an omitted key is no longer written over the stored value (L-93), and
    //   `PUT /api/settings` splits by field per DD-26/DD-27 (L-101) — so R6.3
    //   is reachable from the till. **R6.3 and R6.4 did NOT leave § 6**: they
    //   are `OPERATOR` rows and they are not done, only unblocked. Their
    //   prose changed, their count did not.
    //   FINDINGS STAY AT 9 for the fourth time. R8.1 opened none.
    //   2026-09-13, R9.2 DONE: tasks 22 → 21, and Phase 9 is eight batches.
    //   **The execution order in § 6 is now empty** — R8.0, R9.6, R8.1 and R9.2
    //   were the four steps that existed because of a dependency, and all four
    //   have landed. What is left is the order the tables print in, which is
    //   why § 6's numbered list shrank to two entries rather than one more row
    //   being struck off it.
    //   FINDINGS STAY AT 9 for the fifth time. R9.2 opened none.
    //   2026-09-13, R8.2 DONE: tasks 21 → 20, Phase 8 is four batches. It left
    //   an OPERATOR action that is NOT a row: its migration is rehearsed and
    //   unapplied, and lives under « Awaiting the operator » in § 1 with the
    //   others. A migration awaiting the operator has never had a § 6 row —
    //   Phases 2, 3 and 7 each did the same — so this count does not move for
    //   it, and a session reading only the number should not conclude the
    //   column is in production.
    //   FINDINGS STAY AT 9 for the sixth time. R8.2 opened **L-185** and
    //   escalated **L-154**, and both are audit-sequence ids living in
    //   `docs/audit/FINDINGS.md`, not in § 7.
    //   2026-09-13, R8.3 DONE: tasks 20 → 19, Phase 8 is three batches. L-91's
    //   fix needed BOTH halves — the route reconciling by id and the client
    //   actually sending the ids it already held — because the client sent
    //   none, which the audit had not measured. L-135 and L-145 rode along as
    //   the row said they would.
    //   FINDINGS STAY AT 9 for the seventh time. R8.3 opened none; it recorded
    //   one open QUESTION inside `schema.prisma` (should `comboProductId`
    //   become a real SET NULL FK?) and left it for R9.8, where the data model
    //   is the subject.
    expect(taskStatuses(src).size).toBe(19);
    expect(openFindings(src).size).toBe(9);
    expect(done()).toContain("# HibaPOS France — Completed Work");
  });

  it("no task claims a status the plan does not define", () => {
    const bad = [...taskStatuses(plan())]
      .filter(([, status]) => !ALLOWED_STATUS.has(status))
      .map(([id, status]) => `${id}: ${status}`);
    expect(bad).toEqual([]);
  });

  it("no OPEN finding is owned by a task that is already DONE", () => {
    // The original rot, in the new shape: a finding pointing at finished work
    // reads as finished, and is not.
    const src = plan();
    const statuses = taskStatuses(src);
    const offenders: string[] = [];

    for (const [id, owner] of openFindings(src)) {
      if (isUnowned(owner)) continue;
      for (const task of tasksNamedIn(owner)) {
        if (statuses.get(task) === "DONE") offenders.push(`${id} → ${task} (DONE)`);
      }
    }

    // The failure message is the whole value here: it names the row to fix and
    // the two honest fixes.
    expect(
      offenders,
      offenders.length
        ? `These findings are owned by tasks the plan says are DONE. Either the ` +
          `finding is resolved — move its row out of § 7 and record the fix in ` +
          `REMEDIATION_DONE.md — or the task finished without it, in which case ` +
          `give it a real owner or write "none": ${offenders.join("; ")}`
        : "",
    ).toEqual([]);
  });

  it("every open finding's owner is readable, so the check above cannot be dodged", () => {
    // Without this, emptying the owner cell would silence the test rather than
    // fix the row.
    const src = plan();
    const statuses = taskStatuses(src);
    const bad: string[] = [];
    for (const [id, owner] of openFindings(src)) {
      if (isUnowned(owner)) continue;
      const named = tasksNamedIn(owner);
      if (named.length === 0) {
        bad.push(`${id}: owner names no task and is not "none" — "${owner.slice(0, 60)}"`);
        continue;
      }
      for (const t of named) {
        if (!statuses.has(t)) bad.push(`${id}: task ${t} does not exist in the plan`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("a DONE task has left the plan for the done file", () => {
    // § 2 step 7: on completion an item moves. A task marked DONE that is still
    // sitting in the plan means the move was half-made, and the plan stops
    // being a list of outstanding work — which is its only job.
    const stillHere = [...taskStatuses(plan())]
      .filter(([, status]) => status === "DONE")
      .map(([id]) => id);
    expect(
      stillHere,
      stillHere.length
        ? `These tasks are marked DONE but are still in REMEDIATION_PLAN.md. ` +
          `Move each row to REMEDIATION_DONE.md with its commit sha and how it ` +
          `was verified: ${stillHere.join(", ")}`
        : "",
    ).toEqual([]);
  });

  it("the done file's index names every entry in it, and invents none", () => {
    // Added 2026-09-11, when the done file passed 100 KB and § 3's invariants
    // moved to `docs/INVARIANTS.md`. An index is only useful if it is true, and
    // a hand-maintained one in THIS project goes stale — that is the whole
    // reason `readme-counts.test.ts` exists. So it is pinned both ways: an
    // entry missing from the index fails, and an index line naming an entry
    // that is not there fails too.
    //
    // Headings inside the fenced template at the top are excluded, because the
    // template's `### <ID> — …` placeholder is not an entry. The first draft of
    // this index counted it and listed a 36th entry that does not exist.
    const src = done();
    const lines = src.split("\n");

    const headings: string[] = [];
    let inFence = false;
    for (const line of lines) {
      if (line.trim().startsWith("```")) {
        inFence = !inFence;
        continue;
      }
      if (!inFence && line.startsWith("### ")) headings.push(line.slice(4).trim());
    }

    const start = src.indexOf("## Index");
    const end = src.indexOf("## Completed in this cycle");
    expect(start, "the done file has no Index section").toBeGreaterThan(-1);
    const indexed = src
      .slice(start, end)
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim());

    expect(headings.length, "no entries found — the parser broke").toBeGreaterThan(20);
    const missing = headings.filter((h) => !indexed.includes(h));
    const invented = indexed.filter((i) => !headings.includes(i));
    expect(missing, `entries missing from the index: ${missing.join(" · ")}`).toEqual([]);
    expect(invented, `index names entries that do not exist: ${invented.join(" · ")}`).toEqual([]);
  });

  it("the plan still fits in one read", () => {
    // § 1 tells a session to read this file top to bottom before touching
    // anything. The retired plan reached 2 173 lines and its record 5 595,
    // which is how the front matter acquired its own 40 KB ceiling and then
    // hit it. Measured in bytes over the WHOLE file, because the whole file is
    // what a session is now asked to read.
    const bytes = Buffer.byteLength(plan(), "utf8");
    expect(bytes, `the plan is ${bytes} bytes; retire something into REMEDIATION_DONE.md`)
      .toBeLessThanOrEqual(40_960);
  });
});
