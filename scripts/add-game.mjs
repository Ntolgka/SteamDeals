#!/usr/bin/env node
/**
 * Add games to data/games.json by name, resolving the Steam App ID via the
 * public Steam store search API.
 *
 * Usage:
 *   npm run add-game -- "Hollow Knight" "Stardew Valley"
 *   node scripts/add-game.mjs "Hollow Knight"
 *
 * For each name the top search result is used. The script prints what it
 * matched so a wrong match is easy to spot and fix in data/games.json.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const GAMES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'games.json');
const SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';

const names = process.argv.slice(2).filter((a) => !a.startsWith('-'));
if (names.length === 0) {
  console.error('Usage: npm run add-game -- "Game Name" ["Another Game" ...]');
  process.exit(1);
}

async function searchSteam(term) {
  const url = `${SEARCH_URL}?term=${encodeURIComponent(term)}&l=english&cc=TR`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam search failed with HTTP ${res.status}`);
  const json = await res.json();
  return json?.items ?? [];
}

const games = JSON.parse(readFileSync(GAMES_PATH, 'utf8'));
const existingIds = new Set(games.map((g) => g.appId));
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
      console.log(`• "${top.name}" (appId ${top.id}) is already tracked — skipped.`);
      continue;
    }
    games.push({
      name: top.name,
      appId: top.id,
      steamUrl: `https://store.steampowered.com/app/${top.id}/`,
      headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${top.id}/header.jpg`,
    });
    existingIds.add(top.id);
    added += 1;
    console.log(`✓ Added "${top.name}" (appId ${top.id}) for query "${name}".`);
  } catch (err) {
    console.error(`✗ Failed to resolve "${name}": ${err.message}`);
  }
}

if (added > 0) {
  writeFileSync(GAMES_PATH, `${JSON.stringify(games, null, 2)}\n`);
  console.log(`\nSaved ${added} new game(s) to data/games.json (${games.length} total).`);
} else {
  console.log('\nNo changes written.');
}
