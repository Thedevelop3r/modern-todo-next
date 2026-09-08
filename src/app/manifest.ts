import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest. `display: standalone` plus the two PNG
 * icons (see scripts/generate-icons.mjs) are what make the app installable;
 * `start_url` points at the dashboard because an installed copy is opened by
 * someone who is already signed in.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Modern Todo",
    short_name: "Todo",
    description: "Personal todos with due dates, priorities, projects and insights.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Today", url: "/dashboard/today" },
      { name: "New todo", url: "/dashboard/create-todo" },
    ],
  };
}
