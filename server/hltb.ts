/**
 * HowLongToBeat lookup (server-side).
 *
 * HLTB has no official API. Its site uses an internal search endpoint whose
 * name rotates inside the JS bundle (e.g. /api/bleed at time of writing) and
 * a token/honeypot handshake:
 *
 *   1. GET  /api/<name>/init?t=<now>   → { token, hpKey, hpVal }
 *   2. POST /api/<name>                 headers x-auth-token/x-hp-key/x-hp-val,
 *                                       body = search payload + { [hpKey]: hpVal }
 *
 * We discover <name> from the bundle at runtime and refresh the token on 403.
 * Everything degrades gracefully — on any failure the caller receives null
 * and the UI simply omits playtime.
 */

const BASE = 'https://howlongtobeat.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const ENDPOINT_TTL = 6 * 60 * 60 * 1000;

let endpointCache: { name: string; at: number } | null = null;
let auth: { token: string; hpKey: string; hpVal: string } | null = null;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: `${BASE}/` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function discoverEndpoint(): Promise<string> {
  if (endpointCache && Date.now() - endpointCache.at < ENDPOINT_TTL) return endpointCache.name;

  const home = await fetchText(`${BASE}/`);
  const chunks = [...home.matchAll(/src="(\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => m[1]);

  for (const chunk of chunks) {
    try {
      const js = await fetchText(`${BASE}${chunk}`);
      const m = js.match(/\/api\/([a-z]+)\/init\?t=/) ?? js.match(/fetch\(\s*["'`]\/api\/([a-z]+)["'`]\s*,/);
      if (m) {
        endpointCache = { name: m[1], at: Date.now() };
        return m[1];
      }
    } catch {
      /* try the next chunk */
    }
  }
  throw new Error('HLTB search endpoint not found in bundle');
}

async function initAuth(name: string): Promise<{ token: string; hpKey: string; hpVal: string }> {
  const res = await fetch(`${BASE}/api/${name}/init?t=${Date.now()}`, {
    headers: { 'User-Agent': UA, Referer: `${BASE}/` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HLTB init HTTP ${res.status}`);
  const json = (await res.json()) as { token?: string; hpKey?: string; hpVal?: string };
  if (!json.token) throw new Error('HLTB init returned no token');
  auth = { token: json.token, hpKey: json.hpKey ?? '', hpVal: json.hpVal ?? '' };
  return auth;
}

interface HltbGame {
  game_name: string;
  comp_main: number;
  comp_plus: number;
  comp_100: number;
}

function buildBody(title: string, hpKey: string, hpVal: string): string {
  const body: Record<string, unknown> = {
    searchType: 'games',
    searchTerms: title.split(/\s+/).filter(Boolean),
    searchPage: 1,
    size: 5,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: null, max: null },
        gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
        rangeYear: { min: '', max: '' },
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
  if (hpKey) body[hpKey] = hpVal;
  return JSON.stringify(body);
}

async function searchOnce(name: string, title: string): Promise<Response> {
  const a = auth ?? (await initAuth(name));
  return fetch(`${BASE}/api/${name}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      Origin: BASE,
      Referer: `${BASE}/`,
      'x-auth-token': a.token,
      'x-hp-key': a.hpKey,
      'x-hp-val': a.hpVal,
    },
    body: buildBody(title, a.hpKey, a.hpVal),
    signal: AbortSignal.timeout(12_000),
  });
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface HltbResult {
  matchedName: string;
  mainHours: number | null;
  extraHours: number | null;
  completionistHours: number | null;
}

const toHours = (seconds: number): number | null =>
  seconds > 0 ? Math.round(seconds / 360) / 10 : null;

export async function lookupHltb(title: string): Promise<HltbResult | null> {
  try {
    const name = await discoverEndpoint();
    let res = await searchOnce(name, title);
    if (res.status === 403) {
      // Token expired — refresh once and retry.
      auth = null;
      res = await searchOnce(name, title);
    }
    if (!res.ok) throw new Error(`HLTB search HTTP ${res.status}`);
    const json = (await res.json()) as { data?: HltbGame[] };
    const games = json.data ?? [];
    if (games.length === 0) return null;

    const wanted = normalize(title);
    const best = games.find((g) => normalize(g.game_name) === wanted) ?? games[0];
    return {
      matchedName: best.game_name,
      mainHours: toHours(best.comp_main),
      extraHours: toHours(best.comp_plus),
      completionistHours: toHours(best.comp_100),
    };
  } catch {
    return null;
  }
}
