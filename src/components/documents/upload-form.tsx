"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleCheck,
  CloudUpload,
  FileText,
  OctagonX,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { ApiError } from "@/lib/client-api";
import { formatBytes, titleFromFilename } from "@/lib/utils";
import type { DocumentSummary } from "@/lib/serializers";
import { Alert } from "@/components/ui/alert";
import { Button, IconButton, LinkButton, buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import { CategoryTile, ExpiryBadge } from "./badges";

type Status = "queued" | "uploading" | "analysing" | "done" | "error";

type QueueItem = {
  key: string;
  file: File;
  title: string;
  memberId: string;
  status: Status;
  progress: number;
  document: DocumentSummary | null;
  warnings: string[];
  error: string | null;
};

type UploadResponse = { document: DocumentSummary; warnings: string[] };

/**
 * Drag-and-drop upload with a queue.
 *
 * Files go up one at a time: OCR is CPU-bound, so a parallel batch of large
 * scans would make every file slower and could trip the request timeout.
 * XMLHttpRequest is used instead of fetch because only it reports upload
 * progress, which matters on a 15 MB scan over a home connection.
 */
export function UploadForm({
  members,
  maxUploadMb,
  extensions,
  defaultMemberId = "",
}: {
  members: { id: string; name: string; relation: string }[];
  maxUploadMb: number;
  extensions: string[];
  defaultMemberId?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const [memberId, setMemberId] = useState(defaultMemberId);
  const [tags, setTags] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const activeRequest = useRef<XMLHttpRequest | null>(null);
  const unmounted = useRef(false);
  const cancelRef = useRef(false);
  // Read through a ref so the paste listener below always sees the current choice.
  const memberRef = useRef(memberId);

  useEffect(() => {
    memberRef.current = memberId;
  }, [memberId]);

  useEffect(
    () => () => {
      unmounted.current = true;
      activeRequest.current?.abort();
    },
    [],
  );

  const maxBytes = maxUploadMb * 1024 * 1024;
  const accept = extensions.map((ext) => `.${ext}`).join(",");

  function patch(key: string, changes: Partial<QueueItem>) {
    if (unmounted.current) return;
    setQueue((current) => current.map((item) => (item.key === key ? { ...item, ...changes } : item)));
  }

  function reject(message: string) {
    if (unmounted.current) return;
    setRejections((current) => [...current, message]);
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const accepted: QueueItem[] = [];

    for (const file of incoming) {
      const problem = reviewFile(file, extensions, maxBytes, maxUploadMb);
      if (problem) {
        reject(problem);
        continue;
      }

      accepted.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        title: titleFromFilename(file.name),
        memberId: memberRef.current,
        status: "queued",
        progress: 0,
        document: null,
        warnings: [],
        error: null,
      });
    }

    if (accepted.length > 0) setQueue((current) => [...current, ...accepted]);
    if (inputRef.current) inputRef.current.value = "";
  }

  // A pasted screenshot lands in the queue just like a dropped file.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (unmounted.current) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) addFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // addFiles reads props and refs, so subscribing once is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadItems(items: QueueItem[]) {
    if (items.length === 0) return;

    setBusy(true);
    setRejections([]);
    cancelRef.current = false;

    const tagList = tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    let succeeded = 0;
    let cancelled = false;

    for (const item of items) {
      if (cancelRef.current) {
        cancelled = true;
        break;
      }

      patch(item.key, { status: "uploading", progress: 0, error: null });

      const form = new FormData();
      form.set("file", item.file, item.file.name);
      form.set("title", item.title.trim() || titleFromFilename(item.file.name));
      if (item.memberId) form.set("familyMemberId", item.memberId);
      if (tagList.length > 0) form.set("tags", tagList.join(","));

      try {
        const result = await sendForm(form, (percent, phase) => {
          patch(item.key, { progress: percent, status: phase });
        });

        patch(item.key, {
          status: "done",
          progress: 100,
          document: result.document,
          warnings: result.warnings,
        });
        succeeded += 1;
      } catch (error) {
        if (unmounted.current) return;
        const message = error instanceof ApiError ? error.message : "The upload failed unexpectedly.";
        patch(item.key, { status: "error", error: message });
      }
    }

    setBusy(false);
    activeRequest.current = null;

    if (unmounted.current || cancelled) return;

    // The nav badge and dashboard counts changed on the server.
    router.refresh();

    if (succeeded === items.length) {
      toast.success(`Uploaded ${succeeded} ${succeeded === 1 ? "document" : "documents"}`);
    } else if (succeeded > 0) {
      toast.warning(`Uploaded ${succeeded} of ${items.length}. The rest failed and can be retried.`);
    } else {
      toast.error("None of the uploads succeeded. Check the messages below and try again.");
    }
  }

  function uploadAll() {
    void uploadItems(queue.filter((item) => item.status !== "done"));
  }

  function retryOne(item: QueueItem) {
    void uploadItems([item]);
  }

  function cancelUploads() {
    cancelRef.current = true;
    activeRequest.current?.abort();
  }

  function sendForm(
    form: FormData,
    onProgress: (percent: number, phase: Status) => void,
  ): Promise<UploadResponse> {
    return new Promise((resolve, rejectPromise) => {
      const xhr = new XMLHttpRequest();
      activeRequest.current = xhr;

      xhr.open("POST", "/api/documents");
      xhr.responseType = "json";
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100), "uploading");
        }
      };

      xhr.onload = () => {
        const body = xhr.response as { data?: UploadResponse; error?: { message?: string } } | null;

        if (xhr.status >= 200 && xhr.status < 300 && body?.data) {
          // Bytes are up; the server is now running OCR and classification.
          onProgress(100, "analysing");
          resolve(body.data);
          return;
        }

        rejectPromise(
          new ApiError(body?.error?.message ?? `The server rejected the upload (${xhr.status})`, xhr.status),
        );
      };

      xhr.onerror = () =>
        rejectPromise(new ApiError("Cannot reach the server. Check your connection and try again.", 0));
      xhr.onabort = () => rejectPromise(new ApiError("The upload was cancelled.", 0));

      xhr.send(form);
    });
  }

  const doneCount = queue.filter((item) => item.status === "done").length;
  const failedCount = queue.filter((item) => item.status === "error").length;
  const pendingCount = queue.length - doneCount;
  const allDone = queue.length > 0 && pendingCount === 0;

  return (
    <div className="space-y-4">
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (!busy && event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
        }}
        className={
          "rounded-card border-2 border-dashed p-6 text-center transition-colors sm:p-10 " +
          (dragging
            ? "border-brand-500 bg-brand-50"
            : "border-ink-300 bg-surface hover:border-brand-400 hover:bg-ink-50/60")
        }
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          disabled={busy}
          onChange={(event) => event.target.files && addFiles(event.target.files)}
          className="sr-only"
          id="document-files"
        />

        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-brand-50 text-accent ring-1 ring-brand-100">
          <CloudUpload className="size-7" aria-hidden="true" />
        </span>

        <h2 className="mt-4 text-base font-semibold text-ink-900">
          {dragging ? "Drop to add to the queue" : "Drag documents here"}
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink-500">
          Photos and scans of CNICs, passports, certificates, bills and reports, or a PDF. Up to{" "}
          {maxUploadMb} MB each. Drop files here, or paste a screenshot with Ctrl+V.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <label
            htmlFor="document-files"
            aria-disabled={busy || undefined}
            className={buttonClass(
              "primary",
              "md",
              busy ? "pointer-events-none opacity-55" : "cursor-pointer",
            )}
          >
            <Plus className="size-4" aria-hidden="true" />
            Choose files
          </label>
        </div>

        <p className="mt-3 text-xs text-ink-400">
          Accepted: {extensions.map((ext) => ext.toUpperCase()).join(", ")}
        </p>
      </div>

      {rejections.length > 0 ? (
        <Alert
          tone="warning"
          title={`${rejections.length} ${rejections.length === 1 ? "file was" : "files were"} not added`}
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => setRejections([])}>
              Dismiss
            </Button>
          }
        >
          <ul className="list-disc space-y-1 pl-4">
            {rejections.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {queue.length > 0 ? (
        <div className="rounded-card border border-ink-200/80 bg-surface shadow-card">
          <div className="flex flex-col gap-3 border-b border-ink-100 px-4 py-3.5 sm:flex-row sm:items-end sm:px-5">
            <div className="sm:w-56">
              <Select
                label="File under"
                value={memberId}
                disabled={busy}
                onChange={(event) => {
                  setMemberId(event.target.value);
                  // Applies to everything still waiting, not to finished uploads.
                  setQueue((current) =>
                    current.map((item) =>
                      item.status === "done" ? item : { ...item, memberId: event.target.value },
                    ),
                  );
                }}
                placeholder="No one in particular"
                options={members.map((member) => ({
                  value: member.id,
                  label: `${member.name} · ${member.relation}`,
                }))}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Tags"
                value={tags}
                disabled={busy}
                onChange={(event) => setTags(event.target.value)}
                placeholder="school, 2026, renewed"
                hint="Comma separated, applied to every file in this batch"
              />
            </div>
          </div>

          <ul className="divide-y divide-ink-100">
            {queue.map((item) => (
              <UploadRow
                key={item.key}
                item={item}
                busy={busy}
                members={members}
                onTitle={(title) => patch(item.key, { title })}
                onMember={(value) => patch(item.key, { memberId: value })}
                onRetry={() => retryOne(item)}
                onRemove={() =>
                  setQueue((current) => current.filter((entry) => entry.key !== item.key))
                }
              />
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/60 px-4 py-3 sm:px-5">
            <p className="text-sm text-ink-500" role="status" aria-live="polite">
              {busy
                ? `Working through ${pendingCount} ${pendingCount === 1 ? "file" : "files"}…`
                : failedCount > 0
                  ? `${failedCount} failed — press Upload again to retry${
                      pendingCount > failedCount ? `, ${pendingCount - failedCount} waiting` : ""
                    }`
                  : allDone
                    ? `${doneCount} uploaded`
                    : `${pendingCount} ready to upload`}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              {busy ? (
                <Button type="button" variant="secondary" size="sm" onClick={cancelUploads}>
                  Cancel
                </Button>
              ) : null}

              {!busy && !allDone ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setQueue([])}>
                  Clear queue
                </Button>
              ) : null}

              {allDone ? (
                <>
                  <LinkButton href="/documents" variant="secondary" size="sm">
                    Go to documents
                  </LinkButton>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setQueue([]);
                      setTags("");
                    }}
                    icon={<Upload className="size-4" aria-hidden="true" />}
                  >
                    Upload more
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={uploadAll}
                  loading={busy}
                  disabled={pendingCount === 0}
                  icon={<Upload className="size-4" aria-hidden="true" />}
                >
                  {busy ? "Uploading…" : `Upload ${pendingCount} ${pendingCount === 1 ? "file" : "files"}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UploadRow({
  item,
  busy,
  members,
  onTitle,
  onMember,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  busy: boolean;
  members: { id: string; name: string; relation: string }[];
  onTitle: (title: string) => void;
  onMember: (memberId: string) => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const editable = item.status === "queued" && !busy;
  const doc = item.document;

  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        {doc ? (
          <CategoryTile category={doc.category} />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
            <FileText className="size-4.5" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          {doc ? (
            <div className="space-y-1">
              <Link
                href={`/documents/${doc.id}`}
                className="group inline-flex max-w-full items-center gap-1.5"
              >
                <span className="truncate text-sm font-medium text-ink-900 group-hover:text-accent-strong">
                  {doc.title}
                </span>
                <ArrowRight
                  className="size-3.5 shrink-0 text-ink-400 group-hover:text-accent"
                  aria-hidden="true"
                />
              </Link>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-500">{doc.docTypeLabel}</span>
                <ExpiryBadge expiry={doc.expiry} daysToExpiry={doc.daysToExpiry} />
                {doc.summary ? (
                  <span className="text-xs text-ink-400">· summarised</span>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              <Input
                value={item.title}
                disabled={!editable}
                onChange={(event) => onTitle(event.target.value)}
                aria-label={`Title for ${item.file.name}`}
                className="h-9"
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                <span className="font-medium text-ink-700">{item.file.name}</span>
                <span>{formatBytes(item.file.size)}</span>
                {members.length > 0 ? (
                  <Select
                    value={item.memberId}
                    disabled={!editable}
                    onChange={(event) => onMember(event.target.value)}
                    aria-label={`File ${item.file.name} under`}
                    placeholder="Unfiled"
                    options={members.map((member) => ({ value: member.id, label: member.name }))}
                    className="h-8 w-auto text-xs"
                  />
                ) : null}
              </div>
            </>
          )}

          {item.status === "uploading" || item.status === "analysing" ? (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div
                  className={
                    item.status === "analysing"
                      ? "h-full w-full animate-pulse rounded-full bg-brand-500"
                      : "h-full rounded-full bg-brand-600 transition-[width] duration-200"
                  }
                  style={item.status === "uploading" ? { width: `${item.progress}%` } : undefined}
                />
              </div>
              <p className="text-xs text-ink-500">
                {item.status === "analysing"
                  ? "Uploaded — reading the text and working out what it is…"
                  : `Uploading… ${item.progress}%`}
              </p>
            </div>
          ) : null}

          {item.status === "error" ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-red-700" role="alert">
              <OctagonX className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {item.error}
            </p>
          ) : null}

          {item.warnings.length > 0 ? (
            <ul className="space-y-1">
              {item.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-1.5 text-xs text-amber-800">
                  <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {item.status === "done" ? (
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CircleCheck className="size-4" aria-hidden="true" />
              <span className="sr-only">Uploaded</span>
            </span>
          ) : null}
          {!busy && item.status === "error" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRetry}
              icon={<RotateCcw className="size-3.5" aria-hidden="true" />}
            >
              Retry
            </Button>
          ) : null}
          {!busy && item.status !== "done" ? (
            <IconButton label={`Remove ${item.file.name}`} onClick={onRemove}>
              <Trash2 className="size-4" aria-hidden="true" />
            </IconButton>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Client-side pre-check so obvious mistakes are caught before bytes move. */
function reviewFile(
  file: File,
  extensions: string[],
  maxBytes: number,
  maxUploadMb: number,
): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;

  if (file.size > maxBytes) {
    return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${maxUploadMb} MB.`;
  }

  const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!extensions.includes(extension)) {
    return `"${file.name}" is not a supported format. Upload a photo, a scan or a PDF.`;
  }

  return null;
}
