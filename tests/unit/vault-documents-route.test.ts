import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, mock, test } from "node:test";

import { NextRequest } from "next/server";

import { encryptBytes, utf8 } from "@vault/crypto";
import {
  createVault,
  encryptMetadata,
  generateDek,
  wrapDek,
  type CreateVaultResult,
} from "@vault/keys";
import { newDocumentId } from "@vault/store";

/**
 * Route-level tests for the private-document endpoints (Day 2, Stage C/D).
 *
 * The real handlers run against the real filesystem in a throwaway directory under
 * the OS temp folder — never `./storage`, never `dev.db`. The only fake is the
 * session source, so authentication, origin checks, rate limits, size caps,
 * validation and per-account isolation are exercised as they ship.
 *
 * Records are produced by the reviewed P3/P4 primitives, so the ciphertext is real:
 * these tests can prove the server never sees the plaintext, because it never has it.
 */

const C = globalThis.crypto as Crypto;

const workDir = mkdtempSync(path.join(tmpdir(), "fv-vaultdocs-"));
if (!path.resolve(workDir).startsWith(path.resolve(tmpdir()))) {
  throw new Error(`Vault document tests must run in the OS temp dir, got ${workDir}`);
}
process.env.STORAGE_DIR = workDir;
process.env.MAX_UPLOAD_MB = "1"; // → a 1.5 MiB body cap, so the oversized case stays cheap

type MockModuleOptions = Parameters<typeof mock.module>[1];

let session: { user: { id: string; email: string; name: string } } | null = null;
let currentUser: string | null = null;

mock.module("@/auth", {
  exports: {
    auth: async () => session,
    handlers: {},
    signIn: async () => {},
    signOut: async () => {},
    sessionMaxAge: 0,
  },
} as unknown as MockModuleOptions);

let GET_LIST: typeof import("@/app/api/vault/documents/route").GET;
let GET_ONE: typeof import("@/app/api/vault/documents/[id]/route").GET;
let PUT_ONE: typeof import("@/app/api/vault/documents/[id]/route").PUT;
let DELETE_ONE: typeof import("@/app/api/vault/documents/[id]/route").DELETE;

before(async () => {
  const list = await import("@/app/api/vault/documents/route");
  const one = await import("@/app/api/vault/documents/[id]/route");
  GET_LIST = list.GET;
  GET_ONE = one.GET;
  PUT_ONE = one.PUT;
  DELETE_ONE = one.DELETE;
});

after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// --- helpers ----------------------------------------------------------------

let vaultPromise: Promise<CreateVaultResult> | null = null;
function vault(): Promise<CreateVaultResult> {
  return (vaultPromise ??= createVault("correct horse battery staple", C));
}

const PLAINTEXT = "NANI-PASSPORT-PLAINTEXT-9F3C";
const FILENAME = "nani-passport.pdf";

async function makeRecord(): Promise<{ record: Record<string, unknown>; id: string }> {
  const { vk } = await vault();
  const id = newDocumentId(C);
  const dek = await generateDek(C);
  const now = new Date().toISOString();

  return {
    id,
    record: {
      id,
      createdAt: now,
      updatedAt: now,
      content: await encryptBytes(dek, utf8(PLAINTEXT), { purpose: "content" }, C),
      wrappedDek: await wrapDek(vk, dek, C),
      metadata: await encryptMetadata(
        vk,
        { name: FILENAME, mimeType: "application/pdf", sizeBytes: PLAINTEXT.length },
        C,
      ),
    },
  };
}

function asUser(id: string | null): void {
  currentUser = id;
  session = id ? { user: { id, email: `${id}@example.test`, name: id } } : null;
}

function request(
  method: string,
  id: string,
  body?: unknown,
  opts: { origin?: string | null; ip?: string } = {},
): NextRequest {
  const origin = opts.origin === undefined ? "http://localhost" : opts.origin;
  return new NextRequest(`http://localhost/api/vault/documents/${id}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": opts.ip ?? "203.0.113.9",
      ...(origin ? { origin } : {}),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

function context(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function listRequest(opts: { ip?: string; origin?: string | null } = {}): NextRequest {
  const origin = opts.origin === undefined ? "http://localhost" : opts.origin;
  return new NextRequest("http://localhost/api/vault/documents", {
    method: "GET",
    headers: { "x-forwarded-for": opts.ip ?? "203.0.113.9", ...(origin ? { origin } : {}) },
  });
}

const getOne = (id: string) => GET_ONE(request("GET", id), context(id));
const putOne = (id: string, body: unknown, opts?: { ip?: string; origin?: string | null }) =>
  PUT_ONE(request("PUT", id, body, opts), context(id));
const deleteOne = (id: string) => DELETE_ONE(request("DELETE", id), context(id));

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

async function items(): Promise<{ id: string; sizeBytes: number; updatedAt: string }[]> {
  const payload = await body(await GET_LIST(listRequest()));
  return (payload.data as { items: { id: string; sizeBytes: number; updatedAt: string }[] }).items;
}

function filesUnder(user: string | null): string[] {
  const root = path.join(workDir, "vault-documents", user ?? "");
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };
  try {
    return walk(root);
  } catch {
    return [];
  }
}

/** Objects belonging to the account that is currently signed in. */
function storedFiles(): string[] {
  return filesUnder(currentUser);
}

// --- access control ordering -------------------------------------------------

describe("private documents: access control", () => {
  test("unauthenticated list is 401", async () => {
    asUser(null);
    assert.equal((await GET_LIST(listRequest())).status, 401);
  });

  test("unauthenticated save is 401 before anything is written", async () => {
    asUser(null);
    const { record, id } = await makeRecord();
    assert.equal((await putOne(id, { record })).status, 401);
    assert.equal(storedFiles().length, 0);
  });

  test("cross-origin save is 403 and writes nothing", async () => {
    asUser("user-origin");
    const { record, id } = await makeRecord();
    assert.equal((await putOne(id, { record }, { origin: "https://evil.example" })).status, 403);
    assert.equal(storedFiles().length, 0);
  });

  test("cross-origin list is 403", async () => {
    asUser("user-origin-list");
    assert.equal((await GET_LIST(listRequest({ origin: "https://evil.example" }))).status, 403);
  });

  test("a body naming another account is refused by the strict envelope", async () => {
    asUser("user-envelope");
    const { record, id } = await makeRecord();
    assert.equal((await putOne(id, { record, userId: "someone-else" })).status, 422);
    assert.equal(storedFiles().length, 0);
  });
});

// --- the encrypted round trip -----------------------------------------------

describe("private documents: encrypted round trip", () => {
  test("save, list and read back the same ciphertext", async () => {
    asUser("user-roundtrip");
    const { record, id } = await makeRecord();

    const saved = await putOne(id, { record });
    assert.equal(saved.status, 200);
    const stored = (await body(saved)).data as { id: string; sizeBytes: number };
    assert.equal(stored.id, id);
    assert.ok(stored.sizeBytes > 0);

    const listed = await items();
    assert.deepEqual(listed.map((entry) => entry.id), [id]);
    assert.equal(listed[0]!.sizeBytes, stored.sizeBytes);
    assert.match(listed[0]!.updatedAt, /Z$/);

    const fetched = (await body(await getOne(id))).data as { record: unknown };
    assert.deepEqual(fetched.record, record);
  });

  test("the server stores ciphertext only — no file name, no content, no metadata", async () => {
    asUser("user-blind");
    const { record, id } = await makeRecord();
    await putOne(id, { record });

    const files = storedFiles();
    assert.equal(files.length, 1);
    const text = readFileSync(files[0]!, "utf8");

    assert.ok(!text.includes(PLAINTEXT), "stored bytes must not contain the document content");
    assert.ok(!text.includes(FILENAME), "stored bytes must not contain the file name");
    assert.ok(!text.includes("application/pdf"), "stored bytes must not contain the MIME type");
    // Stored exactly as the browser produced it — the server does not re-encode or process it.
    assert.equal(
      (JSON.parse(text) as { content: { ct: string } }).content.ct,
      (record.content as { ct: string }).ct,
    );
  });

  test("another account cannot read, list or delete it", async () => {
    asUser("user-a-owner");
    const { record, id } = await makeRecord();
    assert.equal((await putOne(id, { record })).status, 200);

    asUser("user-b-other");
    assert.equal((await getOne(id)).status, 404);
    assert.deepEqual(await items(), []);
    assert.equal((await deleteOne(id)).status, 404);
    assert.equal(filesUnder("user-a-owner").length, 1, "user B must not be able to delete user A's file");
  });

  test("delete removes only the caller's own object", async () => {
    asUser("user-delete");
    const { record, id } = await makeRecord();
    await putOne(id, { record });
    assert.equal(storedFiles().length, 1);

    assert.equal((await deleteOne(id)).status, 200);
    assert.equal(storedFiles().length, 0);
    assert.equal((await getOne(id)).status, 404);
    assert.equal((await deleteOne(id)).status, 404);
  });

  test("the same plaintext never produces the same ciphertext", async () => {
    asUser("user-shared-1");
    const first = await makeRecord();
    await putOne(first.id, { record: first.record });

    asUser("user-shared-2");
    const second = await makeRecord();
    await putOne(second.id, { record: second.record });

    const both = [
      ...filesUnder("user-shared-1"),
      ...filesUnder("user-shared-2"),
    ];
    const text = both.map((file) => readFileSync(file, "utf8")).join("\n");
    assert.ok(!text.includes(PLAINTEXT));
    assert.equal(filesUnder("user-shared-1").length, 1);
    assert.equal(filesUnder("user-shared-2").length, 1, "each account sees only its own object");

    // Fresh DEK and fresh IV per encryption: nothing in the account reveals two
    // files being the same document.
    assert.notEqual(
      (first.record.content as { ct: string }).ct,
      (second.record.content as { ct: string }).ct,
    );
    assert.notEqual(
      (first.record.wrappedDek as { ct: string }).ct,
      (second.record.wrappedDek as { ct: string }).ct,
    );
  });
});

// --- validation and limits --------------------------------------------------

describe("private documents: validation and limits", () => {
  test("a purpose-swapped blob is refused", async () => {
    asUser("user-purpose");
    const { record, id } = await makeRecord();
    assert.equal((await putOne(id, { record: { ...record, wrappedDek: record.content } })).status, 422);
    assert.equal(storedFiles().length, 0);
  });

  test("a cleartext field smuggled into the record is refused", async () => {
    asUser("user-cleartext");
    const { record, id } = await makeRecord();
    assert.equal((await putOne(id, { record: { ...record, title: "Passport" } })).status, 422);
    assert.equal(storedFiles().length, 0);
  });

  test("a path id that does not match the record is refused before writing", async () => {
    asUser("user-mismatch");
    const { record } = await makeRecord();
    assert.equal((await putOne("aaaaaaaaaaaaaaaaaaaaaaaa", { record })).status, 422);
    assert.equal(storedFiles().length, 0);
  });

  test("a traversal id is refused", async () => {
    asUser("user-traversal");
    assert.equal((await getOne("../../secrets")).status, 400);
    assert.deepEqual(await items(), []);
  });

  test("an oversized body is rejected with 413 and nothing is written", async () => {
    asUser("user-oversize");
    const { record, id } = await makeRecord();
    const huge = { ...record, content: { ...(record.content as object), ct: "A".repeat(2_000_000) } };

    assert.equal((await putOne(id, { record: huge })).status, 413);
    assert.equal(storedFiles().length, 0);
  });

  test("malformed JSON is a 400, not a 500", async () => {
    asUser("user-malformed");
    assert.equal((await putOne("aaaaaaaaaaaaaaaaaaaaaaaa", "{ not json")).status, 400);
  });

  test("saves are rate limited per account", async () => {
    asUser("user-rate-limit");
    const statuses: number[] = [];
    for (let i = 0; i < 32; i += 1) {
      const { record, id } = await makeRecord();
      const res = await putOne(id, { record }, { ip: "198.51.100.7" });
      statuses.push(res.status);
    }

    assert.ok(statuses.slice(0, 30).every((status) => status === 200), "the first 30 saves go through");
    assert.deepEqual(statuses.slice(30), [429, 429], "writes past the window are throttled");
  });
});
