import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { after, before, describe, test } from "node:test";
import path from "node:path";

/**
 * Integration coverage for `GET /api/system`.
 *
 * Boots the real production server (`next start`) and talks to it over HTTP,
 * so this exercises routing, the auth gate and JSON serialisation exactly as a
 * client would hit them. Requires a prior `next build` (`.next/BUILD_ID`).
 */

const PORT = Number.parseInt(process.env.INTEGRATION_PORT ?? "3299", 10);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();

let server: ChildProcess | null = null;
let ready = false;

async function waitForServer(child: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }
    try {
      // Any HTTP response (even 401) means the server is listening.
      await fetch(`${BASE}/api/system`, { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  throw new Error("timed out waiting for the server to start");
}

describe("GET /api/system (integration)", () => {
  before(async () => {
    const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

    server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
      stdio: "ignore",
    });

    await waitForServer(server);
    ready = true;
  });

  after(() => {
    if (server && server.exitCode === null) {
      server.kill();
    }
  });

  test("rejects an unauthenticated request with 401", async () => {
    assert.ok(ready, "server should be running");

    const res = await fetch(`${BASE}/api/system`, { redirect: "manual" });
    assert.equal(res.status, 401);

    const body = (await res.json()) as { error?: { message?: string } };
    assert.ok(body.error, "error envelope should be present");
    assert.equal(typeof body.error?.message, "string");
  });

  test("never leaks operational or security internals", async () => {
    const res = await fetch(`${BASE}/api/system`, { redirect: "manual" });
    const raw = (await res.text()).toLowerCase();

    const forbidden = [
      "encryption",
      "plaintext",
      "aes",
      "scrypt",
      "cipher",
      "tesseract",
      "storage",
      "dev.db",
      "database_url",
      "auth_secret",
      "documents_encryption_key",
      "configurationissues",
      "acceptedmimetypes",
      "maxuploadbytes",
      "api_key",
      "apikey",
      "openai",
      "anthropic",
      "gemini",
    ];

    for (const term of forbidden) {
      assert.ok(!raw.includes(term), `response must not contain "${term}"`);
    }
  });
});
