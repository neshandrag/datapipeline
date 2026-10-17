import { useCallback, useEffect, useState } from "react";

const PREFIX = "dp:";

/** Build a cache key scoped to a page and, optionally, the active dataset. */
export const cacheKey = (page, scope) => `${PREFIX}${page}${scope ? `:${scope}` : ""}`;

const read = (key, fallback) => {
  if (!key) return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

/**
 * State that survives route changes and reloads within the same browser tab,
 * so returning to a page shows what was already fetched instead of refetching.
 */
export function usePersistentState(key, initial) {
  const [entry, setEntry] = useState(() => ({ key, value: read(key, initial) }));

  if (entry.key !== key) {
    setEntry({ key, value: read(key, initial) });
  }

  useEffect(() => {
    if (!entry.key) return;
    try {
      sessionStorage.setItem(entry.key, JSON.stringify(entry.value));
    } catch {
      // Cache is best-effort — ignore quota/serialization failures.
    }
  }, [entry]);

  const setValue = useCallback((next) => {
    setEntry((prev) => ({
      key: prev.key,
      value: typeof next === "function" ? next(prev.value) : next,
    }));
  }, []);

  return [entry.value, setValue];
}

/** Drop every cached page state — used on logout and when the dataset changes. */
export function clearPersistedState() {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // Ignore — nothing to clear if storage is unavailable.
  }
}
