import type { NextConfig } from "next";

// Cache Components is intentionally disabled: almost every route in this app
// depends on the signed-in user and per-session database state, so the
// default dynamic rendering model is simpler and avoids accidental caching of
// private interview data.
const nextConfig: NextConfig = {
  // PGlite ships a WASM Postgres build that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
