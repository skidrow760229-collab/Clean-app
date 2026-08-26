/** @type {import('next').NextConfig} */
const nextConfig = {
  // Type errors should fail the build rather than ship silently.
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000",
          },
          // Clean has authenticated, state-changing UI, so block framing.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Report-only first so a strict rule can't break the live site.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "img-src 'self' data: blob: https:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'",
              "font-src 'self' data:",
              "connect-src 'self' https://ai-gateway.vercel.sh",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default nextConfig
