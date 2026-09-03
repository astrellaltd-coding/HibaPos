import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `output: "standalone"` was removed in Batch 2.4 (L-04, L-05).
  //
  // It was built on every `next build` and used by nothing. The launcher
  // runs `next start`, which prints "next start does not work with output:
  // standalone" and serves from `.next` anyway — so the standalone tree was
  // pure cost: ~297 MB of duplicated runtime, and a byte-identical copy of
  // `.env` (DATABASE_URL, SESSION_SECRET, BACKUP_ENCRYPTION_KEY) sitting in
  // a second place nobody thought about.
  //
  // Standalone output is genuinely useful for a self-contained install, so
  // Batch 1.4 may well bring it back — deliberately, with the launcher
  // actually pointed at `.next/standalone/server.js` and with the secret
  // handling designed rather than inherited.
  // React strict mode: double-invokes render/effects in DEV to surface
  // effect-cleanup bugs. Previously disabled (masks bugs); re-enabled for
  // production quality. Dev server may show double-renders — that's expected.
  reactStrictMode: true,
};

export default nextConfig;
