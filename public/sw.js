/*
 * FamilyVault AI service worker.
 *
 * What it may cache: the offline reading page and the immutable build assets
 * under /_next/static. What it must never cache: API responses, document files,
 * OCR text, or any authenticated HTML — one user's vault must never be readable
 * by another, and "no-store" from the server has to mean something here too.
 *
 * So there are exactly two jobs:
 *   1. Keep the offline page reachable with no network, so the device's own
 *      encrypted snapshot can be read into it.
 *   2. Serve the app shell's static assets quickly (cache-first), so the app
 *      itself loads fast and works when the network is flaky.
 * Navigations are always network-first and are never written to the cache.
 */

const VERSION = "v2";
const STATIC_CACHE = `fv-static-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icon.svg"];

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Offline · FamilyVault AI</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#f8fafc; color:#0f172a; }
  main { max-width:24rem; padding:2rem; text-align:center; }
  h1 { font-size:1.25rem; margin:0 0 .5rem; }
  p { color:#475569; line-height:1.6; margin:0; }
</style></head>
<body><main>
  <h1>You are offline</h1>
  <p>FamilyVault AI needs a connection to reach your vault. Your documents are safe — reconnect and try again.</p>
</main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Only immutable, non-private build output is worth keeping. */
function isCacheableAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch API traffic or document downloads.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // Navigations: network only. Cache only the standalone offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        if (cached) return cached;
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }),
    );
    return;
  }

  // Build assets: cache-first, refreshed in the background.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200) cache.put(request, response.clone());
            return response;
          })
          .catch(() => undefined);

        return cached || (await network) || Response.error();
      }),
    );
  }
});
