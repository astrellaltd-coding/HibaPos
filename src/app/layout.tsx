import type { Metadata, Viewport } from "next";
import { Inter, Caveat } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "HibaPOS France — Caisse",
  description: "Système de point de vente pour restaurant — HibaPOS France",
  // C-07 (Batch 1.4). This was an inline SVG data URI drawing the mark with a
  // `<text>` element — which renders in whatever font the machine happens to
  // have, and renders as nothing at all in a context that blocks data: URIs.
  // The same mark is now real files under `public/icons/`, drawn as paths so
  // it needs no font, and shared with the web manifest so the browser tab, the
  // taskbar and the Start Menu all show one icon.
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f59e0b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${caveat.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <SonnerToaster richColors position="top-center" />
        </Providers>
      </body>
    </html>
  );
}
