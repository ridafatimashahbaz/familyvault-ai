import path from "node:path";
import type { NextConfig } from "next";

/**
 * FamilyVault AI — local-first PWA (P1 spike).
 *
 * Deliberately client-only: `output: "export"` emits a fully static site with
 * no server runtime and therefore no API routes. It reuses the root
 * `node_modules` (no separate install) and imports browser-safe shared modules
 * from `../src/lib` through the `@shared/*` alias, so `turbopack.root` is
 * pinned to the repository root to allow files outside `pwa/`.
 */
const repoRoot = path.resolve(process.cwd(), "..");

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: { root: repoRoot },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
