"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, LockKeyholeOpen, Plus, ShieldCheck, Trash2 } from "lucide-react";

import { formatBytes, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  deletePrivateDocument,
  listPrivateDocuments,
  openPrivateDocument,
  sealFile,
  syncPrivateDocument,
  type PrivateDocumentListing,
} from "@/lib/vault/private-documents";

/**
 * The files inside the private vault. Every row here is an object the server
 * holds in scrambled form: the name, the size and the date shown to the user are
 * read from *this device's* copy, because the account only knows opaque ids.
 */
export function PrivateFiles({ unlocked }: { unlocked: boolean }) {
  const [items, setItems] = useState<PrivateDocumentListing[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await listPrivateDocuments());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The private list could not be loaded.");
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      let items: PrivateDocumentListing[] | null = null;
      try {
        items = await listPrivateDocuments();
      } catch {
        items = null;
      }
      if (!active) return;
      if (items) setItems(items);
      else setMessage("The private list could not be loaded.");
    };

    void load();
    return () => {
      active = false;
    };
  }, [unlocked]);

  const add = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const record = await sealFile(file);
      try {
        await syncPrivateDocument(record);
        setMessage(null);
      } catch {
        // Encrypted and readable here; the account copy failed, so it is not on other devices yet.
        setMessage(`"${file.name}" is saved on this device but could not be sent to your account.`);
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That file could not be protected.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const open = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const { bytes, meta } = await openPrivateDocument(id);
      saveLocally(bytes, meta.name, meta.mimeType);
    } catch {
      setMessage("This document could not be opened. The copy may have been changed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await deletePrivateDocument(id);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That document could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          aria-label="Choose a file to keep private"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void add(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => input.current?.click()}
          disabled={!unlocked || busy}
          icon={<Plus className="size-4" aria-hidden="true" />}
        >
          Keep a file private
        </Button>
        {!unlocked ? (
          <span className="text-xs text-ink-500">Unlock the vault to add or open files.</span>
        ) : null}
      </div>

      {message ? <Alert tone="warning">{message}</Alert> : null}

      {items.length === 0 ? (
        <p className="text-sm text-ink-500">
          Nothing is kept private yet. Files you add here are scrambled on this device before they are
          stored, so this server keeps them without being able to read them.
        </p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">
                  {item.meta?.name ?? "Private document"}
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {formatDateTime(item.updatedAt)}
                  {item.sizeBytes !== undefined ? ` · ${formatBytes(item.sizeBytes)}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {item.onAccount ? (
                  <Badge tone="success" icon={<ShieldCheck className="size-3" aria-hidden="true" />}>
                    In your account
                  </Badge>
                ) : (
                  <Badge tone="warning">This device only</Badge>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void open(item.id)}
                  disabled={!unlocked || busy}
                  icon={<Download className="size-4" aria-hidden="true" />}
                >
                  Open
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(item.id)}
                  disabled={busy}
                  icon={<Trash2 className="size-4" aria-hidden="true" />}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 ? (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-500">
          <LockKeyholeOpen className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Only this device can show you these names. Your account stores each file as an unreadable
          block with no name attached to it.
        </p>
      ) : null}
    </div>
  );
}

/** Renders the decrypted bytes as a download and forgets them straight away. */
function saveLocally(bytes: Uint8Array, name: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name || "document";
  link.click();
  URL.revokeObjectURL(url);
}
