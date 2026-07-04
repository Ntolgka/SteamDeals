#!/usr/bin/env node
/**
 * Add games to data/games.json by name, resolving the Steam App ID via the
 * public Steam store search API.
 *
 * Usage:
 *   npm run add-game -- "Hollow Knight" "Stardew Valley"
 *   npm run add-game -- --list "HHH" "Hollow Knight"
 *
 * Works with the v2 multi-list format (and migrates a legacy v1 array into
 * a single list named "HHH", matching the app's own migration). Without
 * --list, games go into the first list.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const GAMES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'games.json');
const SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';

const args = process.argv.slice(2);
let listName = null;
const names = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--list') {
    listName = args[++i];
  } else if (!args[i].startsWith('-')) {
    names.push(args[i]);
  }
}

if (names.length === 0) {
  console.error('Usage: npm run add-game -- [--list "List name"] "Game Name" ["Another" ...]');
  process.exit(1);
}

const makeId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

let file;
if (existsSync(GAMES_PATH)) {
  file = JSON.parse(readFileSync(GAMES_PATH, 'utf8'));
} else {
  // Fresh checkout: data/ is gitignored, so start with one empty list.
  mkdirSync(dirname(GAMES_PATH), { recursive: true });
  file = {
    version: 2,
    lists: [{ id: makeId(), name: 'Wishlist', createdAt: Date.now(), games: [] }],
  };
}
if (Array.isArray(file)) {
  const now = Date.now();
  file = {
    version: 2,
    lists: [
      {
        id: makeId(),
        name: 'HHH',
        createdAt: now,
        games: file.map((g, i) => ({ ...g, addedAt: g.addedAt ?? now - (file.length - i) * 1000 })),
      },
    ],
  };
  console.log('Migrated legacy games.json into v2 format (list "HHH").');
}

const list = listName
  ? file.lists.find((l) => l.name.toLowerCase() === listName.toLowerCase())
  : file.lists[0];
if (!list) {
  console.error(`✗ No list named "${listName}". Existing lists: ${file.lists.map((l) => l.name).join(', ')}`);
  process.exit(1);
}

async function searchSteam(term) {
  const url = `${SEARCH_URL}?term=${encodeURIComponent(term)}&l=english&cc=TR`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam search failed with HTTP ${res.status}`);
  const json = await res.json();
  return json?.items ?? [];
}

const existingIds = new Set(list.games.map((g) => g.appId));
let added = 0;

for (const name of names) {
  try {
    const items = await searchSteam(name);
    if (items.length === 0) {
      console.error(`✗ No Steam results for "${name}" — skipped.`);
      continue;
    }
    const top = items[0];
    if (existingIds.has(top.id)) {
      console.log(`• "${top.name}" (appId ${top.id}) is already in "${list.name}" — skipped.`);
      continue;
    }
    list.games.push({
      name: top.name,
      appId: top.id,
      steamUrl: `https://store.steampowered.com/app/${top.id}/`,
      headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${top.id}/header.jpg`,
      addedAt: Date.now(),
    });
    existingIds.add(top.id);
    added += 1;
    console.log(`✓ Added "${top.name}" (appId ${top.id}) to "${list.name}" for query "${name}".`);
  } catch (err) {
    console.error(`✗ Failed to resolve "${name}": ${err.message}`);
  }
}

writeFileSync(GAMES_PATH, `${JSON.stringify(file, null, 2)}\n`);
console.log(
  added > 0
    ? `\nSaved ${added} new game(s) to "${list.name}" (${list.games.length} total).`
    : '\nNo new games added (file rewritten only if migration occurred).',
);
