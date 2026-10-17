"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarClock,
  Download,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import { CATEGORIES, type CategoryKey } from "@/lib/constants";
import {
  DEMO_DOCUMENTS,
  DEMO_MEMBERS,
  answerDemoQuestion,
  demoStats,
  type DemoMember,
} from "@/lib/demo-data";
import { EXPIRY_STATE_LABEL, cn, expiryLabel, formatBytes, formatDate, timeAgo } from "@/lib/utils";
import type { DocumentSummary } from "@/lib/serializers";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";
import { CategoryTile, ExpiryBadge } from "@/components/documents/badges";
import { useSignupPrompt } from "./signup-gate";

type TabKey = "dashboard" | "documents" | "reminders" | "assistant" | "family";

const TABS: { key: TabKey; label: string; icon: typeof Bell }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "documents", label: "Documents", icon: FolderOpen },
  { key: "reminders", label: "Reminders", icon: Bell },
  { key: "assistant", label: "Assistant", icon: MessageCircle },
  { key: "family", label: "Family", icon: Users },
];

export function GuestVault() {
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <div className="space-y-5">
      <nav
        aria-label="Demo sections"
        className="flex gap-1 overflow-x-auto rounded-card border border-ink-200/80 bg-surface p-1 shadow-card"
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === key
                ? "bg-brand-50 text-accent ring-1 ring-inset ring-brand-100"
                : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" ? <DashboardTab onSeeDocuments={() => setTab("documents")} /> : null}
      {tab === "documents" ? <DocumentsTab /> : null}
      {tab === "reminders" ? <RemindersTab /> : null}
      {tab === "assistant" ? <AssistantTab /> : null}
      {tab === "family" ? <FamilyTab /> : null}
    </div>
  );
}

// --- Dashboard -------------------------------------------------------------

function DashboardTab({ onSeeDocuments }: { onSeeDocuments: () => void }) {
  const prompt = useSignupPrompt();
  const stats = demoStats();
  const recent = [...DEMO_DOCUMENTS]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 4);
  const reminders = DEMO_DOCUMENTS.filter((d) => d.expiryDate).sort(
    (a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0),
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Documents"
          value={stats.total}
          hint={`${DEMO_MEMBERS.length} family profiles · ${stats.categories} categories`}
          icon={FolderOpen}
          tone="brand"
        />
        <StatCard
          label="Expiring soon"
          value={stats.expiringSoon}
          hint="Within the next 60 days"
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="Expired"
          value={stats.expired}
          hint={stats.expired > 0 ? "Needs attention" : "Nothing overdue"}
          icon={Bell}
          tone="danger"
        />
        <StatCard
          label="Storage used"
          value={formatBytes(stats.sizeBytes)}
          hint="Across every document in the vault"
          icon={HardDrive}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Recent documents"
            description="Newest additions to the sample vault"
            icon={<FolderOpen className="size-4.5" aria-hidden="true" />}
            action={
              <button
                type="button"
                onClick={onSeeDocuments}
                className="text-sm font-medium text-accent hover:text-accent-strong"
              >
                See all
              </button>
            }
          />
          <CardBody className="space-y-1 p-2 sm:p-3">
            {recent.map((doc) => (
              <DemoRow key={doc.id} doc={doc} />
            ))}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Expiry reminders"
              icon={<Bell className="size-4.5" aria-hidden="true" />}
            />
            <CardBody className="space-y-2.5">
              {reminders.slice(0, 4).map((doc) => (
                <div key={doc.id} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-900">
                      {doc.title}
                    </span>
                    <span className="block text-xs text-ink-500">{expiryLabel(doc.expiryDate)}</span>
                  </span>
                  <ExpiryBadge expiry={doc.expiry} daysToExpiry={doc.daysToExpiry} showDays={false} />
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Ask the assistant"
              description="Answers come from the sample documents"
              icon={<MessageCircle className="size-4.5" aria-hidden="true" />}
            />
            <CardBody className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  prompt(
                    "The assistant answers from your own documents once you have an account. Create one to ask questions about your real vault.",
                  )
                }
                className={buttonClass("subtle", "sm", "w-full justify-start")}
              >
                Which documents are expiring soon?
              </button>
              <button
                type="button"
                onClick={() =>
                  prompt(
                    "The assistant answers from your own documents once you have an account. Create one to ask questions about your real vault.",
                  )
                }
                className={buttonClass("subtle", "sm", "w-full justify-start")}
              >
                What identity documents do we hold?
              </button>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

// --- Documents -------------------------------------------------------------

function DocumentsTab() {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return DEMO_DOCUMENTS.filter((doc) => {
      if (category !== "all" && doc.category !== category) return false;
      if (!q) return true;
      return `${doc.title} ${doc.docTypeLabel} ${doc.categoryLabel} ${doc.summary ?? ""} ${
        doc.familyMember?.name ?? ""
      }`
        .toLowerCase()
        .includes(q);
    });
  }, [term, category]);

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search titles, people and summaries…"
              aria-label="Search the sample vault"
              className="h-10 w-full rounded-lg border border-ink-200 bg-ink-50/60 pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-surface focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
              All categories
            </FilterChip>
            {(Object.keys(CATEGORIES) as CategoryKey[])
              .filter((key) => DEMO_DOCUMENTS.some((d) => d.category === key))
              .map((key) => (
                <FilterChip key={key} active={category === key} onClick={() => setCategory(key)}>
                  {CATEGORIES[key].label}
                </FilterChip>
              ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`${filtered.length} of ${DEMO_DOCUMENTS.length} documents`}
          description="Click a document to see what was extracted"
          icon={<FolderOpen className="size-4.5" aria-hidden="true" />}
        />
        <CardBody className="space-y-2">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">
              No documents in the sample match that search.
            </p>
          ) : (
            filtered.map((doc) => (
              <DemoRow
                key={doc.id}
                doc={doc}
                expanded={openId === doc.id}
                onClick={() => setOpenId(openId === doc.id ? null : doc.id)}
              />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-brand-300 bg-brand-50 text-accent"
          : "border-ink-200 bg-surface text-ink-600 hover:border-ink-300 hover:text-ink-900",
      )}
    >
      {children}
    </button>
  );
}

/** A document row that can expand to show the extracted detail. */
function DemoRow({
  doc,
  expanded,
  onClick,
}: {
  doc: DocumentSummary;
  expanded?: boolean;
  onClick?: () => void;
}) {
  const prompt = useSignupPrompt();
  const clickable = Boolean(onClick);

  return (
    <div className="rounded-lg border border-ink-100">
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={(e) => {
          if (clickable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5",
          clickable && "cursor-pointer rounded-lg hover:bg-ink-50",
        )}
      >
        <CategoryTile category={doc.category} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-900">{doc.title}</span>
          <span className="block truncate text-xs text-ink-500">
            {doc.docTypeLabel}
            {doc.familyMember ? ` · ${doc.familyMember.name}` : ""} · {formatBytes(doc.sizeBytes)} ·{" "}
            {timeAgo(doc.createdAt)}
          </span>
        </span>
        {doc.expiry !== "none" ? (
          <span className="hidden sm:block">
            <ExpiryBadge expiry={doc.expiry} daysToExpiry={doc.daysToExpiry} />
          </span>
        ) : (
          <span className="hidden sm:block">
            <Badge tone="neutral">{EXPIRY_STATE_LABEL.none}</Badge>
          </span>
        )}
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-ink-100 bg-ink-50/50 px-3 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Summary</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">{doc.summary}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Detail label="Category" value={doc.categoryLabel} />
            <Detail label="Document type" value={doc.docTypeLabel} />
            <Detail
              label="Filed under"
              value={doc.familyMember ? doc.familyMember.name : "Not filed"}
            />
            <Detail
              label="Confidence"
              value={`${Math.round(doc.classificationConfidence * 100)}%`}
            />
            <Detail label="Issued" value={formatDate(doc.issueDate)} />
            <Detail
              label="Expires"
              value={doc.noExpiry ? "No expiry — permanent record" : formatDate(doc.expiryDate)}
            />
          </dl>

          {doc.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {doc.tags.map((t) => (
                <Badge key={t} tone="neutral">
                  #{t}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() =>
                prompt("Downloading and editing documents needs an account. Create one to get started.")
              }
              className={buttonClass("secondary", "sm")}
            >
              <Download className="size-4" aria-hidden="true" />
              Download
            </button>
            <button
              type="button"
              onClick={() =>
                prompt("Editing and re-analysing documents needs an account. Create one to get started.")
              }
              className={buttonClass("secondary", "sm")}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit details
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 truncate text-ink-800">{value}</dd>
    </div>
  );
}

// --- Reminders -------------------------------------------------------------

function RemindersTab() {
  const prompt = useSignupPrompt();
  const dated = DEMO_DOCUMENTS.filter((d) => d.expiryDate).sort(
    (a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0),
  );
  const expired = dated.filter((d) => (d.daysToExpiry ?? 0) < 0);
  const upcoming = dated.filter((d) => (d.daysToExpiry ?? 0) >= 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Expired" value={expired.length} icon={Bell} tone="danger" />
        <StatCard
          label="Next 60 days"
          value={upcoming.filter((d) => (d.daysToExpiry ?? 0) <= 60).length}
          icon={CalendarClock}
          tone="warning"
        />
        <StatCard
          label="No expiry tracked"
          value={DEMO_DOCUMENTS.length - dated.length}
          icon={FolderOpen}
        />
      </div>

      <Card>
        <CardHeader
          title="What needs attention"
          description="Expiry dates read automatically from the sample documents"
          icon={<Bell className="size-4.5" aria-hidden="true" />}
          action={
            <button
              type="button"
              onClick={() => prompt("Reminder emails and alerts are part of your own account.")}
              className="text-sm font-medium text-accent hover:text-accent-strong"
            >
              Notify me
            </button>
          }
        />
        <CardBody className="space-y-2">
          {dated.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">Nothing has an expiry date.</p>
          ) : (
            dated.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2.5"
              >
                <CategoryTile category={doc.category} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink-900">{doc.title}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {doc.docTypeLabel} · {formatDate(doc.expiryDate)}
                  </span>
                </span>
                <ExpiryBadge expiry={doc.expiry} daysToExpiry={doc.daysToExpiry} />
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// --- Assistant -------------------------------------------------------------

type DemoMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: DocumentSummary[];
};

const ASSISTANT_PROMPTS = [
  "Which documents are expiring soon?",
  "What identity documents do we hold?",
  "Show me Sana Khan's documents",
];

function AssistantTab() {
  const prompt = useSignupPrompt();
  const [messages, setMessages] = useState<DemoMessage[]>([]);
  const [draft, setDraft] = useState("");

  function ask(question: string) {
    const q = question.trim();
    if (q.length < 3) return;
    const reply = answerDemoQuestion(q, DEMO_MEMBERS.map((m) => m.name));
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: q },
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: reply.text,
        sources: reply.sources,
      },
    ]);
    setDraft("");
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Document assistant"
        description="Read-only answers from the sample vault — nothing is saved"
        icon={<MessageCircle className="size-4.5" aria-hidden="true" />}
        action={
          <Badge tone="brand" icon={<Sparkles className="size-3" aria-hidden="true" />}>
            Built-in local engine
          </Badge>
        }
      />

      <CardBody className="min-h-[16rem] space-y-4">
        {messages.length === 0 ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-ink-600">
              Ask a question in plain language. In the full app every answer is built from your own
              documents and cites exactly which ones it used.
            </p>
            <div className="flex flex-wrap gap-2">
              {ASSISTANT_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => ask(p)}
                  className={buttonClass("subtle", "sm")}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-700 px-3.5 py-2 text-sm text-white">
                  {m.text}
                </p>
              </div>
            ) : (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[90%] space-y-2 rounded-2xl rounded-bl-sm border border-ink-200 bg-ink-50 px-3.5 py-2.5">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink-800">{m.text}</p>
                  {m.sources && m.sources.length > 0 ? (
                    <div className="space-y-1 border-t border-ink-200 pt-2">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-400">
                        From {m.sources.length} document{m.sources.length === 1 ? "" : "s"}
                      </p>
                      {m.sources.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => prompt("Opening documents is part of your own account.")}
                          className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface"
                        >
                          <CategoryTile category={s.category} className="size-7" />
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-ink-800">
                              {s.title}
                            </span>
                            <span className="block truncate text-[0.7rem] text-ink-500">
                              {s.docTypeLabel} · {expiryLabel(s.expiryDate)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          )
        )}
      </CardBody>

      <div className="border-t border-ink-100 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex items-end gap-2"
        >
          <label htmlFor="guest-question" className="sr-only">
            Ask the assistant
          </label>
          <textarea
            id="guest-question"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about the sample documents…"
            className="min-h-10 w-full resize-none rounded-lg border border-ink-200 bg-surface px-3 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none"
          />
          <button type="submit" className={buttonClass("primary", "md")} disabled={draft.trim().length < 3}>
            Ask
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-500">
          You are asking a read-only sample vault. Create an account to ask about your own documents.
        </p>
      </div>
    </Card>
  );
}

// --- Family ----------------------------------------------------------------

function FamilyTab() {
  const prompt = useSignupPrompt();

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader
          title="Family profiles"
          description="Documents are filed under each person"
          icon={<Users className="size-4.5" aria-hidden="true" />}
        />
        <CardBody className="space-y-2.5">
          {DEMO_MEMBERS.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Add someone" icon={<Plus className="size-4.5" aria-hidden="true" />} />
        <CardBody className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-600">
            In the full app you can create a profile for each family member — name, relation and
            date of birth — and file documents under them.
          </p>
          <button
            type="button"
            onClick={() =>
              prompt("Adding family members is part of your own account. Create one to add your household.")
            }
            className={buttonClass("primary", "md", "w-full")}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add a family member
          </button>
        </CardBody>
      </Card>
    </div>
  );
}

function MemberCard({ member }: { member: DemoMember }) {
  const count = DEMO_DOCUMENTS.filter((d) => d.familyMember?.id === member.id).length;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-100 px-3 py-2.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-accent">
        {member.name
          .split(" ")
          .slice(0, 2)
          .map((p) => p[0])
          .join("")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-900">{member.name}</span>
        <span className="block text-xs text-ink-500">
          {member.relationLabel} · {count} document{count === 1 ? "" : "s"}
        </span>
      </span>
    </div>
  );
}
