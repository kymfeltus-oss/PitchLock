import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Pin Turbopack to this app so a `package-lock.json` in a parent folder (e.g. user home) is not used as the root. */
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
