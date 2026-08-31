import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // React strict mode: double-invokes render/effects in DEV to surface
  // effect-cleanup bugs. Previously disabled (masks bugs); re-enabled for
  // production quality. Dev server may show double-renders — that's expected.
  reactStrictMode: true,
};

export default nextConfig;
