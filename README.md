# SteamDeals

Track current Steam discounts for your wishlist. Keep a JSON list of Steam
games, press **Refresh Deals**, and see live prices sorted with the cheapest
games first — in a dark, Steam-inspired interface.

![Stack](https://img.shields.io/badge/stack-React%20%2B%20TypeScript%20%2B%20Vite-66c0f4)

## Features

- **Add games from the UI** — type a name, pick from live Steam search
  results, and the complete entry (App ID, store URL, header image) is saved
  to `data/games.json` automatically and priced immediately
- **Mark as bought / remove** — every card has a ✓ button that marks a game
  as owned (it leaves the wishlist and lives under the **Owned** filter, and
  can be moved back anytime) and a trash button that removes it from the
  list entirely (with confirmation)
- One-click **Refresh Deals** — fetches live prices for every tracked game
- Sorted by lowest current price (free games first); also sort by highest
  discount or alphabetically, plus a "Discounted only" filter and search
- Summary bar: tracked games, number on discount, lowest price, last refresh
- Steam-style cards with header art, discount badge, strikethrough original
  price, and a direct "View on Steam" link
- Graceful handling of delisted games, region restrictions, invalid app IDs,
  and network failures — one broken game never breaks the page
- Results cached in `localStorage`, so the app opens instantly with the last
  known prices; caches older than 6 hours refresh automatically on launch
- Summary bar with wishlist size, discount count, lowest price, total
  savings, and a live-updating last-refresh time
- Error boundary — an unexpected runtime error shows a recovery panel
  instead of a blank page

## Requirements

- [Node.js](https://nodejs.org) 18 or newer (ships with `npm`)

## Installation

```bash
cd ~/Desktop/Dev/Projects/SteamDeals
npm install
```

## Running the app

```bash
npm run dev
```

Then open the printed URL (default **http://localhost:5173**).

Production build, if you ever want one:

```bash
npm run build
npm run preview   # serves the build on http://localhost:4173
```

> The Steam proxy is part of the Vite dev/preview server, so the app must be
> served with `npm run dev` or `npm run preview` — opening `dist/index.html`
> directly from disk will not be able to fetch prices.

## Managing the game list — `data/games.json`

All tracked games live in [`data/games.json`](data/games.json). Each entry:

```json
{
  "name": "Portal 2",
  "appId": 620,
  "steamUrl": "https://store.steampowered.com/app/620/",
  "headerImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/620/header.jpg",
  "owned": true
}
```

- `appId` is the number in the Steam store URL:
  `store.steampowered.com/app/<appId>/...`
- `headerImage` may be left as `""` — the app falls back to the standard Steam
  CDN header (`.../steam/apps/<appId>/header.jpg`) automatically.
- `owned` is optional: `true` moves the game out of the wishlist and under
  the **Owned** filter. The ✓ button on each card toggles it for you.
- The file ships with two **sample entries** (Portal 2, Hades) — delete them
  freely.

The dev server hot-reloads when the file changes; press **Refresh Deals** to
fetch prices for newly added games.

### Adding games by name

**From the UI (easiest):** use the _"Add a game by name…"_ box at the top of
the app. It searches Steam as you type; clicking a result writes a complete
entry to `data/games.json` (via a small local API served by Vite — see
`server/gamesApi.ts`) and fetches its price right away. Games already in
your list are marked "Tracked ✓".

**From the terminal:**

```bash
npm run add-game -- "Hollow Knight" "Stardew Valley"
```

The script queries Steam's store search, takes the top match, and appends a
complete entry (name, appId, URL, header image) to `data/games.json`. It
prints exactly what it matched so a wrong guess is easy to spot and correct.

## How discounts are fetched

- Prices come from the public **Steam Store API**
  (`store.steampowered.com/api/appdetails`). No API key is needed.
- Steam does not allow cross-origin browser requests, so the Vite server
  proxies `/steam-api/*` to `store.steampowered.com` (see `vite.config.ts`).
- Requests are **batched** (up to 25 app IDs per call with
  `filters=price_overview`) with a small concurrency limit, so even large
  lists refresh in a handful of requests.
- Games that return no price block are checked individually to distinguish
  **free-to-play** titles from region-restricted or delisted ones.
- Each refresh result is cached in `localStorage` and shown immediately on
  the next launch.

## Region / storefront

Pricing is pinned to the **Turkey storefront** (`cc=tr`, Steam's USD "MENA"
price sheet) via `STEAM_COUNTRY` in [`src/config.ts`](src/config.ts). Change
it to any ISO country code, or set it to `''` to let Steam infer the region
from your IP. The price cache is kept per-region, so switching never shows
stale prices from another storefront.

## Known limitations

- **Region-dependent prices** — prices/currency come from the storefront
  configured in `src/config.ts` (Turkey/MENA by default). Steam must sell
  the game in that region for a price to appear.
- **Rate limiting** — the appdetails endpoint allows roughly 200 requests per
  5 minutes per IP. Batching keeps usage tiny, but hammering the refresh
  button can trigger HTTP 429; the app shows a clear message if that happens.
- **Unofficial API** — appdetails is public but undocumented; Valve may
  change its behavior at any time.
- Bundles/packages are not resolved; only regular store apps are tracked.

## Project structure

```
SteamDeals/
├── data/games.json          # your tracked games (edit this)
├── scripts/add-game.mjs     # CLI: resolves names → complete JSON entries
├── server/gamesApi.ts       # local API so the UI can write games.json
├── src/
│   ├── components/          # Header, SummaryBar, Toolbar, GameCard, ...
│   ├── hooks/useDeals.ts    # price state + refresh + cache hydration
│   ├── services/steamApi.ts # batched Steam API access
│   ├── services/cache.ts    # localStorage cache
│   ├── utils/               # formatting + sort/filter logic
│   └── styles/global.css    # Steam-inspired theme
└──  vite.config.ts           # dev server + Steam proxy
```
