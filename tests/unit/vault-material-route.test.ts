import assert from "node:assert/strict";
import { before, describe, mock, test } from "node:test";

import { NextRequest } from "next/server";

/**
 * Route-level security tests for `PUT/GET /api/vault/material` (Day 1 Phase 1
 * remediation).
 *
 * The real route handlers are exercised; only the session source and the Prisma
 * client are swapped for controllable in-memory fakes, so these tests prove the
 * *route* contract (auth order, origin, size cap, rate limit, error shape)
 * without a database. Persistent DB behaviour is covered separately in
 * `tests/integration/vault-material-db.test.ts`.
 *
 * Run via `npm test` (which enables `--experimental-test-module-mocks`);
 * `mock.module` must register the fakes before the route is imported.
 */

type Row = { userId: string } & Record<string, unknown>;
type MockModuleOptions = Parameters<typeof mock.module>[1];

let session: { user: { id: string; email: string; name: string } } | null = null;

mock.module("@/auth", {
  exports: {
    auth: async () => session,
    handlers: {},
    signIn: async () => {},
    signOut: async () => {},
    sessionMaxAge: 0,
  },
} as unknown as MockModuleOptions);

const rows = new Map<string, Row>();
const prisma = {
  vaultMaterial: {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      rows.get(where.userId) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: Row;
      update: Row;
    }) => {
      const existing = rows.get(where.userId);
      const next = existing ? { ...existing, ...update } : { ...create };
      rows.set(where.userId, next);
      return next;
    },
  },
};
mock.module("@/lib/prisma", { exports: { prisma } } as unknown as MockModuleOptions);

// The route is imported *after* the mocks are registered (tsx compiles this
// file to CJS, so the import cannot be a top-level `await`).
let GET: typeof import("@/app/api/vault/material/route").GET;
let PUT: typeof import("@/app/api/vault/material/route").PUT;
before(async () => {
  const route = await import("@/app/api/vault/material/route");
  GET = route.GET;
  PUT = route.PUT;
});

// --- helpers ----------------------------------------------------------------

const BASE = "http://localhost/api/vault/material";
const b64 = (bytes: number) => Buffer.from(new Uint8Array(bytes)).toString("base64");

function validMaterial() {
  return {
    kdf: { name: "PBKDF2-SHA256", hash: "SHA-256", iterations: 600_000, salt: b64(16) },
    createdAt: "2026-10-13T10:00:00.000Z",
    wrappedByPassphrase: {
      v: 1,
      alg: "AES-256-GCM",
      purpose: "vk:passphrase",
      iv: b64(12),
      ct: b64(48),
    },
    wrappedByRecoveryKey: {
      v: 1,
      alg: "AES-256-GCM",
      purpose: "vk:recovery",
      iv: b64(12),
      ct: b64(48),
    },
  };
}

function asUser(id: string | null): void {
  session = id ? { user: { id, email: `${id}@example.test`, name: id } } : null;
}

function putRequest(
  body: unknown,
  opts: { origin?: string | null; ip?: string; headers?: Record<string, string> } = {},
): NextRequest {
  const origin = opts.origin === undefined ? "http://localhost" : opts.origin;
  return new NextRequest(BASE, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": opts.ip ?? "203.0.113.1",
      ...(origin ? { origin } : {}),
      ...opts.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// --- 1–3. authentication & origin ordering ----------------------------------

describe("vault material route: access control", () => {
  test("unauthenticated GET is 401", async () => {
    asUser(null);
    const res = await GET();
    assert.equal(res.status, 401);
  });

  test("unauthenticated PUT with a valid origin is 401", async () => {
    asUser(null);
    const res = await PUT(putRequest({ material: validMaterial() }));
    assert.equal(res.status, 401);
  });

  test("cross-origin PUT is 403 before any auth or storage work", async () => {
    asUser(null);
    rows.clear();
    const res = await PUT(
      putRequest({ material: validMaterial() }, { origin: "https://evil.example" }),
    );
    assert.equal(res.status, 403);
    assert.equal(rows.size, 0);
  });
});

// --- 4. happy path ----------------------------------------------------------

describe("vault material route: round-trip", () => {
  test("an authenticated PUT then GET returns the same material", async () => {
    asUser("u-round");
    rows.clear();
    const material = validMaterial();

    const put = await PUT(putRequest({ material }, { ip: "10.1.0.1" }));
    assert.equal(put.status, 200);

    const get = await GET();
    assert.equal(get.status, 200);
    const json = (await get.json()) as { data: { material: unknown } };
    assert.deepEqual(json.data.material, material);
  });
});

// --- 5–6. validation --------------------------------------------------------

describe("vault material route: validation", () => {
  test("an unknown envelope field is rejected with 422", async () => {
    asUser("u-envelope");
    const res = await PUT(
      putRequest({ material: validMaterial(), extra: 1 }, { ip: "10.1.0.2" }),
    );
    assert.equal(res.status, 422);
  });

  test("invalid material is rejected and never persisted", async () => {
    asUser("u-invalid");
    rows.clear();
    const material = { ...validMaterial(), passphrase: "hunter2" };
    const res = await PUT(putRequest({ material }, { ip: "10.1.0.3" }));
    assert.equal(res.status, 422);
    assert.equal(rows.has("u-invalid"), false);
  });
});

// --- 7. request-body size cap ----------------------------------------------

describe("vault material route: request-body cap", () => {
  test("normal valid JSON is accepted", async () => {
    asUser("u-size-ok");
    const res = await PUT(putRequest({ material: validMaterial() }, { ip: "10.2.0.1" }));
    assert.equal(res.status, 200);
  });

  test("an oversized declared Content-Length is rejected with 413", async () => {
    asUser("u-size-declared");
    // A dishonest Content-Length alone (body is tiny) must trip the fast reject.
    const res = await PUT(
      putRequest("{}", { ip: "10.2.0.2", headers: { "content-length": "999999" } }),
    );
    assert.equal(res.status, 413);
  });

  test("an oversized stream with a misleadingly small Content-Length is rejected", async () => {
    asUser("u-size-misleading");
    // Content-Length claims 10 bytes but ~9 KiB is streamed: the cap is enforced
    // on the real bytes, so the header is not trusted.
    const res = await PUT(
      putRequest("x".repeat(9000), {
        ip: "10.2.0.3",
        headers: { "content-length": "10" },
      }),
    );
    assert.equal(res.status, 413);
  });

  test("an oversized stream with no Content-Length is rejected without DB writes", async () => {
    asUser("u-size-stream");
    rows.clear();
    const res = await PUT(putRequest("x".repeat(9000), { ip: "10.2.0.4" }));
    assert.equal(res.status, 413);
    assert.equal(rows.has("u-size-stream"), false);
  });

  test("malformed JSON is rejected with 400", async () => {
    asUser("u-json");
    const res = await PUT(putRequest("{ not json", { ip: "10.2.0.5" }));
    assert.equal(res.status, 400);
  });
});

// --- 8. rate limiting -------------------------------------------------------

describe("vault material route: rate limiting", () => {
  test("allows up to the limit then returns 429", async () => {
    asUser("u-rate");
    let last = 0;
    for (let i = 0; i < 30; i += 1) {
      last = (await PUT(putRequest({ material: validMaterial() }, { ip: "10.3.0.1" }))).status;
      assert.equal(last, 200);
    }
    const blocked = await PUT(putRequest({ material: validMaterial() }, { ip: "10.3.0.1" }));
    assert.equal(blocked.status, 429);
  });

  test("rate limit is per user: one user's exhausted bucket does not block another", async () => {
    asUser("u-rate-a");
    for (let i = 0; i < 31; i += 1) {
      await PUT(putRequest({ material: validMaterial() }, { ip: "10.3.0.2" }));
    }
    assert.equal(
      (await PUT(putRequest({ material: validMaterial() }, { ip: "10.3.0.2" }))).status,
      429,
    );

    asUser("u-rate-b");
    const other = await PUT(putRequest({ material: validMaterial() }, { ip: "10.3.0.3" }));
    assert.equal(other.status, 200);
  });
});

// --- 9. corrupt stored row --------------------------------------------------

describe("vault material route: corrupt stored row", () => {
  test("a stored row that no longer validates returns 500 without leaking internals", async () => {
    asUser("u-corrupt");
    rows.set("u-corrupt", {
      userId: "u-corrupt",
      kdfName: "PBKDF2-SHA256",
      kdfHash: "SHA-256",
      kdfIterations: 600_000,
      kdfSalt: b64(16),
      materialCreatedAt: new Date("2026-10-13T10:00:00.000Z"),
      wrappedByPassphrase: "{ this is not json",
      wrappedByRecoveryKey: "{}",
    });

    const res = await GET();
    assert.equal(res.status, 500);

    const raw = (await res.text()).toLowerCase();
    assert.ok(!raw.includes("wrappedbypassphrase"), "must not echo stored fields");
    assert.ok(!raw.includes("stack"), "must not leak a stack trace");
    assert.ok(!raw.includes("sql"), "must not leak SQL");
  });
});
