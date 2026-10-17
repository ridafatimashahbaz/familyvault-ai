import {
  categoryOf,
  docTypeLabel,
  DOC_TYPES,
  type CategoryKey,
} from "../constants";

/**
 * Rule-based document type classifier.
 *
 * Runs entirely locally so classification works with no API key and no network
 * egress. Three kinds of evidence are combined:
 *   1. phrases from the taxonomy matched in the OCR/text layer
 *   2. hints in the uploaded file name
 *   3. structural patterns that are near-unique to one document type,
 *      e.g. a CNIC number shape or a passport machine-readable zone
 */

export type Classification = {
  docType: string;
  docTypeLabel: string;
  category: CategoryKey;
  /** 0..1 - how much the winner led the runner-up. */
  confidence: number;
  source: "local";
  /** Evidence shown in the UI so the user can see why and correct it. */
  matchedTerms: string[];
};

type Pattern = { docType: string; regex: RegExp; weight: number; label: string };

/**
 * High-precision structural fingerprints. Deliberately conservative: a false
 * structural match is worse than no match because it dominates the score.
 */
const STRUCTURAL_PATTERNS: Pattern[] = [
  // 42101-1234567-8 (CNIC / NADRA)
  { docType: "cnic", regex: /\b\d{5}[-\s]\d{7}[-\s]\d\b/, weight: 6, label: "CNIC number format" },
  // Passport machine-readable zone: P<PAKALI<<MUHAMMAD...
  { docType: "passport", regex: /\bP<[A-Z]{3}[A-Z<]{5,40}/, weight: 7, label: "passport MRZ" },
  { docType: "passport", regex: /\b[A-Z]{1,2}\d{7}\b.{0,40}(passport|type of document)/i, weight: 4, label: "passport number near label" },
  // IBAN
  { docType: "bank_statement", regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/, weight: 3, label: "IBAN format" },
  // NTN / tax
  { docType: "tax_return", regex: /\b\d{7}-\d\b.{0,30}(ntn|national tax)/i, weight: 5, label: "NTN format" },
];

export function classifyDocument(text: string, filename: string): Classification {
  const haystack = `${text}\n${filename}`.toLowerCase();
  const nameOnly = filename.toLowerCase();

  const scores = new Map<string, { score: number; terms: string[] }>();

  const add = (key: string, points: number, term: string) => {
    const entry = scores.get(key) ?? { score: 0, terms: [] };
    entry.score += points;
    if (entry.terms.length < 6) entry.terms.push(term);
    scores.set(key, entry);
  };

  for (const def of DOC_TYPES) {
    for (const keyword of def.keywords) {
      if (containsTerm(haystack, keyword)) {
        // Longer phrases are more specific, so they count for more.
        const words = keyword.split(/\s+/).length;
        add(def.key, Math.min(words, 4) + (words > 1 ? 1 : 0), keyword);
      }
    }

    for (const hint of def.filenameHints) {
      if (containsTerm(nameOnly, hint)) add(def.key, 4, `filename: ${hint}`);
    }
  }

  for (const pattern of STRUCTURAL_PATTERNS) {
    if (pattern.regex.test(text)) add(pattern.docType, pattern.weight, pattern.label);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);

  if (ranked.length === 0 || ranked[0]![1].score < 2) {
    return fallback();
  }

  const [bestKey, best] = ranked[0]!;
  const runnerUp = ranked[1]?.[1].score ?? 0;

  // Confidence rises with total evidence and falls when the runner-up is close.
  // Both terms saturate smoothly instead of clipping, so a marginal match stays
  // visibly less certain than a strong one rather than both reporting ~0.99.
  const margin = best.score - runnerUp;
  const evidence = best.score / (best.score + 12);
  const separation = margin / (margin + 6);
  const confidence = clamp(0.45 * evidence + 0.55 * separation, 0.05, 0.97);

  const def = DOC_TYPES.find((d) => d.key === bestKey) ?? DOC_TYPES[DOC_TYPES.length - 1]!;

  return {
    docType: def.key,
    docTypeLabel: docTypeLabel(def.key),
    category: categoryOf(def.key),
    confidence: round(confidence, 2),
    source: "local",
    matchedTerms: best.terms,
  };
}

const WORD_CHAR = /[a-z0-9]/;

/**
 * `includes` alone makes a short term fire inside an unrelated word: the CNIC
 * hint "nic" matches inside "cli**nic**", which turned a clinic card into a
 * national ID. A term only counts when it stands on its own, except on a side
 * where the term already carries its own punctuation ("bs-", "p<"), where the
 * punctuation is the boundary.
 */
function containsTerm(haystack: string, term: string): boolean {
  if (term.length === 0) return false;

  const needsLeftBoundary = WORD_CHAR.test(term[0]!);
  const needsRightBoundary = WORD_CHAR.test(term[term.length - 1]!);

  let from = 0;
  while (from <= haystack.length - term.length) {
    const at = haystack.indexOf(term, from);
    if (at === -1) return false;

    const before = at === 0 ? "" : haystack[at - 1]!;
    const end = at + term.length;
    const after = end >= haystack.length ? "" : haystack[end]!;

    const leftOk = !needsLeftBoundary || before === "" || !WORD_CHAR.test(before);
    const rightOk = !needsRightBoundary || after === "" || !WORD_CHAR.test(after);
    if (leftOk && rightOk) return true;

    from = at + 1;
  }

  return false;
}

function fallback(): Classification {
  return {
    docType: "other",
    docTypeLabel: docTypeLabel("other"),
    category: "other",
    confidence: 0,
    source: "local",
    matchedTerms: [],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
