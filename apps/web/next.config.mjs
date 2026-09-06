/** @type {import('next').NextConfig} */
const backendTarget = process.env.BACKEND_PROXY_URL || process.env.NEXT_PUBLIC_API_URL || "http://34.205.255.37";

const nextConfig = {
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

