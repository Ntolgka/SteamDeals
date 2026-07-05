/** One game entry inside a list (data/games.json v2). */
export interface TrackedGame {
  name: string;
  appId: number;
  steamUrl: string;
  headerImage: string;
  /** Marked as bought — hidden from the wishlist, visible via the "Owned" filter. */
  owned?: boolean;
  /** When the game was added (used by the "Recently added" sort). */
  addedAt?: number;
}

export interface GameList {
  id: string;
  name: string;
  createdAt: number;
  games: TrackedGame[];
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

/** Lowest price ever observed by this app for a region. */
export interface LowRecord {
  finalCents: number;
  currency: string;
  at: number;
}

export type LowsMap = Record<string, LowRecord>;

/** Steam review summary (from the official appreviews endpoint). */
export interface GameReview {
  percent: number | null;
  total: number;
  desc: string;
  fetchedAt: number;
}

/** Community metadata from SteamSpy. */
export interface GameMeta {
  tags: string[];
  rpgMaker: boolean;
  avgHours: number | null;
  fetchedAt: number;
}

/** HowLongToBeat playtimes. */
export interface GameHltb {
  mainHours: number | null;
  extraHours: number | null;
  matchedName: string | null;
  fetchedAt: number;
}

export interface GameEnrichment {
  review?: GameReview;
  meta?: GameMeta;
  hltb?: GameHltb;
}

export interface TrackedGameWithPrice extends TrackedGame {
  price?: GamePrice;
}

export type SortMode = 'price' | 'discount' | 'playtime' | 'name' | 'recent';

export interface Filters {
  search: string;
  sortMode: SortMode;
  discountedOnly: boolean;
  ownedOnly: boolean;
  /** Maximum current price in whole currency units (1–10), or null for no limit. */
  maxPriceUnits: number | null;
  /** Minimum discount percentage (0 = no minimum). */
  minDiscount: number;
}
