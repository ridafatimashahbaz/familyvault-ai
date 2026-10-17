import Link from "next/link";
import { FolderOpen, Lock, SearchX, Upload } from "lucide-react";

import { requireUser } from "@/lib/session";
import { countDocuments, listDocuments } from "@/lib/services/documents";
import { listFamilyMembers } from "@/lib/services/family-members";
import { toDocumentSummary } from "@/lib/serializers";
import {
  PAGE_SIZE,
  documentsHref,
  hasActiveFilters,
  parseDocumentsQuery,
} from "@/lib/documents-query";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentRow } from "@/components/documents/document-row";
import { FilterBar } from "@/components/documents/filter-bar";
import { Pagination } from "@/components/pagination";

export const metadata = { title: "Documents" };

type RawParams = Record<string, string | string[] | undefined>;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const user = await requireUser();
  const query = parseDocumentsQuery(await searchParams);

  const filters = {
    userId: user.id,
    query: query.q || undefined,
    category: query.category || undefined,
    docType: query.docType || undefined,
    familyMemberId: query.member || undefined,
    status: query.status || undefined,
    expiry: query.expiry || undefined,
    sort: query.sort,
    limit: PAGE_SIZE,
  };

  const [first, members] = await Promise.all([
    listDocuments({ ...filters, offset: (query.page - 1) * PAGE_SIZE }),
    listFamilyMembers(user.id),
  ]);

  const pages = Math.max(1, Math.ceil(first.total / PAGE_SIZE));

  // A stale bookmark or a deleted document can leave `page` past the end; fall
  // back to the last real page rather than showing an empty list.
  const result =
    query.page > pages
      ? await listDocuments({ ...filters, offset: (pages - 1) * PAGE_SIZE })
      : first;

  const page = Math.min(query.page, pages);
  const docs = result.items.map(toDocumentSummary);
  const vaultTotal = hasActiveFilters(query) ? await countDocuments(user.id) : result.total;
  const filtered = hasActiveFilters(query);

  return (
    <>
      <PageHeader
        title="Documents"
        description="The family documents this app can read, search and summarise. Files kept in your private vault are stored separately and are not listed here."
        icon={FolderOpen}
        actions={
          <>
            <LinkButton href="/vault" variant="secondary" icon={<Lock className="size-4" aria-hidden="true" />}>
              Private vault
            </LinkButton>
            <LinkButton href="/upload" icon={<Upload className="size-4" aria-hidden="true" />}>
              Upload
            </LinkButton>
          </>
        }
      />

      {vaultTotal > 0 ? (
        <FilterBar
          query={{ ...query, page }}
          members={members.map((member) => ({ id: member.id, name: member.name }))}
          matched={result.total}
          vaultTotal={vaultTotal}
        />
      ) : null}

      <Card>
        {docs.length === 0 ? (
          vaultTotal === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Your vault is empty"
              description="Upload a photo or scan and FamilyVault will read it, work out what it is, pull out the key details and track any expiry date."
              action={
                <LinkButton href="/upload" icon={<Upload className="size-4" aria-hidden="true" />}>
                  Upload a document
                </LinkButton>
              }
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No documents match those filters"
              description="Try a broader search, or clear the filters to see everything in your vault."
              action={
                filtered ? (
                  <LinkButton href="/documents" variant="secondary">
                    Clear filters
                  </LinkButton>
                ) : null
              }
            />
          )
        ) : (
          <div className="divide-y divide-ink-100">
            {docs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </Card>

      <Pagination
        page={page}
        pages={pages}
        hrefFor={(target) => documentsHref({ ...query, page: target })}
      />

      {docs.length > 0 ? (
        <p className="text-center text-xs text-ink-400">
          Showing {docs.length} of <span className="tabular-nums">{result.total}</span> matches ·{" "}
          <Link href="/assistant" className="underline decoration-dotted hover:text-ink-600">
            Ask the assistant about these
          </Link>
        </p>
      ) : null}
    </>
  );
}
