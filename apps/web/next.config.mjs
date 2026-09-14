/** @type {import('next').NextConfig} */
const backendTarget = process.env.BACKEND_PROXY_URL || process.env.NEXT_PUBLIC_API_URL || "http://34.205.255.37";

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
        destination: `${backendTarget.startsWith("http") ? backendTarget : "http://34.205.255.37"}/:path*`,
      },
    ];
  },
};

export default nextConfig;

