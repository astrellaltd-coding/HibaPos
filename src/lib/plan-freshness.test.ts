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
    expect(taskStatuses(src).size).toBe(21);
    expect(openFindings(src).size).toBe(16);
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
