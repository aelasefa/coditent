/** @type {import('next').NextConfig} */
const backendTarget = (process.env.BACKEND_PROXY_URL || "http://127.0.0.1:8001").replace(/\/$/, "");

if (!/^https?:\/\//.test(backendTarget)) {
  throw new Error("BACKEND_PROXY_URL must be an absolute internal HTTP(S) URL");
}

const nextConfig = {
  // Produce a self-contained production server so the runtime image does not
  // have to run a second, memory-heavy `npm ci --omit=dev`.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.licdn.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "api.coditent.app",
        pathname: "/api-proxy/companies/*/logo",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: `${backendTarget}/:path*`,
      },
      {
        source: "/auth/sso/google/callback",
        destination: `${backendTarget}/auth/sso/google/callback`,
      },
      {
        source: "/auth/sso/linkedin/callback",
        destination: `${backendTarget}/auth/sso/linkedin/callback`,
      },
    ];
  },
};

export default nextConfig;
