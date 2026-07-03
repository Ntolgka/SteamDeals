/**
 * ISO 3166 country code sent to the Steam API as `cc`, which pins pricing to
 * a specific storefront region regardless of your current IP (VPN, travel).
 *
 * 'tr' = Turkey, which uses Steam's USD "MENA" price sheet.
 * Set to '' to let Steam infer the region from your IP instead.
 */
export const STEAM_COUNTRY = 'tr';
