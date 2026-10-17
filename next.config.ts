import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 *
 * `'unsafe-eval'` is only added in development because the HMR client needs
 * it. tesseract.js spins workers up from blob URLs and may fetch language
 * data from a CDN when the local copy is missing, hence `blob:` in
 * worker-src and the two CDN origins in connect-src.
 *
 * `'wasm-unsafe-eval'` is required by the on-device speech model
 * (transformers.js / onnxruntime-web) to instantiate WebAssembly. It does not
 * permit JavaScript `eval`, so it is safe to keep in production.
 */
function contentSecurityPolicy(): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    // Blob URLs back the recorded audio buffer handed to the speech worker.
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "connect-src": [
      "'self'",
      "blob:",
      "data:",
      // OCR language data + worker fallback when not bundled locally.
      "https://cdn.jsdelivr.net",
      "https://unpkg.com",
      "https://tessdata.projectnaptha.com",
      // On-device speech model weights (transformers.js) are fetched once and
      // then cached on the device.
      "https://huggingface.co",
      "https://cdn-lfs.huggingface.co",
      "https://cdn-lfs-us-1.huggingface.co",
      "https://cdn-lfs.hf.co",
    ],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // SAMEORIGIN rather than DENY so the document page can render a PDF in a
  // same-origin iframe. `frame-ancestors 'self'` above is the modern rule and
  // carries the same protection in every browser that supports CSP.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS is only meaningful over HTTPS; enable it once deployed behind TLS.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Pin the workspace root: without this Turbopack walks up and finds a stray
  // lockfile in the user's home directory, which it then refuses to use.
  turbopack: { root: process.cwd() },

  // These read files/binaries from node_modules at runtime and break when
  // bundled by Turbopack.
  serverExternalPackages: ["@prisma/client", "prisma", "tesseract.js", "pdf-parse"],

  // Produces a self-contained .next/standalone tree for the Docker image.
  output: "standalone",

  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
