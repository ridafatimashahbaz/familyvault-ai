import { CATEGORIES, CATEGORY_KEYS, DOCUMENT_STATUSES, DOC_TYPES } from "@/lib/constants";

/**
 * The `/documents` URL is the single source of truth for the list state.
 *
 * Keeping filters in the query string rather than in component state means a
 * filtered view can be bookmarked, shared and reached with the browser back
 * button, and the server component can render the correct page without any
 * client round-trip.
 */

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Title A–Z" },
  { value: "expiry", label: "Expiry date" },
  { value: "size", label: "Largest first" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export const EXPIRY_OPTIONS = [
  { value: "expired", label: "Expired" },
  { value: "expiring", label: "Expiring soon" },
  { value: "valid", label: "Valid" },
  { value: "none", label: "No expiry date" },
] as const;

export type ExpiryKey = (typeof EXPIRY_OPTIONS)[number]["value"];

export const STATUS_OPTIONS = DOCUMENT_STATUSES.map((status) => ({
  value: status,
  label: status.charAt(0).toUpperCase() + status.slice(1),
}));

export const CATEGORY_OPTIONS = CATEGORY_KEYS.map((category) => ({
  value: category,
  label: CATEGORIES[category].label,
}));

/**
 * There are around sixty document types, so the picker narrows to the selected
 * category. With no category chosen it lists them all, alphabetically.
 */
export function docTypeOptionsFor(category: string) {
  const pool = category ? DOC_TYPES.filter((d) => d.category === category) : DOC_TYPES;

  return [...pool]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((d) => ({ value: d.key, label: d.label }));
}

export const PAGE_SIZE = 12;

export type DocumentsQuery = {
  q: string;
  category: string;
  docType: string;
  member: string;
  status: string;
  expiry: ExpiryKey | "";
  sort: SortKey;
  page: number;
};

export const EMPTY_QUERY: DocumentsQuery = {
  q: "",
  category: "",
  docType: "",
  member: "",
  status: "",
  expiry: "",
  sort: "newest",
  page: 1,
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw.trim() : "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

export function parseDocumentsQuery(params: RawParams): DocumentsQuery {
  const sort = oneOf(first(params.sort), SORT_OPTIONS.map((o) => o.value));
  const page = Number.parseInt(first(params.page), 10);

  return {
    q: first(params.q).slice(0, 200),
    category: oneOf(first(params.category), CATEGORY_KEYS),
    docType: first(params.docType).slice(0, 60),
    member: first(params.member),
    status: oneOf(first(params.status), DOCUMENT_STATUSES as readonly string[]),
    expiry: oneOf(first(params.expiry), EXPIRY_OPTIONS.map((o) => o.value)),
    sort: sort || "newest",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

/** Empty values are dropped so a filtered URL stays short and readable. */
export function documentsQueryToParams(query: Partial<DocumentsQuery>): URLSearchParams {
  const params = new URLSearchParams();

  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.docType) params.set("docType", query.docType);
  if (query.member) params.set("member", query.member);
  if (query.status) params.set("status", query.status);
  if (query.expiry) params.set("expiry", query.expiry);
  if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
  if (query.page && query.page > 1) params.set("page", String(query.page));

  return params;
}

export function documentsHref(patch: Partial<DocumentsQuery> = {}): string {
  const params = documentsQueryToParams(patch);
  const search = params.toString();
  return search ? `/documents?${search}` : "/documents";
}

export function hasActiveFilters(query: DocumentsQuery): boolean {
  return Boolean(
    query.q || query.category || query.docType || query.member || query.status || query.expiry,
  );
}
