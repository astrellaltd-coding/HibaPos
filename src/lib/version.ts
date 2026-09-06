// Software identification — L-53 (Batch 3.7).
//
// THE FINDING. `package.json` declared `0.2.1` and nothing in `src/` read it:
// the ticket named the restaurant and never the software, the annual archive
// carried only its own schema version, and no screen said which HibaPOS was
// running. The attestation regime is version-matched — the assujetti must hold
// the attestation « correspondant à la version du logiciel ou système de
// caisse qu'il utilise » (BOI-LETTRE-000242, 25/03/2026) — and a control
// verifies exactly that correspondence between the versions in use and the
// attestations held (BOI-CF-COM-20-60). A version the software cannot state
// is a version the operator cannot evidence.
//
// WHY A LITERAL AND NOT `import pkg from "../../package.json"`. That was the
// first implementation, and it was measured after `next build`: `renderReceipt`
// is also called by the client (the ticket download), so the import pulled the
// WHOLE of `package.json` — scripts and the dependency list with versions —
// into three public client chunks (`grep -rl db:push-force .next/static`),
// readable by anyone who can reach the port. So the release number is copied
// here, and `version.test.ts` fails the suite the moment it disagrees with
// `package.json`. Two sources, one enforced; bump both.
//
// Deliberately NOT exposed by `GET /api` (the liveness probe), which answers
// unauthenticated and says nothing about the process on purpose (C-27).

export const SOFTWARE_NAME = "HibaPOS France";
/** Must equal `package.json`'s `version` — `version.test.ts` enforces it. */
export const SOFTWARE_VERSION = "0.2.1";
/** « HibaPOS France v0.2.1 » — the one string every fiscal surface prints. */
export const SOFTWARE_IDENTITY = `${SOFTWARE_NAME} v${SOFTWARE_VERSION}`;
