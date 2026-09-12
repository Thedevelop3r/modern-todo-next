/** @type {import('next').NextConfig} */

// The API is served from the same origin as the pages (see server.js), so the
// policy below no longer needs to allow a separate backend host.

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "origin-when-cross-origin",
  },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; " +
      "font-src 'self' data:; " +
      "connect-src 'self'; " +
      // Stored video and audio are streamed from /api/files on this origin.
      // default-src would already allow it; saying so keeps that true if
      // default-src is ever tightened.
      "media-src 'self' blob:; " +
      // A stored PDF is previewed in an iframe, never an <object>/<embed> -
      // plugin content gets no foothold at all.
      "object-src 'none'; " +
      "frame-src 'self' blob:; " +
      "worker-src 'self' blob:;",
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
