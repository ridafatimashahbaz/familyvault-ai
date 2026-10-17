import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BotMessageSquare,
  CalendarClock,
  FileText,
  Lock,
  Sparkles,
  Tags,
  TriangleAlert,
} from "lucide-react";

import { ApiRequestError } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDocumentForUser } from "@/lib/services/documents";
import { listFamilyMembers } from "@/lib/services/family-members";
import { docTypeOptions, toDocumentDetail, type DocumentDetail } from "@/lib/serializers";
import { formatBytes, formatDate, formatDateTime } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  CategoryTile,
  ConfidenceBadge,
  ExpiryBadge,
  StatusBadge,
} from "@/components/documents/badges";
import { DateReviewCard } from "@/components/documents/date-review";
import { DocumentActions } from "@/components/documents/document-actions";
import { DocumentEditForm } from "@/components/documents/document-edit-form";
import { DocumentPreview } from "@/components/documents/document-preview";
import { OcrTextCard } from "@/components/documents/ocr-text-card";
import { UnderstandButton } from "@/components/assistant/understand-button";

export const metadata = { title: "Document" };

type Context = { params: Promise<{ id: string }> };

export default async function DocumentPage({ params }: Context) {
  const user = await requireUser();
  const { id } = await params;

  let doc: DocumentDetail;
  try {
    doc = toDocumentDetail(await getDocumentForUser(id, user.id));
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    throw error;
  }

  const members = await listFamilyMembers(user.id);

  return (
    <>
      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-accent"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All documents
      </Link>

      <PageHeader
        title={doc.title}
        description={
          <>
            {doc.originalName} · {formatBytes(doc.sizeBytes)} · added{" "}
            {formatDateTime(doc.createdAt)}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <UnderstandButton id={doc.id} title={doc.title} />
            <DocumentActions id={doc.id} title={doc.title} />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2">
          <CategoryTile category={doc.category} className="size-8 rounded-lg" />
          <span className="text-sm font-medium text-ink-800">{doc.categoryLabel}</span>
        </span>
        <Badge tone="neutral">{doc.docTypeLabel}</Badge>
        <ConfidenceBadge confidence={doc.classificationConfidence} source={doc.classificationSource} />
        <StatusBadge status={doc.status} />
        <ExpiryBadge expiry={doc.expiry} daysToExpiry={doc.daysToExpiry} />
        {doc.encrypted ? (
          <Badge tone="success" icon={<Lock className="size-3" aria-hidden="true" />}>
            Encrypted
          </Badge>
        ) : (
          <Badge tone="danger" icon={<TriangleAlert className="size-3" aria-hidden="true" />}>
            Not encrypted
          </Badge>
        )}
      </div>

      {doc.errorMessage ? (
        <Alert tone="danger" title="Analysis did not complete">
          {doc.errorMessage}. The file itself is stored safely — use{" "}
          <span className="font-medium">Re-analyse</span> to try again.
        </Alert>
      ) : null}

      {doc.status === "processing" ? (
        <Alert tone="info" title="Still being analysed">
          OCR and classification are running. Reload this page in a moment to see the result.
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Original file"
              description={doc.mimeType}
              icon={<FileText className="size-4.5" aria-hidden="true" />}
            />
            <CardBody>
              <DocumentPreview
                id={doc.id}
                mimeType={doc.mimeType}
                title={doc.title}
                hasPreview={doc.hasPreview}
              />
            </CardBody>
          </Card>

          <SummaryCard doc={doc} />
          <UnderstandingCard doc={doc} />
          <FieldsCard doc={doc} />
          <DateReviewCard doc={doc} />
          <OcrTextCard doc={doc} />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Details"
              description="Correct anything the reader got wrong"
              icon={<Sparkles className="size-4.5" aria-hidden="true" />}
            />
            <CardBody>
              <DocumentEditForm
                key={doc.updatedAt}
                doc={doc}
                members={members}
                docTypes={docTypeOptions()}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="File information" />
            <CardBody>
              <dl className="space-y-2.5 text-sm">
                <MetaRow label="Family member" value={doc.familyMember?.name ?? "Not filed"} />
                <MetaRow label="Format" value={doc.mimeType} />
                <MetaRow label="Size" value={formatBytes(doc.sizeBytes)} />
                <MetaRow label="Uploaded" value={formatDateTime(doc.createdAt)} />
                <MetaRow
                  label="Analysed"
                  value={doc.processedAt ? formatDateTime(doc.processedAt) : "Not yet"}
                />
                <MetaRow
                  label="Text engine"
                  value={
                    doc.ocrEngine
                      ? `${doc.ocrEngine}${
                          doc.ocrConfidence !== null
                            ? ` · ${Math.round(doc.ocrConfidence)}% confidence`
                            : ""
                        }`
                      : doc.ocrStatus === "skipped"
                        ? "Not applicable"
                        : "Not run"
                  }
                />
                <MetaRow label="Expiry source" value={expirySourceLabel(doc)} />
                <MetaRow
                  label="Tags"
                  value={doc.tags.length > 0 ? doc.tags.join(", ") : "None"}
                />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Ask about this document"
              icon={<BotMessageSquare className="size-4.5" aria-hidden="true" />}
            />
            <CardBody className="space-y-3">
              <p className="text-sm leading-relaxed text-ink-500">
                The assistant answers from your own vault and can quote the text it read here.
              </p>
              <LinkButton
                href={`/assistant?doc=${doc.id}&q=${encodeURIComponent(`What does "${doc.title}" say?`)}`}
                variant="secondary"
                size="sm"
                icon={<BotMessageSquare className="size-4" aria-hidden="true" />}
              >
                Open the assistant
              </LinkButton>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="min-w-0 truncate text-right text-ink-800" title={value}>
        {value}
      </dd>
    </div>
  );
}

function expirySourceLabel(doc: DocumentDetail): string {
  if (doc.noExpiry) return "Marked as never expiring";
  if (!doc.expiryDate) return "No date found";
  if (doc.expirySource === "manual" || doc.expirySource === "confirmed by you") {
    return "Set by you";
  }
  // Machine sources quote the printed heading they matched, e.g. `label "Coverage until"`.
  const heading = doc.expirySource?.match(/"([^"]+)"/)?.[1];
  if (heading) return `Read from “${heading}”`;
  return "Read from the document";
}

function SummaryCard({ doc }: { doc: DocumentDetail }) {
  return (
    <Card className="border-brand-200 bg-brand-50/40 ring-1 ring-brand-100">
      <CardHeader
        title="Document Summary"
        description="Written by the built-in local engine — read this separately from the raw details below"
        icon={<Sparkles className="size-4.5" aria-hidden="true" />}
        className="border-b border-brand-100"
      />
      <CardBody className="space-y-3">
        {doc.summary ? (
          <p className="text-[15px] leading-relaxed text-ink-900">{doc.summary}</p>
        ) : (
          <p className="text-sm text-ink-500">
            No summary yet. This usually means too little text could be read from the file — try
            re-analysing a sharper scan.
          </p>
        )}

        {doc.notes ? (
          <div className="rounded-lg border border-ink-200 bg-surface px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Your notes</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">{doc.notes}</p>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/**
 * Collapsible background on how the app reads a document. Kept inside a closed
 * `<details>` so it never reads as part of the generated summary above it.
 */
function UnderstandingCard({ doc }: { doc: DocumentDetail }) {
  return (
    <details className="rounded-card border border-ink-200/80 bg-surface shadow-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
        <Sparkles className="size-4.5 shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900">
            How FamilyVault understands your documents
          </span>
          <span className="mt-0.5 block text-sm leading-relaxed text-ink-500">
            What the on-device reader looks at — background, not part of the summary
          </span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-ink-100 px-4 py-4 sm:px-5">
        <p className="text-sm leading-relaxed text-ink-700">
          The text is read on this device, then matched against patterns for document types, dates
          and key fields. Nothing is sent to a cloud service.
        </p>
        {doc.evidence.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
              Matched from this document
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {doc.evidence.map((term) => (
                <Badge key={term} tone="neutral">
                  {term}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        {doc.ocrEngine ? (
          <p className="text-xs text-ink-500">
            Text engine: {doc.ocrEngine}
            {doc.ocrConfidence !== null ? ` · ${Math.round(doc.ocrConfidence)}% confidence` : ""}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function FieldsCard({ doc }: { doc: DocumentDetail }) {
  return (
    <Card>
      <CardHeader
        title="Extracted information"
        description={
          doc.fields.length > 0
            ? `${doc.fields.length} ${doc.fields.length === 1 ? "field" : "fields"} read from the document`
            : "Nothing could be read automatically"
        }
        icon={<Tags className="size-4.5" aria-hidden="true" />}
      />
      {doc.fields.length === 0 ? (
        <CardBody>
          <p className="text-sm leading-relaxed text-ink-500">
            No fields were recognised. The full text below is still searchable, and you can add
            context in your notes.
          </p>
        </CardBody>
      ) : (
        <CardBody className="space-y-4">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {doc.fields.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
                <dd className="mt-0.5 break-words text-sm text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>

          <ExpiryLine doc={doc} />
        </CardBody>
      )}
    </Card>
  );
}

function ExpiryLine({ doc }: { doc: DocumentDetail }) {
  if (doc.noExpiry && !doc.expiryDate) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
      <CalendarClock className="size-4 shrink-0 text-ink-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">
          {doc.noExpiry
            ? "This document does not expire"
            : doc.expiryDate
              ? `Expires ${formatDate(doc.expiryDate)}`
              : "No expiry date found"}
        </p>
        {doc.issueDate ? (
          <p className="text-xs text-ink-500">Issued {formatDate(doc.issueDate)}</p>
        ) : null}
      </div>
      <ExpiryBadge expiry={doc.expiry} daysToExpiry={doc.daysToExpiry} />
    </div>
  );
}
