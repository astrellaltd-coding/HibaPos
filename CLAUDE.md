# HibaPOS France — read this first

This repository runs a real French restaurant's point of sale, under fiscal record-keeping obligations. Two documents govern all work here.

1. Open `REMEDIATION_PLAN.md` and read **everything above its first stage heading** before doing anything. It says where to resume, what is waiting on whom, and what must not be broken. `REMEDIATION_RECORD.md` holds the verbatim evidence for every completed batch; slice it by heading, do not read it whole.
2. Never run `bun run test:e2e`, `bunx vitest`, `npx vitest` or `git clean`, and never run a script in `scripts/` without reading it and the plan's *Immediate warnings* first.
3. Never write to `db/custom.db` or to real menu data. Validate on a scratch copy with **both** `DATABASE_URL` and `HIBAPOS_DATA_DIR` overridden (plan → *Methods established by earlier batches*).
4. `prisma migrate deploy` against production, killing processes and edits to the live catalogue are the operator's actions: prepare, rehearse, verify, then hand over the exact command. `git push` only when the user asks for it in the session.
5. Do one batch, record it as the plan's *HOW TO USE THIS FILE* says, commit, and stop.
