import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { SoftwareIdentity } from "@/components/shared/software-identity";

// L-53 (Batch 3.7) — the fiscal screen shows which software is running.
//
// The component is pure so it can be rendered here without a browser; L-47
// blocks driving an authenticated screen in the in-app pane, and this is the
// same conversion Batches 5.4 and 5.7d made. **The last case is a SOURCE
// assertion, not behaviour**: it proves the fiscal screen references the
// component and feeds it the verify endpoint's `software`, and nothing more.

describe("SoftwareIdentity (L-53)", () => {
  it("prints the name and the version it is given", () => {
    const html = renderToStaticMarkup(
      <SoftwareIdentity software={{ name: "HibaPOS France", version: "9.8.7" }} />,
    );
    expect(html).toContain("HibaPOS France");
    expect(html).toContain("9.8.7");
    expect(html).toContain("Logiciel");
  });

  it("renders nothing while the endpoint has not answered", () => {
    expect(renderToStaticMarkup(<SoftwareIdentity software={undefined} />)).toBe("");
  });

  it("is wired into the fiscal screen from the verify endpoint (source assertion)", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src/features/fiscal/fiscal-view.tsx"),
      "utf8",
    );
    expect(src).toContain("<SoftwareIdentity software={verify.data?.software} />");
  });
});
