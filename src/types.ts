/** One entry in data/games.json. */
export interface TrackedGame {
  name: string;
  appId: number;
  steamUrl: string;
  headerImage: string;
  /** Marked as bought — hidden from the wishlist, visible via the "Owned" filter. */
  owned?: boolean;
}

export type PriceStatus =
  | 'discounted'
  | 'full_price'
  | 'free'
  | 'unavailable'
  | 'error';

/** Result of a price lookup for a single app. Amounts are in minor units (cents). */
export interface GamePrice {
  appId: number;
  status: PriceStatus;
  currency?: string;
  initialCents?: number;
  finalCents?: number;
  discountPercent?: number;
  /** Human-readable detail for unavailable/error states. */
  message?: string;
  fetchedAt: number;
}

export type PriceMap = Record<number, GamePrice>;

export interface TrackedGameWithPrice extends TrackedGame {
  price?: GamePrice;
}

export type SortMode = 'price' | 'discount' | 'name';
