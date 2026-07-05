# SteamDeals

Track current Steam discounts across your own game lists. Add games by name,
paste in whole wishlists, filter by price and discount with Steam-style
sliders, and see reviews, tags, playtime, and all-time-low prices — in a
dark, Steam-inspired interface.

![Stack](https://img.shields.io/badge/stack-React%20%2B%20TypeScript%20%2B%20Vite-66c0f4)

## Features

- **Launch like a real app** — double-click `SteamDeals.app` (macOS): it
  starts the server if needed and opens the app in your browser. Pin it to
  the Dock for one-click access, and use the in-app **Quit** button to shut
  everything down again — no terminal required for either.
- **Multiple lists** — organize games into as many lists as you want
  (tabs above the grid); create, rename, and delete lists freely.
- **Add games from the UI** — type a name, pick from live Steam search
  results; the complete entry (App ID, store URL, header image) is saved
  and priced immediately.
- **Import a wishlist** — paste game names (one per line); every one is
  resolved against Steam search and added to a list of your choice, or a
  brand-new list, with a per-name failure report.
- **Price & discount sliders** — cap the maximum price (1–10 in store
  currency) and require a minimum discount (10–90%), Steam style.
- **All-time lowest price** — every refresh records prices per region into
  `data/lows.json`; cards show the lowest a game has been since you started
  tracking, with an "At all-time low" badge when it's there right now.
- **Reviews, tags, playtime** — Steam review percentage and count,
  community tags (with a dedicated **RPGMAKER** badge for RPG Maker games),
  and HowLongToBeat main-story hours (SteamSpy average as fallback).
- **Region switcher** — the header dropdown changes the Steam storefront
  (default: Turkey — MENA/USD). Price caches and lows are kept per region.
- **Sorting** — lowest price (free first), highest discount, most playtime,
  recently added, alphabetical; plus "Discounted only" / "Owned" filters
  and search.
- One-click **Refresh Deals**; results cached per region in `localStorage`
  (instant startup, auto-refresh when older than 6 hours).
- **Mark as bought / remove** — ✓ moves a game under the "Owned" filter
  (reversible), 🗑 removes it (with confirmation).
- Graceful degradation everywhere — a delisted game, a failed lookup, or a
  blocked metadata service never breaks the page. Error boundary included.

## Requirements

- [Node.js](https://nodejs.org) 18 or newer (ships with `npm`)
- macOS for the `.app` launcher (the web app itself runs anywhere)

## Running the app

**The easy way (macOS):** double-click **`SteamDeals.app`** in the project
folder (or drag it to your Dock and click it there). It starts the server —
installing or repairing dependencies automatically when needed — and opens
http://localhost:5173 in your default browser. Clicking it again while the
server runs just opens the app. If macOS asks about Desktop folder access,
allow it. If anything goes wrong, `steamdeals-launcher.log` in the project
folder has the details.

**Stopping:** press the **Quit** button in the app header (confirms, then
shuts the server down), or run `npm run stop`.

**The terminal way:**

```bash
npm install    # first time only
npm run dev    # → http://localhost:5173
npm run stop   # stops the server (or Ctrl-C in the terminal)
```

Production build: `npm run build && npm run preview` (serves on :4173).

> The Steam/SteamSpy proxies and the local list API are part of the Vite
> server, so the app must be served with `npm run dev` or `npm run preview`
> — opening `dist/index.html` from disk will not work.

## Data files

The `data/` folder is **gitignored** (it's your personal library) and is
created automatically on first run with one empty list.

- **`data/games.json`** — your lists. v2 format:
  `{ "version": 2, "lists": [{ "id", "name", "createdAt", "games": [...] }] }`.
  Each game: `name`, `appId`, `steamUrl`, `headerImage`, optional `owned`
  and `addedAt`. Legacy v1 files (a plain array of games) are migrated
  automatically into a single list — nothing is lost.
- **`data/lows.json`** — lowest observed price per region per game,
  maintained automatically. Delete it to reset tracking.

CLI alternative to the UI: `npm run add-game -- --list "Wishlist" "Hollow Knight"`.

## Where the data comes from

| Data | Source | Notes |
| --- | --- | --- |
| Prices & discounts | Steam Store API (`appdetails`, batched ×25) | region pinned via `cc`; ~200 req/5 min/IP limit |
| Review % | Steam `appreviews` (official) | cached 3 days per game |
| Tags / RPGMAKER | Steam store page (age-gate aware) + SteamSpy | cached 7 days per game |
| Playtime | HowLongToBeat (unofficial, server-side resolver) | cached 14 days; falls back to SteamSpy average |
| All-time low | Tracked locally from your refreshes | only knows prices seen since you started using the app |
| Name → App ID | Steam store search | top match; the UI shows exactly what matched |

## Known limitations

- **All-time lows are "since you started tracking"** — Steam publishes no
  price history, and services like SteamDB have no public API. Lows build
  up as you refresh (per region).
- **HowLongToBeat is unofficial** — its internal endpoint rotates; the
  resolver rediscovers it automatically, but if it changes shape the app
  just shows no playtime until updated.
- **RPGMAKER detection is tag-based** — it appears only when the Steam
  community actually tagged the game "RPGMaker"; there is no engine API.
- Prices reflect the selected storefront; Steam must sell the game in that
  region for a price to appear. Bundles/packages are not resolved.

## Project structure

```
SteamDeals/
├── SteamDeals.app/          # macOS launcher (double-click to run)
├── data/                    # your lists + price lows (gitignored, auto-created)
├── scripts/add-game.mjs     # CLI: add games by name
├── server/
│   ├── gamesApi.ts          # local API: lists, games, bulk import, lows, quit
│   ├── store.ts             # games.json/lows.json access + v1→v2 migration
│   ├── hltb.ts              # HowLongToBeat endpoint discovery + search
│   └── tags.ts              # store-page community tag scraper
├── src/
│   ├── components/          # Header, ListTabs, Toolbar (sliders), ImportModal, GameCard, ...
│   ├── hooks/               # useDeals (prices+lows), useEnrichment, useNow
│   ├── services/            # steamApi, gamesApi, enrich (reviews/tags/HLTB), cache
│   ├── utils/               # formatting + filter/sort logic
│   └── styles/global.css    # Steam-inspired theme
└── vite.config.ts           # dev server + Steam/SteamSpy proxies
```
