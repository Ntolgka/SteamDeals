import { useState } from 'react';
import type { GameList } from '../types';
import {
  bulkImport,
  bulkImportAppIds,
  createList,
  fetchSteamWishlist,
  type BulkImportResult,
} from '../services/gamesApi';

interface ImportModalProps {
  lists: GameList[];
  activeListId: string;
  onClose: () => void;
  /** Called after a successful import so the app can reload state. */
  onImported: (targetListId: string) => void;
}

const NEW_LIST = '__new__';
type Mode = 'names' | 'wishlist';

/**
 * Add many games at once, either by pasting game names (one per line) or by
 * importing a public Steam wishlist. Everything resolves to complete Steam
 * entries server-side and lands in the chosen list — existing or brand new.
 */
export function ImportModal({ lists, activeListId, onClose, onImported }: ImportModalProps) {
  const [mode, setMode] = useState<Mode>('names');
  const [text, setText] = useState('');
  const [wishlistInput, setWishlistInput] = useState('');
  const [target, setTarget] = useState(activeListId);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const names = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  const resolveTargetList = async (): Promise<string | null> => {
    if (target !== NEW_LIST) return target;
    const name = newName.trim();
    if (!name) {
      setError('Give the new list a name.');
      return null;
    }
    return (await createList(name)).id;
  };

  const runNamesImport = async () => {
    setError(null);
    if (names.length === 0) {
      setError('Paste at least one game name (one per line).');
      return;
    }
    setBusy(true);
    try {
      const listId = await resolveTargetList();
      if (!listId) return;
      setProgress(`Resolving ${names.length} name${names.length === 1 ? '' : 's'} on Steam…`);
      const res = await bulkImport(listId, names);
      setResult(res);
      onImported(listId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const runWishlistImport = async () => {
    setError(null);
    if (!wishlistInput.trim()) {
      setError('Enter your Steam profile URL, SteamID, or vanity name.');
      return;
    }
    setBusy(true);
    try {
      const listId = await resolveTargetList();
      if (!listId) return;
      setProgress('Fetching your Steam wishlist…');
      const { items } = await fetchSteamWishlist(wishlistInput.trim());
      setProgress(`Adding ${items.length} game${items.length === 1 ? '' : 's'} (this can take a minute)…`);
      const res = await bulkImportAppIds(listId, items);
      setResult(res);
      onImported(listId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wishlist import failed.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const TargetPicker = (
    <div className="modal__row">
      <label>
        Add to
        <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={busy}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value={NEW_LIST}>➕ Create a new list…</option>
        </select>
      </label>
      {target === NEW_LIST && (
        <input
          type="text"
          placeholder="New list name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={busy}
        />
      )}
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import games">
        <div className="modal__head">
          <h2>Import games</h2>
          <button className="modal__close" onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </div>

        {result === null ? (
          <>
            <div className="modal__tabs" role="tablist">
              <button
                className={`modal__tab${mode === 'names' ? ' is-active' : ''}`}
                onClick={() => setMode('names')}
                disabled={busy}
              >
                Paste names
              </button>
              <button
                className={`modal__tab${mode === 'wishlist' ? ' is-active' : ''}`}
                onClick={() => setMode('wishlist')}
                disabled={busy}
              >
                Steam wishlist
              </button>
            </div>

            {mode === 'names' ? (
              <>
                <p className="modal__hint">
                  Paste game names — one per line. Each name is matched against Steam search and
                  added with its App ID, store link, and artwork.
                </p>
                <textarea
                  className="modal__textarea"
                  rows={7}
                  placeholder={'Hollow Knight\nStardew Valley\nOMORI'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy}
                />
              </>
            ) : (
              <>
                <p className="modal__hint">
                  Paste your Steam profile URL (or SteamID64 / vanity name). Your wishlist must be
                  public: Steam → Profile → Edit Profile → Privacy → <em>Game details: Public</em>.
                </p>
                <input
                  className="modal__input-wide"
                  type="text"
                  placeholder="https://steamcommunity.com/id/yourname"
                  value={wishlistInput}
                  onChange={(e) => setWishlistInput(e.target.value)}
                  disabled={busy}
                />
              </>
            )}

            {TargetPicker}
            {progress && (
              <p className="modal__hint modal__hint--progress">
                <span className="spinner spinner--dim" aria-hidden="true" /> {progress}
              </p>
            )}
            {error && <p className="modal__error">{error}</p>}

            <div className="modal__actions">
              <button className="modal__btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              {mode === 'names' ? (
                <button
                  className="modal__btn modal__btn--primary"
                  onClick={() => void runNamesImport()}
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Importing…
                    </>
                  ) : (
                    `Import ${names.length || ''} game${names.length === 1 ? '' : 's'}`
                  )}
                </button>
              ) : (
                <button
                  className="modal__btn modal__btn--primary"
                  onClick={() => void runWishlistImport()}
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <span className="spinner" aria-hidden="true" /> Importing…
                    </>
                  ) : (
                    'Import wishlist'
                  )}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="modal__hint">
              Added <strong>{result.added.length}</strong> game
              {result.added.length === 1 ? '' : 's'}
              {result.failed.length > 0 && (
                <>
                  {' '}
                  — <strong>{result.failed.length}</strong> skipped:
                </>
              )}
            </p>
            {result.failed.length > 0 && (
              <ul className="modal__failures">
                {result.failed.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <strong>{f.name}</strong> — {f.reason}
                  </li>
                ))}
              </ul>
            )}
            <div className="modal__actions">
              <button className="modal__btn modal__btn--primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
