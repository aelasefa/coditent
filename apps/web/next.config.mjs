/** @type {import('next').NextConfig} */
const configuredBackendTarget = process.env.BACKEND_PROXY_URL || process.env.NEXT_PUBLIC_API_URL;
const backendTarget = configuredBackendTarget?.startsWith("http")
  ? configuredBackendTarget
  : "http://api:8001";

const nextConfig = {
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
