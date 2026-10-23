import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never ship source maps to the browser: they would expose server-only code paths (§2 security rule 2).
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
};

export default nextConfig;
