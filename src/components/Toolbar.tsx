import type { SortMode } from '../types';

interface ToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  discountedOnly: boolean;
  onDiscountedOnlyChange: (value: boolean) => void;
  ownedOnly: boolean;
  onOwnedOnlyChange: (value: boolean) => void;
  ownedCount: number;
}

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'price', label: 'Lowest price' },
  { value: 'discount', label: 'Highest discount' },
  { value: 'name', label: 'A–Z' },
];

export function Toolbar({
  search,
  onSearchChange,
  sortMode,
  onSortChange,
  discountedOnly,
  onDiscountedOnlyChange,
  ownedOnly,
  onOwnedOnlyChange,
  ownedCount,
}: ToolbarProps) {
  return (
    <section className="toolbar" aria-label="Search and sorting">
      <div className="toolbar__search">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          placeholder="Search tracked games…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search tracked games"
        />
      </div>

      <div className="toolbar__sort" role="group" aria-label="Sort order">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`toolbar__sort-btn${sortMode === opt.value ? ' is-active' : ''}`}
            onClick={() => onSortChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <label className="toolbar__toggle">
        <input
          type="checkbox"
          checked={discountedOnly}
          onChange={(e) => onDiscountedOnlyChange(e.target.checked)}
        />
        <span>Discounted only</span>
      </label>

      <label className="toolbar__toggle" title="Show games you marked as bought">
        <input
          type="checkbox"
          checked={ownedOnly}
          onChange={(e) => onOwnedOnlyChange(e.target.checked)}
        />
        <span>Owned{ownedCount > 0 ? ` (${ownedCount})` : ''}</span>
      </label>
    </section>
  );
}
