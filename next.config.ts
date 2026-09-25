import type { NextConfig } from "next";

import { securityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL),
      },
    ];
  },
};

export default nextConfig;
