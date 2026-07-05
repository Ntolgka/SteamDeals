import type { Filters, TrackedGameWithPrice } from '../types';

/**
 * Effective current price in cents used for ordering and the max-price
 * filter. Free games sort first (0); games without usable pricing sort last.
 */
function sortablePrice(game: TrackedGameWithPrice): number {
  const p = game.price;
  if (!p) return Number.MAX_SAFE_INTEGER;
  switch (p.status) {
    case 'free':
      return 0;
    case 'discounted':
    case 'full_price':
      return p.finalCents ?? Number.MAX_SAFE_INTEGER;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function discountOf(game: TrackedGameWithPrice): number {
  return game.price?.status === 'discounted' ? game.price.discountPercent ?? 0 : 0;
}

export function filterAndSort(
  games: TrackedGameWithPrice[],
  filters: Filters,
  /** Playtime in hours for a game, or null when unknown (sorts last). */
  playtimeOf: (appId: number) => number | null,
): TrackedGameWithPrice[] {
  const query = filters.search.trim().toLowerCase();

  // The main view is the wishlist; owned games only appear under the Owned filter.
  let list = games.filter((g) => (filters.ownedOnly ? g.owned === true : !g.owned));

  if (query) {
    list = list.filter((g) => g.name.toLowerCase().includes(query));
  }
  if (filters.discountedOnly) {
    list = list.filter((g) => g.price?.status === 'discounted');
  }
  if (filters.maxPriceUnits !== null) {
    const maxCents = filters.maxPriceUnits * 100;
    list = list.filter((g) => sortablePrice(g) <= maxCents);
  }
  if (filters.minDiscount > 0) {
    list = list.filter((g) => discountOf(g) >= filters.minDiscount);
  }

  const byName = (a: TrackedGameWithPrice, b: TrackedGameWithPrice) =>
    a.name.localeCompare(b.name);

  // Descending playtime; games with unknown playtime sort last.
  const playtimeSort = (a: TrackedGameWithPrice, b: TrackedGameWithPrice) => {
    const pa = playtimeOf(a.appId);
    const pb = playtimeOf(b.appId);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return pb - pa;
  };

  return [...list].sort((a, b) => {
    switch (filters.sortMode) {
      case 'price':
        return sortablePrice(a) - sortablePrice(b) || discountOf(b) - discountOf(a) || byName(a, b);
      case 'discount':
        return discountOf(b) - discountOf(a) || sortablePrice(a) - sortablePrice(b) || byName(a, b);
      case 'playtime':
        return playtimeSort(a, b) || byName(a, b);
      case 'name':
        return byName(a, b);
      case 'recent':
        return (b.addedAt ?? 0) - (a.addedAt ?? 0) || byName(a, b);
    }
  });
}
