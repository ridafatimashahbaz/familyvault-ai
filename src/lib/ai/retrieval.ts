import { docTypeLabel, type CategoryKey } from "@/lib/constants";

/**
 * BM25 keyword retrieval over the signed-in user's documents.
 *
 * A local ranker rather than embeddings: it needs no model download, runs in
 * microseconds over a family-sized vault, and its scores are explainable -
 * the assistant can say which terms matched. Fields are weighted so a match
 * in a title or extracted field outranks a match buried in OCR noise.
 */

export type RetrievalDoc = {
  id: string;
  title: string;
  docType: string;
  category: CategoryKey;
  memberName: string | null;
  summary: string | null;
  fields: Record<string, string>;
  text: string;
  issueDate: Date | null;
  expiryDate: Date | null;
  createdAt: Date;
};

export type ScoredDoc = {
  doc: RetrievalDoc;
  score: number;
  matchedTerms: string[];
  snippet: string;
};

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those is are was were be been being am do does did doing
   have has had having i you he she it we they me him her us them my your his its our their of in on at to for
   with without from by as about into over after before up down out off again more most other some such no nor
   not only own same so too very can will just should now what which who whom when where why how all any both
   each few many much many s t don doesn didn won isn aren wasn weren`.split(/\s+/),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
}

/** Weights applied when building each document's searchable text. */
const FIELD_WEIGHTS = {
  title: 4,
  docTypeLabel: 4,
  category: 2,
  memberName: 3,
  summary: 2,
  fieldKey: 2,
  fieldValue: 3,
  text: 1,
} as const;

function repeat(text: string, times: number): string {
  if (times <= 1) return text;
  return Array.from({ length: times }, () => text).join(" ");
}

function documentText(doc: RetrievalDoc): string {
  const fieldText = Object.entries(doc.fields)
    .map(
      ([key, value]) =>
        `${repeat(key, FIELD_WEIGHTS.fieldKey)} ${repeat(value, FIELD_WEIGHTS.fieldValue)}`,
    )
    .join(" ");

  return [
    repeat(doc.title, FIELD_WEIGHTS.title),
    repeat(docTypeLabel(doc.docType), FIELD_WEIGHTS.docTypeLabel),
    repeat(doc.category, FIELD_WEIGHTS.category),
    repeat(doc.memberName ?? "", FIELD_WEIGHTS.memberName),
    repeat(doc.summary ?? "", FIELD_WEIGHTS.summary),
    fieldText,
    doc.text.slice(0, 8000),
  ].join(" ");
}

const K1 = 1.4;
const B = 0.75;

export function scoreDocuments(
  docs: RetrievalDoc[],
  query: string,
  limit = 6,
): ScoredDoc[] {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0 || docs.length === 0) return [];

  const querySet = new Set(queryTerms);

  const indexed = docs.map((doc) => {
    const tokens = tokenize(documentText(doc));
    const freq = new Map<string, number>();
    for (const token of tokens) freq.set(token, (freq.get(token) ?? 0) + 1);
    return { doc, freq, length: tokens.length };
  });

  const avgLength =
    indexed.reduce((sum, d) => sum + d.length, 0) / Math.max(1, indexed.length);
  const total = indexed.length;

  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const entry of indexed) {
      if ((entry.freq.get(term) ?? 0) > 0) count++;
    }
    documentFrequency.set(term, count);
  }

  const scored: ScoredDoc[] = [];

  for (const entry of indexed) {
    let score = 0;
    const matchedTerms: string[] = [];

    for (const term of queryTerms) {
      const tf = entry.freq.get(term) ?? 0;
      if (tf === 0) continue;

      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5));
      const normalised = (tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * entry.length) / Math.max(1, avgLength)));

      score += idf * normalised;
      matchedTerms.push(term);
    }

    if (score <= 0) continue;

    scored.push({
      doc: entry.doc,
      score,
      matchedTerms: matchedTerms.sort(),
      snippet: buildSnippet(entry.doc, querySet),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** A short window of OCR text around the first query hit, for citations. */
export function buildSnippet(doc: RetrievalDoc, queryTerms: Set<string>): string {
  const source = doc.summary?.trim() || doc.text;
  if (!source) return "";

  const lower = source.toLowerCase();
  let hit = -1;

  for (const term of queryTerms) {
    const at = lower.indexOf(term);
    if (at !== -1 && (hit === -1 || at < hit)) hit = at;
  }

  if (hit === -1) {
    return source.replace(/\s+/g, " ").trim().slice(0, 220);
  }

  const start = Math.max(0, hit - 90);
  const end = Math.min(source.length, hit + 160);
  const window = source.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${window}${end < source.length ? "…" : ""}`;
}

/** Narrows a document set to those belonging to a named family member. */
export function filterByMember(docs: RetrievalDoc[], names: string[]): RetrievalDoc[] {
  if (names.length === 0) return docs;
  const lowered = names.map((n) => n.toLowerCase());
  return docs.filter((d) => d.memberName && lowered.includes(d.memberName.toLowerCase()));
}

/** Names of family members mentioned in a question. */
export function mentionedMembers(question: string, memberNames: string[]): string[] {
  const lower = question.toLowerCase();
  return memberNames.filter((name) => {
    const first = name.split(/\s+/)[0]?.toLowerCase();
    return lower.includes(name.toLowerCase()) || (first && first.length > 2 && lower.includes(first));
  });
}
