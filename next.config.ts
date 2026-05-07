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
