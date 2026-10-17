import { CATEGORIES, categoryOf, docTypeLabel, type CategoryKey } from "@/lib/constants";
import { expiryState, type ExpiryState } from "@/lib/utils";
import type { DocumentSummary } from "@/lib/serializers";

/**
 * A read-only sample vault for the guest ("try without an account") experience.
 *
 * Nothing here touches the database: it is a plain module the client demo
 * renders directly. Dates are relative to `now` so the reminders always look
 * live, and every document is obviously fictional.
 */

export type DemoMember = {
  id: string;
  name: string;
  relation: string;
  relationLabel: string;
};

export const DEMO_MEMBERS: DemoMember[] = [
  { id: "demo-ahmed", name: "Ahmed Khan", relation: "self", relationLabel: "Self" },
  { id: "demo-sana", name: "Sana Khan", relation: "spouse", relationLabel: "Spouse" },
  { id: "demo-zara", name: "Zara Khan", relation: "child", relationLabel: "Child" },
];

const MEMBERS_BY_ID = new Map(DEMO_MEMBERS.map((m) => [m.id, m]));

function daysFromNow(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

type DemoDocInput = {
  id: string;
  title: string;
  originalName: string;
  docType: string;
  sizeBytes: number;
  confidence: number;
  summary: string;
  memberId: string | null;
  tags?: string[];
  issueDaysAgo?: number;
  expiryInDays?: number | null;
  noExpiry?: boolean;
  daysAgoAdded?: number;
};

function buildDocument(input: DemoDocInput): DocumentSummary {
  const category: CategoryKey = categoryOf(input.docType);

  const expiryDate = input.expiryInDays != null ? daysFromNow(input.expiryInDays) : null;
  const noExpiry = input.noExpiry ?? expiryDate === null;
  const expiry: ExpiryState = noExpiry ? "none" : expiryState(new Date(expiryDate!), 60);

  return {
    id: input.id,
    title: input.title,
    originalName: input.originalName,
    extension: input.originalName.split(".").pop() ?? "pdf",
    mimeType: "application/pdf",
    sizeBytes: input.sizeBytes,
    docType: input.docType,
    docTypeLabel: docTypeLabel(input.docType),
    category,
    categoryLabel: CATEGORIES[category].label,
    status: "ready",
    ocrStatus: "done",
    ocrConfidence: 0.9,
    classificationConfidence: input.confidence,
    classificationSource: "auto",
    summary: input.summary,
    notes: null,
    issueDate: input.issueDaysAgo != null ? daysFromNow(-input.issueDaysAgo) : null,
    expiryDate: noExpiry ? null : expiryDate,
    noExpiry,
    expiry,
    daysToExpiry: noExpiry ? null : input.expiryInDays ?? null,
    isExpired: !noExpiry && (input.expiryInDays ?? 1) < 0,
    encrypted: true,
    hasPreview: true,
    familyMember: input.memberId
      ? (() => {
          const m = MEMBERS_BY_ID.get(input.memberId)!;
          return { id: m.id, name: m.name, relation: m.relation };
        })()
      : null,
    tags: input.tags ?? [],
    createdAt: daysFromNow(-(input.daysAgoAdded ?? 3)),
    updatedAt: daysFromNow(-(input.daysAgoAdded ?? 3)),
  };
}

export const DEMO_DOCUMENTS: DocumentSummary[] = [
  buildDocument({
    id: "demo-passport",
    title: "Ahmed Khan · Passport",
    originalName: "passport-ahmed.pdf",
    docType: "passport",
    sizeBytes: 1_540_000,
    confidence: 0.94,
    summary:
      "A passport issued to Ahmed Khan. It was issued 14 Mar 2024 and is valid until 14 Mar 2029, so it stays valid for several more years.",
    memberId: "demo-ahmed",
    issueDaysAgo: 850,
    expiryInDays: 880,
    daysAgoAdded: 40,
    tags: ["travel"],
  }),
  buildDocument({
    id: "demo-cnic",
    title: "Sana Khan · CNIC",
    originalName: "cnic-sana.jpg",
    docType: "cnic",
    sizeBytes: 820_000,
    confidence: 0.89,
    summary:
      "A national identity card for Sana Khan. It is due to expire within the next two months and should be renewed at NADRA.",
    memberId: "demo-sana",
    issueDaysAgo: 1800,
    expiryInDays: 41,
    daysAgoAdded: 22,
  }),
  buildDocument({
    id: "demo-lease",
    title: "House lease agreement",
    originalName: "house-lease-2025.pdf",
    docType: "lease_agreement",
    sizeBytes: 2_180_000,
    confidence: 0.91,
    summary:
      "A lease agreement for the family home. The tenancy ran for one year and has now ended, so a renewal may be needed.",
    memberId: null,
    issueDaysAgo: 430,
    expiryInDays: -65,
    daysAgoAdded: 300,
    tags: ["rent", "home"],
  }),
  buildDocument({
    id: "demo-birth",
    title: "Zara Khan · Birth Certificate",
    originalName: "birth-zara.pdf",
    docType: "birth_certificate",
    sizeBytes: 640_000,
    confidence: 0.93,
    summary:
      "A birth certificate for Zara Khan issued by the union council. It has no expiry date — the record is permanent.",
    memberId: "demo-zara",
    issueDaysAgo: 1500,
    noExpiry: true,
    daysAgoAdded: 18,
  }),
  buildDocument({
    id: "demo-bill",
    title: "K-Electric bill · March",
    originalName: "kelectric-march.pdf",
    docType: "utility_bill",
    sizeBytes: 210_000,
    confidence: 0.72,
    summary:
      "An electricity bill from K-Electric for the most recent billing month. The amount is due within the next couple of weeks.",
    memberId: null,
    issueDaysAgo: 18,
    expiryInDays: 12,
    daysAgoAdded: 2,
    tags: ["utilities"],
  }),
  buildDocument({
    id: "demo-degree",
    title: "Ahmed Khan · Degree Certificate",
    originalName: "degree-ahmed.pdf",
    docType: "degree",
    sizeBytes: 1_020_000,
    confidence: 0.87,
    summary:
      "A university degree certificate awarded to Ahmed Khan. Like most academic records it does not expire.",
    memberId: "demo-ahmed",
    issueDaysAgo: 3400,
    noExpiry: true,
    daysAgoAdded: 30,
  }),
  buildDocument({
    id: "demo-insurance",
    title: "Family health insurance policy",
    originalName: "health-insurance.pdf",
    docType: "health_insurance",
    sizeBytes: 1_760_000,
    confidence: 0.83,
    summary:
      "A health insurance policy covering the household. The policy runs to the end of its term later this year.",
    memberId: null,
    issueDaysAgo: 210,
    expiryInDays: 155,
    daysAgoAdded: 12,
    tags: ["insurance", "medical"],
  }),
];

/** Pre-computed stats for the demo dashboard. */
export function demoStats() {
  const total = DEMO_DOCUMENTS.length;
  const sizeBytes = DEMO_DOCUMENTS.reduce((sum, d) => sum + d.sizeBytes, 0);
  const expiringSoon = DEMO_DOCUMENTS.filter(
    (d) => d.daysToExpiry !== null && d.daysToExpiry >= 0 && d.daysToExpiry <= 60,
  ).length;
  const expired = DEMO_DOCUMENTS.filter((d) => d.isExpired).length;
  const categories = new Set(DEMO_DOCUMENTS.map((d) => d.category)).size;

  return { total, sizeBytes, expiringSoon, expired, categories };
}

export type DemoAssistantReply = { text: string; sources: DocumentSummary[] };

const EXPIRY_RE = /\b(expir\w*|renew\w*|valid\w*|lapse\w*|overdue|due|out\s+of\s+date)\b/i;

/**
 * A deliberately small stand-in for the real assistant, so the guest demo can
 * answer the handful of questions the landing page suggests without a server.
 */
export function answerDemoQuestion(question: string, memberNames: string[]): DemoAssistantReply {
  const q = question.toLowerCase();
  const named = memberNames.filter((n) => q.includes(n.split(" ")[0]!.toLowerCase()));
  const pool = named.length
    ? DEMO_DOCUMENTS.filter((d) => d.familyMember && named.includes(d.familyMember.name))
    : DEMO_DOCUMENTS;

  if (pool.length === 0) {
    return { text: "I could not find any documents for that person in the sample vault.", sources: [] };
  }

  if (EXPIRY_RE.test(q)) {
    const dated = pool
      .filter((d) => d.expiryDate)
      .sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0));
    const expired = dated.filter((d) => (d.daysToExpiry ?? 0) < 0);
    const upcoming = dated.filter((d) => (d.daysToExpiry ?? 0) >= 0);

    const lines: string[] = [];
    if (expired.length) {
      lines.push(`Expired (${expired.length}):`);
      lines.push(
        ...expired.map((d) => `• ${d.title} · expired ${Math.abs(d.daysToExpiry ?? 0)} days ago`),
      );
    }
    if (upcoming.length) {
      if (lines.length) lines.push("");
      lines.push(`Still valid (${upcoming.length}):`);
      lines.push(...upcoming.map((d) => `• ${d.title} · in ${d.daysToExpiry} days`));
    }

    return {
      text: [
        `${pool.filter((d) => (d.daysToExpiry ?? 99) < 0 || (d.daysToExpiry ?? 999) <= 60).length} document(s) in this sample are expired or fall due within 60 days.`,
        "",
        ...lines,
      ].join("\n"),
      sources: dated.slice(0, 4),
    };
  }

  const scored = pool
    .map((d) => {
      const hay = `${d.title} ${d.docTypeLabel} ${d.categoryLabel} ${d.summary ?? ""}`.toLowerCase();
      const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 3);
      const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { d, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      text:
        "In this sample vault I could not find anything matching that. In the full app the assistant searches every title, summary, extracted field and the recognised text of every document in your own account.",
      sources: [],
    };
  }

  return {
    text: [
      `Here is what matches in the sample vault (${scored.length}):`,
      "",
      ...scored.slice(0, 4).map((r) => `• ${r.d.title} · ${r.d.docTypeLabel}\n   ${r.d.summary ?? ""}`),
    ].join("\n"),
    sources: scored.slice(0, 4).map((r) => r.d),
  };
}
