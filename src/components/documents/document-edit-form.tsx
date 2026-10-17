"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";

import { ApiError, apiFetch, describeError } from "@/lib/client-api";
import type { DocumentDetail } from "@/lib/serializers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/toast";

type DocTypeOption = {
  key: string;
  label: string;
  category: string;
  categoryLabel: string;
  hasExpiry: boolean;
};

type FormState = {
  title: string;
  docType: string;
  familyMemberId: string;
  issueDate: string;
  expiryDate: string;
  noExpiry: boolean;
  tags: string;
  notes: string;
};

/** ISO timestamp to the `yyyy-mm-dd` a date input expects. */
function toDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function fromDoc(doc: DocumentDetail): FormState {
  return {
    title: doc.title,
    docType: doc.docType,
    familyMemberId: doc.familyMember?.id ?? "",
    issueDate: toDateInput(doc.issueDate),
    expiryDate: toDateInput(doc.expiryDate),
    noExpiry: doc.noExpiry,
    tags: doc.tags.join(", "),
    notes: doc.notes ?? "",
  };
}

/**
 * Only the fields the user actually touched are sent, so a partial edit can
 * never clear a value that the form does not render.
 */
function buildPatch(initial: FormState, next: FormState): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  if (next.title.trim() !== initial.title.trim()) patch.title = next.title.trim();
  if (next.docType !== initial.docType) patch.docType = next.docType;
  if (next.familyMemberId !== initial.familyMemberId) {
    patch.familyMemberId = next.familyMemberId || null;
  }
  if (next.issueDate !== initial.issueDate) patch.issueDate = next.issueDate || null;
  if (next.noExpiry !== initial.noExpiry) patch.noExpiry = next.noExpiry;
  if (next.notes.trim() !== initial.notes.trim()) patch.notes = next.notes.trim() || null;

  if (next.noExpiry) {
    if (initial.expiryDate || !initial.noExpiry) patch.expiryDate = null;
  } else if (next.expiryDate !== initial.expiryDate) {
    patch.expiryDate = next.expiryDate || null;
  }

  const tagsBefore = normaliseTags(initial.tags);
  const tagsAfter = normaliseTags(next.tags);
  if (tagsBefore.join(",") !== tagsAfter.join(",")) patch.tags = tagsAfter;

  return Object.keys(patch).length > 0 ? patch : null;
}

function normaliseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

export function DocumentEditForm({
  doc,
  members,
  docTypes,
}: {
  doc: DocumentDetail;
  members: { id: string; name: string; relation: string }[];
  docTypes: DocTypeOption[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [initial, setInitial] = useState<FormState>(() => fromDoc(doc));
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const dirty = useMemo(() => buildPatch(initial, form) !== null, [initial, form]);
  const selectedType = docTypes.find((option) => option.key === form.docType);
  const titleMissing = form.title.trim().length === 0;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    const patch = buildPatch(initial, form);
    if (!patch) return;

    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const updated = await apiFetch<DocumentDetail>(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: patch,
      });

      const fresh = fromDoc(updated);
      setInitial(fresh);
      setForm(fresh);
      toast.success("Changes saved");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) setFieldErrors(caught.fieldErrors);
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !titleMissing) void save();
      }}
      className="space-y-4"
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Input
        label="Title"
        value={form.title}
        onChange={(event) => set("title", event.target.value)}
        error={titleMissing ? "A title is required" : (fieldErrors.title?.[0] ?? null)}
        maxLength={200}
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Document type"
          value={form.docType}
          onChange={(event) => set("docType", event.target.value)}
          options={docTypes.map((option) => ({
            value: option.key,
            label: `${option.label} — ${option.categoryLabel}`,
          }))}
          error={fieldErrors.docType?.[0]}
          hint={
            selectedType && !selectedType.hasExpiry
              ? "This type does not usually carry an expiry date."
              : "Correcting this also updates the category."
          }
        />

        <Select
          label="Family member"
          value={form.familyMemberId}
          onChange={(event) => set("familyMemberId", event.target.value)}
          placeholder="Not filed under anyone"
          options={members.map((member) => ({
            value: member.id,
            label: `${member.name} · ${member.relation}`,
          }))}
          error={fieldErrors.familyMemberId?.[0]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          type="date"
          label="Issued"
          value={form.issueDate}
          max={form.expiryDate || undefined}
          onChange={(event) => set("issueDate", event.target.value)}
          error={fieldErrors.issueDate?.[0]}
        />
        <Input
          type="date"
          label="Expires"
          value={form.expiryDate}
          disabled={form.noExpiry}
          min={form.issueDate || undefined}
          onChange={(event) => set("expiryDate", event.target.value)}
          error={fieldErrors.expiryDate?.[0]}
          hint={form.noExpiry ? "Disabled while “never expires” is ticked." : undefined}
        />
      </div>

      <Checkbox
        label="This document never expires"
        hint="For things like birth certificates, degrees and property deeds."
        checked={form.noExpiry}
        onChange={(event) => set("noExpiry", event.target.checked)}
      />

      <Input
        label="Tags"
        value={form.tags}
        onChange={(event) => set("tags", event.target.value)}
        placeholder="renewed, school, 2026"
        hint="Comma separated. Tags are searchable from the documents list."
        error={fieldErrors.tags?.[0]}
      />

      <Textarea
        label="Notes"
        value={form.notes}
        rows={3}
        maxLength={2000}
        onChange={(event) => set("notes", event.target.value)}
        placeholder="Anything worth remembering about this document."
        error={fieldErrors.notes?.[0]}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
        <Button
          type="submit"
          loading={saving}
          disabled={!dirty || titleMissing}
          icon={saving ? undefined : <Save className="size-4" aria-hidden="true" />}
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>

        {dirty ? (
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => {
              setForm(initial);
              setError(null);
              setFieldErrors({});
            }}
            icon={<X className="size-4" aria-hidden="true" />}
          >
            Discard
          </Button>
        ) : (
          <p className="text-sm text-ink-400">No unsaved changes</p>
        )}
      </div>
    </form>
  );
}
