'use client';
import { useEffect, useState } from 'react';
/** Dismiss only the warning; failed statistics stay unavailable until a successful retry. */
export function useStatisticsWarning(failed: boolean) {
  const [visible, setVisible] = useState(failed);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize this transient indicator with the external request outcome.
    setVisible(failed);
    if (!failed) return;
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [failed]);
  return visible;
}
