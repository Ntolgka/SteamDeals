import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import {
  completeEntry,
  makeId,
  mergeLows,
  readLists,
  readLows,
  writeLists,
  writeLows,
  type GameList,
  type LowsFile,
} from './store';
import { lookupHltb } from './hltb';
import { fetchStoreTags } from './tags';
import { fetchWishlist, resolveSteamId } from './wishlist';

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
 *   POST   /local-api/lists/:id/games/:appId/move → { toListId } move game
 *   GET    /local-api/steam-wishlist?input=...    → wishlist appids for a profile
 *   POST   /local-api/lists/:id/games/bulk-appids → { items:[{appid,dateAdded}] }
 *   GET    /local-api/export                      → download full data backup
 *   POST   /local-api/import                      → restore a backup (overwrites)
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

    const moveMatch = path.match(/^\/lists\/([^/]+)\/games\/(\d+)\/move$/);
    if (moveMatch && method === 'POST') {
      const body = (await readBody(req)) as { toListId?: unknown } | null;
      const toListId = typeof body?.toListId === 'string' ? body.toListId : '';
      if (!toListId) return send(res, 400, { error: 'Expected JSON body { toListId: string }.' });
      const lists = await readLists();
      const from = findList(lists, moveMatch[1]);
      const to = findList(lists, toListId);
      if (!from || !to) return send(res, 404, { error: 'List not found.' });
      if (from.id === to.id) return send(res, 400, { error: 'Source and target list are the same.' });
      const appId = Number(moveMatch[2]);
      const index = from.games.findIndex((g) => g.appId === appId);
      if (index < 0) return send(res, 404, { error: `No game with appId ${appId} in this list.` });
      if (to.games.some((g) => g.appId === appId)) {
        return send(res, 409, { error: `"${from.games[index].name}" is already in "${to.name}".` });
      }
      // Move the entry as-is: owned state and addedAt are preserved.
      const [entry] = from.games.splice(index, 1);
      to.games.push(entry);
      await writeLists(lists);
      return send(res, 200, entry);
    }

    const bulkIdsMatch = path.match(/^\/lists\/([^/]+)\/games\/bulk-appids$/);
    if (bulkIdsMatch && method === 'POST') {
      const body = (await readBody(req)) as { items?: unknown; cc?: unknown } | null;
      const items = Array.isArray(body?.items)
        ? (body.items as Array<{ appid?: unknown; dateAdded?: unknown }>).filter(
            (it) => Number.isInteger(Number(it?.appid)) && Number(it.appid) > 0,
          )
        : [];
      const cc = typeof body?.cc === 'string' && body.cc ? body.cc : 'us';
      if (items.length === 0) {
        return send(res, 400, { error: 'Expected JSON body { items: [{ appid }] }.' });
      }
      const lists = await readLists();
      const list = findList(lists, bulkIdsMatch[1]);
      if (!list) return send(res, 404, { error: 'List not found.' });

      // Stay well inside Steam's appdetails rate budget (~200 req / 5 min).
      const CAP = 150;
      const capped = items.slice(0, CAP);
      const added: typeof list.games = [];
      const failed: Array<{ name: string; reason: string }> = [];
      for (const it of capped) {
        const appid = Number(it.appid);
        if (list.games.some((g) => g.appId === appid)) {
          failed.push({ name: `appid ${appid}`, reason: 'Already in list' });
          continue;
        }
        try {
          const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic&cc=${encodeURIComponent(cc)}`;
          const r = await fetch(url, { signal: AbortSignal.timeout(12_000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const json = (await r.json()) as Record<
            string,
            { success: boolean; data?: { name?: string } | unknown[] }
          >;
          const entryData = json[String(appid)];
          const name =
            entryData?.success && entryData.data && !Array.isArray(entryData.data)
              ? entryData.data.name?.trim()
              : undefined;
          if (!name) {
            failed.push({ name: `appid ${appid}`, reason: 'Not available on Steam' });
          } else {
            const dateAdded = Number(it.dateAdded);
            const entry = completeEntry(name, appid, {
              // Keep the original wishlist date so "Recently added" reflects it.
              addedAt: Number.isFinite(dateAdded) && dateAdded > 0 ? dateAdded * 1000 : Date.now(),
            });
            list.games.push(entry);
            added.push(entry);
          }
        } catch (err) {
          failed.push({
            name: `appid ${appid}`,
            reason: err instanceof Error ? err.message : 'Lookup failed',
          });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      if (items.length > CAP) {
        failed.push({
          name: `${items.length - CAP} more item(s)`,
          reason: `Import capped at ${CAP} per run — run the import again for the rest`,
        });
      }
      await writeLists(lists);
      return send(res, 200, { added, failed });
    }

    if (path === '/steam-wishlist' && method === 'GET') {
      const input = params.get('input')?.trim();
      if (!input) return send(res, 400, { error: 'Missing ?input= parameter.' });
      const steamId = await resolveSteamId(input);
      const items = await fetchWishlist(steamId);
      return send(res, 200, { steamId, items });
    }

    if (path === '/export' && method === 'GET') {
      const [lists, lows] = await Promise.all([readLists(), readLows()]);
      const stamp = new Date().toISOString().slice(0, 10);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="steamdeals-backup-${stamp}.json"`,
      );
      res.end(
        JSON.stringify({ steamdealsBackup: 1, exportedAt: Date.now(), lists, lows }, null, 2),
      );
      return;
    }

    if (path === '/import' && method === 'POST') {
      const body = (await readBody(req)) as {
        steamdealsBackup?: unknown;
        lists?: unknown;
        lows?: unknown;
      } | null;
      if (body?.steamdealsBackup !== 1 || !Array.isArray(body.lists)) {
        return send(res, 400, { error: 'Not a valid SteamDeals backup file.' });
      }
      const lists = body.lists as GameList[];
      const valid =
        lists.length > 0 &&
        lists.every(
          (l) =>
            typeof l?.id === 'string' &&
            typeof l?.name === 'string' &&
            Array.isArray(l?.games) &&
            l.games.every((g) => typeof g?.name === 'string' && Number.isInteger(g?.appId)),
        );
      if (!valid) return send(res, 400, { error: 'Backup file contains invalid list data.' });
      await writeLists(lists);
      if (body.lows && typeof body.lows === 'object') {
        await writeLows(body.lows as LowsFile);
      }
      return send(res, 200, { ok: true, lists: lists.length });
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
