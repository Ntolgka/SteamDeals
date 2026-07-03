import type { PriceMap } from '../types';
import { STEAM_COUNTRY } from '../config';

/**
 * localStorage cache so the UI shows the last known prices instantly on
 * startup. A refresh always overwrites it with fresh data. The key includes
 * the configured country so changing regions never shows stale prices.
 */

const CACHE_KEY = `steamdeals.cache.v1.${STEAM_COUNTRY || 'auto'}`;

interface CachePayload {
  version: 1;
  updatedAt: number;
  prices: PriceMap;
}

export function loadCache(): { prices: PriceMap; updatedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (parsed?.version !== 1 || typeof parsed.updatedAt !== 'number' || !parsed.prices) {
      return null;
    }
    return { prices: parsed.prices, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

export function saveCache(prices: PriceMap, updatedAt: number): void {
  try {
    const payload: CachePayload = { version: 1, updatedAt, prices };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Quota/private-mode failures are non-fatal; the app just loses fast startup.
  }
}
