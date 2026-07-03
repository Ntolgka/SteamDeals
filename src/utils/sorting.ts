import type { SortMode, TrackedGameWithPrice } from '../types';

/**
 * Effective current price in cents used for ordering.
 * Free games sort first (0); games without usable pricing sort last.
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
  search: string,
  sortMode: SortMode,
  discountedOnly: boolean,
  ownedOnly: boolean,
): TrackedGameWithPrice[] {
  const query = search.trim().toLowerCase();

  // The main view is the wishlist; owned games only appear under the Owned filter.
  let list = games.filter((g) => (ownedOnly ? g.owned === true : !g.owned));

  if (query) {
    list = list.filter((g) => g.name.toLowerCase().includes(query));
  }
  if (discountedOnly) {
    list = list.filter((g) => g.price?.status === 'discounted');
  }

  const byName = (a: TrackedGameWithPrice, b: TrackedGameWithPrice) =>
    a.name.localeCompare(b.name);

  return [...list].sort((a, b) => {
    switch (sortMode) {
      case 'price':
        return sortablePrice(a) - sortablePrice(b) || discountOf(b) - discountOf(a) || byName(a, b);
      case 'discount':
        return discountOf(b) - discountOf(a) || sortablePrice(a) - sortablePrice(b) || byName(a, b);
      case 'name':
        return byName(a, b);
    }
  });
}
