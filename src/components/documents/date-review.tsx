"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, EyeOff, ShieldAlert } from "lucide-react";

import { apiFetch, describeError } from "@/lib/client-api";
import type { DateReviewItem, DocumentDetail } from "@/lib/serializers";
import { formatDate } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";

/**
 * Dates the reader found, with the evidence for each one, so the user can
 * confirm, correct or reject them.
 *
 * Nothing here is applied silently: a date only becomes the document's expiry
 * when the user says so, and once they have, re-analysing the file keeps their
 * answer instead of going back to the machine's guess.
 */
export function DateReviewCard({ doc }: { doc: DocumentDetail }) {
  if (doc.dates.length === 0) return null;

  const needsReview = doc.dates.filter((date) => date.reviewRequired);
  const settled = doc.dates.filter((date) => !date.reviewRequired);

  return (
    <Card>
      <CardHeader
        title="Dates found in this document"
        description={
          needsReview.length > 0
            ? `${needsReview.length} ${needsReview.length === 1 ? "date needs" : "dates need"} your check before they are used for reminders`
            : "You have checked these dates"
        }
        icon={<CalendarClock className="size-4.5" aria-hidden="true" />}
      />
      <CardBody className="space-y-3">
        {needsReview.map((date) => (
          <DateRow key={date.key} docId={doc.id} date={date} />
        ))}
        {settled.length > 0 ? (
          <div className="space-y-3 border-t border-ink-100 pt-3">
            {settled.map((date) => (
              <DateRow key={date.key} docId={doc.id} date={date} />
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function confidenceWords(confidence: number): string {
  if (confidence >= 0.9) return "The reader was sure about this.";
  if (confidence >= 0.7) return "The reader was fairly sure.";
  if (confidence >= 0.5) return "The reader had trouble with this.";
  return "The reader could hardly make this out.";
}

function DateRow({ docId, date }: { docId: string; date: DateReviewItem }) {
  const router = useRouter();
  const [draft, setDraft] = useState(date.effective);
  const [busy, setBusy] = useState<"confirmed" | "ignored" | "expiry" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changed = draft !== date.detected;
  const ignored = date.decision?.action === "ignored";

  async function decide(action: "confirmed" | "ignored" | "expiry") {
    setBusy(action);
    setError(null);

    try {
      await apiFetch<DocumentDetail>(`/api/documents/${docId}`, {
        method: "PATCH",
        body: {
          dateReview: {
            key: date.key,
            action,
            ...(action !== "ignored" && changed ? { iso: draft } : {}),
          },
        },
      });

      router.refresh();
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-ink-900">{date.label}</span>
        <span className="text-xs text-ink-500">page {date.page}</span>
        {date.decision ? (
          <Badge tone={ignored ? "neutral" : "success"}>
            {ignored ? "Marked as not this" : date.decision.action === "expiry" ? "Used as expiry" : "Confirmed by you"}
          </Badge>
        ) : date.reviewRequired ? (
          <Badge tone="warning" icon={<ShieldAlert className="size-3" aria-hidden="true" />}>
            Needs your check
          </Badge>
        ) : null}
      </div>

      <p className="mt-1 text-sm text-ink-800">
        {ignored ? (
          "You said this is not the date it looks like."
        ) : (
          <>
            <span className="font-medium">{formatDate(newSafeDate(date.effective))}</span>
            <span className="text-ink-500">
              {" "}
              — printed as “{date.raw}”
              {date.precision === "month" ? ", with no day given" : ""}
            </span>
          </>
        )}
      </p>

      {!ignored && date.evidence ? (
        <p className="mt-1 text-xs leading-relaxed text-ink-500">Found next to: “{date.evidence}”</p>
      ) : null}

      {date.reviewRequired && date.reasons.length > 0 ? (
        <ul className="mt-1.5 list-disc space-y-0.5 ps-4 text-xs leading-relaxed text-amber-800">
          {date.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {!ignored ? (
        <>
          <div className="mt-2.5 flex flex-wrap items-end gap-2">
            <Input
              type="date"
              label={date.label}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="w-40 bg-surface"
              hint={confidenceWords(date.confidence)}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={date.reviewRequired ? "primary" : "secondary"}
              loading={busy === "confirmed"}
              disabled={busy !== null}
              onClick={() => void decide("confirmed")}
              icon={busy === "confirmed" ? undefined : <Check className="size-4" aria-hidden="true" />}
            >
              {date.role === "expiry" ? "Yes, this is the expiry" : "Yes, that is right"}
            </Button>

            {date.role !== "expiry" ? (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === "expiry"}
                disabled={busy !== null}
                onClick={() => void decide("expiry")}
              >
                Use as the expiry date
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="ghost"
              loading={busy === "ignored"}
              disabled={busy !== null}
              onClick={() => void decide("ignored")}
              icon={busy === "ignored" ? undefined : <EyeOff className="size-4" aria-hidden="true" />}
            >
              This is not it
            </Button>

            {changed ? (
              <p className="text-xs text-ink-500">Saving will use the date you typed above.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-2">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}

/** `effective` is always `YYYY-MM-DD`; a bad value falls back to today rather than rendering "Invalid date". */
function newSafeDate(iso: string): Date {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
