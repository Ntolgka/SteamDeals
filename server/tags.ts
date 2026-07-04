/**
 * Community tags scraped from the Steam store page (server-side).
 *
 * SteamSpy has no data for age-gated titles, but the store page itself
 * embeds the full community tag list in an InitAppTagModal(...) call. We
 * request the page with age-bypass cookies so adult games resolve too.
 * Returns [] on any failure — tags are a nice-to-have, never load-bearing.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const AGE_BYPASS_COOKIES =
  'birthtime=0; lastagecheckage=1-January-1990; wants_mature_content=1; mature_content=1';

interface StoreTag {
  name: string;
  count: number;
}

export async function fetchStoreTags(appId: number): Promise<string[]> {
  try {
    const res = await fetch(`https://store.steampowered.com/app/${appId}/?l=english`, {
      headers: { 'User-Agent': UA, Cookie: AGE_BYPASS_COOKIES },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const m = html.match(/InitAppTagModal\(\s*\d+\s*,\s*(\[.*?\])\s*,/s);
    if (!m) return [];
    const tags = JSON.parse(m[1]) as StoreTag[];
    return tags
      .filter((t) => typeof t?.name === 'string')
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .map((t) => t.name);
  } catch {
    return [];
  }
}
