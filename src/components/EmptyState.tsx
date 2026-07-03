export function EmptyState() {
  return (
    <div className="empty-state">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        <path d="M8 21h8M12 17v4" />
      </svg>
      <h2>No games tracked yet</h2>
      <p>
        Type a game name in the box above to add your first game — the Steam App ID, store link,
        and artwork are filled in automatically. You can also edit <code>data/games.json</code>{' '}
        directly or run <code>npm run add-game -- "Game Name"</code>.
      </p>
    </div>
  );
}
