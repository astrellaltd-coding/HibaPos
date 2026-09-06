import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SOFTWARE_NAME, SOFTWARE_VERSION, SOFTWARE_IDENTITY } from "@/lib/version";

// L-53 (Batch 3.7) — the software must be able to state its version.
//
// The constant is a COPY of `package.json`'s version (reading the file leaked
// the whole of it into the client bundle — see `version.ts`), so this is the
// test that fails the suite the moment the two disagree. Bump both, or ship a
// ticket that names the wrong version.

describe("software identification (L-53)", () => {
  it("equals the version package.json declares — the one place a release is declared", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      version: string;
    };
    expect(SOFTWARE_VERSION).toBe(pkg.version);
  });

  it("is a dotted release number, so a placeholder cannot pass", () => {
    expect(SOFTWARE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("names the software and the version in the one string every surface prints", () => {
    expect(SOFTWARE_NAME).toBe("HibaPOS France");
    expect(SOFTWARE_IDENTITY).toBe(`${SOFTWARE_NAME} v${SOFTWARE_VERSION}`);
  });
});
