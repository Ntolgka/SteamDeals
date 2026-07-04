import type { PriceMap } from '../types';

/**
 * localStorage price cache, kept per storefront region so switching regions
 * never shows another region's prices. A refresh always overwrites it.
 */

interface CachePayload {
  version: 1;
  updatedAt: number;
  prices: PriceMap;
}

const key = (cc: string) => `steamdeals.cache.v1.${cc || 'auto'}`;

export function loadCache(cc: string): { prices: PriceMap; updatedAt: number } | null {
  try {
    const raw = localStorage.getItem(key(cc));
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

export function saveCache(cc: string, prices: PriceMap, updatedAt: number): void {
  try {
    const payload: CachePayload = { version: 1, updatedAt, prices };
    localStorage.setItem(key(cc), JSON.stringify(payload));
  } catch {
    // Quota/private-mode failures are non-fatal; the app just loses fast startup.
  }
}
