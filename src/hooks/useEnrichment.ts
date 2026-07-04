import { useEffect, useRef, useState } from 'react';
import type { GameEnrichment, TrackedGame } from '../types';
import { ensureEnrichment, loadCachedEnrichment } from '../services/enrich';

/**
 * Loads review/tags/playtime data for the given games: cached values appear
 * immediately, missing or stale ones are fetched sequentially in the
 * background (one game at a time) so the extra services are never hammered.
 */
export function useEnrichment(games: TrackedGame[]) {
  const [enrichment, setEnrichment] = useState<Record<number, GameEnrichment>>({});
  const inQueue = useRef(new Set<number>());
  const running = useRef(false);
  const queue = useRef<TrackedGame[]>([]);

  useEffect(() => {
    // Surface cached data instantly for any game we haven't loaded yet.
    setEnrichment((prev) => {
      let next = prev;
      for (const g of games) {
        if (prev[g.appId]) continue;
        const cached = loadCachedEnrichment(g.appId);
        if (cached) {
          if (next === prev) next = { ...prev };
          next[g.appId] = cached;
        }
      }
      return next;
    });

    for (const g of games) {
      if (!inQueue.current.has(g.appId)) {
        inQueue.current.add(g.appId);
        queue.current.push(g);
      }
    }

    if (running.current) return;
    running.current = true;
    void (async () => {
      while (queue.current.length > 0) {
        const game = queue.current.shift()!;
        const data = await ensureEnrichment(game.appId, game.name);
        setEnrichment((prev) => ({ ...prev, [game.appId]: data }));
      }
      running.current = false;
    })();
  }, [games]);

  return enrichment;
}
