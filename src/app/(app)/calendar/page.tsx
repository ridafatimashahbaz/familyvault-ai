import Link from "next/link";
import { CalendarDays, Download, ListChecks } from "lucide-react";

import { getI18n } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";
import { getDocumentsWithExpiry } from "@/lib/services/documents";
import { toDocumentSummary } from "@/lib/serializers";
import { parseMonthKey, toCalendarEvent, type CalendarEvent } from "@/lib/calendar";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ExpiryCalendar } from "@/components/calendar/expiry-calendar";

export const metadata = { title: "Calendar" };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const params = await searchParams;

  const rows = await getDocumentsWithExpiry(user.id);
  const events = rows
    .map((row) => toCalendarEvent(toDocumentSummary(row)))
    .filter((event): event is CalendarEvent => event !== null);

  const now = new Date();
  const requested = parseMonthKey(first(params.month));
  const { year, month } = requested ?? { year: now.getFullYear(), month: now.getMonth() + 1 };

  return (
    <>
      <PageHeader
        title={t.calendar.title}
        description={t.calendar.description}
        icon={CalendarDays}
        actions={
          <>
            <Link href="/reminders" className={buttonClass("secondary", "md")}>
              <ListChecks className="size-4" aria-hidden="true" />
              {t.calendar.viewReminders}
            </Link>
            <a href="/api/calendar/ics" className={buttonClass("primary", "md")} download>
              <Download className="size-4" aria-hidden="true" />
              {t.calendar.exportIcs}
            </a>
          </>
        }
      />

      {events.length === 0 ? (
        <div className="rounded-card border border-ink-200/80 bg-surface shadow-card">
          <EmptyState
            icon={CalendarDays}
            title={t.calendar.emptyTitle}
            description={t.calendar.emptyBody}
          />
        </div>
      ) : (
        <ExpiryCalendar events={events} initialYear={year} initialMonth={month} soonDays={30} />
      )}
    </>
  );
}
