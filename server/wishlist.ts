/**
 * Steam wishlist retrieval (server-side).
 *
 * Accepts a profile URL (…/profiles/<id64> or …/id/<vanity>), a bare
 * SteamID64, or a bare vanity name. Vanity names resolve via the legacy
 * community XML endpoint (no API key needed); the wishlist itself comes
 * from the keyless IWishlistService/GetWishlist endpoint.
 *
 * Note: the wishlist must be public (Profile privacy → Game details).
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface WishlistItem {
  appid: number;
  /** Unix seconds when the user wishlisted it, if Steam provides it. */
  dateAdded: number | null;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function resolveVanity(vanity: string): Promise<string> {
  const xml = await fetchText(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`);
  const m = xml.match(/<steamID64>(\d{17})<\/steamID64>/);
  if (!m) throw new Error(`Could not find a Steam profile named "${vanity}".`);
  return m[1];
}

/** URL, SteamID64, or vanity name → SteamID64. */
export async function resolveSteamId(input: string): Promise<string> {
  const trimmed = input.trim();

  const profileUrl = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profileUrl) return profileUrl[1];

  const vanityUrl = trimmed.match(/steamcommunity\.com\/id\/([^/?#\s]+)/);
  if (vanityUrl) return resolveVanity(vanityUrl[1]);

  if (/^\d{17}$/.test(trimmed)) return trimmed;

  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return resolveVanity(trimmed);

  throw new Error('Enter a Steam profile URL, a SteamID64, or a vanity name.');
}

export async function fetchWishlist(steamId: string): Promise<WishlistItem[]> {
  const url = `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=${steamId}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Steam wishlist request failed (HTTP ${res.status}).`);
  const json = (await res.json()) as {
    response?: { items?: Array<{ appid?: number; date_added?: number }> };
  };
  const items = json.response?.items ?? [];
  if (items.length === 0) {
    throw new Error(
      'No wishlist items found — the wishlist is empty, or the profile\'s "Game details" privacy setting is not Public.',
    );
  }
  return items
    .filter((it) => typeof it.appid === 'number')
    .map((it) => ({ appid: it.appid!, dateAdded: it.date_added ?? null }));
}
