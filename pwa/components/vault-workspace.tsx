"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CATEGORIES, CATEGORY_KEYS, type CategoryKey } from "@shared/constants";
import {
  exportVaultText,
  listVaultDocuments,
  openVaultDocument,
  removeVaultDocument,
  sealDocumentFile,
  updateVaultDocumentDetails,
  type NewDocumentDetails,
  type VaultDocumentDetailsPatch,
  type VaultDocumentSummary,
} from "@vault/documents";
import { describeVaultFailure } from "@vault/errors";
import { WARNING_DAYS } from "@vault/reminders";
import { estimateStorage } from "@vault/store";
import { DocumentDetails } from "./document-details";
import { ExpiryAlerts } from "./expiry-alerts";
import { ImageReader } from "./image-reader";

type Notice = { tone: "ok" | "warn" | "bad"; text: string };

/**
 * The open vault: add documents, read them back, remove them, take a backup.
 *
 * Titles, categories and dates are decrypted here, in this tab, only while the
 * vault is open. The stored form is ciphertext, so the list renders names from
 * the local copy and never from anywhere else — there is nowhere else.
 */
export function VaultWorkspace() {
  const [items, setItems] = useState<VaultDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"add" | "open" | "delete" | "export" | "edit" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number } | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CategoryKey>("other");
  const [expiryDate, setExpiryDate] = useState("");
  const [reading, setReading] = useState<NewDocumentDetails | null>(null);
  const [expiryConfirmed, setExpiryConfirmed] = useState(false);
  const [person, setPerson] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryKey | "all">("all");

  const refresh = useCallback(async () => {
    setItems(await listVaultDocuments());
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await listVaultDocuments();
        if (active) setItems(rows);
      } catch (error) {
        if (active) setNotice({ tone: "bad", text: describeVaultFailure(error) });
      } finally {
        if (active) setLoading(false);
      }
      const estimate = await estimateStorage();
      if (active) setStorage(estimate);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

  async function add() {
    if (!file) return;
    setBusy("add");
    setNotice(null);
    try {
      await sealDocumentFile(file, {
        title,
        category,
        expiryDate: expiryDate || null,
        person,
        expiryReview: { source: reading?.expiryReview?.source ?? "manual", confirmed: expiryConfirmed, evidence: reading?.expiryReview?.evidence },
        recognition: reading?.recognition,
      });
      setTitle("");
      setExpiryDate("");
      setReading(null);
      setExpiryConfirmed(false);
      setPerson("");
      setCategory("other");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
      setNotice({ tone: "ok", text: "Saved in your vault." });
    } catch (error) {
      setNotice({ tone: "bad", text: describeVaultFailure(error) });
    } finally {
      setBusy(null);
    }
  }

  async function open(id: string) {
    setBusy("open");
    setNotice(null);
    try {
      const { bytes, meta } = await openVaultDocument(id);
      downloadBytes(bytes, meta.name, meta.mimeType);
      setNotice({ tone: "ok", text: `Saved a copy of “${meta.name}” to your downloads.` });
    } catch (error) {
      setNotice({ tone: "bad", text: describeVaultFailure(error) });
    } finally {
      setBusy(null);
    }
  }

  function askToRemove(id: string) {
    setConfirmingId(id);
    // Drop back to the safe state if the user walks away mid-decision.
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmingId(null), 6000);
  }

  async function remove(id: string) {
    setBusy("delete");
    setNotice(null);
    try {
      await removeVaultDocument(id);
      setConfirmingId(null);
      await refresh();
      setNotice({ tone: "ok", text: "Removed from this device." });
    } catch (error) {
      setNotice({ tone: "bad", text: describeVaultFailure(error) });
    } finally {
      setBusy(null);
    }
  }

  async function saveDetails(details: VaultDocumentDetailsPatch) {
    if (!selectedId) return;
    setBusy("edit");
    setNotice(null);
    try {
      await updateVaultDocumentDetails(selectedId, details);
      await refresh();
      setSelectedId(null);
      setNotice({ tone: "ok", text: "Details saved. Your original file is unchanged." });
    } catch (error) {
      setNotice({ tone: "bad", text: describeVaultFailure(error) });
    } finally {
      setBusy(null);
    }
  }

  async function backup() {
    setBusy("export");
    setNotice(null);
    try {
      const text = await exportVaultText();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(text, `familyvault-${stamp}.fvault`, "application/json");
      setNotice({
        tone: "ok",
        text: "Backup saved. Open it with your passphrase OR your recovery file. Protect the recovery file separately: anyone with it and the backup can open your documents.",
      });
    } catch (error) {
      setNotice({ tone: "bad", text: describeVaultFailure(error) });
    } finally {
      setBusy(null);
    }
  }

  const filtered = items.filter((item) => {
    if (categoryFilter !== "all" && item.meta?.category !== categoryFilter) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      (item.meta?.name ?? "").toLowerCase().includes(needle) ||
      (item.meta?.person ?? "").toLowerCase().includes(needle)
    );
  });

  const selected = items.find((item) => item.id === selectedId);

  return (
    <>
      {selected?.meta ? <DocumentDetails key={selected.id} meta={selected.meta} busy={busy !== null} onSave={saveDetails} onClose={() => setSelectedId(null)} /> : null}
      <ExpiryAlerts documents={items} onReview={setSelectedId} />
      <section className="card">
        <h2>Add a document</h2>
        <p className="muted">
          Choose a file, give it a name you will recognise, and it is scrambled here before it is
          saved.
        </p>
        <div className="grid-2">
          <label className="field">
            <span>
              File <span className="hint">photo or PDF</span>
            </span>
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                setFile(picked);
                setReading(null);
                setExpiryDate("");
                setExpiryConfirmed(false);
                if (picked && !title) setTitle(picked.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              placeholder="e.g. Abba's CNIC"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="field">
            <span>What kind of document?</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as CategoryKey)}>
              {CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {CATEGORIES[key].label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Expiry date <span className="hint">if it has one</span>
            </span>
            <input type="date" value={expiryDate} onChange={(event) => {
              setExpiryDate(event.target.value);
              setExpiryConfirmed(false);
              setReading((value) => value ? { ...value, expiryReview: { source: "manual", confirmed: false } } : null);
            }} />
          </label>
          <label className="field">
            <span>
              Whose document is it? <span className="hint">optional</span>
            </span>
            <input
              type="text"
              value={person}
              placeholder="e.g. Nani"
              onChange={(event) => setPerson(event.target.value)}
            />
          </label>
        </div>
        {expiryDate ? <label className="field"><span><input type="checkbox" checked={expiryConfirmed} onChange={(event) => setExpiryConfirmed(event.target.checked)} /> I checked this expiry date against the original.</span></label> : null}
        {expiryDate && !expiryConfirmed ? <p className="notice notice-warn">This date will need confirmation before any expiry reminders.</p> : null}
        {file?.type.startsWith("image/") ? <ImageReader key={`${file.name}-${file.lastModified}`} file={file} onApply={(details) => {
          setReading(details);
          setCategory(details.category);
          setExpiryDate(details.expiryDate ?? "");
          setExpiryConfirmed(false);
        }} /> : null}
        <div className="actions">
          <button type="button" className="btn btn-primary" disabled={busy !== null || !file} onClick={() => void add()}>
            {busy === "add" ? "Scrambling and saving…" : "Save it in my vault"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Your documents</h2>

        {notice ? (
          <p className={`notice notice-${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>
            {notice.text}
          </p>
        ) : null}

        {items.length > 0 ? (
          <div className="grid-2">
            <label className="field">
              <span>Search by name</span>
              <input
                type="search"
                value={query}
                placeholder="e.g. passport"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Filter by kind</span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as CategoryKey | "all")}
              >
                <option value="all">All kinds</option>
                {CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {CATEGORIES[key].label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {loading ? (
          <p className="muted">Opening your documents…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            Nothing here yet. Add your first document above — it stays on this device, scrambled.
          </p>
        ) : filtered.length === 0 ? (
          <p className="muted">Nothing matches that search.</p>
        ) : (
          <ul className="list">
            {filtered.map((item) => (
              <li className="row" key={item.id}>
                <div className="row-main">
                  <p className="row-title">{item.meta?.name ?? "Saved document"}</p>
                  <p className="row-meta">{describeRow(item)}</p>
                </div>
                <div className="row-actions">
                  <div className="chips">
                    {item.unreadable ? <span className="chip chip-bad">Could not be read</span> : null}
                    {item.meta ? <ExpiryChip date={item.meta.expiryDate} confirmed={item.meta.expiryReview?.confirmed === true} /> : null}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy !== null}
                    onClick={() => void open(item.id)}
                  >
                    Save a copy
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== null || !item.meta} onClick={() => setSelectedId(item.id)}>Review details</button>
                  {confirmingId === item.id ? (
                    <span className="confirm">
                      <span>Remove for good?</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy !== null}
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busy !== null}
                        onClick={() => void remove(item.id)}
                      >
                        {busy === "delete" ? "Removing…" : "Remove"}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy !== null}
                      onClick={() => askToRemove(item.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Backup</h2>
        <p className="muted">
          One file holding everything, already scrambled. Without your passphrase or your recovery
          file it cannot be opened by anyone — including you.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy !== null}
            onClick={() => void backup()}
          >
            {busy === "export" ? "Preparing the backup…" : "Save a backup file"}
          </button>
        </div>
        {storage?.usage !== undefined && storage?.quota !== undefined ? (
          <p className="small muted">
            Using {formatBytes(storage.usage)} of the {formatBytes(storage.quota)} this browser
            offers. Back up regularly: clearing your browser data would erase this vault.
          </p>
        ) : (
          <p className="small muted">
            Back up regularly. Clearing your browser data would erase this vault.
          </p>
        )}
      </section>
    </>
  );
}

function describeRow(item: VaultDocumentSummary): string {
  const parts: string[] = [];
  if (item.meta) {
    parts.push(CATEGORIES[item.meta.category]?.label ?? "Other");
    if (item.meta.person) parts.push(item.meta.person);
    if (item.meta.sizeBytes > 0) parts.push(formatBytes(item.meta.sizeBytes));
  }
  parts.push(`added ${formatDate(item.createdAt)}`);
  return parts.join(" · ");
}

function ExpiryChip({ date, confirmed }: { date: string | null; confirmed: boolean }) {
  if (!date) return null;
  const days = daysUntil(date);
  if (days === null) return null;
  const check = confirmed ? "" : " · check date";
  if (days < 0) return <span className="chip chip-bad">Expired {formatDate(date)}{check}</span>;
  if (days === 0) return <span className="chip chip-warn">Expires today{check}</span>;
  if (days <= WARNING_DAYS) return <span className="chip chip-warn">Expires in {days} days{check}</span>;
  return <span className="chip">Expires {formatDate(date)}{check}</span>;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
}

/** Whole days from today; negative means already past. */
function daysUntil(value: string): number | null {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(target);
  start.setHours(0, 0, 0, 0);
  return Math.round((start.getTime() - today.getTime()) / 86_400_000);
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Renders decrypted bytes as a download and forgets them straight away. */
function downloadBytes(bytes: Uint8Array<ArrayBuffer>, name: string, mimeType: string): void {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name || "document";
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(text: string, name: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
