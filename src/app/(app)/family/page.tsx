import { FolderOpen, Inbox, Users } from "lucide-react";

import { requireUser } from "@/lib/session";
import { countDocuments } from "@/lib/services/documents";
import { listFamilyMembers } from "@/lib/services/family-members";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/stat-card";
import { FamilyManager } from "@/components/family/family-manager";

export const metadata = { title: "Family" };

export default async function FamilyPage() {
  const user = await requireUser();

  const [members, totalDocuments] = await Promise.all([
    listFamilyMembers(user.id, { includeArchived: true }),
    countDocuments(user.id),
  ]);

  const active = members.filter((member) => !member.archived);
  const filed = members.reduce((sum, member) => sum + member.documentCount, 0);
  const unfiled = Math.max(0, totalDocuments - filed);

  return (
    <>
      <PageHeader
        title="Family"
        description="One login for the whole household. Profiles are the labels your documents are filed under — they cannot sign in on their own."
        icon={Users}
        actions={
          <LinkButton href="/upload" variant="secondary">
            Upload for someone
          </LinkButton>
        }
      />

      {unfiled > 0 ? (
        <Alert tone="info" title={`${unfiled} ${unfiled === 1 ? "document is" : "documents are"} not filed under anyone`}>
          Open a document and pick a family member, or filter the list to work through them.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Profiles"
          value={active.length}
          hint={
            members.length > active.length
              ? `${members.length - active.length} archived`
              : "Everyone in the household"
          }
          icon={Users}
          tone="brand"
        />
        <StatCard
          label="Filed documents"
          value={filed}
          hint="Attached to a profile"
          icon={FolderOpen}
          href="/documents"
        />
        <StatCard
          label="Unfiled"
          value={unfiled}
          hint={unfiled > 0 ? "Worth sorting" : "Everything is filed"}
          icon={Inbox}
          tone={unfiled > 0 ? "warning" : "neutral"}
        />
      </div>

      <FamilyManager
        initial={members.map((member) => ({
          id: member.id,
          name: member.name,
          relation: member.relation,
          birthDate: member.birthDate ? member.birthDate.toISOString().slice(0, 10) : null,
          notes: member.notes,
          archived: member.archived,
          documentCount: member.documentCount,
        }))}
      />
    </>
  );
}
