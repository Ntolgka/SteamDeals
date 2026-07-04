import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Filters, GameList, TrackedGame, TrackedGameWithPrice } from './types';
import { getCountry, setCountry } from './config';
import {
  createList,
  deleteGame,
  deleteList,
  loadState,
  renameList,
  setOwned,
} from './services/gamesApi';
import { useDeals } from './hooks/useDeals';
import { useEnrichment } from './hooks/useEnrichment';
import { filterAndSort } from './utils/sorting';
import { Header } from './components/Header';
import { AddGameBar } from './components/AddGameBar';
import { ListTabs } from './components/ListTabs';
import { SummaryBar } from './components/SummaryBar';
import { Toolbar } from './components/Toolbar';
import { GameGrid } from './components/GameGrid';
import { EmptyState } from './components/EmptyState';
import { ErrorBanner } from './components/ErrorBanner';
import { ImportModal } from './components/ImportModal';

const NO_GAMES: TrackedGame[] = [];
const ACTIVE_LIST_KEY = 'steamdeals.activeList';

const DEFAULT_FILTERS: Filters = {
  search: '',
  sortMode: 'price',
  discountedOnly: false,
  ownedOnly: false,
  maxPriceUnits: null,
  minDiscount: 0,
};

export default function App() {
  const [lists, setLists] = useState<GameList[] | null>(null);
  const [activeListId, setActiveListId] = useState<string>(
    () => localStorage.getItem(ACTIVE_LIST_KEY) ?? '',
  );
  const [cc, setCc] = useState(getCountry());
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showImport, setShowImport] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const reloadState = useCallback(async (selectListId?: string) => {
    try {
      const { lists: fresh } = await loadState();
      setLists(fresh);
      setActiveListId((current) => {
        const wanted = selectListId ?? current;
        return fresh.some((l) => l.id === wanted) ? wanted : (fresh[0]?.id ?? '');
      });
      setListError(null);
    } catch (err) {
      setLists((prev) => prev ?? []);
      setListError(err instanceof Error ? err.message : 'Could not load the game lists.');
    }
  }, []);

  useEffect(() => {
    void reloadState();
  }, [reloadState]);

  useEffect(() => {
    try {
      if (activeListId) localStorage.setItem(ACTIVE_LIST_KEY, activeListId);
    } catch {
      /* non-fatal */
    }
  }, [activeListId]);

  const activeList = useMemo(
    () => lists?.find((l) => l.id === activeListId) ?? lists?.[0] ?? null,
    [lists, activeListId],
  );
  const activeGames = activeList?.games ?? NO_GAMES;

  const { prices, lows, lastRefresh, loading, error, refresh } = useDeals(activeGames, cc);
  const enrichment = useEnrichment(activeGames);

  const gamesWithPrices: TrackedGameWithPrice[] = useMemo(
    () => activeGames.map((g) => ({ ...g, price: prices[g.appId] })),
    [activeGames, prices],
  );

  // Summary reflects the wishlist — owned games are no longer deals to hunt.
  const wishlistGames = useMemo(() => gamesWithPrices.filter((g) => !g.owned), [gamesWithPrices]);

  const visibleGames = useMemo(
    () => filterAndSort(gamesWithPrices, filters),
    [gamesWithPrices, filters],
  );

  const trackedIds = useMemo(() => new Set(activeGames.map((g) => g.appId)), [activeGames]);

  const currency = useMemo(
    () => gamesWithPrices.find((g) => g.price?.currency)?.price?.currency ?? null,
    [gamesWithPrices],
  );

  const guard = async (op: () => Promise<unknown>) => {
    try {
      await op();
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The operation failed.');
    }
  };

  const handleCcChange = (next: string) => {
    setCountry(next);
    setCc(next);
  };

  const handleCreateList = () => {
    const name = window.prompt('Name for the new list:')?.trim();
    if (!name) return;
    void guard(async () => {
      const list = await createList(name);
      await reloadState(list.id);
    });
  };

  const handleRenameList = () => {
    if (!activeList) return;
    const name = window.prompt('New name for this list:', activeList.name)?.trim();
    if (!name || name === activeList.name) return;
    void guard(async () => {
      await renameList(activeList.id, name);
      await reloadState();
    });
  };

  const handleDeleteList = () => {
    if (!activeList) return;
    if (!window.confirm(`Delete the list "${activeList.name}" and its ${activeList.games.length} game(s)?`)) {
      return;
    }
    void guard(async () => {
      await deleteList(activeList.id);
      await reloadState(lists?.find((l) => l.id !== activeList.id)?.id);
    });
  };

  const handleToggleOwned = (game: TrackedGameWithPrice) => {
    if (!activeList) return;
    void guard(async () => {
      await setOwned(activeList.id, game.appId, !game.owned);
      await reloadState();
    });
  };

  const handleDelete = (game: TrackedGameWithPrice) => {
    if (!activeList) return;
    if (!window.confirm(`Remove "${game.name}" from "${activeList.name}"?`)) return;
    void guard(async () => {
      await deleteGame(activeList.id, game.appId);
      await reloadState();
    });
  };

  const bannerError = actionError ?? listError ?? error;
  const showError = bannerError !== null && bannerError !== dismissedError;

  return (
    <div className="app">
      <Header
        loading={loading}
        hasGames={activeGames.length > 0}
        cc={cc}
        onCcChange={handleCcChange}
        onRefresh={() => void refresh()}
      />

      {showError && (
        <ErrorBanner message={bannerError} onDismiss={() => setDismissedError(bannerError)} />
      )}

      {lists !== null && activeList && (
        <>
          <AddGameBar
            listId={activeList.id}
            trackedIds={trackedIds}
            onAdded={() => void reloadState()}
            onImportClick={() => setShowImport(true)}
          />
          <ListTabs
            lists={lists}
            activeListId={activeList.id}
            onSelect={setActiveListId}
            onCreate={handleCreateList}
            onRename={handleRenameList}
            onDelete={handleDeleteList}
          />
        </>
      )}

      {lists === null ? (
        <div className="page-loading">
          <span className="spinner" aria-hidden="true" />
          <p>Loading your game lists…</p>
        </div>
      ) : !activeList || activeGames.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <SummaryBar games={wishlistGames} lastRefresh={lastRefresh} />
          <Toolbar
            filters={filters}
            onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            ownedCount={gamesWithPrices.length - wishlistGames.length}
            currency={currency}
          />
          <GameGrid
            games={visibleGames}
            loading={loading}
            ownedView={filters.ownedOnly}
            lows={lows}
            enrichment={enrichment}
            onToggleOwned={handleToggleOwned}
            onDelete={handleDelete}
          />
        </>
      )}

      {showImport && lists !== null && activeList && (
        <ImportModal
          lists={lists}
          activeListId={activeList.id}
          onClose={() => setShowImport(false)}
          onImported={(listId) => void reloadState(listId)}
        />
      )}

      <footer className="app-footer">
        <p>
          Prices from the Steam Store API · reviews from Steam · tags &amp; playtime from SteamSpy
          and HowLongToBeat · all-time lows tracked locally per region. Not affiliated with Valve.
        </p>
      </footer>
    </div>
  );
}
