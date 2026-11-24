import type { SupportedLanguagesType } from './typing';

// Only explicit UI selections emit this event; bootstrap and account restoration do not.
const listeners = new Set<(locale: SupportedLanguagesType) => void>();
export function onLocaleSelected(
  listener: (locale: SupportedLanguagesType) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function notifyLocaleSelected(locale: SupportedLanguagesType) {
  for (const listener of listeners) listener(locale);
}
