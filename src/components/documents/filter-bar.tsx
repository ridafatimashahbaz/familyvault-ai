"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Input, Select } from "@/components/ui/field";
import {
  CATEGORY_OPTIONS,
  EXPIRY_OPTIONS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  docTypeOptionsFor,
  documentsQueryToParams,
  hasActiveFilters,
  type DocumentsQuery,
} from "@/lib/documents-query";

/**
 * Drives `/documents` entirely through the query string.
 *
 * Every control replaces the URL and lets the server component re-render, so
 * there is no second copy of the list state to keep in sync, and a filtered
 * view survives a reload or a shared link.
 */
export function FilterBar({
  query,
  members,
  matched,
  vaultTotal,
}: {
  query: DocumentsQuery;
  members: { id: string; name: string }[];
  /** Documents matching the current filters, across every page. */
  matched: number;
  /** Every document in the vault, for the "x of y" readout. */
  vaultTotal: number;
}) {
  const router = useRouter();

  const [text, setText] = useState(query.q);
  /** Last URL asked for, so two quick control changes cannot clobber each other. */
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
  }, [query]);

  /** Last query string the search box pushed, used to spot changes from outside. */
  const pushed = useRef(query.q);
  useEffect(() => {
    if (query.q !== pushed.current) {
      pushed.current = query.q;
      setText(query.q);
    }
  }, [query.q]);

  function push(patch: Partial<DocumentsQuery>) {
    let next: DocumentsQuery = { ...latest.current, ...patch, page: 1 };

    // A type from the previous category would silently match nothing.
    if (patch.category !== undefined && next.docType) {
      const stillValid = docTypeOptionsFor(next.category).some((option) => option.value === next.docType);
      if (!stillValid) next = { ...next, docType: "" };
    }

    latest.current = next;
    const search = documentsQueryToParams(next).toString();
    router.replace(search ? `/documents?${search}` : "/documents", { scroll: false });
  }

  // Typing waits for a pause; every other control applies immediately.
  useEffect(() => {
    if (text === pushed.current) return;
    const timer = setTimeout(() => {
      pushed.current = text;
      push({ q: text });
    }, 350);
    return () => clearTimeout(timer);
    // `push` reads refs and props that are current at call time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const filtered = hasActiveFilters(query);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        pushed.current = text;
        push({ q: text });
      }}
      className="rounded-card border border-ink-200/80 bg-surface p-3 shadow-card sm:p-4"
    >
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="xl:w-72 xl:shrink-0">
          <Input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search titles, text, notes, tags…"
            aria-label="Search documents"
            leading={<Search className="size-4" aria-hidden="true" />}
          />
        </div>

        <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Select
            aria-label="Filter by family member"
            value={query.member}
            onChange={(event) => push({ member: event.target.value })}
            placeholder="Everyone"
            options={members.map((member) => ({ value: member.id, label: member.name }))}
          />
          <Select
            aria-label="Filter by category"
            value={query.category}
            onChange={(event) => push({ category: event.target.value })}
            placeholder="All categories"
            options={CATEGORY_OPTIONS}
          />
          <Select
            aria-label="Filter by document type"
            value={query.docType}
            onChange={(event) => push({ docType: event.target.value })}
            placeholder="All types"
            options={docTypeOptionsFor(query.category)}
          />
          <Select
            aria-label="Filter by expiry"
            value={query.expiry}
            onChange={(event) => push({ expiry: event.target.value as DocumentsQuery["expiry"] })}
            placeholder="Any expiry"
            options={[...EXPIRY_OPTIONS]}
          />
          <Select
            aria-label="Filter by processing status"
            value={query.status}
            onChange={(event) => push({ status: event.target.value })}
            placeholder="Any status"
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-2.5">
        <p className="text-sm text-ink-500" role="status" aria-live="polite">
          {filtered ? (
            <>
              <span className="font-medium text-ink-800 tabular-nums">{matched}</span> of{" "}
              <span className="tabular-nums">{vaultTotal}</span> documents match
            </>
          ) : (
            <>
              <span className="font-medium text-ink-800 tabular-nums">{vaultTotal}</span>{" "}
              {vaultTotal === 1 ? "document" : "documents"}
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          <Select
            aria-label="Sort documents"
            value={query.sort}
            onChange={(event) => push({ sort: event.target.value as DocumentsQuery["sort"] })}
            options={[...SORT_OPTIONS]}
            className="h-8 w-auto text-xs"
          />
          {filtered ? (
            <Link
              href="/documents"
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear filters
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}
