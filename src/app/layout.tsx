import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/providers";
import { ServiceWorkerRegistration } from "@/components/layout/ServiceWorkerRegistration";
import "./globals.css";
// The 50 generated palettes. globals.css keeps :root/.dark as the fallback.
import "./themes.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Modern Todo",
    template: "%s · Modern Todo",
  },
  description: "Manage your personal todos with ease - due dates, priorities, tags, boards and insights.",
  manifest: "/manifest.webmanifest",
  applicationName: "Modern Todo",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  // An installed copy gets the app's own chrome, not the browser's.
  appleWebApp: { capable: true, title: "Modern Todo", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#090c14" },
  ],
};

/**
 * Runs before first paint, so it has to be small, dependency-free and silent on
 * failure - a browser with storage blocked simply gets the default appearance.
 */
const RESTORE_APPEARANCE = `try{
  var d=document.documentElement;
  var t=localStorage.getItem("modern-todo:themeId");
  if(t)d.dataset.theme=t;
  var f=localStorage.getItem("modern-todo:fontFamily");
  if(f){
    d.style.setProperty("--font-sans",'"'+f+'"');
    var l=document.createElement("link");
    l.id="google-font";l.rel="stylesheet";
    l.href="/api/fonts/css?family="+encodeURIComponent(f);
    document.head.appendChild(l);
  }
}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-fg">
        {/*
          Restores the saved theme and font before anything paints, so a reload
          never flashes the default palette first. next-themes does the same for
          light/dark; this is its counterpart for `data-theme` and --font-sans.
          The account remains the source of truth - ThemeEffect/FontEffect
          overwrite both once /me resolves.
        */}
        <script dangerouslySetInnerHTML={{ __html: RESTORE_APPEARANCE }} />

        {/* First tab stop on every page: jump past the chrome to the content. */}
        <a
          href="#main"
          className="sr-only left-4 top-4 z-[100] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow-lg focus:not-sr-only focus:absolute"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
