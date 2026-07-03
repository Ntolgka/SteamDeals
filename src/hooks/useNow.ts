import { useEffect, useState } from 'react';

/**
 * Re-renders the component on an interval so relative timestamps
 * ("5 min ago") stay current without any user interaction.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
