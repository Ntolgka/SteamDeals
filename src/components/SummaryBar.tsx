import type { TrackedGameWithPrice } from '../types';
import { formatPrice, formatRelativeTime } from '../utils/format';
import { useNow } from '../hooks/useNow';

interface SummaryBarProps {
  games: TrackedGameWithPrice[];
  lastRefresh: number | null;
}

export function SummaryBar({ games, lastRefresh }: SummaryBarProps) {
  useNow(); // keep "last refresh" ticking
  const discounted = games.filter((g) => g.price?.status === 'discounted');

  let savingsLabel = '—';
  const savingsCents = discounted.reduce(
    (sum, g) =>
      g.price!.initialCents !== undefined && g.price!.finalCents !== undefined
        ? sum + (g.price!.initialCents - g.price!.finalCents)
        : sum,
    0,
  );
  if (savingsCents > 0 && discounted[0]?.price?.currency) {
    savingsLabel = formatPrice(savingsCents, discounted[0].price.currency);
  }

  let lowestLabel = '—';
  const priced = games.filter(
    (g) =>
      g.price &&
      (g.price.status === 'discounted' || g.price.status === 'full_price' || g.price.status === 'free'),
  );
  if (priced.some((g) => g.price!.status === 'free')) {
    lowestLabel = 'Free';
  } else if (priced.length > 0) {
    const cheapest = priced.reduce((min, g) =>
      (g.price!.finalCents ?? Infinity) < (min.price!.finalCents ?? Infinity) ? g : min,
    );
    if (cheapest.price!.finalCents !== undefined && cheapest.price!.currency) {
      lowestLabel = formatPrice(cheapest.price!.finalCents, cheapest.price!.currency);
    }
  }

  const stats = [
    { label: 'Wishlist games', value: String(games.length) },
    { label: 'On discount', value: String(discounted.length), highlight: discounted.length > 0 },
    { label: 'Lowest price', value: lowestLabel },
    { label: 'You save', value: savingsLabel, highlight: savingsCents > 0 },
    { label: 'Last refresh', value: lastRefresh ? formatRelativeTime(lastRefresh) : 'never' },
  ];

  return (
    <section className="summary" aria-label="Summary">
      {stats.map((s) => (
        <div className="summary__stat" key={s.label}>
          <span className={`summary__value${s.highlight ? ' summary__value--green' : ''}`}>
            {s.value}
          </span>
          <span className="summary__label">{s.label}</span>
        </div>
      ))}
    </section>
  );
}
