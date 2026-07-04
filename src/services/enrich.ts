import type { GameEnrichment, GameHltb, GameMeta, GameReview } from '../types';

/**
 * Per-game metadata that changes slowly and is therefore cached aggressively
 * in localStorage:
 *
 *  - review:  Steam's official appreviews summary (% positive, count)
 *  - meta:    community tags from the Steam store page (via the local
 *             server, which bypasses the age gate — SteamSpy has no data
 *             for adult titles). The store page only exposes the top ~20
 *             tags, so RPGMaker detection additionally scans SteamSpy's
 *             full tag list; SteamSpy also provides the playtime fallback
 *             when HLTB has nothing.
 *
 * Lookups run through a single queue with a small gap between requests so a
 * large list never hammers any of these services.
 */

const CACHE_PREFIX = 'steamdeals.enrich.v3.';
const REVIEW_TTL = 3 * 24 * 60 * 60 * 1000;
const META_TTL = 7 * 24 * 60 * 60 * 1000;
const HLTB_TTL = 14 * 24 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 300;

export function loadCachedEnrichment(appId: number): GameEnrichment | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + appId);
    return raw ? (JSON.parse(raw) as GameEnrichment) : null;
  } catch {
    return null;
  }
}

function saveCachedEnrichment(appId: number, data: GameEnrichment): void {
  try {
    localStorage.setItem(CACHE_PREFIX + appId, JSON.stringify(data));
  } catch {
    // Cache-full is non-fatal.
  }
}

const fresh = (fetchedAt: number | undefined, ttl: number) =>
  fetchedAt !== undefined && Date.now() - fetchedAt < ttl;

const RPGMAKER_RE = /rpg\s*maker/i;

async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchReview(appId: number): Promise<GameReview> {
  const json = await fetchJson<{
    query_summary?: { review_score_desc?: string; total_positive?: number; total_reviews?: number };
  }>(`/steam-api/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`);
  const s = json.query_summary;
  const total = s?.total_reviews ?? 0;
  return {
    percent: total > 0 ? Math.round(((s?.total_positive ?? 0) / total) * 100) : null,
    total,
    desc: s?.review_score_desc ?? '',
    fetchedAt: Date.now(),
  };
}

/** Store-page community tags (works for age-gated games too). */
async function fetchStoreTags(appId: number): Promise<string[]> {
  const json = await fetchJson<{ tags?: string[] }>(`/local-api/tags?appid=${appId}`, 20_000);
  return json.tags ?? [];
}

interface SteamSpyData {
  tags: string[];
  avgHours: number | null;
}

async function fetchSteamSpy(appId: number): Promise<SteamSpyData> {
  const json = await fetchJson<{
    tags?: Record<string, number> | unknown[];
    average_forever?: number;
  }>(`/steamspy/api.php?request=appdetails&appid=${appId}`);
  const tagVotes =
    json.tags && !Array.isArray(json.tags) ? Object.entries(json.tags) : ([] as Array<[string, number]>);
  tagVotes.sort((a, b) => b[1] - a[1]);
  return {
    tags: tagVotes.map(([t]) => t),
    avgHours:
      json.average_forever && json.average_forever > 0
        ? Math.round((json.average_forever / 60) * 10) / 10
        : null,
  };
}

async function fetchHltb(title: string): Promise<GameHltb> {
  const json = await fetchJson<{
    result: { matchedName: string; mainHours: number | null; extraHours: number | null } | null;
  }>(`/local-api/hltb?title=${encodeURIComponent(title)}`, 25_000);
  return {
    mainHours: json.result?.mainHours ?? null,
    extraHours: json.result?.extraHours ?? null,
    matchedName: json.result?.matchedName ?? null,
    fetchedAt: Date.now(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildMeta(tagNames: string[], avgHours: number | null, rpgMakerHint: boolean): GameMeta {
  return {
    tags: tagNames.filter((t) => !RPGMAKER_RE.test(t)).slice(0, 3),
    rpgMaker: rpgMakerHint || tagNames.some((t) => RPGMAKER_RE.test(t)),
    avgHours,
    fetchedAt: Date.now(),
  };
}

/**
 * Ensure enrichment for one game, refreshing only the stale parts.
 * Returns the (possibly updated) enrichment, or the cached one on failure.
 */
export async function ensureEnrichment(appId: number, title: string): Promise<GameEnrichment> {
  const cached = loadCachedEnrichment(appId) ?? {};
  const result: GameEnrichment = { ...cached };
  let changed = false;

  if (!fresh(cached.review?.fetchedAt, REVIEW_TTL)) {
    try {
      result.review = await fetchReview(appId);
      changed = true;
      await sleep(REQUEST_GAP_MS);
    } catch {
      /* keep stale/absent review */
    }
  }

  if (!fresh(cached.hltb?.fetchedAt, HLTB_TTL)) {
    try {
      result.hltb = await fetchHltb(title);
      changed = true;
      await sleep(REQUEST_GAP_MS);
    } catch {
      /* keep stale/absent hltb */
    }
  }

  if (!fresh(cached.meta?.fetchedAt, META_TTL)) {
    try {
      let tags = await fetchStoreTags(appId);
      let avgHours: number | null = null;
      let rpgMakerHint = false;

      // The store page caps at ~20 tags, so SteamSpy's full list is still
      // needed for RPGMaker detection (and as tag/playtime fallback).
      await sleep(REQUEST_GAP_MS);
      try {
        const spy = await fetchSteamSpy(appId);
        avgHours = spy.avgHours;
        rpgMakerHint = spy.tags.some((t) => RPGMAKER_RE.test(t));
        if (tags.length === 0) tags = spy.tags;
      } catch {
        /* SteamSpy is best-effort */
      }

      result.meta = buildMeta(tags, avgHours, rpgMakerHint);
      changed = true;
      await sleep(REQUEST_GAP_MS);
    } catch {
      /* keep stale/absent meta */
    }
  }

  if (changed) saveCachedEnrichment(appId, result);
  return result;
}
