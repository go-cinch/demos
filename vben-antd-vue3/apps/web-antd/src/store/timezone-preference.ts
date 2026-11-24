import { preferences, updatePreferences } from '@vben/preferences';
import { setCurrentTimezone } from '@vben/utils';

import { updateUserTimezoneApi } from '#/api/core/user';

import {
  createGlobalPreferenceSync,
  pendingSelection,
} from './global-preference';

export function isValidTimezone(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value === 'Local' ||
    !/^[A-Za-z][\w+./-]*$/.test(value)
  )
    return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function systemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
function resolveTimezone(value: string) {
  return isValidTimezone(value) ? value : systemTimezone();
}
function applyTimezone(timezone: string) {
  // Update date formatting immediately; the store watcher also updates the selector.
  setCurrentTimezone(timezone);
  updatePreferences({ app: { timezone } });
}

export function initializeTimezonePreference() {
  const pending = pendingSelection('timezone');
  applyTimezone(
    pending && isValidTimezone(pending.value)
      ? pending.value
      : systemTimezone(),
  );
}

export function createTimezonePreferenceSync() {
  return createGlobalPreferenceSync({
    fallback: systemTimezone,
    field: 'timezone',
    current: () => preferences.app.timezone,
    resolve: resolveTimezone,
    save: updateUserTimezoneApi,
    apply: applyTimezone,
  });
}
