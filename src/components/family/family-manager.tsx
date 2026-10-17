"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { RELATIONS, RELATION_LABELS, type Relation } from "@/lib/constants";
import { ApiError, apiFetch, describeError } from "@/lib/client-api";
import { formatDate, initials } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/toast";

export type MemberRow = {
  id: string;
  name: string;
  relation: string;
  birthDate: string | null;
  notes: string | null;
  archived: boolean;
  documentCount: number;
};

type Draft = {
  name: string;
  relation: Relation;
  birthDate: string;
  notes: string;
};

const EMPTY_DRAFT: Draft = { name: "", relation: "self", birthDate: "", notes: "" };

const RELATION_OPTIONS = RELATIONS.map((relation) => ({
  value: relation,
  label: RELATION_LABELS[relation],
}));

/**
 * Family profiles: the labels documents are filed under.
 *
 * One household, one login — profiles never authenticate. Deleting a profile
 * keeps its documents and simply unfiles them, which the API guarantees and the
 * confirmation text states so nobody hesitates to tidy up.
 */
export function FamilyManager({ initial }: { initial: MemberRow[] }) {
  const router = useRouter();
  const toast = useToast();

  const [members, setMembers] = useState<MemberRow[]>(initial);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const active = members.filter((member) => !member.archived);
  const archived = members.filter((member) => member.archived);

  async function create() {
    setBusy("create");
    setError(null);
    setFieldErrors({});

    try {
      const created = await apiFetch<MemberRow>("/api/family-members", {
        method: "POST",
        body: payload(draft),
      });

      setMembers((current) => [...current, { ...created, birthDate: isoDate(created.birthDate) }]);
      setDraft(EMPTY_DRAFT);
      toast.success(`${created.name} added`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function save(id: string) {
    setBusy(id);
    setError(null);
    setFieldErrors({});

    try {
      const updated = await apiFetch<MemberRow>(`/api/family-members/${id}`, {
        method: "PATCH",
        body: payload(editDraft),
      });

      setMembers((current) =>
        current.map((member) =>
          member.id === id ? { ...updated, birthDate: isoDate(updated.birthDate) } : member,
        ),
      );
      setEditingId(null);
      toast.success("Profile updated");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchived(member: MemberRow) {
    setBusy(member.id);
    try {
      const updated = await apiFetch<MemberRow>(`/api/family-members/${member.id}`, {
        method: "PATCH",
        body: { archived: !member.archived },
      });

      setMembers((current) =>
        current.map((entry) =>
          entry.id === member.id ? { ...entry, archived: updated.archived } : entry,
        ),
      );
      toast.success(updated.archived ? `${member.name} archived` : `${member.name} restored`);
      router.refresh();
    } catch (caught) {
      toast.error(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function remove(member: MemberRow) {
    setBusy(member.id);
    try {
      await apiFetch(`/api/family-members/${member.id}`, { method: "DELETE" });
      setMembers((current) => current.filter((entry) => entry.id !== member.id));
      setConfirmingId(null);
      toast.success(
        `${member.name} deleted. Their ${member.documentCount} ${
          member.documentCount === 1 ? "document stays" : "documents stay"
        } in the vault, unfiled.`,
      );
      router.refresh();
    } catch (caught) {
      toast.error(describeError(caught));
    } finally {
      setBusy(null);
    }
  }

  function startEditing(member: MemberRow) {
    setEditingId(member.id);
    setEditDraft({
      name: member.name,
      relation: (RELATIONS as readonly string[]).includes(member.relation)
        ? (member.relation as Relation)
        : "other",
      birthDate: member.birthDate ?? "",
      notes: member.notes ?? "",
    });
    setError(null);
    setFieldErrors({});
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader
            title="Family profiles"
            description={
              active.length === 0
                ? "Nobody added yet"
                : `${active.length} ${active.length === 1 ? "person" : "people"}${
                    archived.length > 0 ? ` · ${archived.length} archived` : ""
                  }`
            }
            icon={<Users className="size-4.5" aria-hidden="true" />}
            action={
              archived.length > 0 ? (
                <Checkbox
                  label="Show archived"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
              ) : null
            }
          />

          {members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No profiles yet"
              description="Add the people whose documents you keep. Profiles are just labels — they do not sign in, and everything stays under your one login."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {members
                .filter((member) => !member.archived || showArchived)
                .map((member) => (
                  <li
                    key={member.id}
                    className={member.archived ? "bg-ink-50/60" : undefined}
                  >
                    {editingId === member.id ? (
                      <div className="space-y-4 px-4 py-4 sm:px-5">
                        <MemberFields
                          draft={editDraft}
                          setDraft={setEditDraft}
                          fieldErrors={fieldErrors}
                          busy={busy === member.id}
                          idPrefix={`edit-${member.id}`}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            loading={busy === member.id}
                            disabled={!editDraft.name.trim()}
                            onClick={() => save(member.id)}
                            icon={
                              busy === member.id ? undefined : (
                                <Save className="size-4" aria-hidden="true" />
                              )
                            }
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busy === member.id}
                            onClick={() => setEditingId(null)}
                            icon={<X className="size-4" aria-hidden="true" />}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-accent ring-1 ring-brand-100">
                          {initials(member.name)}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink-900">
                              {member.name}
                            </span>
                            <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-xs text-ink-600">
                              {RELATION_LABELS[member.relation as Relation] ?? member.relation}
                            </span>
                            {member.archived ? (
                              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">
                                Archived
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-500">
                            {member.birthDate ? `Born ${formatDate(member.birthDate)} · ` : ""}
                            {member.documentCount}{" "}
                            {member.documentCount === 1 ? "document" : "documents"}
                          </span>
                        </span>

                        {confirmingId === member.id ? (
                          <span className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1">
                            <span className="text-xs font-medium text-red-800">Delete profile?</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy === member.id}
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              size="sm"
                              loading={busy === member.id}
                              onClick={() => remove(member)}
                            >
                              Delete
                            </Button>
                          </span>
                        ) : (
                          <span className="flex shrink-0 items-center gap-1">
                            {member.documentCount > 0 ? (
                              <Link
                                href={`/documents?member=${member.id}`}
                                className="inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium text-accent transition-colors hover:bg-brand-50"
                              >
                                View documents
                              </Link>
                            ) : null}
                            <IconButton
                              label={`Edit ${member.name}`}
                              disabled={busy === member.id}
                              onClick={() => startEditing(member)}
                            >
                              <Pencil className="size-4" aria-hidden="true" />
                            </IconButton>
                            <IconButton
                              label={member.archived ? `Restore ${member.name}` : `Archive ${member.name}`}
                              disabled={busy === member.id}
                              onClick={() => toggleArchived(member)}
                            >
                              {member.archived ? (
                                <ArchiveRestore className="size-4" aria-hidden="true" />
                              ) : (
                                <Archive className="size-4" aria-hidden="true" />
                              )}
                            </IconButton>
                            <IconButton
                              label={`Delete ${member.name}`}
                              disabled={busy === member.id}
                              onClick={() => setConfirmingId(member.id)}
                            >
                              <Trash2 className="size-4 text-red-600" aria-hidden="true" />
                            </IconButton>
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Add someone"
            icon={<UserPlus className="size-4.5" aria-hidden="true" />}
          />
          <CardBody className="space-y-4">
            <MemberFields
              draft={draft}
              setDraft={setDraft}
              fieldErrors={fieldErrors}
              busy={busy === "create"}
              idPrefix="new"
            />
            <Button
              type="button"
              className="w-full"
              loading={busy === "create"}
              disabled={!draft.name.trim()}
              onClick={create}
              icon={
                busy === "create" ? undefined : <Plus className="size-4" aria-hidden="true" />
              }
            >
              Add profile
            </Button>
            <p className="text-xs leading-relaxed text-ink-500">
              Deleting a profile never deletes documents — they stay in the vault and simply become
              unfiled.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function MemberFields({
  draft,
  setDraft,
  fieldErrors,
  busy,
  idPrefix,
}: {
  draft: Draft;
  setDraft: (updater: (current: Draft) => Draft) => void;
  fieldErrors: Record<string, string[]>;
  busy: boolean;
  idPrefix: string;
}) {
  return (
    <>
      <Input
        id={`${idPrefix}-name`}
        label="Full name"
        value={draft.name}
        disabled={busy}
        maxLength={80}
        required
        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
        error={fieldErrors.name?.[0]}
        placeholder="Ayesha Khan"
      />

      <Select
        id={`${idPrefix}-relation`}
        label="Relationship"
        value={draft.relation}
        disabled={busy}
        onChange={(event) =>
          setDraft((current) => ({ ...current, relation: event.target.value as Relation }))
        }
        options={RELATION_OPTIONS}
        error={fieldErrors.relation?.[0]}
      />

      <Input
        id={`${idPrefix}-birthDate`}
        type="date"
        label="Date of birth"
        value={draft.birthDate}
        disabled={busy}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(event) => setDraft((current) => ({ ...current, birthDate: event.target.value }))}
        error={fieldErrors.birthDate?.[0]}
        hint="Optional"
      />

      <Textarea
        id={`${idPrefix}-notes`}
        label="Notes"
        rows={3}
        maxLength={1000}
        value={draft.notes}
        disabled={busy}
        onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
        error={fieldErrors.notes?.[0]}
        placeholder="Anything worth remembering."
      />
    </>
  );
}

function payload(draft: Draft) {
  return {
    name: draft.name.trim(),
    relation: draft.relation,
    birthDate: draft.birthDate || null,
    notes: draft.notes.trim() || null,
  };
}

/** The API returns an ISO timestamp; a date input wants yyyy-mm-dd. */
function isoDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
