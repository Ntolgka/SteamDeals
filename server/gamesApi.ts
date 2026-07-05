import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import {
  completeEntry,
  makeId,
  mergeLows,
  readLists,
  readLows,
  writeLists,
  type GameList,
} from './store';
import { lookupHltb } from './hltb';
import { fetchStoreTags } from './tags';

/**
 * Local API served by Vite (dev and preview). The browser cannot write files
 * or call cross-origin services with custom headers, so both live here.
 *
 *   GET    /local-api/state                       → { lists }
 *   POST   /local-api/lists { name }              → new list
 *   PATCH  /local-api/lists/:id { name }          → rename list
 *   DELETE /local-api/lists/:id                   → remove list
 *   POST   /local-api/lists/:id/games             → { name, appId } add game
 *   POST   /local-api/lists/:id/games/bulk        → { names: string[], cc } resolve + add
 *   PATCH  /local-api/lists/:id/games/:appId      → { owned: boolean }
 *   DELETE /local-api/lists/:id/games/:appId      → remove game
 *   GET    /local-api/lows?cc=tr                  → lowest observed prices
 *   POST   /local-api/lows { cc, prices }         → merge observations
 *   GET    /local-api/hltb?title=...              → HowLongToBeat lookup
 *   GET    /local-api/tags?appid=...              → community tags (store page)
 *   POST   /local-api/quit                        → stop the SteamDeals server
 */

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null);
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

async function resolveSteamName(
  name: string,
  cc: string,
): Promise<{ id: number; name: string } | null> {
  const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=${encodeURIComponent(cc || 'us')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Steam search HTTP ${res.status}`);
  const json = (await res.json()) as { items?: Array<{ id: number; name: string; type?: string }> };
  const top = (json.items ?? [])[0];
  return top && typeof top.id === 'number' ? { id: top.id, name: top.name } : null;
}

const findList = (lists: GameList[], id: string) => lists.find((l) => l.id === id);

const handle: Connect.NextHandleFunction = async (req, res, next) => {
  // The '/local-api' mount prefix is already stripped from req.url here.
  const [path, query = ''] = (req.url ?? '').split('?');
  const params = new URLSearchParams(query);
  const method = req.method ?? 'GET';

  try {
    if (path === '/state' && method === 'GET') {
      return send(res, 200, { lists: await readLists() });
    }

    if (path === '/lists' && method === 'POST') {
      const body = (await readBody(req)) as { name?: unknown } | null;
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Expected JSON body { name: string }.' });
      const lists = await readLists();
      if (lists.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
        return send(res, 409, { error: `A list named "${name}" already exists.` });
      }
      const list: GameList = { id: makeId(), name, createdAt: Date.now(), games: [] };
      lists.push(list);
      await writeLists(lists);
      return send(res, 201, list);
    }

    const listMatch = path.match(/^\/lists\/([^/]+)$/);
    if (listMatch && (method === 'PATCH' || method === 'DELETE')) {
      const lists = await readLists();
      const list = findList(lists, listMatch[1]);
      if (!list) return send(res, 404, { error: 'List not found.' });
      if (method === 'DELETE') {
        if (lists.length === 1) {
          return send(res, 400, { error: 'Cannot delete the last remaining list.' });
        }
        await writeLists(lists.filter((l) => l.id !== list.id));
        return send(res, 200, { ok: true });
      }
      const body = (await readBody(req)) as { name?: unknown } | null;
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) return send(res, 400, { error: 'Expected JSON body { name: string }.' });
      list.name = name;
      await writeLists(lists);
      return send(res, 200, list);
    }

    const bulkMatch = path.match(/^\/lists\/([^/]+)\/games\/bulk$/);
    if (bulkMatch && method === 'POST') {
      const body = (await readBody(req)) as { names?: unknown; cc?: unknown } | null;
      const names = Array.isArray(body?.names)
        ? body.names.filter((n): n is string => typeof n === 'string' && n.trim() !== '')
        : [];
      const cc = typeof body?.cc === 'string' ? body.cc : 'us';
      if (names.length === 0) {
        return send(res, 400, { error: 'Expected JSON body { names: string[] }.' });
      }
      if (names.length > 200) {
        return send(res, 400, { error: 'Too many names in one import (max 200).' });
      }
      const lists = await readLists();
      const list = findList(lists, bulkMatch[1]);
      if (!list) return send(res, 404, { error: 'List not found.' });

      const added: typeof list.games = [];
      const failed: Array<{ name: string; reason: string }> = [];
      for (const raw of names) {
        const name = raw.trim();
        try {
          const hit = await resolveSteamName(name, cc);
          if (!hit) {
            failed.push({ name, reason: 'No Steam search result' });
          } else if (list.games.some((g) => g.appId === hit.id)) {
            failed.push({ name, reason: `Already in list as "${hit.name}"` });
          } else {
            const entry = completeEntry(hit.name, hit.id);
            list.games.push(entry);
            added.push(entry);
          }
        } catch (err) {
          failed.push({ name, reason: err instanceof Error ? err.message : 'Lookup failed' });
        }
        // Be polite to Steam's search endpoint.
        await new Promise((r) => setTimeout(r, 250));
      }
      await writeLists(lists);
      return send(res, 200, { added, failed });
    }

    const gamesMatch = path.match(/^\/lists\/([^/]+)\/games$/);
    if (gamesMatch && method === 'POST') {
      const body = (await readBody(req)) as { name?: unknown; appId?: unknown } | null;
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const appId = Number(body?.appId);
      if (!name || !Number.isInteger(appId) || appId <= 0) {
        return send(res, 400, { error: 'Expected JSON body { name: string, appId: number }.' });
      }
      const lists = await readLists();
      const list = findList(lists, gamesMatch[1]);
      if (!list) return send(res, 404, { error: 'List not found.' });
      if (list.games.some((g) => g.appId === appId)) {
        return send(res, 409, { error: `"${name}" is already in this list.` });
      }
      const entry = completeEntry(name, appId);
      list.games.push(entry);
      await writeLists(lists);
      return send(res, 201, entry);
    }

    const gameMatch = path.match(/^\/lists\/([^/]+)\/games\/(\d+)$/);
    if (gameMatch && (method === 'PATCH' || method === 'DELETE')) {
      const lists = await readLists();
      const list = findList(lists, gameMatch[1]);
      if (!list) return send(res, 404, { error: 'List not found.' });
      const appId = Number(gameMatch[2]);
      const index = list.games.findIndex((g) => g.appId === appId);
      if (index < 0) return send(res, 404, { error: `No game with appId ${appId} in this list.` });

      if (method === 'DELETE') {
        list.games.splice(index, 1);
        await writeLists(lists);
        return send(res, 200, { ok: true });
      }
      const body = (await readBody(req)) as { owned?: unknown } | null;
      if (typeof body?.owned !== 'boolean') {
        return send(res, 400, { error: 'Expected JSON body { owned: boolean }.' });
      }
      if (body.owned) {
        list.games[index].owned = true;
      } else {
        delete list.games[index].owned;
      }
      await writeLists(lists);
      return send(res, 200, list.games[index]);
    }

    if (path === '/lows' && method === 'GET') {
      const cc = params.get('cc') ?? 'us';
      const lows = await readLows();
      return send(res, 200, lows[cc] ?? {});
    }

    if (path === '/lows' && method === 'POST') {
      const body = (await readBody(req)) as { cc?: unknown; prices?: unknown } | null;
      const cc = typeof body?.cc === 'string' && body.cc ? body.cc : null;
      const prices = body?.prices as Record<string, { finalCents: number; currency: string }>;
      if (!cc || typeof prices !== 'object' || prices === null) {
        return send(res, 400, { error: 'Expected JSON body { cc: string, prices: object }.' });
      }
      return send(res, 200, await mergeLows(cc, prices));
    }

    if (path === '/quit' && method === 'POST') {
      send(res, 200, { ok: true });
      // Let the response flush, then stop the whole dev-server process.
      setTimeout(() => process.exit(0), 250);
      return;
    }

    if (path === '/tags' && method === 'GET') {
      const appId = Number(params.get('appid'));
      if (!Number.isInteger(appId) || appId <= 0) {
        return send(res, 400, { error: 'Missing or invalid ?appid= parameter.' });
      }
      return send(res, 200, { tags: await fetchStoreTags(appId) });
    }

    if (path === '/hltb' && method === 'GET') {
      const title = params.get('title')?.trim();
      if (!title) return send(res, 400, { error: 'Missing ?title= parameter.' });
      return send(res, 200, { result: await lookupHltb(title) });
    }

    next();
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : 'Internal error.' });
  }
};

export function gamesApiPlugin(): Plugin {
  return {
    name: 'steamdeals-games-api',
    configureServer(server) {
      server.middlewares.use('/local-api', handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/local-api', handle);
    },
  };
}
