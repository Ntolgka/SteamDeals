import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * File-backed storage for the local API.
 *
 * data/games.json  — game lists. Legacy v1 files (a plain array of games)
 *                    are migrated automatically into v2 shape with a single
 *                    list named "HHH" (per user request), preserving entries.
 * data/lows.json   — lowest price ever observed per region per app, updated
 *                    on every refresh the client performs.
 */

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const GAMES_PATH = join(DATA_DIR, 'games.json');
const LOWS_PATH = join(DATA_DIR, 'lows.json');

export interface GameEntry {
  name: string;
  appId: number;
  steamUrl: string;
  headerImage: string;
  owned?: boolean;
  addedAt?: number;
}

export interface GameList {
  id: string;
  name: string;
  createdAt: number;
  games: GameEntry[];
}

interface GamesFileV2 {
  version: 2;
  lists: GameList[];
}

export interface LowRecord {
  finalCents: number;
  currency: string;
  at: number;
}

/** cc → appId → lowest observed price. */
export type LowsFile = Record<string, Record<string, LowRecord>>;

export function makeId(): string {
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function completeEntry(name: string, appId: number, extra?: Partial<GameEntry>): GameEntry {
  return {
    name,
    appId,
    steamUrl: `https://store.steampowered.com/app/${appId}/`,
    headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
    addedAt: Date.now(),
    ...extra,
  };
}

export async function readLists(): Promise<GameList[]> {
  let raw: string;
  try {
    raw = await readFile(GAMES_PATH, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    // Fresh checkout: data/ is gitignored, so start with one empty list.
    const lists: GameList[] = [
      { id: makeId(), name: 'Wishlist', createdAt: Date.now(), games: [] },
    ];
    await writeLists(lists);
    return lists;
  }
  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    // v1 → v2 migration: existing games become the "HHH" list.
    const now = Date.now();
    const migrated: GamesFileV2 = {
      version: 2,
      lists: [
        {
          id: makeId(),
          name: 'HHH',
          createdAt: now,
          games: (parsed as GameEntry[]).map((g, i) => ({
            ...g,
            // Stagger timestamps so "recently added" keeps the file order.
            addedAt: g.addedAt ?? now - (parsed.length - i) * 1000,
          })),
        },
      ],
    };
    await writeLists(migrated.lists);
    return migrated.lists;
  }

  const file = parsed as GamesFileV2;
  if (file?.version !== 2 || !Array.isArray(file.lists)) {
    throw new Error('data/games.json has an unrecognized format.');
  }
  return file.lists;
}

export async function writeLists(lists: GameList[]): Promise<void> {
  const file: GamesFileV2 = { version: 2, lists };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(GAMES_PATH, `${JSON.stringify(file, null, 2)}\n`);
}

export async function readLows(): Promise<LowsFile> {
  try {
    return JSON.parse(await readFile(LOWS_PATH, 'utf8')) as LowsFile;
  } catch {
    return {};
  }
}

export async function mergeLows(
  cc: string,
  prices: Record<string, { finalCents: number; currency: string }>,
): Promise<Record<string, LowRecord>> {
  const lows = await readLows();
  const region = (lows[cc] ??= {});
  const now = Date.now();
  for (const [appId, p] of Object.entries(prices)) {
    if (!Number.isFinite(p?.finalCents) || p.finalCents < 0 || !p.currency) continue;
    const prev = region[appId];
    if (!prev || p.finalCents < prev.finalCents) {
      region[appId] = { finalCents: p.finalCents, currency: p.currency, at: now };
    }
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(LOWS_PATH, `${JSON.stringify(lows, null, 2)}\n`);
  return region;
}
