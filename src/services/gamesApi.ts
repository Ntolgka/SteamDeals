import type { TrackedGame } from '../types';
import { STEAM_COUNTRY } from '../config';

/** Client for the local games-list API (see server/gamesApi.ts) and Steam search. */

export interface SteamSearchItem {
  id: number;
  name: string;
  tiny_image?: string;
  price?: { currency: string; initial: number; final: number };
}

export async function loadGames(): Promise<TrackedGame[]> {
  const res = await fetch('/local-api/games');
  if (!res.ok) throw new Error(`Could not load the game list (HTTP ${res.status}).`);
  return (await res.json()) as TrackedGame[];
}

export async function addGame(name: string, appId: number): Promise<TrackedGame> {
  const res = await fetch('/local-api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, appId }),
  });
  const json = (await res.json().catch(() => null)) as
    | (TrackedGame & { error?: string })
    | { error?: string }
    | null;
  if (!res.ok) {
    throw new Error(json && 'error' in json && json.error ? json.error : `Failed to add game (HTTP ${res.status}).`);
  }
  return json as TrackedGame;
}

export async function setOwned(appId: number, owned: boolean): Promise<TrackedGame> {
  const res = await fetch(`/local-api/games/${appId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owned }),
  });
  const json = (await res.json().catch(() => null)) as (TrackedGame & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(json?.error ?? `Failed to update game (HTTP ${res.status}).`);
  }
  return json as TrackedGame;
}

export async function deleteGame(appId: number): Promise<void> {
  const res = await fetch(`/local-api/games/${appId}`, { method: 'DELETE' });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? `Failed to remove game (HTTP ${res.status}).`);
  }
}

export async function searchSteam(term: string, signal?: AbortSignal): Promise<SteamSearchItem[]> {
  const cc = STEAM_COUNTRY || 'us';
  const url = `/steam-api/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=${cc}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Steam search failed (HTTP ${res.status}).`);
  const json = (await res.json()) as { items?: unknown[] };
  return ((json.items ?? []) as SteamSearchItem[]).filter(
    (it) => typeof it?.id === 'number' && typeof it?.name === 'string',
  );
}
