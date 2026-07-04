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

export async function loadLows(cc: string): Promise<LowsMap> {
  return request(`/local-api/lows?cc=${encodeURIComponent(cc)}`);
}

export async function reportLows(
  cc: string,
  prices: Record<string, { finalCents: number; currency: string }>,
): Promise<LowsMap> {
  return request('/local-api/lows', jsonInit('POST', { cc, prices }));
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
