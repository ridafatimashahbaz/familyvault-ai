/**
 * Vault client API (Phase 1, Day 2 Stage A/B).
 *
 * Thin, browser-only wrappers around the vault routes. Two rules hold here:
 *
 * 1. Identity is never sent. The session cookie is the only credential, so the
 *    server — not the caller — decides whose vault is read or written.
 * 2. Nothing is trusted. Every response body goes through `contract.ts` before
 *    the caller sees it, so a server (or a proxy) that returns something else is
 *    a hard error rather than data that reaches Web Crypto.
 */

import { apiFetch } from "@/lib/client-api";
import {
  parseDocumentRecord,
  parseMaterialEnvelope,
  parseVaultInventory,
  parseVaultMaterial,
  type VaultInventoryEntry,
} from "./contract";
import type { DocumentRecord, VaultMaterial } from "@vault/types";

const OPAQUE_ID = /^[A-Za-z0-9_-]{16,64}$/;

function documentUrl(id: string): string {
  if (!OPAQUE_ID.test(id)) {
    throw new Error("Refusing to request a vault document with a non-opaque id");
  }
  return `/api/vault/documents/${id}`;
}

export async function fetchVaultMaterial(): Promise<VaultMaterial | null> {
  const data = await apiFetch<{ material: unknown }>("/api/vault/material");
  return parseMaterialEnvelope(data.material);
}

/** Uploads wrapped material only. The passphrase and the vault key are never arguments here. */
export async function uploadVaultMaterial(material: VaultMaterial): Promise<VaultMaterial> {
  const payload = parseVaultMaterial(material);
  const data = await apiFetch<{ material: unknown }>("/api/vault/material", {
    method: "PUT",
    body: { material: payload },
  });
  return parseMaterialEnvelope(data.material) ?? payload;
}

export async function listVaultDocuments(): Promise<VaultInventoryEntry[]> {
  const data = await apiFetch<{ items: unknown }>("/api/vault/documents");
  return parseVaultInventory(data.items);
}

export async function fetchVaultDocument(id: string): Promise<DocumentRecord> {
  const data = await apiFetch<{ record: unknown }>(documentUrl(id));
  return parseDocumentRecord(data.record);
}

export async function storeVaultDocument(
  record: DocumentRecord,
): Promise<{ id: string; sizeBytes: number }> {
  const payload = parseDocumentRecord(record);
  return apiFetch<{ id: string; sizeBytes: number }>(documentUrl(payload.id), {
    method: "PUT",
    body: { record: payload },
  });
}

export async function removeVaultDocument(id: string): Promise<void> {
  await apiFetch<{ deleted: string }>(documentUrl(id), { method: "DELETE" });
}
