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

  // M-26 (Batch 4.4): the app sent no security headers at all and had no
  // middleware to add them. Low risk on a kiosk, but free to fix.
  //
  // Two deliberate omissions:
  //
  //  * **No HSTS.** DD-06 binds the server to `127.0.0.1` over plain HTTP.
  //    `Strict-Transport-Security` would instruct the browser to refuse that
  //    origin over HTTP in future — i.e. it would break the till. It belongs
  //    with a TLS deployment, not before one.
  //  * **`'unsafe-inline'` / `'unsafe-eval'` in `script-src`.** Next injects
  //    inline bootstrap scripts, and a nonce-based CSP needs middleware that
  //    rewrites every response. The value here is `frame-ancestors`,
  //    `object-src` and pinning every fetch to `'self'`; a strict script-src
  //    is a separate piece of work, and a CSP that breaks the POS is worse
  //    than one that narrows it.
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
