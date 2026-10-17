import { DOC_TYPES, docTypeLabel } from "@/lib/constants";
import { daysUntil, expiryLabel, formatDate } from "@/lib/utils";
import { env } from "@/lib/env";
import { EXPLAIN_INTENT } from "./prompts";
import { LOCAL_ENGINE_LABEL } from "./provider";
import {
  filterByMember,
  mentionedMembers,
  scoreDocuments,
  type RetrievalDoc,
  type ScoredDoc,
} from "./retrieval";

/**
 * The document assistant.
 *
 * Answers are always grounded in retrieved documents and cite them. The prose
 * is composed locally from the retrieved set by an intent-based composer, so
 * no document text, metadata or question is ever sent to a third party.
 * Nothing here invents facts.
 */

export type AssistantSource = {
  id: string;
  title: string;
  docTypeLabel: string;
  memberName: string | null;
  score: number;
  snippet: string;
};

export type AssistantAnswer = {
  answer: string;
  sources: AssistantSource[];
  provider: string;
  engine: "local";
  /** Total documents considered, so the UI can say "searched N documents". */
  searched: number;
};

const EXPIRY_INTENT =
  /\b(expir\w*|renew\w*|valid\w*|lapse\w*|overdue|due\s+soon|out\s+of\s+date|running\s+out)\b/i;
const COUNT_INTENT = /\b(how\s+many|count\s+of|number\s+of|total\s+number)\b/i;

export async function answerQuestion(options: {
  question: string;
  docs: RetrievalDoc[];
  memberNames: string[];
}): Promise<AssistantAnswer> {
  const { question, docs, memberNames } = options;

  if (docs.length === 0) {
    return {
      answer:
        "Your vault has no documents yet, so there is nothing to search. " +
        "Upload a document and I will be able to answer questions about it.",
      sources: [],
      provider: LOCAL_ENGINE_LABEL,
      engine: "local",
      searched: 0,
    };
  }

  const named = mentionedMembers(question, memberNames);
  const pool = named.length > 0 ? filterByMember(docs, named) : docs;
  const effectivePool = pool.length > 0 ? pool : docs;

  const limit = env().ASSISTANT_MAX_CONTEXT_DOCS;
  const ranked = scoreDocuments(effectivePool, question, limit);

  const sources: AssistantSource[] = ranked.map((r) => toSource(r));

  return {
    answer: answerLocally(question, ranked, effectivePool, named),
    sources,
    provider: LOCAL_ENGINE_LABEL,
    engine: "local",
    searched: docs.length,
  };
}

function toSource(result: ScoredDoc): AssistantSource {
  return {
    id: result.doc.id,
    title: result.doc.title,
    docTypeLabel: docTypeLabel(result.doc.docType),
    memberName: result.doc.memberName,
    score: Math.round(result.score * 100) / 100,
    snippet: result.snippet,
  };
}

// --- Local path ------------------------------------------------------------

/** Finds document types the question is asking about. */
function matchedDocTypes(question: string): string[] {
  const q = question.toLowerCase();
  const hits: { key: string; weight: number }[] = [];

  for (const def of DOC_TYPES) {
    if (def.key === "other") continue;

    let weight = 0;
    const labelWords = def.label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    if (labelWords.some((w) => q.includes(w))) weight += 3;

    for (const hint of def.filenameHints) {
      if (hint.length > 2 && q.includes(hint.replace(/-/g, " "))) weight += 4;
      if (hint.length > 2 && q.includes(hint)) weight += 4;
    }
    for (const keyword of def.keywords.slice(0, 6)) {
      if (keyword.length > 4 && q.includes(keyword)) weight += 2;
    }
    if (weight > 0) hits.push({ key: def.key, weight });
  }

  return hits.sort((a, b) => b.weight - a.weight).slice(0, 3).map((h) => h.key);
}

function bullet(doc: RetrievalDoc, detail?: string): string {
  const who = doc.memberName ? ` — ${doc.memberName}` : "";
  const expiry = doc.expiryDate ? ` (${expiryLabel(doc.expiryDate)})` : "";
  return `• ${doc.title}${who} · ${docTypeLabel(doc.docType)}${expiry}${detail ? `\n   ${detail}` : ""}`;
}

function fieldDetail(doc: RetrievalDoc, keys: RegExp): string {
  const parts = Object.entries(doc.fields)
    .filter(([k]) => keys.test(k))
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${v}`);
  return parts.join(" · ");
}

/**
 * Plain-language explanation of a single document, used by "Understand it".
 * It only restates what the document already holds — type, holder, dates,
 * extracted fields — so it can never contradict the file.
 */
function explainLocally(ranked: ScoredDoc[], pool: RetrievalDoc[]): string {
  const doc = ranked[0]?.doc ?? pool[0];

  if (!doc) {
    return "I could not find a document to explain. Open a document and choose “Understand it”, or name the document you mean.";
  }

  const lines: string[] = [
    `${doc.title} is a ${docTypeLabel(doc.docType)} document${doc.memberName ? ` for ${doc.memberName}` : ""}.`,
  ];

  if (doc.summary) lines.push("", doc.summary);

  const dates: string[] = [];
  if (doc.issueDate) dates.push(`Issued ${formatDate(doc.issueDate)}`);
  if (doc.expiryDate) {
    const past = daysUntil(doc.expiryDate)! < 0;
    dates.push(`${past ? "Expired" : "Valid until"} ${formatDate(doc.expiryDate)} (${expiryLabel(doc.expiryDate)})`);
  }
  if (dates.length > 0) lines.push("", `Dates: ${dates.join(" · ")}.`);

  const fields = Object.entries(doc.fields)
    .slice(0, 6)
    .map(([key, value]) => `• ${key}: ${value}`);
  if (fields.length > 0) lines.push("", "Key details:", ...fields);

  lines.push("", "Open the original document to check any number or date before relying on it.");

  return lines.join("\n");
}

export function answerLocally(
  question: string,
  ranked: ScoredDoc[],
  pool: RetrievalDoc[],
  named: string[],
): string {
  const scope = named.length > 0 ? ` for ${named.join(" and ")}` : "";
  const isExpiry = EXPIRY_INTENT.test(question);
  const isCount = COUNT_INTENT.test(question);
  const types = matchedDocTypes(question);

  if (EXPLAIN_INTENT.test(question)) {
    return explainLocally(ranked, pool);
  }

  if (isExpiry) {
    const withExpiry = pool
      .filter((d) => d.expiryDate)
      .sort((a, b) => a.expiryDate!.getTime() - b.expiryDate!.getTime());

    if (withExpiry.length === 0) {
      return `No document${scope} has an expiry date on record. ` +
        `Expiry is only detected when the document itself prints a labelled expiry date. ` +
        `You can set one manually from the document page.`;
    }

    const expired = withExpiry.filter((d) => daysUntil(d.expiryDate)! < 0);
    const upcoming = withExpiry.filter((d) => daysUntil(d.expiryDate)! >= 0);
    const lines: string[] = [];

    if (expired.length > 0) {
      lines.push(`Expired${scope} (${expired.length}):`);
      lines.push(...expired.slice(0, 6).map((d) => bullet(d, `Expired ${formatDate(d.expiryDate)}`)));
    }
    if (upcoming.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push(`Still valid${scope} (${upcoming.length}):`);
      lines.push(
        ...upcoming.slice(0, 6).map((d) => bullet(d, `Valid until ${formatDate(d.expiryDate)}`)),
      );
    }

    const warningDays = env().EXPIRY_WARNING_DAYS;
    const soon = upcoming.filter((d) => daysUntil(d.expiryDate)! <= warningDays).length;
    const header =
      soon > 0
        ? `${soon} document${soon === 1 ? "" : "s"}${scope} will expire within ${warningDays} days.`
        : `Nothing${scope} expires within the next ${warningDays} days.`;

    return [header, "", ...lines].join("\n");
  }

  if (types.length > 0) {
    const matches = pool.filter((d) => types.includes(d.docType));

    if (isCount) {
      const labels = types.map(docTypeLabel).join(", ");
      return matches.length === 0
        ? `There are no ${labels} documents${scope} in the vault.`
        : `There ${matches.length === 1 ? "is 1" : `are ${matches.length}`} ${labels} document${matches.length === 1 ? "" : "s"}${scope}.`;
    }

    if (matches.length === 0) {
      const labels = types.map((t) => docTypeLabel(t)).join(", ");
      return `I could not find any ${labels} documents${scope}. ` +
        (ranked.length > 0
          ? `The closest matches in your vault are:\n${ranked.slice(0, 3).map((r) => bullet(r.doc, r.snippet.slice(0, 140))).join("\n")}`
          : `Upload one and I will index it automatically.`);
    }

    const idPattern = /number|cnic|passport|iban|policy|account|registration|licence|reference/i;
    return [
      `Found ${matches.length} ${matches.length === 1 ? "document" : "documents"}${scope} matching ${types.map((t) => docTypeLabel(t)).join(", ")}:`,
      "",
      ...matches.slice(0, 6).map((d) => bullet(d, fieldDetail(d, idPattern) || d.summary?.slice(0, 140) || "")),
    ].join("\n");
  }

  if (ranked.length === 0) {
    return `I searched your ${pool.length} document${pool.length === 1 ? "" : "s"} and found nothing matching that question. ` +
      `Try naming a person, a document type, or asking what is expiring.`;
  }

  if (isCount) {
    return `${ranked.length} document${ranked.length === 1 ? "" : "s"} matched that question out of ${pool.length} in the vault.`;
  }

  return [
    `Here is what I found${scope}:`,
    "",
    ...ranked.slice(0, 4).map((r) =>
      bullet(
        r.doc,
        r.doc.summary?.slice(0, 200) || fieldDetail(r.doc, /name|number|date/i) || r.snippet.slice(0, 160),
      ),
    ),
    "",
    `Matched on: ${ranked[0]!.matchedTerms.slice(0, 8).join(", ")}.`,
  ].join("\n");
}
