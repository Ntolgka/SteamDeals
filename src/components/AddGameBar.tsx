import { useEffect, useRef, useState } from 'react';
import type { TrackedGame } from '../types';
import { addGame, searchSteam, type SteamSearchItem } from '../services/gamesApi';
import { formatPrice } from '../utils/format';

interface AddGameBarProps {
  listId: string;
  trackedIds: Set<number>;
  onAdded: (game: TrackedGame) => void;
  onImportClick: () => void;
}

/**
 * Search Steam by name and add a game to the active list with one click.
 * All entry details (appId, store URL, header image) are derived from the
 * selected search result.
 */
export function AddGameBar({ listId, trackedIds, onAdded, onImportClick }: AddGameBarProps) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SteamSearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search-as-you-type against Steam's store search.
  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const items = await searchSteam(query, controller.signal);
        setResults(items.slice(0, 6));
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) {
          setResults([]);
          setError(err instanceof Error ? err.message : 'Search failed.');
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term]);

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setResults(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const pick = async (item: SteamSearchItem) => {
    if (busyId !== null || trackedIds.has(item.id)) return;
    setBusyId(item.id);
    setError(null);
    try {
      const entry = await addGame(listId, item.name, item.id);
      onAdded(entry);
      setTerm('');
      setResults(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add game.');
    } finally {
      setBusyId(null);
    }
  };

  const open = term.trim().length >= 2 && (searching || results !== null);

  return (
    <section className="addbar" aria-label="Add a game" ref={containerRef}>
      <div className="addbar__row">
        <div className="addbar__field">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <input
            type="text"
            placeholder="Add a game by name — e.g. Hollow Knight…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setResults(null);
            }}
            aria-label="Add a game by name"
          />
          {searching && <span className="spinner spinner--dim" aria-hidden="true" />}

          {open && (
            <div className="addbar__results" role="listbox">
              {!searching && results?.length === 0 && (
                <div className="addbar__empty">No Steam results for “{term.trim()}”.</div>
              )}
              {results?.map((item) => {
                const tracked = trackedIds.has(item.id);
                return (
                  <button
                    key={item.id}
                    className="addbar__result"
                    onClick={() => void pick(item)}
                    disabled={tracked || busyId !== null}
                    role="option"
                    aria-selected="false"
                  >
                    <img
                      src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/capsule_231x87.jpg`}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        // Fall back to Steam's own search thumbnail, then give up.
                        const img = e.currentTarget;
                        if (item.tiny_image && img.src !== item.tiny_image) {
                          img.src = item.tiny_image;
                        } else {
                          img.style.visibility = 'hidden';
                        }
                      }}
                    />
                    <span className="addbar__result-name">{item.name}</span>
                    <span className="addbar__result-meta">
                      {tracked
                        ? 'Tracked ✓'
                        : busyId === item.id
                          ? 'Adding…'
                          : item.price
                            ? formatPrice(item.price.final, item.price.currency)
                            : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button className="addbar__import" onClick={onImportClick} title="Paste a whole wishlist at once">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
          </svg>
          Import wishlist
        </button>
      </div>
      {error && <p className="addbar__error">{error}</p>}
    </section>
  );
}
