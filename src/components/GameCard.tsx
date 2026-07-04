import { useState } from 'react';
import type { GameEnrichment, LowRecord, TrackedGameWithPrice } from '../types';
import { headerImageUrl } from '../services/steamApi';
import { formatPrice, formatRelativeTime } from '../utils/format';
import { useNow } from '../hooks/useNow';

interface GameCardProps {
  game: TrackedGameWithPrice;
  loading: boolean;
  low?: LowRecord;
  enrichment?: GameEnrichment;
  onToggleOwned: (game: TrackedGameWithPrice) => void;
  onDelete: (game: TrackedGameWithPrice) => void;
}

function PriceBlock({ game, loading }: Pick<GameCardProps, 'game' | 'loading'>) {
  const p = game.price;

  if (loading && !p) {
    return (
      <div className="card__price-row">
        <div className="skeleton skeleton--price" />
      </div>
    );
  }

  if (!p) {
    return <p className="card__note">Press “Refresh Deals” to load pricing.</p>;
  }

  switch (p.status) {
    case 'free':
      return (
        <div className="card__price-row">
          <span className="card__price card__price--free">Free to Play</span>
        </div>
      );
    case 'discounted':
      return (
        <div className="card__price-row">
          <span className="card__discount-badge">-{p.discountPercent}%</span>
          <div className="card__prices">
            <span className="card__price-old">
              {formatPrice(p.initialCents!, p.currency!)}
            </span>
            <span className="card__price card__price--deal">
              {formatPrice(p.finalCents!, p.currency!)}
            </span>
          </div>
        </div>
      );
    case 'full_price':
      return (
        <div className="card__price-row">
          <span className="card__no-discount">No active discount</span>
          <span className="card__price">{formatPrice(p.finalCents!, p.currency!)}</span>
        </div>
      );
    case 'unavailable':
      return <p className="card__note card__note--warn">{p.message ?? 'Unavailable on Steam.'}</p>;
    case 'error':
      return <p className="card__note card__note--error">{p.message ?? 'Failed to load price.'}</p>;
  }
}

function reviewClass(percent: number): string {
  if (percent >= 70) return 'card__review--pos';
  if (percent >= 40) return 'card__review--mixed';
  return 'card__review--neg';
}

const compactCount = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);

function MetaRow({ game, low, enrichment }: Pick<GameCardProps, 'game' | 'low' | 'enrichment'>) {
  const review = enrichment?.review;
  const hltb = enrichment?.hltb;
  const avg = enrichment?.meta?.avgHours;
  const p = game.price;

  const playtime =
    hltb?.mainHours != null
      ? { hours: hltb.mainHours, title: `HowLongToBeat — Main story${hltb.matchedName ? ` (${hltb.matchedName})` : ''}` }
      : avg != null
        ? { hours: avg, title: 'SteamSpy — average playtime' }
        : null;

  const atLow =
    low !== undefined &&
    p?.finalCents !== undefined &&
    (p.status === 'discounted' || p.status === 'full_price' || p.status === 'free') &&
    p.finalCents <= low.finalCents;

  const hasAnything = (review && review.percent !== null) || playtime || low;
  if (!hasAnything) return null;

  return (
    <div className="card__meta">
      {review && review.percent !== null && (
        <span
          className={`card__review ${reviewClass(review.percent)}`}
          title={`${review.desc} — ${review.total.toLocaleString()} Steam reviews`}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
            <path d="M2 10h4v11H2zM22 11c0-1.1-.9-2-2-2h-5.3l.9-4.3v-.3c0-.4-.2-.8-.4-1.1L14 2 8.6 8.6c-.4.3-.6.8-.6 1.4v9c0 1.1.9 2 2 2h7c.8 0 1.5-.5 1.8-1.2l2.1-7c.1-.2.1-.4.1-.6v-1.2z" />
          </svg>
          {review.percent}% <em>({compactCount(review.total)})</em>
        </span>
      )}
      {playtime && (
        <span className="card__playtime" title={playtime.title}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
          </svg>
          {playtime.hours} h
        </span>
      )}
      {low && (
        <span
          className={`card__low${atLow ? ' card__low--now' : ''}`}
          title={`Lowest price this app has seen in this region (tracked since you started using SteamDeals) — recorded ${new Date(low.at).toLocaleDateString()}`}
        >
          {atLow ? 'At all-time low' : `Low: ${formatPrice(low.finalCents, low.currency)}`}
        </span>
      )}
    </div>
  );
}

export function GameCard({ game, loading, low, enrichment, onToggleOwned, onDelete }: GameCardProps) {
  useNow(); // keep "Updated X ago" ticking
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = game.headerImage || headerImageUrl(game.appId);
  const meta = enrichment?.meta;

  return (
    <article className={`card${loading && !game.price ? ' card--loading' : ''}`}>
      <div className="card__media">
        {imageFailed ? (
          <div className="card__media-fallback" aria-hidden="true">
            <span>{game.name.slice(0, 1)}</span>
          </div>
        ) : (
          <img
            src={imageSrc}
            alt={`${game.name} header`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
        {game.price?.status === 'discounted' && (
          <span className="card__ribbon">-{game.price.discountPercent}%</span>
        )}
        <div className="card__actions">
          <button
            className={`card__action${game.owned ? ' card__action--owned' : ''}`}
            title={game.owned ? 'Owned — click to move back to the wishlist' : 'Mark as bought'}
            aria-label={game.owned ? `Move ${game.name} back to wishlist` : `Mark ${game.name} as bought`}
            onClick={() => onToggleOwned(game)}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m4 12.5 5 5L20 6.5" />
            </svg>
          </button>
          <button
            className="card__action card__action--danger"
            title="Remove from list"
            aria-label={`Remove ${game.name} from list`}
            onClick={() => onDelete(game)}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
          </button>
        </div>
      </div>

      <div className="card__body">
        <h2 className="card__title" title={game.name}>
          {game.name}
        </h2>

        {(meta?.rpgMaker || (meta?.tags.length ?? 0) > 0) && (
          <div className="card__tags">
            {meta?.rpgMaker && <span className="card__tag card__tag--rpgmaker">RPGMAKER</span>}
            {meta?.tags.map((t) => (
              <span className="card__tag" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}

        <PriceBlock game={game} loading={loading} />
        <MetaRow game={game} low={low} enrichment={enrichment} />

        <div className="card__footer">
          <a
            className="card__steam-link"
            href={game.steamUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Steam
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7" />
              <path d="M9 7h8v8" />
            </svg>
          </a>
          {game.price && (
            <span className="card__updated">
              Updated {formatRelativeTime(game.price.fetchedAt)}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
