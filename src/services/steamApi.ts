import type { GamePrice, PriceMap } from '../types';
import { STEAM_COUNTRY } from '../config';

/**
 * Steam Store API access.
 *
 * All requests go through the Vite proxy at /steam-api (see vite.config.ts)
 * because store.steampowered.com does not allow cross-origin browser calls.
 *
 * Strategy to keep request counts low:
 *  1. One batched appdetails call per chunk of apps with
 *     filters=price_overview (the only filter Steam allows for multi-app
 *     requests). This resolves paid games in very few requests.
 *  2. Apps that come back successful but without price data are then checked
 *     individually (small concurrency pool) to distinguish free-to-play games
 *     from region-restricted/unlisted ones.
 */

const PROXY_BASE = '/steam-api';
const BATCH_SIZE = 25;
const DETAIL_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const CC_PARAM = STEAM_COUNTRY ? `&cc=${STEAM_COUNTRY}` : '';

interface PriceOverview {
  currency: string;
  initial: number;
  final: number;
  discount_percent: number;
}

interface BatchEntry {
  success: boolean;
  // Steam returns `[]` instead of an object when there is no data to report.
  data?: { price_overview?: PriceOverview } | unknown[];
}

interface BasicEntry {
  success: boolean;
  data?: { is_free?: boolean; type?: string } | unknown[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 429) {
      throw new Error('Steam is rate-limiting requests. Wait a minute and try again.');
    }
    if (!res.ok) {
      throw new Error(`Steam responded with HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Run tasks with a fixed concurrency limit. Individual failures do not abort the pool. */
async function runPool(tasks: Array<() => Promise<void>>, limit: number): Promise<void> {
  const queue = [...tasks];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const task = queue.shift();
      if (task) await task();
    }
  });
  await Promise.all(workers);
}

function priceFromOverview(appId: number, po: PriceOverview, now: number): GamePrice {
  return {
    appId,
    status: po.discount_percent > 0 ? 'discounted' : 'full_price',
    currency: po.currency,
    initialCents: po.initial,
    finalCents: po.final,
    discountPercent: po.discount_percent,
    fetchedAt: now,
  };
}

/**
 * Fetch current prices for the given app ids.
 * Never throws for individual games — every id gets an entry, with
 * status 'error'/'unavailable' when something went wrong for it.
 */
export async function fetchPrices(appIds: number[]): Promise<PriceMap> {
  const now = Date.now();
  const result: PriceMap = {};
  const needsDetailCheck: number[] = [];

  const batches = chunk(appIds, BATCH_SIZE);
  await runPool(
    batches.map((ids) => async () => {
      const url = `${PROXY_BASE}/api/appdetails?appids=${ids.join(',')}&filters=price_overview${CC_PARAM}`;
      try {
        const payload = await fetchJson<Record<string, BatchEntry>>(url);
        for (const id of ids) {
          const entry = payload?.[String(id)];
          if (!entry || !entry.success) {
            result[id] = {
              appId: id,
              status: 'unavailable',
              message: 'Not available on Steam (invalid app id, delisted, or region-restricted).',
              fetchedAt: now,
            };
          } else if (
            entry.data &&
            !Array.isArray(entry.data) &&
            entry.data.price_overview
          ) {
            result[id] = priceFromOverview(id, entry.data.price_overview, now);
          } else {
            // Success but no price block: free-to-play or no price in this region.
            needsDetailCheck.push(id);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Request failed';
        for (const id of ids) {
          result[id] = { appId: id, status: 'error', message, fetchedAt: now };
        }
      }
    }),
    2,
  );

  await runPool(
    needsDetailCheck.map((id) => async () => {
      const url = `${PROXY_BASE}/api/appdetails?appids=${id}&filters=basic${CC_PARAM}`;
      try {
        const payload = await fetchJson<Record<string, BasicEntry>>(url);
        const entry = payload?.[String(id)];
        const data = entry?.success && !Array.isArray(entry.data) ? entry.data : undefined;
        if (data?.is_free) {
          result[id] = { appId: id, status: 'free', finalCents: 0, fetchedAt: now };
        } else {
          result[id] = {
            appId: id,
            status: 'unavailable',
            message: 'No pricing available (not sold in this region or not purchasable).',
            fetchedAt: now,
          };
        }
      } catch (err) {
        result[id] = {
          appId: id,
          status: 'error',
          message: err instanceof Error ? err.message : 'Request failed',
          fetchedAt: now,
        };
      }
    }),
    DETAIL_CONCURRENCY,
  );

  return result;
}

/** Steam CDN header image, used when games.json has no headerImage set. */
export function headerImageUrl(appId: number): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}
