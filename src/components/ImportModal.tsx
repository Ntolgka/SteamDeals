import { useState } from 'react';
import type { GameList } from '../types';
import { bulkImport, createList, type BulkImportResult } from '../services/gamesApi';

interface ImportModalProps {
  lists: GameList[];
  activeListId: string;
  onClose: () => void;
  /** Called after a successful import so the app can reload state. */
  onImported: (targetListId: string) => void;
}

const NEW_LIST = '__new__';

/**
 * Paste a wishlist (one game name per line); every name is resolved to a
 * complete Steam entry server-side and added to the chosen list — an
 * existing one or a brand new one.
 */
export function ImportModal({ lists, activeListId, onClose, onImported }: ImportModalProps) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState(activeListId);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const names = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');

  const runImport = async () => {
    setError(null);
    if (names.length === 0) {
      setError('Paste at least one game name (one per line).');
      return;
    }
    setBusy(true);
    try {
      let listId = target;
      if (target === NEW_LIST) {
        const name = newName.trim();
        if (!name) {
          setError('Give the new list a name.');
          setBusy(false);
          return;
        }
        listId = (await createList(name)).id;
      }
      const res = await bulkImport(listId, names);
      setResult(res);
      onImported(listId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import wishlist">
        <div className="modal__head">
          <h2>Import wishlist</h2>
          <button className="modal__close" onClick={onClose} disabled={busy} aria-label="Close">
            ✕
          </button>
        </div>

        {result === null ? (
          <>
            <p className="modal__hint">
              Paste game names — one per line. Each name is matched against Steam search and added
              with its App ID, store link, and artwork.
            </p>
            <textarea
              className="modal__textarea"
              rows={8}
              placeholder={'Hollow Knight\nStardew Valley\nOMORI'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
            />
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
            {error && <p className="modal__error">{error}</p>}
            <div className="modal__actions">
              <button className="modal__btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="modal__btn modal__btn--primary" onClick={() => void runImport()} disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Importing {names.length} game
                    {names.length === 1 ? '' : 's'}…
                  </>
                ) : (
                  `Import ${names.length || ''} game${names.length === 1 ? '' : 's'}`
                )}
              </button>
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
                  — <strong>{result.failed.length}</strong> could not be added:
                </>
              )}
            </p>
            {result.failed.length > 0 && (
              <ul className="modal__failures">
                {result.failed.map((f) => (
                  <li key={f.name}>
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
