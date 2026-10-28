import { useEffect, useState } from "react";
import { effectiveTimezone } from "./model";
const key = "tail-react-timezone";
export function readAdminTimezone() {
  return effectiveTimezone(localStorage.getItem(key) ?? undefined);
}
export function setAdminTimezone(value: string) {
  localStorage.setItem(key, value);
  window.dispatchEvent(new Event("cinch-timezone-changed"));
}
export function useSelectedTimezone() {
  const [zone, setZone] = useState(readAdminTimezone);
  useEffect(() => {
    const changed = () => setZone(readAdminTimezone());
    window.addEventListener("cinch-timezone-changed", changed);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener("cinch-timezone-changed", changed);
      window.removeEventListener("storage", changed);
    };
  }, []);
  return zone;
}
export const timezoneOptions = [
  ...new Set([
    "UTC",
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    ...Intl.supportedValuesOf("timeZone"),
  ]),
].sort();
