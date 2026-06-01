import { AUTH_TOKEN_KEY } from "@/lib/auth-user";

/** TTL presets (ms) for cache scopes. */
export const API_CACHE_TTL = {
  /** Master data: states, industries, filter dropdowns. */
  filters: 30 * 60_000,
  /** Paginated project lists and similar tables. */
  listing: 2 * 60_000,
  /** Project tab / detail page GET payloads. */
  page: 5 * 60_000,
} as const;

export type ApiCacheScope = keyof typeof API_CACHE_TTL;

type CacheEntry = {
  value: unknown;
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function sessionFingerprint(): string {
  if (globalThis.window === undefined) {
    return "ssr";
  }
  const token = globalThis.window.localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    return "anon";
  }
  return token.length <= 16 ? token : token.slice(-16);
}

export function buildCacheKey(scope: string, key: string): string {
  return `${scope}:${sessionFingerprint()}:${key}`;
}

/** Synchronous read of a fresh cache entry (for instant UI hydration). */
export function peekCached<T>(scope: string, key: string): T | undefined {
  const fullKey = buildCacheKey(scope, key);
  const entry = store.get(fullKey);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) {
      store.delete(fullKey);
    }
    return undefined;
  }
  return entry.value as T;
}

export async function getCached<T>(
  scope: ApiCacheScope | string,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const fullKey = buildCacheKey(scope, key);
  const hit = store.get(fullKey);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  if (hit) {
    store.delete(fullKey);
  }

  const pending = inflight.get(fullKey);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = (async () => {
    try {
      const value = await fetcher();
      store.set(fullKey, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(fullKey);
    }
  })();

  inflight.set(fullKey, promise);
  return promise;
}

/** Drop all entries, or those whose full key contains `matcher`. */
export function invalidateApiCache(matcher?: string): void {
  if (!matcher) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.includes(matcher)) {
      store.delete(key);
    }
  }
  for (const key of inflight.keys()) {
    if (key.includes(matcher)) {
      inflight.delete(key);
    }
  }
}

export function clearApiCache(): void {
  invalidateApiCache();
}

/** Invalidate cached GET data for a single project (after saves/uploads). */
export function invalidateProjectPageCache(projectId: string): void {
  const id = projectId.trim();
  if (!id) {
    return;
  }
  invalidateApiCache(encodeURIComponent(id));
  invalidateApiCache(id);
}

/** Invalidate project detail cache and paginated list caches after a write. */
export function invalidateAfterProjectMutation(projectId: string): void {
  invalidateProjectPageCache(projectId);
  invalidateApiCache(":listing:");
}
