import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The separate static PWA app's build output (source is still linted):
    "pwa/.next/**",
    "pwa/out/**",
    // Third-party OCR engine binaries copied in by
    // scripts/prepare-recognition-runtime.mjs — minified vendor code, not ours:
    "pwa/public/reading-runtime/**",
    "pwa/public/models/**",
  ]),
]);

export default eslintConfig;
