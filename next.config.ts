import type { NextConfig } from "next";
import { SERVER_ACTION_BODY_SIZE_LIMIT } from "./lib/upload-config";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["192.168.8.220"],
  experimental: {
    serverActions: { bodySizeLimit: SERVER_ACTION_BODY_SIZE_LIMIT },
  },
  async headers() {
    return [{
      source: "/portal/:path*",
      headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }],
    }];
  },
};

export default nextConfig;
