"use client";

import Link from "next/link";
import { CalendarPlus, ExternalLink } from "lucide-react";

import { cn, expiryLabel, formatDate } from "@/lib/utils";
import { googleCalendarUrl, urgencyOf, type CalendarEvent, type CalendarUrgency } from "@/lib/calendar";
import { useLocale } from "@/components/locale-provider";
import { CategoryTile } from "@/components/documents/badges";

/**
 * The list under the grid for the day the user has selected. Each row links to
 * its document and offers a prefilled "add to Google Calendar" link — no OAuth,
 * the user decides what leaves the app.
 */
export function CalendarDayPanel({
  dateKey,
  events,
  soonDays = 30,
}: {
  dateKey: string;
  events: CalendarEvent[];
  soonDays?: number;
}) {
  const { t } = useLocale();

  const legend: Record<CalendarUrgency, string> = {
    expired: t.calendar.legendExpired,
    soon: t.calendar.legendSoon,
    valid: t.calendar.legendValid,
  };

  return (
    <div className="rounded-card border border-ink-200/80 bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-ink-900">{formatDate(dateKey)}</p>
        <span className="text-xs text-ink-500">
          {t.calendar.eventsCount.replace("{count}", String(events.length))}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-500 sm:px-5">{t.calendar.dayEmpty}</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {events.map((event) => {
            const urgency = urgencyOf(event, soonDays);
            return (
              <li key={event.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <CategoryTile category={event.category} />

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/documents/${event.id}`}
                    className="block truncate text-sm font-medium text-ink-900 hover:text-accent-strong"
                  >
                    {event.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-500">
                    <span>{event.docTypeLabel}</span>
                    {event.memberName ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{event.memberName}</span>
                      </>
                    ) : null}
                    <span aria-hidden="true">·</span>
                    <span>{expiryLabel(event.date)}</span>
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={`/documents/${event.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-strong"
                    >
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                      {t.calendar.openDocument}
                    </Link>
                    <a
                      href={googleCalendarUrl(event)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800"
                    >
                      <CalendarPlus className="size-3.5" aria-hidden="true" />
                      {t.calendar.addToGoogle}
                    </a>
                  </div>
                </div>

                <span
                  className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", dotClass(urgency))}
                  title={legend[urgency]}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function dotClass(urgency: CalendarUrgency): string {
  if (urgency === "expired") return "bg-danger";
  if (urgency === "soon") return "bg-warning";
  return "bg-success";
}
