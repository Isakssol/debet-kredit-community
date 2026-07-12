import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Kvitton/fakturor laddas upp via server actions — default 1 MB räcker inte
      // för mobilfoton. Matchar MAX_FILE_BYTES (8 MB) i lib/actions/ai.ts + marginal.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
