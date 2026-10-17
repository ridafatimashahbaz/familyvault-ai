/**
 * The offline vault (PWA) — lifecycle, documents and backups on one device.
 *
 * These run the real browser modules (`session.ts`, `documents.ts`, the P3/P4
 * crypto and the IndexedDB store) against a fake IndexedDB and a fresh "device"
 * for every case, and assert the security claims themselves:
 *
 *  - a fresh device has no vault, and no key can be used before one is opened;
 *  - a wrong passphrase fails closed and leaves the vault locked;
 *  - the recovery file re-wraps the *same* vault key, so nothing is re-encrypted
 *    and the forgotten passphrase stops working;
 *  - a backup restores on a new device and opens with the same passphrase;
 *  - a damaged backup or a tampered document is refused before anything is
 *    written or returned.
 *
 * No database, no network and no real browser profile are touched.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { b64decodeStrict, b64encode, utf8 } from "@vault/crypto";
import {
  exportVaultText,
  importVaultText,
  listVaultDocuments,
  openVaultDocument,
  removeVaultDocument,
  sealDocumentBytes,
  sealDocumentFile,
  vaultHasData,
  type StoredDocumentMeta,
} from "@vault/documents";
import { describeVaultFailure, isVaultStoreError, VaultCryptoError, VaultStoreError } from "@vault/errors";
import {
  createLocalVault,
  getLocalVaultState,
  inspectLocalVault,
  isLocalVaultUnlocked,
  lockLocalVault,
  noteLocalVaultDetail,
  recoverLocalVault,
  requireLocalVaultKey,
  resetLocalVaultSession,
  unlockLocalVault,
} from "@vault/session";
import { openVaultStore } from "@vault/store";

const PASSPHRASE = "correct horse battery staple";
const NEW_PASSPHRASE = "the passphrase I will remember";
const PLAINTEXT = utf8("Birth certificate — serial AA1234567");

const META: StoredDocumentMeta = {
  name: "birth-certificate.pdf",
  mimeType: "application/pdf",
  sizeBytes: PLAINTEXT.length,
  category: "civil",
  expiryDate: null,
};

let factory: IDBFactory;

/** A fresh browser profile: empty device storage, no session state. */
function freshDevice(): void {
  factory = new IDBFactory();
  globalThis.indexedDB = factory;
  resetLocalVaultSession();
}

async function newDeviceWithVault(): Promise<void> {
  freshDevice();
  await inspectLocalVault();
  await createLocalVault(PASSPHRASE);
}

/** Reads the persisted records directly, the way a second tab would. */
async function storedRecords(): Promise<{ material: unknown; docs: number }> {
  const store = await openVaultStore({ factory });
  try {
    return {
      material: await store.getMaterial(),
      docs: (await store.listDocuments()).length,
    };
  } finally {
    store.close();
  }
}

async function assertStoreCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(isVaultStoreError(error), `expected VaultStoreError, got ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  });
}

// --- 1. lifecycle -----------------------------------------------------------

describe("setting up and opening the vault on one device", () => {
  test("a fresh device has no vault and no key can be used", async () => {
    freshDevice();

    const state = await inspectLocalVault();
    assert.equal(state.phase, "no-vault");
    assert.equal(isLocalVaultUnlocked(), false);
    assert.throws(() => requireLocalVaultKey(), /Open your vault first/);
    await assert.rejects(sealDocumentBytes(PLAINTEXT, META), /Open your vault first/);
  });

  test("creating a vault unlocks it here and hands back one recovery file", async () => {
    freshDevice();
    await inspectLocalVault();

    const kit = await createLocalVault(PASSPHRASE);

    assert.equal(getLocalVaultState().phase, "unlocked");
    assert.equal(isLocalVaultUnlocked(), true);
    assert.equal(kit.format, "fvault-recovery-kit");
    assert.equal(kit.version, 1);
    assert.ok(!JSON.stringify(kit).includes(PASSPHRASE), "the passphrase must never be written anywhere");

    // What is persisted is wrapped blobs only: no passphrase, no recovery key,
    // no usable key material.
    const { material } = await storedRecords();
    assert.ok(material);
    const persisted = JSON.stringify(material);
    assert.ok(!persisted.includes(PASSPHRASE));
    assert.ok(!persisted.includes(kit.recoveryKey), "the raw recovery key must never be persisted");
    const record = material as {
      wrappedByPassphrase: { purpose: string; ct: string };
      wrappedByRecoveryKey: { purpose: string; ct: string };
    };
    assert.equal(record.wrappedByPassphrase.purpose, "vk:passphrase");
    assert.equal(record.wrappedByRecoveryKey.purpose, "vk:recovery");
    assert.equal(b64decodeStrict(record.wrappedByPassphrase.ct).length, 48);
    assert.equal(b64decodeStrict(record.wrappedByRecoveryKey.ct).length, 48);

    // A second vault cannot be created over this one.
    await assert.rejects(createLocalVault("another long passphrase"), /already has a private vault/);
  });

  test("a wrong passphrase fails closed; the right one opens it again", async () => {
    await newDeviceWithVault();

    lockLocalVault();
    assert.equal(getLocalVaultState().phase, "locked");
    assert.equal(isLocalVaultUnlocked(), false);

    await assert.rejects(unlockLocalVault("definitely the wrong passphrase"), /did not open the vault/);
    assert.equal(getLocalVaultState().phase, "locked");
    assert.equal(isLocalVaultUnlocked(), false);
    assert.throws(() => requireLocalVaultKey(), /Open your vault first/);

    await unlockLocalVault(PASSPHRASE);
    assert.equal(getLocalVaultState().phase, "unlocked");
    assert.equal(isLocalVaultUnlocked(), true);
  });

  test("the recovery file replaces a forgotten passphrase without re-encrypting anything", async () => {
    freshDevice();
    await inspectLocalVault();
    const kit = await createLocalVault(PASSPHRASE);
    const { id } = await sealDocumentBytes(PLAINTEXT, META);

    // The user locks the vault, forgets the passphrase, and finds the kit file.
    lockLocalVault();
    await assert.rejects(unlockLocalVault("what was it again"), /did not open the vault/);

    await recoverLocalVault(JSON.stringify(kit), NEW_PASSPHRASE);
    assert.equal(getLocalVaultState().phase, "unlocked");

    // The document was never touched: the recovery file re-wrapped the same key.
    const opened = await openVaultDocument(id);
    assert.deepEqual(opened.bytes, PLAINTEXT);

    // Only the new passphrase works from now on.
    lockLocalVault();
    await assert.rejects(unlockLocalVault(PASSPHRASE), /did not open the vault/);
    await unlockLocalVault(NEW_PASSPHRASE);
    assert.equal(isLocalVaultUnlocked(), true);

    // A short new passphrase and a junk file are refused, and the vault stays shut.
    lockLocalVault();
    await assert.rejects(recoverLocalVault(JSON.stringify(kit), "short"), /at least 8 characters/);
    await assert.rejects(recoverLocalVault("{not json", NEW_PASSPHRASE), /not a FamilyVault recovery file/);
    await assert.rejects(
      recoverLocalVault(JSON.stringify({ hello: "world" }), NEW_PASSPHRASE),
      /not a FamilyVault recovery file/,
    );
    assert.equal(isLocalVaultUnlocked(), false);
  });

  test("a valid recovery file from another vault cannot replace this vault", async () => {
    freshDevice();
    await inspectLocalVault();
    const otherKit = await createLocalVault("another synthetic vault passphrase");
    freshDevice();
    await inspectLocalVault();
    const ownKit = await createLocalVault(PASSPHRASE);
    const { id } = await sealDocumentBytes(PLAINTEXT, META);
    const before = await storedRecords();
    lockLocalVault();

    await assert.rejects(recoverLocalVault(otherKit, NEW_PASSPHRASE), /does not belong/);
    await assert.rejects(
      recoverLocalVault({ ...otherKit, wrappedByRecoveryKey: ownKit.wrappedByRecoveryKey }, NEW_PASSPHRASE),
      /does not belong/,
    );
    assert.equal(getLocalVaultState().phase, "locked");
    assert.deepEqual(await storedRecords(), before);
    await unlockLocalVault(PASSPHRASE);
    assert.deepEqual((await openVaultDocument(id)).bytes, PLAINTEXT);

    lockLocalVault();
    await recoverLocalVault({ ...ownKit, createdAt: "2000-01-01T00:00:00.000Z" }, NEW_PASSPHRASE);
    assert.equal((await openVaultDocument(id)).meta.name, META.name);
    const after = (await storedRecords()).material as { createdAt: string };
    assert.equal(after.createdAt, ownKit.createdAt);
    lockLocalVault();
    await recoverLocalVault(ownKit, PASSPHRASE);
    assert.deepEqual((await openVaultDocument(id)).bytes, PLAINTEXT);
  });

  test("a recovery file does not create a replacement vault without its backup", async () => {
    freshDevice();
    await inspectLocalVault();
    const kit = await createLocalVault(PASSPHRASE);
    freshDevice();
    await inspectLocalVault();
    await assert.rejects(recoverLocalVault(kit, NEW_PASSPHRASE), /Restore your backup/);
    assert.deepEqual(await storedRecords(), { material: null, docs: 0 });
    assert.equal(getLocalVaultState().phase, "no-vault");
  });
});

// --- 2. documents -----------------------------------------------------------

describe("documents on this device", () => {
  test("the same bytes sealed twice never produce the same ciphertext", async () => {
    await newDeviceWithVault();

    const a = await sealDocumentBytes(PLAINTEXT, META);
    const b = await sealDocumentBytes(PLAINTEXT, META);
    assert.notEqual(a.id, b.id);
    assert.match(a.id, /^[A-Za-z0-9_-]{16,64}$/);

    const store = await openVaultStore({ factory });
    const records = await store.listDocuments();
    store.close();
    assert.equal(records.length, 2);
    assert.notEqual(records[0].content.ct, records[1].content.ct);
    assert.notEqual(records[0].content.iv, records[1].content.iv);
    assert.notEqual(records[0].wrappedDek.ct, records[1].wrappedDek.ct);
    assert.notEqual(records[0].metadata.ct, records[1].metadata.ct);
    for (const record of records) {
      assert.equal(record.content.purpose, "content");
      assert.equal(record.wrappedDek.purpose, "dek");
      assert.equal(record.metadata.purpose, "meta");
    }
  });

  test("titles are decrypted only while the vault is open", async () => {
    await newDeviceWithVault();

    const file = new File([PLAINTEXT], "nani-cnic.pdf", { type: "application/pdf" });
    const { id } = await sealDocumentFile(file, { category: "identity", person: "Nani" });

    const open = await listVaultDocuments();
    assert.equal(open.length, 1);
    assert.equal(open[0].id, id);
    assert.equal(open[0].meta?.name, "nani-cnic.pdf");
    assert.equal(open[0].meta?.category, "identity");
    assert.equal(open[0].meta?.person, "Nani");

    lockLocalVault();
    const locked = await listVaultDocuments();
    assert.equal(locked.length, 1, "the row is still visible without the key");
    assert.equal(locked[0].meta, undefined, "the title is not decrypted while locked");
    assert.equal(locked[0].unreadable, undefined);
  });

  test("a title given by the user wins over the file name", async () => {
    await newDeviceWithVault();

    const file = new File([PLAINTEXT], "IMG_2043.jpg", { type: "image/jpeg" });
    const { id } = await sealDocumentFile(file, { title: "Abba's old passport", category: "identity" });

    const opened = await openVaultDocument(id);
    assert.equal(opened.meta.name, "Abba's old passport");
    assert.equal(opened.meta.mimeType, "image/jpeg");
    assert.equal(opened.meta.sizeBytes, PLAINTEXT.length);
    assert.deepEqual(opened.bytes, PLAINTEXT);
  });

  test("an expiry date is stored as a real date or refused", async () => {
    await newDeviceWithVault();

    await assert.rejects(
      sealDocumentBytes(PLAINTEXT, { ...META, expiryDate: "31-12-2030" }),
      /could not be understood/,
    );

    const { id } = await sealDocumentBytes(PLAINTEXT, { ...META, expiryDate: "2030-12-31" });
    const rows = await listVaultDocuments();
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].meta?.expiryDate, "2030-12-31");
  });

  test("a tampered stored copy is refused with no partial bytes", async () => {
    await newDeviceWithVault();
    const { id } = await sealDocumentBytes(PLAINTEXT, META);

    const store = await openVaultStore({ factory });
    const record = await store.getDocument(id);
    assert.ok(record);
    const bytes = b64decodeStrict(record.content.ct);
    bytes[0] ^= 0x01;
    await store.putDocument({ ...record, content: { ...record.content, ct: b64encode(bytes) } });
    store.close();

    await assert.rejects(openVaultDocument(id), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(describeVaultFailure(error), /may have been changed/);
      return true;
    });

    // The damaged row is still listed and can be removed rather than hidden.
    assert.equal((await listVaultDocuments()).length, 1);
    await removeVaultDocument(id);
    assert.equal((await listVaultDocuments()).length, 0);
  });

  test("removing is honest about a missing id", async () => {
    await newDeviceWithVault();
    const { id } = await sealDocumentBytes(PLAINTEXT, META);

    await removeVaultDocument(id);
    assert.equal((await listVaultDocuments()).length, 0);

    await assert.rejects(removeVaultDocument(id), /no longer in this vault/);
    await assert.rejects(openVaultDocument(id), /no longer in this vault/);
  });
});

// --- 3. backups -------------------------------------------------------------

describe("backups", () => {
  test("a backup restores on a new device and opens with the same passphrase", async () => {
    await newDeviceWithVault();
    const { id } = await sealDocumentFile(
      new File([PLAINTEXT], "certificate.pdf", { type: "application/pdf" }),
      { category: "education", expiryDate: "2031-01-15" },
    );

    const backup = await exportVaultText();
    assert.ok(!backup.includes(PASSPHRASE), "a backup never carries the passphrase");
    assert.ok(!backup.includes("certificate.pdf"), "a backup never carries a clear-text title");

    // A new device: nothing stored, nothing unlocked.
    freshDevice();
    assert.equal(await vaultHasData(), false);
    await inspectLocalVault();

    const restored = await importVaultText(backup);
    assert.equal(restored, 1);
    assert.equal(getLocalVaultState().phase, "locked");

    // The panel that ran the restore is swapped out for the unlock panel, so
    // the confirmation has to live at screen level to be visible.
    noteLocalVaultDetail("Backup restored: 1 document. Enter its passphrase to open it.");
    assert.equal(getLocalVaultState().detail, "Backup restored: 1 document. Enter its passphrase to open it.");

    await unlockLocalVault(PASSPHRASE);
    assert.equal(getLocalVaultState().detail, undefined, "opening the vault drops the one-shot confirmation");
    const opened = await openVaultDocument(id);
    assert.deepEqual(opened.bytes, PLAINTEXT);
    assert.equal(opened.meta.name, "certificate.pdf");
    assert.equal(opened.meta.expiryDate, "2031-01-15");
  });

  test("restoring refuses to overwrite a device that already has data", async () => {
    await newDeviceWithVault();
    await sealDocumentBytes(PLAINTEXT, META);
    const backup = await exportVaultText();

    const before = JSON.stringify((await storedRecords()).material);
    await assertStoreCode(importVaultText(backup), "VAULT_NOT_EMPTY");
    assert.equal(JSON.stringify((await storedRecords()).material), before);
    assert.equal((await listVaultDocuments()).length, 1, "the existing document is untouched");
  });

  test("a damaged backup is refused before anything is written", async () => {
    freshDevice();
    await inspectLocalVault();
    assert.equal(await vaultHasData(), false);

    await assertStoreCode(importVaultText("{not json"), "CORRUPT_EXPORT");
    await assertStoreCode(importVaultText(JSON.stringify({ format: "fvault-export" })), "CORRUPT_EXPORT");
    assert.equal(await vaultHasData(), false);
    assert.equal(getLocalVaultState().phase, "no-vault");
  });

  test("there is nothing to back up before a vault exists", async () => {
    freshDevice();
    await inspectLocalVault();
    await assert.rejects(exportVaultText(), /no vault on this device to back up/);
  });
});

// --- 4. words the user reads ------------------------------------------------

describe("plain-language failures", () => {
  test("every failure the screens can show is free of codes and stack names", () => {
    const cases: [unknown, RegExp][] = [
      [new VaultCryptoError("AUTH_FAILED", "x"), /may have been changed/],
      [new VaultStoreError("VAULT_NOT_EMPTY", "x"), /already a vault/],
      [new VaultStoreError("QUOTA_EXCEEDED", "x"), /no room left/],
      [new VaultStoreError("CORRUPT_EXPORT", "x"), /backup file could not be read/],
      [new VaultStoreError("NOT_FOUND", "x"), /no longer in this vault/],
      [new Error("Enter your vault passphrase."), /Enter your vault passphrase/],
    ];

    for (const [error, expected] of cases) {
      const text = describeVaultFailure(error);
      assert.match(text, expected);
      assert.doesNotMatch(text, /Error|code|undefined/i);
    }
  });
});
