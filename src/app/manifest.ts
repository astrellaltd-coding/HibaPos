import type { MetadataRoute } from "next";

/**
 * C-07 (Batch 1.4) — the web manifest that turns the till from "a browser
 * someone left open" into an installed application.
 *
 * WHY THIS EXISTS. Batch 1.4's own validation asks for the browser to be "in
 * kiosk mode without human action". Kiosk flags alone get you a chromeless
 * window that is still, in the taskbar and in the Start Menu, Edge. With this
 * manifest the operator can **Install** the app once and then gets a desktop
 * shortcut, a Start Menu entry, a pinnable taskbar identity and its own icon —
 * which is what the owner of a restaurant means by "an app".
 *
 * ON LOCALHOST, AND THAT IS NOT AN ACCIDENT. Installability normally requires
 * a secure context, i.e. HTTPS. `http://localhost` and `http://127.0.0.1` are
 * the documented exception, which is why this works with no certificate on a
 * machine that is never on the public internet. It does **not** work over the
 * LAN address — `http://192.168.x.x:3000` is not a secure context and shows no
 * install button. That costs us nothing: DD-06 binds the server to `127.0.0.1`
 * on purpose, and it is the same secure-context rule that made the `Secure`
 * session cookie work at localhost and fail over the LAN.
 *
 * NO SERVICE WORKER, DELIBERATELY. Chromium desktop no longer requires one to
 * install, and adding one here would be a net loss: the server runs on the SAME
 * machine as the browser, so if it is down the API is dead too and a cached
 * shell shows a broken till rather than an honest error. What a cache WOULD
 * reliably buy us is a stale UI after an update — the exact failure that is
 * hardest to diagnose from another country. If someone adds one later, this
 * paragraph is the argument they have to answer first.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable identity, so the installed app survives a change of start_url.
    id: "/?source=pwa",
    name: "HibaPOS France — Caisse",
    short_name: "HibaPOS",
    description: "Système de point de vente pour restaurant — HibaPOS France",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    // `standalone`, not `fullscreen`: the window has no address bar, no tabs
    // and no bookmarks, but the operator keeps the taskbar. Full screen is the
    // launcher's job (`hibapos-kiosk.ps1`), which is reversible from outside
    // the app — a manifest that forced fullscreen would not be.
    display: "standalone",
    // Deliberately NOT locked. The target is a landscape all-in-one, but
    // pinning the orientation would break the app on any tablet the operator
    // later uses to take orders, and buys nothing on hardware that cannot
    // rotate anyway.
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#f59e0b",
    categories: ["business", "food", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Windows and Android apply their own mask. A pre-rounded icon gets
      // rounded twice and loses its corners, so the maskable variant is full
      // bleed with the mark inside the 80 % safe zone.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
