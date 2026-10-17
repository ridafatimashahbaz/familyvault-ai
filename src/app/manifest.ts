import type { MetadataRoute } from "next";

/**
 * Web app manifest, served at /manifest.webmanifest.
 *
 * PNG icons in three shapes so every platform installs cleanly:
 *   - 192 + 512 "any"      → Chrome / Edge desktop + Android installability
 *   - 512 "maskable"       → Android crops it to the launcher shape safely
 *   - SVG "any"            → crisp on any density that supports it
 * iOS uses apple-touch-icon.png (declared in the root layout).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FamilyVault AI — family document vault",
    short_name: "FamilyVault",
    description:
      "Store, classify and summarise family documents. Read text with OCR, track expiry dates and ask questions about your own vault.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#146157",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Upload a document", url: "/upload" },
      { name: "Reminders", url: "/reminders" },
      { name: "Assistant", url: "/assistant" },
    ],
  };
}
