import type { GameList, LowsMap, TrackedGame } from '../types';
import { getCountry } from '../config';

/** Client for the local API (see server/gamesApi.ts) and Steam store search. */

export interface SteamSearchItem {
  id: number;
  name: string;
  tiny_image?: string;
  price?: { currency: string; initial: number; final: number };
}

export interface BulkImportResult {
  added: TrackedGame[];
  failed: Array<{ name: string; reason: string }>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(json?.error ?? `Request failed (HTTP ${res.status}).`);
  }
  return json as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export async function loadState(): Promise<{ lists: GameList[] }> {
  return request('/local-api/state');
}

export async function createList(name: string): Promise<GameList> {
  return request('/local-api/lists', jsonInit('POST', { name }));
}

export async function renameList(listId: string, name: string): Promise<GameList> {
  return request(`/local-api/lists/${listId}`, jsonInit('PATCH', { name }));
}

export async function deleteList(listId: string): Promise<void> {
  await request(`/local-api/lists/${listId}`, { method: 'DELETE' });
}

export async function addGame(listId: string, name: string, appId: number): Promise<TrackedGame> {
  return request(`/local-api/lists/${listId}/games`, jsonInit('POST', { name, appId }));
}

export async function bulkImport(listId: string, names: string[]): Promise<BulkImportResult> {
  return request(
    `/local-api/lists/${listId}/games/bulk`,
    jsonInit('POST', { names, cc: getCountry() }),
  );
}

export async function setOwned(
  listId: string,
  appId: number,
  owned: boolean,
): Promise<TrackedGame> {
  return request(`/local-api/lists/${listId}/games/${appId}`, jsonInit('PATCH', { owned }));
}

export async function deleteGame(listId: string, appId: number): Promise<void> {
  await request(`/local-api/lists/${listId}/games/${appId}`, { method: 'DELETE' });
}

export async function moveGame(
  fromListId: string,
  appId: number,
  toListId: string,
): Promise<TrackedGame> {
  return request(
    `/local-api/lists/${fromListId}/games/${appId}/move`,
    jsonInit('POST', { toListId }),
  );
}

export interface WishlistFetchResult {
  steamId: string;
  items: Array<{ appid: number; dateAdded: number | null }>;
}

export async function fetchSteamWishlist(input: string): Promise<WishlistFetchResult> {
  return request(`/local-api/steam-wishlist?input=${encodeURIComponent(input)}`);
}

export async function bulkImportAppIds(
  listId: string,
  items: Array<{ appid: number; dateAdded: number | null }>,
): Promise<BulkImportResult> {
  return request(
    `/local-api/lists/${listId}/games/bulk-appids`,
    jsonInit('POST', { items, cc: getCountry() }),
  );
}

export async function importBackup(backup: unknown): Promise<{ ok: boolean; lists: number }> {
  return request('/local-api/import', jsonInit('POST', backup));
}

export async function loadLows(cc: string): Promise<LowsMap> {
  return request(`/local-api/lows?cc=${encodeURIComponent(cc)}`);
}

export async function reportLows(
  cc: string,
  prices: Record<string, { finalCents: number; currency: string }>,
): Promise<LowsMap> {
  return request('/local-api/lows', jsonInit('POST', { cc, prices }));
}

/**
 * Ask the local server to shut down. The process exits right after replying,
 * so a dropped connection is also a success — both resolve without throwing.
 */
export async function quitApp(): Promise<void> {
  try {
    await fetch('/local-api/quit', { method: 'POST' });
  } catch {
    // Connection reset because the server exited — that's the success path.
  }
}

export async function searchSteam(term: string, signal?: AbortSignal): Promise<SteamSearchItem[]> {
  const cc = getCountry() || 'us';
  const url = `/steam-api/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=${cc}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Steam search failed (HTTP ${res.status}).`);
  const json = (await res.json()) as { items?: unknown[] };
  return ((json.items ?? []) as SteamSearchItem[]).filter(
    (it) => typeof it?.id === 'number' && typeof it?.name === 'string',
  );
}
