import { useEffect, useMemo, useState } from 'react';
import type { SortMode, TrackedGame, TrackedGameWithPrice } from './types';
import { deleteGame, loadGames, setOwned } from './services/gamesApi';
import { useDeals } from './hooks/useDeals';
import { filterAndSort } from './utils/sorting';
import { Header } from './components/Header';
import { AddGameBar } from './components/AddGameBar';
import { SummaryBar } from './components/SummaryBar';
import { Toolbar } from './components/Toolbar';
import { GameGrid } from './components/GameGrid';
import { EmptyState } from './components/EmptyState';
import { ErrorBanner } from './components/ErrorBanner';

const NO_GAMES: TrackedGame[] = [];

export default function App() {
  const [games, setGames] = useState<TrackedGame[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { prices, lastRefresh, loading, error, refresh } = useDeals(games ?? NO_GAMES);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('price');
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(false);

  useEffect(() => {
    loadGames()
      .then(setGames)
      .catch((err) => {
        setGames([]);
        setListError(err instanceof Error ? err.message : 'Could not load the game list.');
      });
  }, []);

  const gamesWithPrices: TrackedGameWithPrice[] = useMemo(
    () => (games ?? NO_GAMES).map((g) => ({ ...g, price: prices[g.appId] })),
    [games, prices],
  );

  // Summary reflects the wishlist — owned games are no longer deals to hunt.
  const wishlistGames = useMemo(() => gamesWithPrices.filter((g) => !g.owned), [gamesWithPrices]);

  const visibleGames = useMemo(
    () => filterAndSort(gamesWithPrices, search, sortMode, discountedOnly, ownedOnly),
    [gamesWithPrices, search, sortMode, discountedOnly, ownedOnly],
  );

  const trackedIds = useMemo(() => new Set((games ?? NO_GAMES).map((g) => g.appId)), [games]);

  const handleToggleOwned = async (game: TrackedGameWithPrice) => {
    try {
      const nextOwned = !game.owned;
      await setOwned(game.appId, nextOwned);
      setGames((prev) =>
        (prev ?? []).map((g) =>
          g.appId === game.appId ? { ...g, owned: nextOwned || undefined } : g,
        ),
      );
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update the game.');
    }
  };

  const handleDelete = async (game: TrackedGameWithPrice) => {
    if (!window.confirm(`Remove "${game.name}" from your list?`)) return;
    try {
      await deleteGame(game.appId);
      setGames((prev) => (prev ?? []).filter((g) => g.appId !== game.appId));
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove the game.');
    }
  };

  const bannerError = actionError ?? listError ?? error;
  const showError = bannerError !== null && bannerError !== dismissedError;

  return (
    <div className="app">
      <Header
        loading={loading}
        hasGames={(games?.length ?? 0) > 0}
        onRefresh={() => void refresh()}
      />

      {showError && (
        <ErrorBanner message={bannerError} onDismiss={() => setDismissedError(bannerError)} />
      )}

      {games !== null && (
        <AddGameBar
          trackedIds={trackedIds}
          onAdded={(entry) => setGames((prev) => [...(prev ?? []), entry])}
        />
      )}

      {games === null ? (
        <div className="page-loading">
          <span className="spinner" aria-hidden="true" />
          <p>Loading your game list…</p>
        </div>
      ) : games.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <SummaryBar games={wishlistGames} lastRefresh={lastRefresh} />
          <Toolbar
            search={search}
            onSearchChange={setSearch}
            sortMode={sortMode}
            onSortChange={setSortMode}
            discountedOnly={discountedOnly}
            onDiscountedOnlyChange={setDiscountedOnly}
            ownedOnly={ownedOnly}
            onOwnedOnlyChange={setOwnedOnly}
            ownedCount={gamesWithPrices.length - wishlistGames.length}
          />
          <GameGrid
            games={visibleGames}
            loading={loading}
            ownedView={ownedOnly}
            onToggleOwned={(g) => void handleToggleOwned(g)}
            onDelete={(g) => void handleDelete(g)}
          />
        </>
      )}

      <footer className="app-footer">
        <p>
          Prices are fetched from the public Steam Store API and shown in your regional currency.
          Not affiliated with Valve.
        </p>
      </footer>
    </div>
  );
}
