import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// PLAN FRESHNESS — the staleness this project keeps producing, made into a test.
//
// TWICE NOW a stage has completed and left findings pointing at batches that
// finished without doing them. Nine rows after Stage 6 (L-50, L-48, L-45,
// L-44, L-32, L-31, L-30, L-24, L-19) and four more after Stage 7 (L-51,
// L-36, L-22, L-47). A row whose last cell reads "6.1" beside a `COMPLETED`
// Batch 6.1 reads as *done*, and none of them was.
//
// Both times it was found by a manual sweep, which is exactly the kind of
// check that works until somebody is in a hurry. The plan already prefers a
// standing assertion over a paragraph — that is what `GATES` did for DD-22's
// authorization review — so the same treatment applies here.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It reads the plan as text and checks
// **internal consistency**: no open finding may name a batch that the same
// document says is `COMPLETED`. It cannot tell whether a finding is genuinely
// fixed, whether the batch it names is the right one, or whether the prose is
// true. It closes one specific, recurring, mechanical rot — a pointer to work
// that has already finished — and nothing else.

const PLAN = path.join(process.cwd(), "REMEDIATION_PLAN.md");

function plan(): string {
  return readFileSync(PLAN, "utf8");
}

/** Every batch id the plan declares, with the status it declares for it. */
function batchStatuses(src: string): Map<string, string> {
  const out = new Map<string, string>();
  // `## Batch 7.4a — Title` followed within a few lines by `**Status:** `X``
  const re = /^## Batch ([0-9][0-9a-z.]*)\s*[—-][^\n]*\n([\s\S]{0,400}?)\*\*Status:\*\*\s*`([^`]+)`/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.set(m[1], m[3].trim());
  return out;
}

/** The open-findings register: id → the text of its last cell. */
function openFindings(src: string): Map<string, string> {
  const start = src.indexOf("# NEWLY DISCOVERED ISSUES");
  const end = src.indexOf("# DEFERRED / LOW PRIORITY");
  const out = new Map<string, string>();
  for (const line of src.slice(start, end).split("\n")) {
    if (!line.startsWith("| **")) continue;
    const id = line.split("**")[1];
    const cells = line.split(" | ");
    out.set(id, cells[cells.length - 1]);
  }
  return out;
}

/**
 * The ASSIGNMENT half of a register row's last cell.
 *
 * The column has a shape, stated in the register itself:
 * `<assignment> — <anything>`. Everything after the first em dash is prose —
 * usually the history of which batch completed without the finding — and must
 * NOT be read as an assignment. Scrubbing that prose with regexes was the
 * first attempt here and it was the wrong shape of solution: it made the test
 * a guessing game about English rather than a check of a contract.
 */
function assignmentOf(cell: string): string {
  return cell.split(" — ")[0];
}

/** Rows that deliberately have no batch. */
function isUnassigned(assignment: string): boolean {
  return /NO BATCH OWNS THIS|Operator action/i.test(assignment);
}

/** Batch ids named in an assignment — "7.4c", "6.1 or 7.2", "**1.3**". */
function batchesNamedIn(assignment: string): string[] {
  return [...assignment.matchAll(/\b([0-9]\.[0-9][a-z]?)\b/g)].map((m) => m[1]);
}

describe("plan freshness — an open finding may not point at a finished batch", () => {
  it("parses the plan at all, so a silent zero cannot pass this file", () => {
    // Every check below is a loop. If the parsing broke, they would all pass
    // over an empty set, which is the classic vacuous test.
    const src = plan();
    expect(batchStatuses(src).size).toBeGreaterThan(20);
    expect(openFindings(src).size).toBeGreaterThan(0);
    expect(batchStatuses(src).get("7.1")).toBe("COMPLETED");
  });

  it("no OPEN finding is assigned to a COMPLETED batch", () => {
    const src = plan();
    const statuses = batchStatuses(src);
    const offenders: string[] = [];

    for (const [id, cell] of openFindings(src)) {
      const assignment = assignmentOf(cell);
      if (isUnassigned(assignment)) continue;
      for (const batch of batchesNamedIn(assignment)) {
        if (statuses.get(batch) === "COMPLETED") {
          offenders.push(`${id} → Batch ${batch} (COMPLETED)`);
        }
      }
    }

    // The failure message is the whole value here: it says which row to fix
    // and what the two honest fixes are.
    expect(
      offenders,
      offenders.length
        ? `These findings are assigned to batches the plan says are COMPLETED. ` +
          `Either the finding is resolved — move its row to REMEDIATION_RECORD.md ` +
          `→ Resolved findings — or the batch finished without it, in which case ` +
          `give it a real owner, or write "NO BATCH OWNS THIS" and put the ` +
          `history after the em dash: ${offenders.join("; ")}`
        : "",
    ).toEqual([]);
  });

  it("every open finding's assignment is readable, so the check above cannot be dodged", () => {
    // Without this, deleting the assignment — or burying it after the dash —
    // would silence the test rather than fix the row.
    const src = plan();
    const statuses = batchStatuses(src);
    const bad: string[] = [];
    for (const [id, cell] of openFindings(src)) {
      const assignment = assignmentOf(cell);
      if (isUnassigned(assignment)) continue;
      const named = batchesNamedIn(assignment);
      if (named.length === 0) {
        bad.push(`${id}: assignment names no batch — "${assignment.slice(0, 60)}"`);
        continue;
      }
      for (const b of named) {
        if (!statuses.has(b)) bad.push(`${id}: Batch ${b} does not exist in the plan`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no batch stub claims a status the plan does not define", () => {
    // The plan's own "Status values (use exactly these)" table. A typo'd
    // status is how a batch quietly stops being tracked by anything.
    const src = plan();
    const allowed = new Set([
      "NOT STARTED",
      "IN PROGRESS",
      "IMPLEMENTED — TESTING REQUIRED",
      "COMPLETED",
      "BLOCKED",
      "DEFERRED",
      "REQUIRES DECISION",
      "REQUIRES EXTERNAL VERIFICATION",
      "SPLIT", // used by 5.7 and 7.4, both of which name their parts
    ]);
    const bad = [...batchStatuses(src)]
      .filter(([, status]) => !allowed.has(status))
      .map(([id, status]) => `${id}: ${status}`);
    expect(bad).toEqual([]);
  });

  it("the front matter still fits in one read", () => {
    // HOW TO USE: "Anything above the first stage heading must fit in one
    // read; if it grows past about 40 KB, retire something into the record
    // rather than adding." Measured in BYTES, and above `# STAGE 0` — the
    // first stage heading, which is what CLAUDE.md tells a session to read.
    const src = plan();
    const frontMatter = src.slice(0, src.indexOf("# STAGE 0"));
    const bytes = Buffer.byteLength(frontMatter, "utf8");
    expect(bytes, `front matter is ${bytes} bytes; retire something into the record`)
      .toBeLessThanOrEqual(40_960);
  });
});
