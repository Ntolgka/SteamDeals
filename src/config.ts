/**
 * Steam storefront region. The `cc` code pins pricing to a specific regional
 * price sheet regardless of your current IP (VPN, travel). The selection is
 * kept in localStorage and can be changed from the header dropdown.
 */

export interface Region {
  code: string;
  label: string;
}

export const REGIONS: Region[] = [
  { code: 'tr', label: 'Turkey — MENA (USD)' },
  { code: 'us', label: 'United States (USD)' },
  { code: 'ar', label: 'Argentina — LATAM (USD)' },
  { code: 'de', label: 'Europe (EUR)' },
  { code: 'gb', label: 'United Kingdom (GBP)' },
  { code: 'ua', label: 'Ukraine (UAH)' },
  { code: 'kz', label: 'CIS (USD)' },
  { code: 'br', label: 'Brazil (BRL)' },
  { code: 'in', label: 'India (INR)' },
  { code: 'jp', label: 'Japan (JPY)' },
  { code: 'cn', label: 'China (CNY)' },
];

export const DEFAULT_COUNTRY = 'tr';

const STORAGE_KEY = 'steamdeals.cc';

export function getCountry(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_COUNTRY;
  } catch {
    return DEFAULT_COUNTRY;
  }
}

export function setCountry(cc: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, cc);
  } catch {
    // Non-fatal; the session just won't persist the choice.
  }
}
