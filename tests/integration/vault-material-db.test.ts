import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";

/**
 * Isolated SQLite integration tests for the `VaultMaterial` model (Day 1 Phase 1
 * remediation, §6).
 *
 * These run against a throwaway database created *outside* the repository, in
 * the OS temp directory. The schema is built by executing the real committed
 * migration SQL (in order) — no `prisma migrate` command is run, and the real
 * `prisma/dev.db` is never opened, migrated or touched. A guard fails the run
 * if the temp path ever resolves to a repo/dev database.
 *
 * The point is to verify, against a *real* SQLite engine rather than a fake:
 *   - `userId` is unique,
 *   - upsert updates an existing row instead of creating a second one,
 *   - two users' material stays isolated,
 *   - deleting a user cascades to their material,
 *   - concurrent upserts for one user leave exactly one row.
 */

const REPO_ROOT = resolve(".");
const MIGRATIONS_DIR = join(REPO_ROOT, "prisma", "migrations");
const PROD_DB_NAMES = ["dev.db", "prod.db", "production.db"];

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(MIGRATIONS_DIR, entry.name, "migration.sql"))
    .sort(); // timestamp-prefixed directory names sort chronologically
}

type PrismaLike = {
  user: {
    create(args: unknown): Promise<{ id: string }>;
    delete(args: unknown): Promise<unknown>;
  };
  vaultMaterial: {
    create(args: unknown): Promise<unknown>;
    upsert(args: unknown): Promise<unknown>;
    findUnique(args: unknown): Promise<unknown>;
    count(args?: unknown): Promise<number>;
  };
  $disconnect(): Promise<void>;
};

let workDir: string;
let dbPath: string;
let prisma: PrismaLike;

const b64 = (bytes: number) => Buffer.from(new Uint8Array(bytes)).toString("base64");

function rowFor(userId: string) {
  return {
    userId,
    kdfName: "PBKDF2-SHA256",
    kdfHash: "SHA-256",
    kdfIterations: 600_000,
    kdfSalt: b64(16),
    materialCreatedAt: new Date("2026-10-13T10:00:00.000Z"),
    wrappedByPassphrase: JSON.stringify({
      v: 1,
      alg: "AES-256-GCM",
      purpose: "vk:passphrase",
      iv: b64(12),
      ct: b64(48),
    }),
    wrappedByRecoveryKey: JSON.stringify({
      v: 1,
      alg: "AES-256-GCM",
      purpose: "vk:recovery",
      iv: b64(12),
      ct: b64(48),
    }),
  };
}

async function createUser(email: string): Promise<string> {
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", name: email.split("@")[0] },
  });
  return user.id;
}

before(async () => {
  workDir = mkdtempSync(join(tmpdir(), "fv-vault-it-"));
  dbPath = join(workDir, "vault-it.db");

  // --- guard: this must never be a real application database ---------------
  const resolved = resolve(dbPath);
  if (!resolved.startsWith(resolve(tmpdir()))) {
    throw new Error(`refusing to run: temp DB is not under the OS temp dir (${resolved})`);
  }
  if (PROD_DB_NAMES.some((name) => resolved.endsWith(name))) {
    throw new Error(`refusing to run: temp DB name looks like a real database (${resolved})`);
  }

  // --- build the schema by executing the real migration SQL ----------------
  // `node:sqlite` is bundled with the Node 24 runtime but not the older
  // `@types/node` in this repo, so it is loaded through a non-literal specifier
  // (typed `any`) and narrowed locally.
  const sqliteSpecifier = "node:sqlite";
  const { DatabaseSync } = (await import(sqliteSpecifier)) as {
    DatabaseSync: new (path: string) => { exec(sql: string): void; close(): void };
  };

  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    for (const file of migrationFiles()) {
      db.exec(readFileSync(file, "utf8"));
    }
  } finally {
    db.close();
  }

  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient({
    datasourceUrl: `file:${dbPath}`,
  }) as unknown as PrismaLike;
});

after(async () => {
  await prisma?.$disconnect();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe("vault material (real SQLite): constraints and scoping", () => {
  test("a second row for the same user violates the unique constraint", async () => {
    const userId = await createUser("unique@example.test");
    await prisma.vaultMaterial.create({ data: rowFor(userId) });

    await assert.rejects(
      prisma.vaultMaterial.create({ data: rowFor(userId) }),
      (error: unknown) => /unique|constraint/i.test(String(error)),
    );
  });

  test("upsert replaces the existing row rather than adding a second", async () => {
    const userId = await createUser("upsert@example.test");
    const first = rowFor(userId);
    const second = { ...rowFor(userId), kdfIterations: 700_000 };

    await prisma.vaultMaterial.upsert({
      where: { userId },
      create: { ...first },
      update: {},
    });
    await prisma.vaultMaterial.upsert({
      where: { userId },
      create: { ...second },
      update: { kdfIterations: second.kdfIterations },
    });

    assert.equal(await prisma.vaultMaterial.count({ where: { userId } }), 1);
    const stored = (await prisma.vaultMaterial.findUnique({ where: { userId } })) as {
      kdfIterations: number;
    };
    assert.equal(stored.kdfIterations, 700_000);
  });

  test("two users' material stays isolated", async () => {
    const a = await createUser("iso-a@example.test");
    const b = await createUser("iso-b@example.test");

    await prisma.vaultMaterial.create({ data: { ...rowFor(a), kdfSalt: b64(16) } });
    await prisma.vaultMaterial.create({ data: { ...rowFor(b), kdfSalt: "AAECAwQFBgcICQoLDA0ODw==" } });

    const rowA = (await prisma.vaultMaterial.findUnique({ where: { userId: a } })) as {
      userId: string;
    };
    const rowB = (await prisma.vaultMaterial.findUnique({ where: { userId: b } })) as {
      userId: string;
    };
    assert.equal(rowA.userId, a);
    assert.equal(rowB.userId, b);
  });

  test("deleting a user cascades to their vault material", async () => {
    const userId = await createUser("cascade@example.test");
    await prisma.vaultMaterial.create({ data: rowFor(userId) });
    assert.ok(await prisma.vaultMaterial.findUnique({ where: { userId } }));

    await prisma.user.delete({ where: { id: userId } });

    assert.equal(await prisma.vaultMaterial.findUnique({ where: { userId } }), null);
  });

  test("concurrent upserts for one user leave exactly one row", async () => {
    const userId = await createUser("concurrent@example.test");

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        prisma.vaultMaterial.upsert({
          where: { userId },
          create: { ...rowFor(userId), kdfIterations: 600_000 + i },
          update: { kdfIterations: 600_000 + i },
        }),
      ),
    );

    assert.equal(await prisma.vaultMaterial.count({ where: { userId } }), 1);
  });
});
