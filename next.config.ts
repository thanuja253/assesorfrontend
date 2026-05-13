import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/consultant",
  assetPrefix: "/consultant/",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "staging.greenco.in",
        pathname: "/app-assets/images/logo/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/consultant/login",
        permanent: false,
        basePath: false,
      },
      {
        source: "/facilitator/:path*",
        destination: "/consultant/facilitator/:path*",
        permanent: false,
        basePath: false,
      },
      {
        source: "/assessor/:path*",
        destination: "/consultant/assessor/:path*",
        permanent: false,
        basePath: false,
      },
      {
        source: "/facilitator/page-management/:projectId/tab/quickview",
        destination: "/facilitator/page-management/:projectId/quick-view",
        permanent: false,
      },
      {
        source: "/assessor/page-management/:projectId/tab/quickview",
        destination: "/facilitator/page-management/:projectId/quick-view",
        permanent: false,
      },
      {
        source: "/facilitator/page-management/:projectId/quickview",
        destination: "/facilitator/page-management/:projectId/quick-view",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
