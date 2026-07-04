import type { GameEnrichment, LowsMap, TrackedGameWithPrice } from '../types';
import { GameCard } from './GameCard';

interface GameGridProps {
  games: TrackedGameWithPrice[];
  loading: boolean;
  ownedView: boolean;
  lows: LowsMap;
  enrichment: Record<number, GameEnrichment>;
  onToggleOwned: (game: TrackedGameWithPrice) => void;
  onDelete: (game: TrackedGameWithPrice) => void;
}

export function GameGrid({
  games,
  loading,
  ownedView,
  lows,
  enrichment,
  onToggleOwned,
  onDelete,
}: GameGridProps) {
  if (games.length === 0) {
    return (
      <div className="grid-empty">
        <p>
          {ownedView
            ? 'No owned games yet — press the ✓ button on a card to mark it as bought.'
            : 'No games match the current search or filters.'}
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
          low={lows[String(game.appId)]}
          enrichment={enrichment[game.appId]}
          onToggleOwned={onToggleOwned}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
