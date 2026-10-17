/**
 * The intent patterns behind the assistant's "explain this document" action.
 *
 * Kept in one place so the exact wording of "Understand it" can be reviewed on
 * its own, away from the retrieval logic.
 */

/** A question the assistant treats as "explain this document to me". */
export const EXPLAIN_INTENT =
  /\b(explain|understand|simplif\w*|in simple words|plain words|what does (?:it|this) mean|summari[sz]e|summary|overview)\b/i;

/** The question behind the "Understand it" action on a document. */
export function explainQuestion(title: string): string {
  return `Explain the document "${title}" in plain, simple words: what kind of document is it, who is it for, and what should we know or do next?`;
}
