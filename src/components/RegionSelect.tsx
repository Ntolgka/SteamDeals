import { REGIONS } from '../config';

interface RegionSelectProps {
  cc: string;
  onChange: (cc: string) => void;
}

export function RegionSelect({ cc, onChange }: RegionSelectProps) {
  return (
    <label className="region-select" title="Steam storefront used for prices">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.7 2.6 4 5.6 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.6-4-9s1.3-6.4 4-9Z" />
      </svg>
      <select value={cc} onChange={(e) => onChange(e.target.value)} aria-label="Steam store region">
        {REGIONS.map((r) => (
          <option key={r.code} value={r.code}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}
