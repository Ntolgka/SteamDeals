import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';

/**
 * Tiny local API served by Vite (dev and preview) so the UI can add games to
 * data/games.json — the browser cannot write files itself.
 *
 *   GET    /local-api/games           → full tracked list
 *   POST   /local-api/games           → { name, appId } → appends a complete
 *                                       entry (steamUrl + headerImage derived
 *                                       from the appId), 409 on duplicates
 *   PATCH  /local-api/games/:appId    → { owned: boolean } → mark bought/owned
 *   DELETE /local-api/games/:appId    → remove the game from the list
 */

const GAMES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'games.json');

interface GameEntry {
  name: string;
  appId: number;
  steamUrl: string;
  headerImage: string;
  owned?: boolean;
}

async function readGames(): Promise<GameEntry[]> {
  return JSON.parse(await readFile(GAMES_PATH, 'utf8')) as GameEntry[];
}

async function writeGames(games: GameEntry[]): Promise<void> {
  await writeFile(GAMES_PATH, `${JSON.stringify(games, null, 2)}\n`);
}

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

const handle: Connect.NextHandleFunction = async (req, res, next) => {
  // The '/local-api' mount prefix is already stripped from req.url here.
  const path = (req.url ?? '').split('?')[0];
  const isGames = path === '/games';
  const idMatch = path.match(/^\/games\/(\d+)$/);
  try {
    if (idMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
      const appId = Number(idMatch[1]);
      const games = await readGames();
      const index = games.findIndex((g) => g.appId === appId);
      if (index < 0) {
        return send(res, 404, { error: `No tracked game with appId ${appId}.` });
      }
      if (req.method === 'DELETE') {
        games.splice(index, 1);
        await writeGames(games);
        return send(res, 200, { ok: true });
      }
      const body = (await readBody(req)) as { owned?: unknown } | null;
      if (typeof body?.owned !== 'boolean') {
        return send(res, 400, { error: 'Expected JSON body { owned: boolean }.' });
      }
      if (body.owned) {
        games[index].owned = true;
      } else {
        delete games[index].owned; // keep the file clean for wishlist entries
      }
      await writeGames(games);
      return send(res, 200, games[index]);
    }
    if (isGames && req.method === 'GET') {
      return send(res, 200, await readGames());
    }
    if (isGames && req.method === 'POST') {
      const body = (await readBody(req)) as { name?: unknown; appId?: unknown } | null;
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      const appId = Number(body?.appId);
      if (!name || !Number.isInteger(appId) || appId <= 0) {
        return send(res, 400, { error: 'Expected JSON body { name: string, appId: number }.' });
      }
      const games = await readGames();
      if (games.some((g) => g.appId === appId)) {
        return send(res, 409, { error: `"${name}" is already in your list.` });
      }
      const entry: GameEntry = {
        name,
        appId,
        steamUrl: `https://store.steampowered.com/app/${appId}/`,
        headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
      };
      games.push(entry);
      await writeGames(games);
      return send(res, 201, entry);
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
