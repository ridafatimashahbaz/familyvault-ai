import { ExternalLink, ImageOff } from "lucide-react";

import { LinkButton } from "@/components/ui/button";

/**
 * Inline preview of the stored original.
 *
 * The source is the authenticated file endpoint, which decrypts per request and
 * sends `no-store`, so a plain <img> is used rather than next/image: the optimiser
 * would cache private bytes on disk and cannot proxy an authenticated route
 * without a custom loader.
 */
export function DocumentPreview({
  id,
  mimeType,
  title,
  hasPreview,
}: {
  id: string;
  mimeType: string;
  title: string;
  hasPreview: boolean;
}) {
  const src = `/api/documents/${id}/file`;

  if (!hasPreview) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-surface text-ink-400 ring-1 ring-ink-200">
          <ImageOff className="size-6" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink-800">Browsers cannot display this format</p>
          <p className="mt-1 text-sm text-ink-500">
            {mimeType} is stored safely but has no built-in browser viewer. Download it to open it
            in another app.
          </p>
        </div>
        <LinkButton
          href={`${src}?download=1`}
          variant="secondary"
          size="sm"
          icon={<ExternalLink className="size-4" aria-hidden="true" />}
        >
          Download the file
        </LinkButton>
      </div>
    );
  }

  if (mimeType === "application/pdf") {
    return (
      <div className="space-y-2">
        <iframe
          src={src}
          title={`Preview of ${title}`}
          loading="lazy"
          className="h-[36rem] w-full rounded-lg border border-ink-200 bg-ink-100"
        />
        <p className="text-xs text-ink-400">
          Not showing?{" "}
          <a href={src} target="_blank" rel="noreferrer" className="underline hover:text-ink-600">
            Open the PDF in a new tab
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Scanned preview of ${title}`}
        loading="lazy"
        className="max-h-[36rem] w-full rounded-lg border border-ink-200 bg-ink-100 object-contain"
      />
      <p className="text-xs text-ink-400">
        <a href={src} target="_blank" rel="noreferrer" className="underline hover:text-ink-600">
          Open the full-size image in a new tab
        </a>
        .
      </p>
    </div>
  );
}
