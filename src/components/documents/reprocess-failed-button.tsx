"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

/**
 * Retries a batch of failed documents from the dashboard alert. The route is
 * capped, so this is safe to press more than once to clear a larger backlog.
 */
export function ReprocessFailedButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/documents/reprocess-failed", { method: "POST" });
      const body = (await response.json()) as {
        data?: { attempted: number; succeeded: number; failed: number };
        error?: { message?: string };
      };

      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Could not reprocess the documents.");
      }

      const { attempted, succeeded, failed } = body.data;
      if (attempted === 0) {
        toast.success("Nothing left to reprocess.");
      } else if (failed === 0) {
        toast.success(`Reprocessed ${succeeded} ${succeeded === 1 ? "document" : "documents"}.`);
      } else {
        toast.warning(`Reprocessed ${succeeded}, ${failed} still failing. Press again to retry.`);
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reprocess the documents.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={run}
      icon={<RotateCcw className="size-3.5" aria-hidden="true" />}
    >
      Reprocess all failed
    </Button>
  );
}
