import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/assessor/login",
        destination: "/login/assessor",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
