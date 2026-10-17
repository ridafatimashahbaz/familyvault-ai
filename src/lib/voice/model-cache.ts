/**
 * The on-device model is stored by transformers.js in the browser's Cache API.
 * These helpers let the app report that, and — importantly — purge it on
 * sign-out alongside the offline snapshot, so a shared device leaves nothing
 * behind.
 */

const CACHE_HINTS = ["transformers", "huggingface", "hf"];

function cacheNames(): Promise<string[]> {
  if (typeof caches === "undefined") return Promise.resolve([]);
  return caches.keys();
}

export async function isVoiceModelCached(): Promise<boolean> {
  const names = await cacheNames();
  return names.some((name) => CACHE_HINTS.some((hint) => name.toLowerCase().includes(hint)));
}

/** Removes the cached model files. Safe to call when nothing is cached. */
export async function clearVoiceModelCache(): Promise<void> {
  if (typeof caches === "undefined") return;
  const names = await cacheNames();
  const modelCaches = names.filter((name) =>
    CACHE_HINTS.some((hint) => name.toLowerCase().includes(hint)),
  );
  await Promise.all(modelCaches.map((name) => caches.delete(name)));
}
