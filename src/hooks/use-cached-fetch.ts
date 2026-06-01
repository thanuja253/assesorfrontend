"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type ApiCacheScope, API_CACHE_TTL, getCached, peekCached } from "@/lib/api-cache";

type UseCachedFetchOptions = {
  scope: ApiCacheScope;
  cacheKey: string;
  ttlMs?: number;
  enabled?: boolean;
};

type UseCachedFetchResult<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  refresh: () => void;
};

/**
 * Loads data with in-memory cache: shows cached values immediately, then revalidates.
 */
export function useCachedFetch<T>(
  fetcher: () => Promise<T>,
  { scope, cacheKey, ttlMs, enabled = true }: UseCachedFetchOptions,
): UseCachedFetchResult<T> {
  const ttl = ttlMs ?? API_CACHE_TTL[scope];
  const [data, setData] = useState<T | null>(() => peekCached<T>(scope, cacheKey) ?? null);
  const [loading, setLoading] = useState(() => enabled && peekCached<T>(scope, cacheKey) === undefined);
  const [error, setError] = useState("");
  const generationRef = useRef(0);

  const load = useCallback(
    async (forceLoading: boolean) => {
      if (!enabled) {
        return;
      }
      const generation = ++generationRef.current;
      const hasCached = peekCached<T>(scope, cacheKey) !== undefined;
      if (forceLoading && !hasCached) {
        setLoading(true);
      }
      setError("");
      try {
        const result = await getCached(scope, cacheKey, ttl, fetcher);
        if (generation !== generationRef.current) {
          return;
        }
        setData(result);
      } catch (e: unknown) {
        if (generation !== generationRef.current) {
          return;
        }
        const message = e instanceof Error ? e.message : "Could not load data.";
        setError(message);
      } finally {
        if (generation === generationRef.current) {
          setLoading(false);
        }
      }
    },
    [cacheKey, enabled, fetcher, scope, ttl],
  );

  useEffect(() => {
    const cached = peekCached<T>(scope, cacheKey);
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
    }
    void load(cached === undefined);
  }, [cacheKey, enabled, load, scope]);

  const refresh = useCallback(() => {
    void load(true);
  }, [load]);

  return { data, loading, error, refresh };
}
