import { useCallback, useEffect, useRef, useState } from 'react';
import type { LowsMap, PriceMap, TrackedGame } from '../types';
import { fetchPrices } from '../services/steamApi';
import { loadCache, saveCache } from '../services/cache';
import { loadLows, reportLows } from '../services/gamesApi';

interface DealsState {
  prices: PriceMap;
  lastRefresh: number | null;
  loading: boolean;
  /** Set only when the refresh as a whole failed (e.g. network down). */
  error: string | null;
}

const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * Owns price state for one storefront region: hydrates from the per-region
 * localStorage cache, refreshes on demand, automatically prices games with
 * no data yet, and keeps the server-side "lowest price observed" file
 * updated with every fetch.
 */
export function useDeals(games: TrackedGame[], cc: string) {
  const [state, setState] = useState<DealsState>(() => {
    const cached = loadCache(cc);
    return {
      prices: cached?.prices ?? {},
      lastRefresh: cached?.updatedAt ?? null,
      loading: false,
      error: null,
    };
  });
  const [lows, setLows] = useState<LowsMap>({});

  const inFlight = useRef(false);
  // Guards the auto-fetch effect against retry loops for ids that already failed.
  const attempted = useRef(new Set<number>());
  const staleChecked = useRef(false);

  // Region switch: rehydrate that region's cache and start fresh.
  const prevCc = useRef(cc);
  useEffect(() => {
    if (prevCc.current === cc) return;
    prevCc.current = cc;
    attempted.current.clear();
    staleChecked.current = false;
    const cached = loadCache(cc);
    setState({
      prices: cached?.prices ?? {},
      lastRefresh: cached?.updatedAt ?? null,
      loading: false,
      error: null,
    });
  }, [cc]);

  useEffect(() => {
    loadLows(cc)
      .then(setLows)
      .catch(() => setLows({}));
  }, [cc]);

  const fetchFor = useCallback(
    async (appIds: number[], fullRefresh: boolean) => {
      if (inFlight.current || appIds.length === 0) return;
      inFlight.current = true;
      for (const id of appIds) attempted.current.add(id);
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const fetched = await fetchPrices(appIds, cc);
        setState((s) => {
          const prices = fullRefresh ? fetched : { ...s.prices, ...fetched };
          const lastRefresh = fullRefresh || s.lastRefresh === null ? Date.now() : s.lastRefresh;
          saveCache(cc, prices, lastRefresh);
          return { prices, lastRefresh, loading: false, error: null };
        });

        // Record observations so the all-time-low file keeps improving.
        const observations: Record<string, { finalCents: number; currency: string }> = {};
        for (const p of Object.values(fetched)) {
          if (p.finalCents !== undefined && (p.currency || p.status === 'free')) {
            observations[p.appId] = {
              finalCents: p.finalCents,
              currency: p.currency ?? 'USD',
            };
          }
        }
        if (Object.keys(observations).length > 0) {
          reportLows(cc, observations).then(setLows).catch(() => undefined);
        }
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Refresh failed unexpectedly.',
        }));
      } finally {
        inFlight.current = false;
      }
    },
    [cc],
  );

  const refresh = useCallback(() => {
    attempted.current.clear();
    return fetchFor(games.map((g) => g.appId), true);
  }, [games, fetchFor]);

  // Cached prices older than the threshold trigger one automatic refresh.
  useEffect(() => {
    if (staleChecked.current || games.length === 0) return;
    staleChecked.current = true;
    if (state.lastRefresh !== null && Date.now() - state.lastRefresh > STALE_MS) {
      void fetchFor(games.map((g) => g.appId), true);
    }
  }, [games, state.lastRefresh, fetchFor]);

  // Price any games that have no data yet (first launch, newly added,
  // switched list, switched region). Full refresh when nothing was priced.
  useEffect(() => {
    const missing = games
      .filter((g) => !state.prices[g.appId] && !attempted.current.has(g.appId))
      .map((g) => g.appId);
    if (missing.length > 0) {
      void fetchFor(missing, missing.length === games.length);
    }
  }, [games, state.prices, fetchFor]);

  return { ...state, lows, refresh };
}
