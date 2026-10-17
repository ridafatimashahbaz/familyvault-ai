/*
 * FamilyVault PWA service worker.
 *
 * The app is local-first: every document lives in this browser's own storage,
 * and the app makes no requests for private data at all. So the worker has one
 * job — keep the app usable with no network, so the installed app opens on a
 * plane, in a basement, or with the router off.
 *
 * How each kind of request is answered:
 *   - opening the app (a navigation) goes to the network first and only falls
 *     back to the saved copy when there is no network. A new release is
 *     therefore picked up on the very next open instead of being pinned by a
 *     stale shell — this file is copied unchanged between builds, so it cannot
 *     itself mark "a new version is here".
 *   - built assets, icons, the manifest, the on-device reading files and the
 *     demo samples are cached and served from cache first. Built assets carry a
 *     content hash in their URL, so a new release simply asks for new URLs and
 *     old entries are swept out on activation.
 *
 * What it never caches:
 *   - anything under /api/ (there is nothing there in a static build — this is a
 *     guard in case a route is ever added by mistake);
 *   - anything that is not a GET request.
 *
 * Document data is never fetched over the network, so it never passes through
 * here: it lives in IndexedDB and is decrypted in the page, not in this worker.
 */

const VERSION = "v3";
const SHELL_CACHE = `fv-pwa-shell-${VERSION}`;
const ASSET_CACHE = `fv-pwa-assets-${VERSION}`;

/** Fetched during install so the app opens offline from the very first launch. */
const SHELL_PATHS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/apple-touch-icon.png",
];

/**
 * Everything the built shell references — found by reading the HTML during
 * install, so the very first offline launch works. Without this, a chunk that
 * was never requested while online would be missing from the cache and the
 * app would open to a blank, never-hydrating shell.
 */
async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);

  const put = async (path, cache) => {
    try {
      const response = await fetch(path, { cache: "reload" });
      if (response && response.status === 200) await cache.put(path, response);
    } catch {
      // Individually best-effort: one missing file never fails the install.
    }
  };

  await Promise.all(SHELL_PATHS.map((path) => put(path, shell)));

  // Parse the built page for its script/style URLs and cache those too.
  try {
    const page = await fetch("/", { cache: "reload" });
    if (page && page.status === 200) {
      // Clone before the body is read — a used body cannot be cloned.
      await shell.put("/", page.clone());
      const html = await page.text();
      const urls = new Set();
      for (const match of html.matchAll(/\/_next\/[^"'>\s)]+/g)) urls.add(match[0]);
      await Promise.all([...urls].map((path) => put(path, assets)));
    }
  } catch {
    // Offline during install: the runtime handlers fill this in once online.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await precacheShell();
      } catch {
        // A browser that refuses Cache Storage still gets a working app.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/reading-runtime/") ||
      url.pathname.startsWith("/recognition-samples/") ||
      url.pathname === "/icon.svg" ||
      url.pathname === "/apple-touch-icon.png" ||
      url.pathname === "/manifest.webmanifest")
  );
}

/** Cache-first with a quiet refresh, for immutable build output. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

/**
 * Opening the app: ask the network first so a new release is used on the next
 * open, and fall back to the saved copy only when there is no network. The
 * saved copy is refreshed here as a side effect, so an app opened online once
 * will still open offline later.
 */
async function shellFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const network = await fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return (await network) || (await cache.match(request)) || (await cache.match("/")) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(shellFirst(request));
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
