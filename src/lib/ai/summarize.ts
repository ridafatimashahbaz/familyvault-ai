import { DOC_TYPE_MAP, docTypeLabel, type CategoryKey, CATEGORIES } from "@/lib/constants";
import { type ExtractedFields } from "@/lib/pipeline/extract";
import { formatDate } from "@/lib/utils";

/**
 * Document summaries.
 *
 * Produced entirely on the server from the extracted fields plus the most
 * informative sentences of the OCR text — no document text ever leaves the
 * machine to build a summary.
 */

export type SummaryInput = {
  title: string;
  docType: string;
  category: CategoryKey;
  memberName?: string | null;
  text: string;
  fields: ExtractedFields;
  issueDate?: Date | null;
  expiryDate?: Date | null;
};

export type SummaryResult = { summary: string; source: "local" };

export async function summarizeDocument(input: SummaryInput): Promise<SummaryResult> {
  return { summary: summarizeLocally(input), source: "local" };
}

// --- Local extractive summary ---------------------------------------------

const STOPWORDS = new Set(
  `a an and are as at be by for from has have i in is it its of on or that the this to was were will with
   not but if then than so such can could should would there their they we you your our us
   page no nr number ref signature signed holder card document certificate`.split(/\s+/),
);

/** OCR noise: runs of a single character, stray punctuation, control glyphs. */
function isNoise(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (trimmed.length < 18 || trimmed.length > 220) return true;
  if (/(.)\1{5,}/.test(trimmed)) return true;

  const letters = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  if (letters / trimmed.length < 0.45) return true;

  const words = trimmed.split(/\s+/);
  if (words.length < 4) return true;
  // A line that is only a label ("DATE OF BIRTH") carries no summary value.
  return words.every((w) => w.length <= 3);
}

function contentWords(sentence: string): string[] {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function bestSentences(text: string, limit = 3): string[] {
  const candidates = text
    .split(/(?:\r?\n)+|(?<=[.!?])\s{1,}/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => !isNoise(s));

  if (candidates.length === 0) return [];

  // Term frequency over the whole document, so sentences using the
  // document's own vocabulary score highest.
  const frequency = new Map<string, number>();
  for (const sentence of candidates) {
    for (const word of contentWords(sentence)) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }

  const scored = candidates.map((sentence, index) => {
    const words = contentWords(sentence);
    if (words.length === 0) return { sentence, score: -1 };

    const tf = words.reduce((sum, w) => sum + Math.log(1 + (frequency.get(w) ?? 0)), 0);
    const normalised = tf / Math.sqrt(words.length);
    // Mild preference for text near the top, where headers and key facts sit.
    const position = 1 / (1 + index / 25);

    return { sentence, score: normalised * 0.8 + position * 1.2 };
  });

  const seen = new Set<string>();
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const key = s.sentence.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map((s) => s.sentence);
}

/** The doc-type label trimmed to the part that reads naturally inside a sentence. */
function shortDocTypeName(docType: string): string {
  if (!DOC_TYPE_MAP[docType] || docType === "other") return "document of unknown type";
  return docTypeLabel(docType).split(" / ")[0]!.trim();
}

export function summarizeLocally(input: SummaryInput): string {
  const parts: string[] = [];
  const category = CATEGORIES[input.category].label;

  const who = input.memberName ? ` for ${input.memberName}` : "";
  const noun = shortDocTypeName(input.docType);
  const article = /^[aeiou]/i.test(noun) ? "an" : "a";
  parts.push(`This is ${article} ${noun}${who}, filed under ${category}.`);

  const fields = input.fields;
  const personName =
    fields["Name"] ??
    fields["Full Name"] ??
    fields["Child Name"] ??
    fields["Patient Name"] ??
    fields["Policy Holder"] ??
    fields["Account Title"];
  const identifier =
    fields["CNIC Number"] ??
    fields["Passport Number"] ??
    fields["Registration Number"] ??
    fields["Policy Number"] ??
    fields["Account Number"] ??
    fields["Licence Number"] ??
    fields["Deed Number"];

  if (personName && identifier) {
    parts.push(`It records ${personName} with reference ${identifier}.`);
  } else if (personName) {
    parts.push(`It is issued in the name of ${personName}.`);
  } else if (identifier) {
    parts.push(`The document reference is ${identifier}.`);
  }

  const dates: string[] = [];
  if (input.issueDate) dates.push(`issued ${formatDate(input.issueDate)}`);
  if (input.expiryDate) dates.push(`valid until ${formatDate(input.expiryDate)}`);
  if (dates.length > 0) {
    parts.push(`It was ${dates.join(" and ")}.`);
  }

  const sentences = bestSentences(input.text, input.text.length > 1200 ? 3 : 2);
  if (sentences.length > 0) {
    parts.push(sentences.join(" "));
  }

  if (!input.text || input.text.trim().length < 10) {
    parts.push(
      "No readable text could be extracted from this file, so the summary is based on the file name and type alone.",
    );
  } else if (sentences.length === 0) {
    parts.push("The extracted text contained no complete sentences worth quoting.");
  }

  return parts.join(" ");
}
