interface HeaderProps {
  loading: boolean;
  hasGames: boolean;
  onRefresh: () => void;
}

export function Header({ loading, hasGames, onRefresh }: HeaderProps) {
  return (
    <header className="header">
      <div className="header__brand">
        <svg className="header__logo" viewBox="0 0 32 32" aria-hidden="true">
          <circle cx="16" cy="16" r="15" fill="var(--bg-deep)" stroke="var(--accent)" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="7" fill="none" stroke="var(--accent)" strokeWidth="3" />
          <circle cx="16" cy="16" r="2.5" fill="var(--accent)" />
        </svg>
        <div>
          <h1 className="header__title">
            Steam<span>Deals</span>
          </h1>
          <p className="header__subtitle">Track current Steam discounts for your wishlist</p>
        </div>
      </div>

      <button
        className="refresh-btn"
        onClick={onRefresh}
        disabled={loading || !hasGames}
        title={hasGames ? 'Fetch the latest prices from Steam' : 'Add games to data/games.json first'}
      >
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Refreshing…
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            Refresh Deals
          </>
        )}
      </button>
    </header>
  );
}
