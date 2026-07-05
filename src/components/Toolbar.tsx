import type { Filters, SortMode } from '../types';
import { formatPrice } from '../utils/format';

interface ToolbarProps {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  ownedCount: number;
  /** Currency of the active region (for slider labels), if known. */
  currency: string | null;
}

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'price', label: 'Lowest price' },
  { value: 'discount', label: 'Highest discount' },
  { value: 'playtime', label: 'Most playtime' },
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'A–Z' },
];

export function Toolbar({ filters, onChange, ownedCount, currency }: ToolbarProps) {
  const priceLabel =
    filters.maxPriceUnits === null
      ? 'Any'
      : `≤ ${currency ? formatPrice(filters.maxPriceUnits * 100, currency) : `$${filters.maxPriceUnits}`}`;
  const discountLabel = filters.minDiscount === 0 ? 'Any' : `≥ ${filters.minDiscount}%`;

  return (
    <section className="toolbar" aria-label="Search, filters and sorting">
      <div className="toolbar__row">
        <div className="toolbar__search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            placeholder="Search this list…"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            aria-label="Search tracked games"
          />
        </div>

        <div className="toolbar__sort" role="group" aria-label="Sort order">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`toolbar__sort-btn${filters.sortMode === opt.value ? ' is-active' : ''}`}
              onClick={() => onChange({ sortMode: opt.value })}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="toolbar__toggle">
          <input
            type="checkbox"
            checked={filters.discountedOnly}
            onChange={(e) => onChange({ discountedOnly: e.target.checked })}
          />
          <span>Discounted only</span>
        </label>

        <label className="toolbar__toggle" title="Show games you marked as bought">
          <input
            type="checkbox"
            checked={filters.ownedOnly}
            onChange={(e) => onChange({ ownedOnly: e.target.checked })}
          />
          <span>Owned{ownedCount > 0 ? ` (${ownedCount})` : ''}</span>
        </label>
      </div>

      <div className="toolbar__row toolbar__row--sliders">
        <label className="slider">
          <span className="slider__name">Max price</span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={filters.maxPriceUnits ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange({ maxPriceUnits: v === 0 ? null : v });
            }}
            aria-label="Maximum price"
          />
          <span className={`slider__value${filters.maxPriceUnits !== null ? ' is-active' : ''}`}>
            {priceLabel}
          </span>
        </label>

        <label className="slider">
          <span className="slider__name">Min discount</span>
          <input
            type="range"
            min={0}
            max={90}
            step={10}
            value={filters.minDiscount}
            onChange={(e) => onChange({ minDiscount: Number(e.target.value) })}
            aria-label="Minimum discount percentage"
          />
          <span className={`slider__value${filters.minDiscount > 0 ? ' is-active' : ''}`}>
            {discountLabel}
          </span>
        </label>
      </div>
    </section>
  );
}
