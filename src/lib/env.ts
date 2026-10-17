import { z } from "zod";

/**
 * Server-only environment access.
 *
 * The app has no AI provider keys: summaries, classification and the assistant
 * all run on the built-in local engines. OCR degrades to a local implementation
 * (or is disabled) rather than failing.
 */

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const numberish = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number.parseInt(v ?? "", 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    });

const schema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),

  AUTH_SECRET: z.string().min(1).default(""),
  AUTH_SESSION_MAX_AGE: z.string().min(1).default("7d"),
  AUTH_TRUST_HTTPS: booleanish,

  DOCUMENT_ENCRYPTION_KEY: z.string().min(1).default(""),
  STORAGE_DIR: z.string().min(1).default("./storage"),

  MAX_UPLOAD_MB: numberish(15),

  OCR_ENGINE: z.enum(["tesseract", "none"]).default("tesseract"),
  OCR_LANGUAGES: z.string().min(1).default("eng"),
  OCR_LANG_PATH: z.string().min(1).default("./storage/ocr-lang"),
  PDF_TEXT_LAYER_MIN_CHARS: numberish(40),

  ASSISTANT_MAX_CONTEXT_DOCS: numberish(6),

  EXPIRY_WARNING_DAYS: numberish(60),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Secrets that must be present outside development. Called at boot so a
 * misconfigured production deploy fails loudly instead of silently storing
 * documents unencrypted or signing sessions with an empty key.
 */
export function assertProductionSecrets(): string[] {
  const e = env();
  if (e.NODE_ENV !== "production") return [];

  const missing: string[] = [];
  if (!e.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!e.DOCUMENT_ENCRYPTION_KEY) missing.push("DOCUMENT_ENCRYPTION_KEY");
  return missing;
}

export const isProduction = () => env().NODE_ENV === "production";
