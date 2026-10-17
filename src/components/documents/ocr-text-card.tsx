"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanText, Save, X } from "lucide-react";

import { apiFetch, describeError } from "@/lib/client-api";
import { MAX_TEXT_EDIT_CHARS } from "@/lib/constants";
import type { DocumentDetail } from "@/lib/serializers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";

/**
 * The text that was read out of the document, editable.
 *
 * Search, the summary and the assistant all read from this text, so fixing a
 * wrong name or number here fixes them everywhere. Once a user has corrected
 * it, re-analysing the file keeps their version instead of silently restoring
 * the machine's - and says so when it does.
 */
export function OcrTextCard({ doc }: { doc: DocumentDetail }) {
  const router = useRouter();

  const original = doc.ocrText ?? "";
  const [draft, setDraft] = useState(original);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = draft !== original;
  const tooLong = draft.length > MAX_TEXT_EDIT_CHARS;

  async function save() {
    if (!dirty || tooLong) return;

    setSaving(true);
    setError(null);
    try {
      await apiFetch<DocumentDetail>(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: { text: draft },
      });
      router.refresh();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Text from this document"
        description={
          original
            ? `${original.length.toLocaleString("en-GB")} characters${
                doc.ocrConfidence !== null ? `, read with ${certaintyWords(doc.ocrConfidence)}` : ""
              }${doc.textEdited ? " · corrected by you" : ""}`
            : undefined
        }
        icon={<ScanText className="size-4.5" aria-hidden="true" />}
      />
      <CardBody className="space-y-3">
        {doc.pageCount !== null && doc.pagesRead < doc.pageCount ? (
          <Alert tone="warning">
            This file has {doc.pageCount} pages but only the first {doc.pagesRead} were read, so
            the rest is missing from below - and from search and summaries.
          </Alert>
        ) : null}

        {!original ? (
          <p className="text-sm leading-relaxed text-ink-500">
            {doc.ocrStatus === "skipped"
              ? "This file format is kept as it is and no text was read from it. You can still type the important lines below and search for them."
              : "No text could be read from this file. Type what the document says below and save it, so you can search for it and ask about it."}
          </p>
        ) : null}

        <Textarea
          label={original ? "Text used for search, summaries and the assistant" : "Type the text yourself"}
          value={draft}
          rows={original ? 12 : 6}
          dir="ltr"
          placeholder={
            original ? undefined : "For a photo of handwriting, typing the important lines is the reliable option."
          }
          onChange={(event) => setDraft(event.target.value)}
          error={
            tooLong
              ? `Too long - ${MAX_TEXT_EDIT_CHARS.toLocaleString("en-GB")} characters at most.`
              : null
          }
          className="preserve-lines font-mono text-xs"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            loading={saving}
            disabled={!dirty || tooLong || draft.trim().length === 0}
            onClick={() => void save()}
            icon={saving ? undefined : <Save className="size-4" aria-hidden="true" />}
          >
            {saving ? "Saving…" : "Save text"}
          </Button>

          {dirty ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setDraft(original);
                setError(null);
              }}
              icon={<X className="size-4" aria-hidden="true" />}
            >
              Discard
            </Button>
          ) : (
            <p className="text-xs text-ink-400">
              {doc.textEdited
                ? "This is the version you saved."
                : original
                  ? "Still exactly as it was read."
                  : "Nothing saved yet."}
            </p>
          )}
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}
      </CardBody>
    </Card>
  );
}

function certaintyWords(percent: number): string {
  if (percent >= 90) return "high certainty";
  if (percent >= 70) return "fair certainty";
  if (percent >= 45) return "low certainty";
  return "very low certainty";
}
