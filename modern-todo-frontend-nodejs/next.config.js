/** @type {import('next').NextConfig} */

// content security policy

// allowed domains

const allowedDomains = ["http://localhost:3000", "http://localhost:4000"];

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
    value: `default-src 'self'; script-src 'self' ${allowedDomains.join(" ")} 'unsafe-inline' 'unsafe-eval'; style-src 'self' ${allowedDomains.join(
      " "
    )} 'unsafe-inline'; img-src 'self' ${allowedDomains.join(" ")} data: blob:; font-src 'self' ${allowedDomains.join(" ")} data:; connect-src 'self' ${allowedDomains.join(
      " "
    )}; frame-src 'self' ${allowedDomains.join(" ")};`,
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
