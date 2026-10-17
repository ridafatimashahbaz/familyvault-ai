import Link from "next/link";
import { Bell, CalendarClock, CalendarDays, CircleSlash, Download, TriangleAlert } from "lucide-react";

import { env } from "@/lib/env";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";
import { countUntrackedExpiries, getExpiringDocuments } from "@/lib/services/documents";
import { toDocumentSummary, type DocumentSummary } from "@/lib/serializers";
import { expiryLabel, formatDate } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/stat-card";
import { CategoryTile } from "@/components/documents/badges";

export const metadata = { title: "Reminders" };

const WINDOWS = [30, 60, 90, 180, 365] as const;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

export default async function RemindersPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const user = await requireUser();
  const { locale, t } = await getI18n();
  const params = await searchParams;

  const defaultDays = env().EXPIRY_WARNING_DAYS;
  const requested = Number.parseInt(first(params.days), 10);
  const days = WINDOWS.includes(requested as (typeof WINDOWS)[number]) ? requested : defaultDays;
  const onlyExpired = first(params.expiry) === "expired";

  const [rows, untracked] = await Promise.all([
    getExpiringDocuments(user.id, days),
    countUntrackedExpiries(user.id),
  ]);

  const docs = rows.map(toDocumentSummary);
  const expired = docs.filter((doc) => doc.isExpired);
  const upcoming = docs.filter((doc) => !doc.isExpired);

  return (
    <>
      <PageHeader
        title={t.reminders.title}
        description={format(t.reminders.description, { days })}
        icon={Bell}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {WINDOWS.map((window) => (
              <Link
                key={window}
                href={`/reminders?days=${window}`}
                aria-current={window === days ? "true" : undefined}
                className={
                  window === days
                    ? "inline-flex h-8 items-center rounded-lg bg-brand-700 px-3 text-sm font-medium text-white"
                    : "inline-flex h-8 items-center rounded-lg border border-ink-200 bg-surface px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
                }
              >
                {format(t.reminders.windowDays, { days: window })}
              </Link>
            ))}
            <Link href="/calendar" className={buttonClass("secondary", "sm")}>
              <CalendarDays className="size-4" aria-hidden="true" />
              {t.calendar.title}
            </Link>
            <a href="/api/calendar/ics" className={buttonClass("secondary", "sm")} download>
              <Download className="size-4" aria-hidden="true" />
              {t.calendar.exportIcs}
            </a>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t.common.expired}
          value={expired.length}
          hint={expired.length > 0 ? t.reminders.statExpiredHintRenew : t.reminders.statExpiredHintOk}
          icon={TriangleAlert}
          href={expired.length > 0 ? "/reminders?expiry=expired" : undefined}
          tone={expired.length > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label={format(t.reminders.statUpcoming, { days })}
          value={upcoming.length}
          hint={t.reminders.statUpcomingHint}
          icon={CalendarClock}
          tone={upcoming.length > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label={t.reminders.statUntracked}
          value={untracked}
          hint={t.reminders.statUntrackedHint}
          icon={CircleSlash}
          href="/documents?expiry=none"
        />
      </div>

      {expired.length === 0 && upcoming.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={t.reminders.emptyTitle}
            description={format(t.reminders.emptyBody, { days })}
            action={
              <LinkButton href="/documents" variant="secondary">
                {t.reminders.browseAll}
              </LinkButton>
            }
          />
        </Card>
      ) : null}

      {onlyExpired ? (
        <Alert
          tone="info"
          title={t.reminders.showingExpired}
          action={
            <LinkButton href={`/reminders?days=${days}`} variant="secondary" size="sm">
              {t.reminders.showAll}
            </LinkButton>
          }
        />
      ) : null}

      {expired.length > 0 ? (
        <Card>
          <CardHeader
            title={t.common.expired}
            description={format(t.reminders.expiredCard, { count: expired.length })}
            icon={<TriangleAlert className="size-4.5 text-red-600" aria-hidden="true" />}
          />
          <div className="divide-y divide-ink-100">
            {expired.map((doc) => (
              <ReminderRow key={doc.id} doc={doc} />
            ))}
          </div>
        </Card>
      ) : null}

      {!onlyExpired && upcoming.length > 0 ? (
        <Card>
          <CardHeader
            title={format(t.reminders.expiringWithin, { days })}
            description={format(t.reminders.upcomingCard, { count: upcoming.length })}
            icon={<CalendarClock className="size-4.5" aria-hidden="true" />}
          />
          {groupByMonth(upcoming, locale === "ur" ? "ur" : "en-GB").map(([month, group]) => (
            <div key={month}>
              <h3 className="border-y border-ink-100 bg-ink-50/70 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500 sm:px-5">
                {month}
              </h3>
              <div className="divide-y divide-ink-100">
                {group.map((doc) => (
                  <ReminderRow key={doc.id} doc={doc} />
                ))}
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      {!onlyExpired && untracked > 0 ? (
        <p className="text-center text-xs text-ink-400">
          {format(t.reminders.untrackedNote, { count: untracked })}{" "}
          <Link href="/documents?expiry=none" className="underline decoration-dotted hover:text-ink-600">
            {t.reminders.reviewThem}
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}

function groupByMonth(
  docs: DocumentSummary[],
  locale: string,
): [string, DocumentSummary[]][] {
  const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const groups = new Map<string, DocumentSummary[]>();

  for (const doc of docs) {
    if (!doc.expiryDate) continue;
    const month = formatter.format(new Date(doc.expiryDate));
    const bucket = groups.get(month);
    if (bucket) bucket.push(doc);
    else groups.set(month, [doc]);
  }

  return [...groups.entries()];
}

function ReminderRow({ doc }: { doc: DocumentSummary }) {
  return (
    <Link
      href={`/documents/${doc.id}`}
      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 sm:px-5"
    >
      <CategoryTile category={doc.category} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-accent-strong">
          {doc.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-500">
          <span>{doc.docTypeLabel}</span>
          {doc.familyMember ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{doc.familyMember.name}</span>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>{formatDate(doc.expiryDate)}</span>
        </span>
      </span>

      <span className="shrink-0">
        <Badge tone={doc.isExpired ? "danger" : doc.daysToExpiry !== null && doc.daysToExpiry <= 30 ? "warning" : "neutral"}>
          {expiryLabel(doc.expiryDate)}
        </Badge>
      </span>
    </Link>
  );
}
