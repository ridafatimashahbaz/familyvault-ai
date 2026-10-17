/**
 * Fixed-window rate limiter.
 *
 * State lives in process memory, so this protects a single Node process.
 * On multi-instance or serverless deployments put a shared store (for example
 * Upstash Redis) behind the same interface - see docs/DEPLOYMENT.md.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Sweeps finished windows so a long-lived process does not grow without bound.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, limit, remaining: limit - 1, resetAt: now + windowMs };
  }

  existing.count += 1;
  const ok = existing.count <= limit;
  return {
    ok,
    limit,
    remaining: Math.max(0, limit - existing.count),
    resetAt: existing.resetAt,
  };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Rejects same-origin mutations that carry a cross-site Origin header.
 * Cookie SameSite=Lax already blocks most CSRF, but form-less fetches from
 * a malicious page can still slip through in some browsers.
 */
export function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser clients and same-origin GETs

  try {
    const url = new URL(request.url);
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}
