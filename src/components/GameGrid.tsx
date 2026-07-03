import type { TrackedGameWithPrice } from '../types';
import { GameCard } from './GameCard';

interface GameGridProps {
  games: TrackedGameWithPrice[];
  loading: boolean;
  ownedView: boolean;
  onToggleOwned: (game: TrackedGameWithPrice) => void;
  onDelete: (game: TrackedGameWithPrice) => void;
}

export function GameGrid({ games, loading, ownedView, onToggleOwned, onDelete }: GameGridProps) {
  if (games.length === 0) {
    return (
      <div className="grid-empty">
        <p>
          {ownedView
            ? 'No owned games yet — press the ✓ button on a card to mark it as bought.'
            : 'No games match the current search or filter.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid">
      {games.map((game) => (
        <GameCard
          key={game.appId}
          game={game}
          loading={loading}
          onToggleOwned={onToggleOwned}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
