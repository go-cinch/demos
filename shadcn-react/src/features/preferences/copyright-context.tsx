'use client';

import * as React from 'react';

export interface CopyrightPreferences {
  enabled: boolean;
  date: string;
  company: string;
  companyLink: string;
  icp: string;
  icpLink: string;
}

const STORAGE_KEY = 'go-cinch-copyright-preferences';
const defaults: CopyrightPreferences = {
  enabled: true,
  date: String(new Date().getFullYear()),
  company: 'go-cinch',
  companyLink: 'https://github.com/go-cinch/demos',
  icp: '',
  icpLink: ''
};

const Context = React.createContext<{
  preferences: CopyrightPreferences;
  update: (patch: Partial<CopyrightPreferences>) => void;
} | null>(null);

export function CopyrightProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = React.useState(defaults);
  const skipInitialWrite = React.useRef(true);
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      // oxlint-disable-next-line react/set-state-in-effect -- hydrate persisted client preference
      setPreferences({ ...defaults, ...saved });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);
  React.useEffect(() => {
    if (skipInitialWrite.current) {
      skipInitialWrite.current = false;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);
  const value = React.useMemo(
    () => ({
      preferences,
      update: (patch: Partial<CopyrightPreferences>) =>
        setPreferences((current) => ({ ...current, ...patch }))
    }),
    [preferences]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useCopyright() {
  const value = React.useContext(Context);
  if (!value) throw new Error('useCopyright must be used inside CopyrightProvider');
  return value;
}
