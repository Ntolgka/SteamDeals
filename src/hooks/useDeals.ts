import { useCallback, useEffect, useRef, useState } from 'react';
import type { PriceMap, TrackedGame } from '../types';
import { fetchPrices } from '../services/steamApi';
import { loadCache, saveCache } from '../services/cache';

interface DealsState {
  prices: PriceMap;
  lastRefresh: number | null;
  loading: boolean;
  /** Set only when the refresh as a whole failed (e.g. network down). */
  error: string | null;
}

/**
 * Owns price state: hydrates from the localStorage cache on mount, refreshes
 * all tracked games on demand, and automatically prices games that have no
 * data yet (first launch, or just added via the UI).
 */
export function useDeals(games: TrackedGame[]) {
  const [state, setState] = useState<DealsState>(() => {
    const cached = loadCache();
    return {
      prices: cached?.prices ?? {},
      lastRefresh: cached?.updatedAt ?? null,
      loading: false,
      error: null,
    };
  });

  const inFlight = useRef(false);
  // Guards the auto-fetch effect against retry loops for ids that already failed.
  const attempted = useRef(new Set<number>());
  const staleChecked = useRef(false);

  const fetchFor = useCallback(async (appIds: number[], fullRefresh: boolean) => {
    if (inFlight.current || appIds.length === 0) return;
    inFlight.current = true;
    for (const id of appIds) attempted.current.add(id);
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const fetched = await fetchPrices(appIds);
      setState((s) => {
        const prices = fullRefresh ? fetched : { ...s.prices, ...fetched };
        const lastRefresh = fullRefresh || s.lastRefresh === null ? Date.now() : s.lastRefresh;
        saveCache(prices, lastRefresh);
        return { prices, lastRefresh, loading: false, error: null };
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Refresh failed unexpectedly.',
      }));
    } finally {
      inFlight.current = false;
    }
  }, []);

  const refresh = useCallback(() => {
    attempted.current.clear();
    return fetchFor(games.map((g) => g.appId), true);
  }, [games, fetchFor]);

  // Cached prices older than this trigger one automatic refresh on launch.
  const STALE_MS = 6 * 60 * 60 * 1000;
  useEffect(() => {
    if (staleChecked.current || games.length === 0) return;
    staleChecked.current = true;
    if (state.lastRefresh !== null && Date.now() - state.lastRefresh > STALE_MS) {
      void fetchFor(games.map((g) => g.appId), true);
    }
  }, [games, state.lastRefresh, fetchFor, STALE_MS]);

  // Price any games that have no data yet. Treated as a full refresh when
  // nothing was priced before (first ever launch).
  useEffect(() => {
    const missing = games
      .filter((g) => !state.prices[g.appId] && !attempted.current.has(g.appId))
      .map((g) => g.appId);
    if (missing.length > 0) {
      void fetchFor(missing, missing.length === games.length);
    }
  }, [games, state.prices, fetchFor]);

  return { ...state, refresh };
}
