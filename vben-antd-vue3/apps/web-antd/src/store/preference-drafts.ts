import type { PreferenceValue } from './ui-preferences-contract';

import { userCache } from '@vben/utils/cache';

export interface PreferenceDraft {
  value: null | PreferenceValue;
  changed_at: number;
}

const legacyDraftPrefix = 'cinch-preference-drafts:v2:';
let legacyAccount: string | undefined;
const fieldKey = (field: string) => `preference-draft/${field}`;
const guest = () => userCache.anonymous('session');
const guestKey = 'preference-drafts';

function guestDrafts(): Record<string, PreferenceDraft> {
  const cache = guest();
  cache.migrate(guestKey, 'cinch-preference-drafts:v2:guest');
  return cache.get(guestKey) ?? {};
}

export function readDraft(field: string): PreferenceDraft | undefined {
  const owner = userCache.account;
  if (owner === null) return;
  if (owner === undefined) return guestDrafts()[field];
  const cache = userCache.current();
  const key = fieldKey(field);
  if (legacyAccount)
    cache.migrate(key, `${legacyDraftPrefix}${legacyAccount}:${field}`);
  return cache.get(key);
}

export function writeDraft(field: string, draft?: PreferenceDraft) {
  if (userCache.account === null) return;
  if (userCache.account !== undefined) {
    const cache = userCache.current();
    if (draft) cache.set(fieldKey(field), draft);
    else cache.removeItem(fieldKey(field));
    return;
  }
  const values = guestDrafts();
  if (draft) values[field] = draft;
  else Reflect.deleteProperty(values, field);
  if (Object.keys(values).length > 0) guest().set(guestKey, values);
  else guest().removeItem(guestKey);
}

export function acknowledgeDraft(field: string, expected: PreferenceDraft) {
  const current = readDraft(field);
  if (
    current &&
    current.changed_at === expected.changed_at &&
    JSON.stringify(current.value) === JSON.stringify(expected.value)
  ) {
    writeDraft(field);
  }
}

export function claimPreferenceDrafts(previousKey?: string) {
  legacyAccount = previousKey;
  const choices = guestDrafts();
  for (const [field, draft] of Object.entries(choices)) {
    const previous = readDraft(field);
    if (draft && (!previous || draft.changed_at >= previous.changed_at)) {
      writeDraft(field, draft);
    }
  }
  guest().removeItem(guestKey);
}
