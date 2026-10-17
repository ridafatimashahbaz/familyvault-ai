"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";

import { ApiError, apiFetch, describeError } from "@/lib/client-api";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/toast";

export function ProfileForm({
  name,
  email,
  memberSince,
}: {
  name: string;
  email: string;
  memberSince: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [value, setValue] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const dirty = value.trim() !== name.trim();
  const tooShort = value.trim().length < 2;

  async function save() {
    setSaving(true);
    setError(null);
    setFieldError(null);

    try {
      await apiFetch<{ name: string }>("/api/account", {
        method: "PATCH",
        body: { name: value.trim() },
      });
      toast.success("Name updated");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) setFieldError(caught.fieldErrors.name?.[0] ?? null);
      setError(describeError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !tooShort) void save();
      }}
      className="space-y-4"
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Input
        label="Your name"
        value={value}
        maxLength={80}
        required
        onChange={(event) => setValue(event.target.value)}
        error={tooShort ? "Enter at least 2 characters" : fieldError}
        hint="Used for greetings and as the owner of every document in the vault."
      />

      <Input label="Email address" value={email} readOnly disabled hint="This is your sign-in address." />
      <Input label="Account created" value={memberSince} readOnly disabled />

      <Button
        type="submit"
        loading={saving}
        disabled={!dirty || tooShort}
        icon={saving ? undefined : <Save className="size-4" aria-hidden="true" />}
      >
        {saving ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}
