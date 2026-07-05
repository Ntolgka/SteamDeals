import type { GameEnrichment, GameList, LowsMap, TrackedGameWithPrice } from '../types';
import { GameCard } from './GameCard';

interface GameGridProps {
  games: TrackedGameWithPrice[];
  loading: boolean;
  ownedView: boolean;
  lows: LowsMap;
  enrichment: Record<number, GameEnrichment>;
  moveTargets: GameList[];
  onToggleOwned: (game: TrackedGameWithPrice) => void;
  onDelete: (game: TrackedGameWithPrice) => void;
  onMove: (game: TrackedGameWithPrice, toListId: string) => void;
}

export function GameGrid({
  games,
  loading,
  ownedView,
  lows,
  enrichment,
  moveTargets,
  onToggleOwned,
  onDelete,
  onMove,
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
          moveTargets={moveTargets}
          onToggleOwned={onToggleOwned}
          onDelete={onDelete}
          onMove={onMove}
        />
      ))}
    </div>
  );
}
