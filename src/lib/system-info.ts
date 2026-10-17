import { CATEGORIES, CATEGORY_KEYS, RELATIONS, RELATION_LABELS } from "@/lib/constants";
import { env } from "@/lib/env";
import { docTypeOptions } from "@/lib/serializers";

/**
 * The public, non-technical view of an instance's configuration that the
 * interface is allowed to read: the app's display name, upload/expiry limits
 * and the document taxonomy.
 *
 * Deliberately excludes anything operational — encryption mode, OCR/AI engine
 * state, storage paths, MIME allowlists and secret checks. None of that is
 * needed to render the app, and an end user must never see it.
 */
export type PublicSystemInfo = {
  appName: string;
  limits: {
    maxUploadMb: number;
    expiryWarningDays: number;
  };
  docTypes: ReturnType<typeof docTypeOptions>;
  categories: { key: string; label: string; blurb: string }[];
  relations: { key: string; label: string }[];
};

export function publicSystemInfo(): PublicSystemInfo {
  const e = env();

  return {
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "FamilyVault AI",
    limits: {
      maxUploadMb: e.MAX_UPLOAD_MB,
      expiryWarningDays: e.EXPIRY_WARNING_DAYS,
    },
    docTypes: docTypeOptions(),
    categories: CATEGORY_KEYS.map((key) => ({ key, ...CATEGORIES[key] })),
    relations: RELATIONS.map((key) => ({ key, label: RELATION_LABELS[key] })),
  };
}
