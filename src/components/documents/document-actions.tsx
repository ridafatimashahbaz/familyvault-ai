"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, RotateCcw, Trash2 } from "lucide-react";

import { apiFetch, describeError } from "@/lib/client-api";
import { Button, LinkButton } from "@/components/ui/button";
import { useToast } from "@/components/toast";

/**
 * Destructive and long-running actions for one document.
 *
 * Delete uses a two-step inline confirmation rather than window.confirm so the
 * styling matches the rest of the app and the prompt cannot be suppressed by a
 * browser setting.
 */
export function DocumentActions({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = useState<"reprocess" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function askToDelete() {
    setConfirming(true);
    // Drop back to the safe state if the user walks away mid-decision.
    timer.current = setTimeout(() => setConfirming(false), 6000);
  }

  async function reprocess() {
    setBusy("reprocess");
    try {
      const result = await apiFetch<{ warnings: string[] }>(
        `/api/documents/${id}/reprocess`,
        { method: "POST" },
      );

      if (result.warnings.length > 0) {
        // Every note matters — one may be about a date the user confirmed — so
        // none are dropped; the toast wraps.
        toast.warning(result.warnings.join(" "));
      } else {
        toast.success("Analysis complete");
      }
      router.refresh();
    } catch (error) {
      toast.error(describeError(error));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
      toast.success(`"${title}" deleted`);
      router.push("/documents");
      router.refresh();
    } catch (error) {
      toast.error(describeError(error));
      setBusy(null);
      setConfirming(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <LinkButton
        href={`/api/documents/${id}/file?download=1`}
        variant="secondary"
        size="sm"
        icon={<FileDown className="size-4" aria-hidden="true" />}
      >
        Download
      </LinkButton>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={busy === "reprocess"}
        disabled={busy !== null}
        onClick={reprocess}
        icon={busy === "reprocess" ? undefined : <RotateCcw className="size-4" aria-hidden="true" />}
      >
        {busy === "reprocess" ? "Re-running…" : "Re-analyse"}
      </Button>

      {confirming ? (
        <span className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1">
          <span className="text-xs font-medium text-red-800">Delete permanently?</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              setConfirming(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            loading={busy === "delete"}
            disabled={busy !== null}
            onClick={remove}
          >
            Delete
          </Button>
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy !== null}
          onClick={askToDelete}
          icon={<Trash2 className="size-4 text-red-600" aria-hidden="true" />}
          className="text-red-700 hover:bg-red-50 hover:text-red-800"
        >
          Delete
        </Button>
      )}
    </div>
  );
}
