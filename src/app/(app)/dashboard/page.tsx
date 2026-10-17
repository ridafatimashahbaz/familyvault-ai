import Link from "next/link";
import {
  ArrowRight,
  BotMessageSquare,
  CalendarClock,
  FileText,
  FolderTree,
  HardDrive,
  ScanText,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Upload,
  Users,
} from "lucide-react";

import { env } from "@/lib/env";
import { format, type Dictionary } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { requireUser } from "@/lib/session";
import { getDashboardStats, getExpiringDocuments } from "@/lib/services/documents";
import { listFamilyMembers } from "@/lib/services/family-members";
import { toDocumentSummary, type DocumentSummary } from "@/lib/serializers";
import { expiryLabel, formatBytes, initials } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/stat-card";
import { CategoryIcon } from "@/components/documents/badges";
import { DocumentRow } from "@/components/documents/document-row";
import { ReprocessFailedButton } from "@/components/documents/reprocess-failed-button";

export const metadata = { title: "Dashboard" };

const ASSISTANT_PROMPTS = [
  "Which documents are expiring soon?",
  "What identity documents do we hold?",
  "Summarise our medical records.",
];

export default async function DashboardPage() {
  const user = await requireUser();
  const { t } = await getI18n();

  const [stats, expiring, members] = await Promise.all([
    getDashboardStats(user.id),
    getExpiringDocuments(user.id),
    listFamilyMembers(user.id),
  ]);

  const recent = stats.recent.map(toDocumentSummary);
  const upcoming = expiring.slice(0, 5).map(toDocumentSummary);
  const firstName = user.name.trim().split(/\s+/)[0] || "there";
  const attention = stats.expired + stats.expiringSoon;
  const isEmpty = stats.totalDocuments === 0;

  return (
    <>
      <PageHeader
        title={format(t.dashboard.welcome, { name: firstName })}
        description={isEmpty ? t.dashboard.leadEmpty : t.dashboard.lead}
        icon={Sparkles}
        actions={
          <>
            <LinkButton href="/upload" icon={<Upload className="size-4" aria-hidden="true" />}>
              {t.dashboard.uploadCta}
            </LinkButton>
            <LinkButton
              href="/assistant"
              variant="secondary"
              icon={<BotMessageSquare className="size-4" aria-hidden="true" />}
            >
              {t.dashboard.askCta}
            </LinkButton>
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-card border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-accent-strong">
        <ShieldCheck className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
        <p className="leading-relaxed">{t.dashboard.securityLine}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t.dashboard.statDocuments}
          value={stats.totalDocuments}
          hint={format(t.dashboard.statDocumentsHint, {
            members: stats.members,
            categories: stats.byCategory.length,
          })}
          icon={FileText}
          href="/documents"
          tone="brand"
        />
        <StatCard
          label={t.dashboard.statExpiring}
          value={stats.expiringSoon}
          hint={format(t.dashboard.statExpiringHint, { days: env().EXPIRY_WARNING_DAYS })}
          icon={CalendarClock}
          href="/reminders"
          tone={stats.expiringSoon > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label={t.dashboard.statExpired}
          value={stats.expired}
          hint={stats.expired > 0 ? t.dashboard.statNeedsRenewing : t.dashboard.statNothingOverdue}
          icon={TriangleAlert}
          href="/reminders?expiry=expired"
          tone={stats.expired > 0 ? "danger" : "neutral"}
        />
        <StatCard
          label={t.dashboard.statStorage}
          value={formatBytes(stats.totalSizeBytes, 0)}
          hint={t.dashboard.statStorageHint}
          icon={HardDrive}
        />
      </div>

      {stats.failed > 0 ? (
        <Alert
          tone="danger"
          title={format(t.dashboard.failedTitle, { count: stats.failed })}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <ReprocessFailedButton />
              <LinkButton href="/documents?status=failed" variant="secondary" size="sm">
                {t.dashboard.review}
              </LinkButton>
            </div>
          }
        >
          {t.dashboard.failedBody}
        </Alert>
      ) : null}

      {stats.processing > 0 ? (
        <Alert tone="info" title={format(t.dashboard.processingTitle, { count: stats.processing })}>
          {t.dashboard.processingBody}
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {isEmpty ? (
            <GettingStarted memberCount={members.length} t={t} />
          ) : (
            <Card>
              <CardHeader
                title={t.dashboard.recentTitle}
                description={t.dashboard.recentLead}
                icon={<FolderTree className="size-4.5" aria-hidden="true" />}
                action={
                  <Link
                    href="/documents"
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong"
                  >
                    {t.common.viewAll}
                    <ArrowRight className="size-3.5 flip-rtl" aria-hidden="true" />
                  </Link>
                }
              />
              <div className="divide-y divide-ink-100">
                {recent.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} />
                ))}
              </div>
            </Card>
          )}

          {!isEmpty && stats.byCategory.length > 0 ? (
            <CategoryBreakdown categories={stats.byCategory} total={stats.totalDocuments} t={t} />
          ) : null}
        </div>

        <div className="space-y-5">
          <RemindersPanel
            items={upcoming}
            total={attention}
            warningDays={env().EXPIRY_WARNING_DAYS}
            t={t}
          />
          <FamilyPanel members={members} t={t} />
          <AssistantPanel t={t} />
        </div>
      </div>
    </>
  );
}

/** Shown instead of the recent list when the vault has nothing in it yet. */
function GettingStarted({ memberCount, t }: { memberCount: number; t: Dictionary }) {
  const steps = [
    {
      title: t.dashboard.stepFamily,
      description: t.dashboard.stepFamilyBody,
      href: "/family",
      done: memberCount > 0,
      icon: Users,
    },
    {
      title: t.dashboard.stepUpload,
      description: t.dashboard.stepUploadBody,
      href: "/upload",
      done: false,
      icon: Upload,
    },
    {
      title: t.dashboard.stepReview,
      description: t.dashboard.stepReviewBody,
      href: "/documents",
      done: false,
      icon: ScanText,
    },
  ];

  return (
    <Card>
      <CardHeader
        title={t.dashboard.setupTitle}
        description={t.dashboard.setupLead}
        icon={<Sparkles className="size-4.5" aria-hidden="true" />}
      />
      <ol className="divide-y divide-ink-100">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Link
              href={step.href}
              className="group flex items-start gap-3.5 px-4 py-4 transition-colors hover:bg-ink-50 sm:px-5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-accent ring-1 ring-brand-100">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-900 group-hover:text-accent-strong">
                    {step.title}
                  </span>
                  {step.done ? <Badge tone="success">{t.common.done}</Badge> : null}
                </span>
                <span className="mt-0.5 block text-sm leading-relaxed text-ink-500">
                  {step.description}
                </span>
              </span>
              <step.icon
                className="mt-1 size-4 shrink-0 text-ink-300 group-hover:text-accent"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ol>
      <CardFooter>
        <LinkButton href="/upload" size="sm" icon={<Upload className="size-4" aria-hidden="true" />}>
          {t.dashboard.uploadFirst}
        </LinkButton>
      </CardFooter>
    </Card>
  );
}

function CategoryBreakdown({
  categories,
  total,
  t,
}: {
  categories: { category: string; label: string; count: number }[];
  total: number;
  t: Dictionary;
}) {
  const max = Math.max(...categories.map((c) => c.count), 1);

  return (
    <Card>
      <CardHeader
        title={t.dashboard.byCategory}
        description={t.dashboard.byCategoryLead}
        icon={<FolderTree className="size-4.5" aria-hidden="true" />}
      />
      <CardBody className="space-y-3">
        {categories.map((entry) => (
          <Link
            key={entry.category}
            href={`/documents?category=${entry.category}`}
            className="group block rounded-lg px-1 py-0.5 hover:bg-ink-50"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="text-accent group-hover:text-accent-strong">
                <CategoryIcon category={entry.category} className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{entry.label}</span>
              <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                {entry.count} · {Math.round((entry.count / total) * 100)}%
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-600 transition-all"
                style={{ width: `${(entry.count / max) * 100}%` }}
              />
            </div>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}

function RemindersPanel({
  items,
  total,
  warningDays,
  t,
}: {
  items: DocumentSummary[];
  total: number;
  warningDays: number;
  t: Dictionary;
}) {
  return (
    <Card>
      <CardHeader
        title={t.dashboard.remindersTitle}
        description={
          total === 0
            ? format(t.dashboard.remindersNone, { days: warningDays })
            : format(t.dashboard.remindersSome, { count: total })
        }
        icon={<CalendarClock className="size-4.5" aria-hidden="true" />}
        action={
          total > 0 ? (
            <Link
              href="/reminders"
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong"
            >
              {t.common.all}
              <ArrowRight className="size-3.5 flip-rtl" aria-hidden="true" />
            </Link>
          ) : null
        }
      />
      {items.length === 0 ? (
        <CardBody>
          <p className="text-sm leading-relaxed text-ink-500">
            {format(t.dashboard.remindersEmpty, { days: warningDays })}
          </p>
        </CardBody>
      ) : (
        <div className="divide-y divide-ink-100">
          {items.map((doc) => (
            <Link
              key={doc.id}
              href={`/documents/${doc.id}`}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 sm:px-5"
            >
              <span
                className={
                  doc.expiry === "expired"
                    ? "flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600"
                    : "flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"
                }
              >
                <CalendarClock className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-accent-strong">
                  {doc.title}
                </span>
                <span className="block truncate text-xs text-ink-500">
                  {doc.familyMember ? `${doc.familyMember.name} · ` : ""}
                  {expiryLabel(doc.expiryDate)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function FamilyPanel({
  members,
  t,
}: {
  members: { id: string; name: string; relation: string; documentCount: number }[];
  t: Dictionary;
}) {
  const shown = members.slice(0, 6);

  return (
    <Card>
      <CardHeader
        title={t.dashboard.familyTitle}
        description={
          members.length === 0
            ? t.dashboard.familyNone
            : format(t.dashboard.familySome, { count: members.length })
        }
        icon={<Users className="size-4.5" aria-hidden="true" />}
        action={
          <Link
            href="/family"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong"
          >
            {t.common.manage}
            <ArrowRight className="size-3.5 flip-rtl" aria-hidden="true" />
          </Link>
        }
      />
      {shown.length === 0 ? (
        <CardBody>
          <p className="text-sm leading-relaxed text-ink-500">{t.dashboard.familyEmpty}</p>
          <LinkButton href="/family" variant="secondary" size="sm" className="mt-3">
            {t.dashboard.addSomeone}
          </LinkButton>
        </CardBody>
      ) : (
        <ul className="divide-y divide-ink-100">
          {shown.map((member) => (
            <li key={member.id}>
              <Link
                href={`/documents?member=${member.id}`}
                className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-ink-50 sm:px-5"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-700">
                  {initials(member.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900 group-hover:text-accent-strong">
                    {member.name}
                  </span>
                  <span className="block truncate text-xs text-ink-500 capitalize">
                    {member.relation}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-500 tabular-nums">
                  {member.documentCount} {member.documentCount === 1 ? "doc" : "docs"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AssistantPanel({ t }: { t: Dictionary }) {
  return (
    <Card>
      <CardHeader
        title={t.dashboard.assistantTitle}
        description={t.dashboard.assistantLead}
        icon={<BotMessageSquare className="size-4.5" aria-hidden="true" />}
      />
      <CardBody className="space-y-2">
        {ASSISTANT_PROMPTS.map((prompt) => (
          <Link
            key={prompt}
            href={`/assistant?q=${encodeURIComponent(prompt)}`}
            className="flex items-center gap-2 rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-accent-strong"
          >
            <span className="min-w-0 flex-1 truncate">{prompt}</span>
            <ArrowRight className="size-3.5 shrink-0 text-ink-400 flip-rtl" aria-hidden="true" />
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}
