import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { encryptBytes, utf8 } from "@vault/crypto";
import { isVaultStoreError } from "@vault/errors";
import { buildExport, exportFilename, importExport, parseExport, serializeExport } from "@vault/export";
import {
  createVault,
  encryptMetadata,
  generateDek,
  wrapDek,
  type CreateVaultResult,
} from "@vault/keys";
import {
  estimateStorage,
  newDocumentId,
  openVaultStore,
  requestPersistence,
  type DocumentRecord,
  type VaultStore,
} from "@vault/store";

const C = globalThis.crypto as Crypto;
const PASSPHRASE = "correct horse battery staple";

/** One vault shared across tests so the (deliberately expensive) KDF runs once. */
let vaultPromise: Promise<CreateVaultResult> | null = null;
function vault(): Promise<CreateVaultResult> {
  return (vaultPromise ??= createVault(PASSPHRASE, C));
}

function openStore(): Promise<VaultStore> {
  return openVaultStore({ factory: new IDBFactory() });
}

async function assertStoreCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(isVaultStoreError(error), `expected VaultStoreError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

function assertThrowsStoreCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(isVaultStoreError(error), `expected VaultStoreError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

async function makeDocument(
  vk: CryptoKey,
  overrides: Partial<DocumentRecord> = {},
): Promise<DocumentRecord> {
  const dek = await generateDek(C);
  const wrappedDek = await wrapDek(vk, dek, C);
  const content = await encryptBytes(dek, utf8("document body"), { purpose: "content" }, C);
  const metadata = await encryptMetadata(vk, { title: "Doc" }, C);
  const createdAt = new Date().toISOString();
  return {
    id: newDocumentId(C),
    createdAt,
    updatedAt: createdAt,
    content,
    wrappedDek,
    metadata,
    ...overrides,
  };
}

/**
 * A factory whose database aborts the *next* transaction mid-flight, then
 * behaves normally. Used to prove that a real transaction abort (not a
 * pre-transaction validation error) rolls back with no partial write.
 */
function abortNextTransaction(factory: IDBFactory): IDBFactory {
  const wrapper = {
    open(name?: string, version?: number) {
      const request = factory.open(name as string, version as number);
      request.addEventListener(
        "success",
        () => {
          const db = request.result;
          let armed = true;
          const originalTransaction = db.transaction.bind(db) as (
            ...args: unknown[]
          ) => IDBTransaction;
          Object.defineProperty(db, "transaction", {
            configurable: true,
            value: (...args: unknown[]) => {
              const transaction = originalTransaction(...args);
              if (armed) {
                armed = false;
                queueMicrotask(() => {
                  try {
                    transaction.abort();
                  } catch {
                    /* already settled */
                  }
                });
              }
              return transaction;
            },
          });
        },
        { once: true },
      );
      return request;
    },
  };
  return wrapper as unknown as IDBFactory;
}

/** A factory whose next write throws a genuine `QuotaExceededError`. */
function quotaOnWriteFactory(factory: IDBFactory): IDBFactory {
  const wrapper = {
    open(name?: string, version?: number) {
      const request = factory.open(name as string, version as number);
      request.addEventListener(
        "success",
        () => {
          const db = request.result;
          const originalTransaction = db.transaction.bind(db) as (
            ...args: unknown[]
          ) => IDBTransaction;
          Object.defineProperty(db, "transaction", {
            configurable: true,
            value: (...args: unknown[]) => {
              const transaction = originalTransaction(...args);
              const originalStore = transaction.objectStore.bind(transaction) as (
                ...storeArgs: unknown[]
              ) => IDBObjectStore;
              Object.defineProperty(transaction, "objectStore", {
                configurable: true,
                value: (...storeArgs: unknown[]) => {
                  const store = originalStore(...storeArgs);
                  Object.defineProperty(store, "put", {
                    configurable: true,
                    value: () => {
                      throw new DOMException("simulated quota", "QuotaExceededError");
                    },
                  });
                  return store;
                },
              });
              return transaction;
            },
          });
        },
        { once: true },
      );
      return request;
    },
  };
  return wrapper as unknown as IDBFactory;
}

describe("vault store", () => {
  test("material round-trips through the store", async () => {
    const { material } = await vault();
    const store = await openStore();
    assert.equal(await store.getMaterial(), null);

    await store.putMaterial(material);
    assert.deepEqual(await store.getMaterial(), material);
    store.close();
  });

  test("documents round-trip, list in createdAt order and delete", async () => {
    const { vk } = await vault();
    const store = await openStore();

    const second = await makeDocument(vk, { createdAt: "2026-02-02T00:00:00.000Z" });
    const first = await makeDocument(vk, { createdAt: "2026-01-01T00:00:00.000Z" });
    const third = await makeDocument(vk, { createdAt: "2026-03-03T00:00:00.000Z" });

    assert.equal(await store.countDocuments(), 0);
    await store.putDocument(second);
    await store.putDocument(first);
    await store.putDocument(third);
    assert.equal(await store.countDocuments(), 3);

    assert.deepEqual(await store.getDocument(first.id), first);

    const listed = await store.listDocuments();
    assert.deepEqual(
      listed.map((document) => document.id),
      [first.id, second.id, third.id],
    );

    await store.deleteDocument(second.id);
    assert.equal(await store.getDocument(second.id), null);
    assert.equal(await store.countDocuments(), 2);
    await assertStoreCode(store.deleteDocument(second.id), "NOT_FOUND");
    store.close();
  });

  test("rejects key material, wrong-purpose blobs and malformed records without writing", async () => {
    const { vk } = await vault();
    const store = await openStore();
    const document = await makeDocument(vk);

    // A CryptoKey nested several levels deep is still rejected.
    const nested = { ...document, metadata: { ...document.metadata, nested: { key: vk } } };
    await assertStoreCode(store.putDocument(nested as unknown as DocumentRecord), "INVALID_RECORD");

    // A CryptoKey inside an array is rejected too.
    const inArray = { ...document, tags: [vk] };
    await assertStoreCode(store.putDocument(inArray as unknown as DocumentRecord), "INVALID_RECORD");

    // Wrong-purpose blob (content used where metadata is expected).
    await assertStoreCode(
      store.putDocument({ ...document, metadata: document.content }),
      "INVALID_RECORD",
    );

    // Illegal id and non-ISO timestamps.
    await assertStoreCode(store.putDocument({ ...document, id: "short" }), "INVALID_RECORD");
    await assertStoreCode(store.putDocument({ ...document, updatedAt: "not-a-date" }), "INVALID_RECORD");

    // Nothing was written by any of the rejected calls.
    assert.equal(await store.countDocuments(), 0);
    assert.equal(await store.getDocument(document.id), null);
    store.close();
  });

  test("an interrupted write aborts the whole transaction (no partial record)", async () => {
    const { material } = await vault();

    const abortedMaterialStore = await openVaultStore({
      factory: abortNextTransaction(new IDBFactory()),
    });
    await assert.rejects(abortedMaterialStore.putMaterial(material));
    assert.equal(await abortedMaterialStore.getMaterial(), null);
    abortedMaterialStore.close();

    const { vk } = await vault();
    const document = await makeDocument(vk);
    const abortedDocStore = await openVaultStore({
      factory: abortNextTransaction(new IDBFactory()),
    });
    await assert.rejects(abortedDocStore.putDocument(document));
    assert.equal(await abortedDocStore.countDocuments(), 0);
    abortedDocStore.close();
  });

  test("export round-trips and imports into a fresh store", async () => {
    const { material, vk } = await vault();
    const store = await openStore();
    await store.putMaterial(material);
    const one = await makeDocument(vk, { createdAt: "2026-01-01T00:00:00.000Z" });
    const two = await makeDocument(vk, { createdAt: "2026-01-02T00:00:00.000Z" });
    await store.putDocument(one);
    await store.putDocument(two);

    const exp = buildExport(material, await store.listDocuments(), new Date("2026-10-13T00:00:00.000Z"));
    const text = serializeExport(exp);
    assert.deepEqual(parseExport(text), exp);
    assert.equal(exportFilename(new Date("2026-10-13T00:00:00.000Z")), "familyvault-2026-10-13.fvault");

    const restored = await openStore();
    await importExport(restored, parseExport(text));
    assert.deepEqual(await restored.getMaterial(), exp.material);
    assert.deepEqual(await restored.listDocuments(), exp.documents);
    store.close();
    restored.close();
  });

  test("import is atomic and refuses a non-empty vault", async () => {
    const { material, vk } = await vault();
    const document = await makeDocument(vk);
    const exp = buildExport(material, [document], new Date("2026-10-13T00:00:00.000Z"));

    // (a) Non-empty vault: rejected, existing contents untouched.
    const nonEmpty = await openStore();
    await nonEmpty.putMaterial(material);
    await nonEmpty.putDocument(document);
    await assertStoreCode(importExport(nonEmpty, exp), "VAULT_NOT_EMPTY");
    assert.deepEqual(await nonEmpty.getMaterial(), material);
    assert.equal(await nonEmpty.countDocuments(), 1);

    // (b) A bad document mid-list is rejected before any transaction opens.
    const fresh = await openStore();
    const bad = {
      ...exp,
      documents: [exp.documents[0], { ...exp.documents[0], id: "nope" }],
    };
    await assertStoreCode(importExport(fresh, bad as unknown as typeof exp), "CORRUPT_EXPORT");
    assert.equal(await fresh.countDocuments(), 0);
    assert.equal(await fresh.getMaterial(), null);

    // (c) A fault during the import transaction leaves the vault unchanged.
    const aborted = await openVaultStore({ factory: abortNextTransaction(new IDBFactory()) });
    await assert.rejects(importExport(aborted, exp));
    assert.equal(await aborted.countDocuments(), 0);
    assert.equal(await aborted.getMaterial(), null);

    nonEmpty.close();
    fresh.close();
    aborted.close();
  });

  test("rejects corrupted or reshaped exports", async () => {
    const { material, vk } = await vault();
    const document = await makeDocument(vk);
    const exp = buildExport(material, [document]);
    const good = JSON.parse(serializeExport(exp));

    assertThrowsStoreCode(() => parseExport("{not json"), "CORRUPT_EXPORT");
    assertThrowsStoreCode(() => parseExport(JSON.stringify({ ...good, format: "nope" })), "CORRUPT_EXPORT");
    assertThrowsStoreCode(() => parseExport(JSON.stringify({ ...good, version: 2 })), "CORRUPT_EXPORT");
    assertThrowsStoreCode(() => parseExport(JSON.stringify({ ...good, extra: true })), "CORRUPT_EXPORT");
    assertThrowsStoreCode(
      () => parseExport(JSON.stringify({ ...good, material: { ...good.material, extra: 1 } })),
      "CORRUPT_EXPORT",
    );
    assertThrowsStoreCode(
      () =>
        parseExport(
          JSON.stringify({
            ...good,
            material: {
              ...good.material,
              wrappedByPassphrase: { ...good.material.wrappedByPassphrase, purpose: "vk:recovery" },
            },
          }),
        ),
      "CORRUPT_EXPORT",
    );
    assertThrowsStoreCode(
      () =>
        parseExport(
          JSON.stringify({ ...good, material: { ...good.material, kdf: { ...good.material.kdf, iterations: 1000 } } }),
        ),
      "CORRUPT_EXPORT",
    );
    assertThrowsStoreCode(
      () => parseExport(JSON.stringify({ ...good, documents: "not-an-array" })),
      "CORRUPT_EXPORT",
    );
    assertThrowsStoreCode(
      () =>
        parseExport(
          JSON.stringify({ ...good, documents: [{ ...good.documents[0], id: "!" }] }),
        ),
      "CORRUPT_EXPORT",
    );

    // The good shape still parses.
    assert.deepEqual(parseExport(JSON.stringify(good)), exp);
  });

  test("eviction helpers never throw and quota failures map to QUOTA_EXCEEDED", async () => {
    // No storage manager available (Node): safe defaults, no throw.
    assert.equal(await requestPersistence(), false);
    assert.equal(await estimateStorage(), null);

    const empty = {} as StorageManager;
    assert.equal(await requestPersistence(empty), false);
    assert.equal(await estimateStorage(empty), null);

    const stub = {
      persist: async () => true,
      estimate: async () => ({ usage: 12, quota: 34 }),
    } as unknown as StorageManager;
    assert.equal(await requestPersistence(stub), true);
    assert.deepEqual(await estimateStorage(stub), { usage: 12, quota: 34 });

    const { material } = await vault();
    const store = await openVaultStore({ factory: quotaOnWriteFactory(new IDBFactory()) });
    await assertStoreCode(store.putMaterial(material), "QUOTA_EXCEEDED");
    assert.equal(await store.getMaterial(), null);
    store.close();
  });
});
