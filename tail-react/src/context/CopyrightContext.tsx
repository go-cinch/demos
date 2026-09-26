import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CopyrightPreferences {
  enabled: boolean;
  date: string;
  company: string;
  companyLink: string;
  icp: string;
  icpLink: string;
}

const STORAGE_KEY = "go-cinch-copyright-preferences";
const defaults: CopyrightPreferences = {
  enabled: true,
  date: String(new Date().getFullYear()),
  company: "go-cinch",
  companyLink: "https://github.com/go-cinch/demos",
  icp: "",
  icpLink: "",
};

const CopyrightContext = createContext<{
  preferences: CopyrightPreferences;
  update: (patch: Partial<CopyrightPreferences>) => void;
} | null>(null);

export function CopyrightProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<CopyrightPreferences>(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch {
      return defaults;
    }
  });
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)), [preferences]);
  const value = useMemo(
    () => ({ preferences, update: (patch: Partial<CopyrightPreferences>) => setPreferences((current) => ({ ...current, ...patch })) }),
    [preferences],
  );
  return <CopyrightContext.Provider value={value}>{children}</CopyrightContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCopyright() {
  const value = useContext(CopyrightContext);
  if (!value) throw new Error("useCopyright must be used inside CopyrightProvider");
  return value;
}

export function Copyright({ className = "" }: { className?: string }) {
  const { preferences } = useCopyright();
  if (!preferences.enabled) return null;
  return (
    <div className={className}>
      Copyright © {preferences.date}{" "}
      <a href={preferences.companyLink} rel="noreferrer" target="_blank">{preferences.company}</a>
      {preferences.icp && (
        <> · <a href={preferences.icpLink || undefined} rel="noreferrer" target={preferences.icpLink ? "_blank" : undefined}>{preferences.icp}</a></>
      )}
    </div>
  );
}
