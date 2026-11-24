/* oxlint-disable unicorn/prefer-export-from */
import type { Preferences } from './types';

import { preferencesManager } from './preferences';

export const {
  onUserPreferencesChange,
  updateUserPreferences,
  updateUserCustomPreferences,
  resetUserPreferences,
  setPreferenceDefaults,
  getPreferences,
  getCustomPreferences,
  getInitialCustomPreferences,
  getPreferencesExtension,
  updatePreferences,
  updateCustomPreferences,
  resetPreferences,
  clearCache,
  initPreferences,
} = preferencesManager;

export const preferences: Preferences = getPreferences();

export { preferencesManager };

export * from './constants';
export type { UserPreferenceChange } from './preferences';
export {
  DEFAULT_TIMEZONE_CHOICES,
  formatTimezoneOffset,
  formatTimezoneTime,
  timezoneName,
} from './timezone';

export type { TimezoneChoice } from './timezone';

export type * from './types';
export * from './use-preferences';
