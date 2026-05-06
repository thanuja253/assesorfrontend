import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/consultant",
  assetPrefix: "/consultant/",
  async redirects() {
    return [
      {
        source: "/",
        destination: "/consultant/login",
        permanent: false,
        basePath: false,
      },
    ];
  },
};

export default nextConfig;
