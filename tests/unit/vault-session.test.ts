/**
 * Client vault lifecycle (Phase 1, Day 2 Stage D).
 *
 * These run the *real* browser modules — `session.ts`, `private-documents.ts`,
 * `client.ts`, `contract.ts`, the P3/P4 crypto and the IndexedDB store — against
 * a fake HTTP server and a fake IndexedDB, and they assert the security claims
 * themselves rather than trusting the wording of the code:
 *
 *  - the passphrase and any usable key never leave the tab;
 *  - what reaches the account is wrapped blobs and ciphertext only;
 *  - a wrong passphrase fails closed and leaves the vault locked;
 *  - a second device opens the same documents with the same passphrase;
 *  - a device that cannot check the account never overwrites it;
 *  - an untrusted server response is refused before it reaches Web Crypto.
 *
 * No database, no network and no real browser profile are touched.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { b64decodeStrict, b64encode, utf8 } from "@vault/crypto";
import { isVaultCryptoError } from "@vault/errors";
import { openVaultStore } from "@vault/store";
import type { DocumentRecord, VaultMaterial } from "@vault/types";

import { fetchVaultDocument, fetchVaultMaterial, listVaultDocuments } from "@/lib/vault/client";
import {
  deletePrivateDocument,
  listPrivateDocuments,
  openPrivateDocument,
  sealBytes,
  sealFile,
  syncPrivateDocument,
  type PrivateDocumentListing,
} from "@/lib/vault/private-documents";
import {
  getVaultState,
  inspectVault,
  isVaultUnlocked,
  lockVault,
  requireVaultKey,
  resetVaultSession,
  setupVault,
  unlockVault,
} from "@/lib/vault/session";

const PASSPHRASE = "correct horse battery staple";
const OTHER_PASSPHRASE = "a completely different vault";
const PLAINTEXT = utf8("Nani's passport number AA1234567 — secret content");
const MATERIAL = "/api/vault/material";
const DOCS = "/api/vault/documents";

// --- fake account (HTTP) ----------------------------------------------------

type ServedDocument = { record: DocumentRecord; bytes: number; updatedAt: string };

type FakeAccount = {
  material: VaultMaterial | null;
  docs: Map<string, ServedDocument>;
  materialWrites: number;
  documentWrites: number;
  bodies: { method: string; path: string; body: string }[];
  /** True while the account behaves like an unreachable server. */
  offline: boolean;
  /** True while the account lies in its inventory response. */
  inventNames: boolean;
};

let account: FakeAccount;

function resetAccount(): void {
  account = {
    material: null,
    docs: new Map(),
    materialWrites: 0,
    documentWrites: 0,
    bodies: [],
    offline: false,
    inventNames: false,
  };
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ok = (data: unknown) => json(200, { data });
const err = (status: number, message: string) => json(status, { error: { message } });

installFetchStub();

function installFetchStub(): void {
  resetAccount();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const raw =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const path = new URL(raw, "http://localhost").pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    account.bodies.push({ method, path, body });

    if (account.offline) throw new TypeError("Failed to fetch");

    if (path === MATERIAL) {
      if (method === "GET") return ok({ material: account.material });
      const payload = JSON.parse(body) as { material: VaultMaterial };
      account.material = payload.material;
      account.materialWrites += 1;
      return ok({ material: payload.material });
    }

    if (path === DOCS) {
      const items = [...account.docs.values()].map((entry) => ({
        id: entry.record.id,
        sizeBytes: entry.bytes,
        updatedAt: entry.updatedAt,
      }));
      // A lying server that attaches a file name to an inventory row.
      if (account.inventNames && items.length > 0) {
        (items[0] as Record<string, unknown>).name = "nani-passport.pdf";
      }
      return ok({ items });
    }

    if (path.startsWith(`${DOCS}/`)) {
      const id = path.slice(DOCS.length + 1);
      if (method === "PUT") {
        const payload = JSON.parse(body) as { record: DocumentRecord };
        if (payload.record.id !== id) return err(422, "Document id does not match the saved record");
        account.docs.set(id, {
          record: payload.record,
          bytes: body.length,
          updatedAt: payload.record.updatedAt,
        });
        account.documentWrites += 1;
        return ok({ id, sizeBytes: body.length });
      }
      const served = account.docs.get(id);
      if (method === "GET") {
        return served ? ok({ record: served.record }) : err(404, "Not found");
      }
      if (method === "DELETE") {
        if (!served) return err(404, "Not found");
        account.docs.delete(id);
        return ok({ deleted: id });
      }
    }

    return err(404, "No such endpoint");
  }) as unknown as typeof fetch;
}

function requests(method: string, pathPrefix: string): number {
  return account.bodies.filter((r) => r.method === method && r.path.startsWith(pathPrefix)).length;
}

/** The body of the most recent request to `path`, parsed. */
function lastBody(method: string, path: string): Record<string, unknown> {
  const found = [...account.bodies].reverse().find((r) => r.method === method && r.path === path);
  assert.ok(found, `no ${method} request to ${path} was made`);
  return JSON.parse(found.body) as Record<string, unknown>;
}

// --- fake device (IndexedDB) ------------------------------------------------

let factory: IDBFactory;

/** Simulates a fresh browser profile: empty device storage, same account. */
function newDevice(): void {
  factory = new IDBFactory();
  globalThis.indexedDB = factory;
  resetVaultSession();
}

async function deviceCopy(): Promise<{ material: VaultMaterial | null; docs: DocumentRecord[] }> {
  const store = await openVaultStore({ factory });
  try {
    return { material: await store.getMaterial(), docs: await store.listDocuments() };
  } finally {
    store.close();
  }
}

async function ensureUnlocked(): Promise<void> {
  if (!isVaultUnlocked()) await unlockVault(PASSPHRASE);
}

function assertLocked(message: RegExp): void {
  assert.equal(isVaultUnlocked(), false);
  assert.throws(() => requireVaultKey(), message);
}

const META = {
  name: "nani-passport.pdf",
  mimeType: "application/pdf",
  sizeBytes: PLAINTEXT.length,
  label: "Nani's passport",
};

// --- state carried between groups ------------------------------------------

let deviceAMaterial: VaultMaterial | null = null;
let sealedA: DocumentRecord | null = null;

// --- 1. create, unlock, lock ------------------------------------------------

describe("vault lifecycle on the first device", () => {
  test("nothing on the device or in the account means there is no vault yet", async () => {
    newDevice();
    const state = await inspectVault();
    assert.equal(state.phase, "no-vault");
    assert.equal(state.synced, false);
    assertLocked(/Unlock your private vault first/);
    await assert.rejects(sealBytes(PLAINTEXT, META), /Unlock your private vault first/);
  });

  test("creating a vault sends wrapped blobs only — never the passphrase or a usable key", async () => {
    newDevice();
    await inspectVault();

    const created = await setupVault(PASSPHRASE);

    assert.equal(getVaultState().phase, "unlocked");
    assert.equal(getVaultState().synced, true);
    assert.equal(account.materialWrites, 1);
    assert.equal(isVaultUnlocked(), true);

    const sent = lastBody("PUT", MATERIAL);
    assert.deepEqual(Object.keys(sent), ["material"]);
    const material = sent.material as Record<string, unknown>;
    assert.deepEqual(Object.keys(material).sort(), [
      "createdAt",
      "kdf",
      "wrappedByPassphrase",
      "wrappedByRecoveryKey",
    ]);

    const wire = JSON.stringify(sent);
    assert.ok(!wire.includes(PASSPHRASE), "the passphrase must never be transmitted");
    assert.ok(
      !wire.includes(created.kit.recoveryKey),
      "the raw recovery key must never be transmitted",
    );

    // Wrapped VK: 32 key bytes + the 16-byte GCM tag, and purpose-bound.
    const wrappedPass = material.wrappedByPassphrase as { purpose: string; ct: string };
    const wrappedRec = material.wrappedByRecoveryKey as { purpose: string; ct: string };
    assert.equal(wrappedPass.purpose, "vk:passphrase");
    assert.equal(wrappedRec.purpose, "vk:recovery");
    assert.equal(b64decodeStrict(wrappedPass.ct).length, 48);
    assert.equal(b64decodeStrict(wrappedRec.ct).length, 48);

    const local = await deviceCopy();
    assert.ok(local.material);
    deviceAMaterial = local.material;
    assert.deepEqual(account.material, local.material);
    assert.equal(local.docs.length, 0);
  });

  test("a wrong passphrase fails closed and changes nothing", async () => {
    await ensureUnlocked();
    lockVault();
    assert.equal(getVaultState().phase, "locked");

    const writesBefore = account.materialWrites;
    const materialBefore = JSON.stringify(account.material);

    await assert.rejects(unlockVault("wrong passphrase entirely"), /did not open the vault/);
    assert.equal(getVaultState().phase, "locked");
    assertLocked(/Unlock your private vault first/);
    assert.equal(account.materialWrites, writesBefore);
    assert.equal(JSON.stringify(account.material), materialBefore);
  });

  test("the right passphrase opens it again without re-uploading", async () => {
    const writesBefore = account.materialWrites;
    await unlockVault(PASSPHRASE);
    assert.equal(getVaultState().phase, "unlocked");
    assert.equal(getVaultState().synced, true);
    assert.equal(isVaultUnlocked(), true);
    assert.equal(account.materialWrites, writesBefore);
  });

  test("a device with an empty disk cannot create a second vault over the account's", async () => {
    const materialBefore = JSON.stringify(account.material);
    newDevice();
    await inspectVault();

    await assert.rejects(setupVault(OTHER_PASSPHRASE), /already has a private vault/);
    assert.equal(JSON.stringify(account.material), materialBefore);
    assert.equal(account.materialWrites, 1);
    // The guard runs before any key is derived: this device holds only the
    // account's own wrapped material, adopted a moment ago, and no new vault.
    assert.deepEqual((await deviceCopy()).material, JSON.parse(materialBefore));
  });
});

// --- 2. seal, sync, open ----------------------------------------------------

describe("private documents on the first device", () => {
  beforeEach(ensureUnlocked);

  test("the same bytes sealed twice never produce the same ciphertext", async () => {
    const a = await sealBytes(PLAINTEXT, META);
    const b = await sealBytes(PLAINTEXT, META);
    sealedA = a;

    assert.notEqual(a.id, b.id);
    assert.notEqual(a.content.ct, b.content.ct);
    assert.notEqual(a.content.iv, b.content.iv);
    assert.notEqual(a.wrappedDek.ct, b.wrappedDek.ct);
    assert.notEqual(a.metadata.ct, b.metadata.ct);

    assert.equal((await syncPrivateDocument(a)).id, a.id);
    assert.equal((await syncPrivateDocument(b)).id, b.id);
    assert.equal(account.documentWrites, 2);
  });

  test("the account stores ciphertext, opaque ids and byte counts only", async () => {
    assert.ok(sealedA, "the previous test sealed the document");
    const served = account.docs.get(sealedA.id);
    assert.ok(served);

    // The server is storage: it holds the browser's bytes unchanged.
    assert.deepEqual(served.record.content, sealedA.content);
    assert.deepEqual(served.record.wrappedDek, sealedA.wrappedDek);
    assert.deepEqual(served.record.metadata, sealedA.metadata);

    const wire = JSON.stringify(served.record);
    assert.ok(!wire.includes("passport"), "a file name must not reach the account");
    assert.ok(!wire.includes("Nani"), "a label must not reach the account");
    assert.ok(!wire.includes("application/pdf"), "the type must not reach the account");
    assert.ok(!wire.includes(b64encode(PLAINTEXT)), "the plaintext must not reach the account");
    assert.ok(!wire.includes(PASSPHRASE));

    assert.equal(served.record.content.purpose, "content");
    assert.equal(served.record.wrappedDek.purpose, "dek");
    assert.equal(served.record.metadata.purpose, "meta");

    const inventory = await listVaultDocuments();
    const entry = inventory.find((item) => item.id === sealedA?.id);
    assert.ok(entry);
    assert.deepEqual(Object.keys(entry).sort(), ["id", "sizeBytes", "updatedAt"]);
    assert.ok(entry.sizeBytes > 0);
  });

  test("opening a private document returns exactly the bytes that were sealed", async () => {
    assert.ok(sealedA);
    const opened = await openPrivateDocument(sealedA.id);
    assert.deepEqual(opened.bytes, PLAINTEXT);
    assert.equal(opened.meta.name, META.name);
    assert.equal(opened.meta.label, META.label);
    assert.equal(opened.meta.mimeType, META.mimeType);
  });

  test("a picked file keeps its name inside the encrypted metadata", async () => {
    const file = new File([PLAINTEXT], "abba-serial.pdf", { type: "application/pdf" });
    const record = await sealFile(file);
    await syncPrivateDocument(record);

    const served = account.docs.get(record.id);
    assert.ok(served);
    assert.ok(!JSON.stringify(served.record).includes("abba-serial"));

    const opened = await openPrivateDocument(record.id);
    assert.equal(opened.meta.name, "abba-serial.pdf");
    assert.deepEqual(opened.bytes, PLAINTEXT);
    await deletePrivateDocument(record.id);
  });

  test("the listing merges the device copy with the account copy", async () => {
    assert.ok(sealedA);
    const items = await listPrivateDocuments();
    const mine = items.filter((item: PrivateDocumentListing) => item.id === sealedA?.id);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].onThisDevice, true);
    assert.equal(mine[0].onAccount, true);
    assert.equal(mine[0].meta?.name, META.name);
    assert.ok(mine[0].sizeBytes && mine[0].sizeBytes > 0);
  });

  test("locking drops the key while the wrapped material stays", async () => {
    assert.ok(sealedA);
    lockVault();
    assertLocked(/Unlock your private vault first/);
    await assert.rejects(openPrivateDocument(sealedA.id), /Unlock your private vault first/);

    const local = await deviceCopy();
    assert.deepEqual(local.material, deviceAMaterial);
    assert.equal((await deviceCopy()).docs.length, 2, "ciphertext stays on the device");
  });
});

// --- 3. an untrusted server -------------------------------------------------

describe("a hostile or damaged account response", () => {
  let snapshot: Map<string, ServedDocument>;
  let materialSnapshot: string;

  beforeEach(async () => {
    await ensureUnlocked();
    materialSnapshot = JSON.stringify(account.material);
    snapshot = new Map(
      [...account.docs].map(([id, entry]) => [
        id,
        {
          record: JSON.parse(JSON.stringify(entry.record)) as ServedDocument["record"],
          bytes: entry.bytes,
          updatedAt: entry.updatedAt,
        },
      ]),
    );
  });

  afterEach(() => {
    account.docs = new Map(snapshot);
    account.material = JSON.parse(materialSnapshot) as VaultMaterial | null;
    account.inventNames = false;
  });

  function serve(id: string): DocumentRecord {
    const served = account.docs.get(id);
    assert.ok(served, "the document is stored on the account");
    return served.record;
  }

  function tamper(ct: string): string {
    const bytes = b64decodeStrict(ct);
    bytes[0] ^= 0x01;
    return b64encode(bytes);
  }

  test("a flipped ciphertext bit is refused with no partial bytes", async () => {
    assert.ok(sealedA);
    serve(sealedA.id).content.ct = tamper(serve(sealedA.id).content.ct);

    await assert.rejects(openPrivateDocument(sealedA.id), (error: unknown) => {
      assert.ok(isVaultCryptoError(error), `expected a vault crypto error, got ${String(error)}`);
      assert.equal(error.code, "AUTH_FAILED");
      return true;
    });
  });

  test("a tampered wrapped document key is refused", async () => {
    assert.ok(sealedA);
    serve(sealedA.id).wrappedDek.ct = tamper(serve(sealedA.id).wrappedDek.ct);

    await assert.rejects(openPrivateDocument(sealedA.id), (error: unknown) => {
      assert.ok(isVaultCryptoError(error));
      assert.equal(error.code, "AUTH_FAILED");
      return true;
    });
  });

  test("a blob replayed under the wrong purpose never reaches decryption", async () => {
    assert.ok(sealedA);
    const record = serve(sealedA.id);
    record.content = record.metadata; // a "meta" blob where "content" belongs

    await assert.rejects(fetchVaultDocument(sealedA.id), /expected a "content" blob/);
  });

  test("a record smuggled with a cleartext name is refused", async () => {
    assert.ok(sealedA);
    const record = serve(sealedA.id) as unknown as Record<string, unknown>;
    record.title = "Nani's passport";

    await assert.rejects(fetchVaultDocument(sealedA.id), /must contain exactly these fields/);
  });

  test("an inventory row that carries a file name is refused", async () => {
    account.inventNames = true;
    await assert.rejects(listVaultDocuments(), /must contain exactly these fields/);
  });

  test("a material blob with swapped purposes is refused, and the device vault survives", async () => {
    const swapped = JSON.parse(JSON.stringify(account.material)) as VaultMaterial;
    (swapped.wrappedByPassphrase as unknown as { purpose: string }).purpose = "vk:recovery";
    (swapped.wrappedByRecoveryKey as unknown as { purpose: string }).purpose = "vk:passphrase";
    account.material = swapped;

    await assert.rejects(fetchVaultMaterial(), /expected a "vk:passphrase" blob/);

    // An account that cannot be understood is an account that cannot be checked:
    // the device copy keeps working instead of being wiped or replaced.
    const state = await inspectVault();
    assert.equal(state.phase, "locked");
    assert.ok(state.detail);
    assert.equal((await deviceCopy()).material?.wrappedByPassphrase.purpose, "vk:passphrase");
    assert.equal(account.materialWrites, 1);
  });
});

// --- 4. a second device, same account --------------------------------------

describe("a second device with the same passphrase", () => {
  test("the vault is adopted from the account as wrapped blobs only", async () => {
    assert.ok(sealedA);
    newDevice();
    const state = await inspectVault();

    assert.equal(state.phase, "locked");
    assert.equal(state.synced, true);
    assert.equal(account.materialWrites, 1, "adopting a vault must not re-upload it");
    assert.deepEqual((await deviceCopy()).material, account.material);
    assert.equal((await deviceCopy()).docs.length, 0, "no documents are pre-downloaded");
    assertLocked(/Unlock your private vault first/);
  });

  test("the first device's passphrase is not this device's passphrase", async () => {
    await assert.rejects(unlockVault(OTHER_PASSPHRASE), /did not open the vault/);
    assertLocked(/Unlock your private vault first/);
    assert.equal(requests("PUT", MATERIAL), 1);
  });

  test("the same passphrase opens documents sealed on another device", async () => {
    assert.ok(sealedA);
    await unlockVault(PASSPHRASE);
    assert.equal(getVaultState().phase, "unlocked");
    assert.equal(getVaultState().synced, true);

    const opened = await openPrivateDocument(sealedA.id);
    assert.deepEqual(opened.bytes, PLAINTEXT);
    assert.equal(opened.meta.name, META.name);
    // It came from the account: this device still holds no document records.
    assert.equal((await deviceCopy()).docs.length, 0);
  });

  test("listing the account never fetches and decrypts every document", async () => {
    const readsBefore = requests("GET", `${DOCS}/`);
    const items = await listPrivateDocuments();

    assert.ok(items.length >= 2);
    assert.equal(requests("GET", `${DOCS}/`), readsBefore, "a listing fetches no document bodies");
    for (const item of items) {
      assert.equal(item.onThisDevice, false);
      assert.equal(item.onAccount, true);
      assert.equal(item.meta, undefined, "names stay encrypted until a document is opened");
      assert.match(item.id, /^[A-Za-z0-9_-]{16,64}$/);
    }
  });

  test("a document this device never stored can still be removed from the account", async () => {
    const [otherId] = [...account.docs.keys()];
    assert.ok(otherId);
    assert.equal((await deviceCopy()).docs.length, 0);

    await deletePrivateDocument(otherId);
    assert.equal(account.docs.has(otherId), false);
    const remaining = await listPrivateDocuments();
    assert.ok(!remaining.some((item) => item.id === otherId));
  });
});

// --- 5. an unreachable account is not an empty account ----------------------

describe("a device that cannot reach the account", () => {
  test("it builds a vault locally and refuses to push it blind", async () => {
    const materialBefore = JSON.stringify(account.material);
    account.offline = true;
    newDevice();

    const state = await inspectVault();
    assert.equal(state.phase, "no-vault");
    assert.ok(state.detail, "the plain-language reason is shown");

    const created = await setupVault(OTHER_PASSPHRASE);
    assert.equal(created.synced, false);
    assert.ok(created.syncMessage);
    assert.equal(getVaultState().phase, "unlocked");
    assert.equal(getVaultState().synced, false);

    assert.deepEqual(account.material, JSON.parse(materialBefore));
    assert.equal(account.materialWrites, 1);
    assert.equal(requests("PUT", MATERIAL), 1);

    const local = await deviceCopy();
    assert.ok(local.material);
    assert.equal(local.material.wrappedByPassphrase.purpose, "vk:passphrase");
    assert.equal(local.docs.length, 0);
  });

  test("unlocking later still does not overwrite the account's vault", async () => {
    const materialBefore = JSON.stringify(account.material);
    account.offline = false;

    lockVault();
    await unlockVault(OTHER_PASSPHRASE);

    assert.equal(getVaultState().phase, "unlocked");
    assert.equal(getVaultState().synced, false);
    assert.equal(JSON.stringify(account.material), materialBefore);
    assert.equal(account.materialWrites, 1);
  });

  test("the mismatch is reported as a conflict, and neither copy is touched", async () => {
    const localBefore = JSON.stringify((await deviceCopy()).material);
    const remoteBefore = JSON.stringify(account.material);

    const state = await inspectVault();
    assert.equal(state.phase, "conflict");
    assert.equal(state.synced, false);
    assert.match(state.detail ?? "", /cannot be merged/);

    assert.equal(JSON.stringify((await deviceCopy()).material), localBefore);
    assert.equal(JSON.stringify(account.material), remoteBefore);
    assert.equal(account.materialWrites, 1);
    assertLocked(/Unlock your private vault first/);
  });
});
