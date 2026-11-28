import type { UserPreferenceChange } from '@vben/preferences';

import type { PreferenceDraft } from './preference-drafts';
import type { PreferenceValue, UIPreferences } from './ui-preferences-contract';

import { userCache } from '@vben/utils/cache';

import { updateUIPreferencesApi } from '#/api/core/user';

import { getLoginPagePreferences } from './login-page-preferences';
import { acknowledgeDraft, readDraft, writeDraft } from './preference-drafts';
import {
  applyUIPreferences,
  bundledUIDefaults,
  expandPreferences,
  flattenPreferences,
  overlayPreferences,
  setUIDefaults,
  userPreferencePatch,
} from './ui-preferences-contract';

const day = 86_400_000;
type PendingValues = Record<string, PreferenceDraft>;
let defaults: UIPreferences | undefined;

function readPending(acceptedAt = Date.now()): PendingValues {
  const allowed = flattenPreferences(currentDefaults());
  const valid: PendingValues = {};
  for (const [key, fallback] of Object.entries(allowed)) {
    const entry = readDraft(key);
    if (!entry) continue;
    if (
      Number.isFinite(entry.changed_at) &&
      entry.changed_at <= Date.now() &&
      acceptedAt - entry.changed_at <= day &&
      (entry.value === null || typeof entry.value === typeof fallback) &&
      (typeof entry.value !== 'object' ||
        entry.value === null ||
        (Array.isArray(entry.value) &&
          entry.value.every((item) => typeof item === 'string')))
    )
      valid[key] = entry;
    else acknowledgeDraft(key, entry);
  }
  return valid;
}
function currentDefaults() {
  return defaults ?? bundledUIDefaults();
}
function configureDefaults(value?: UIPreferences) {
  if (value) {
    defaults = structuredClone(value);
    setUIDefaults(value);
  }
}
function valuesOf(entries: PendingValues) {
  return Object.fromEntries(
    Object.entries(entries).map(([key, entry]) => [key, entry.value]),
  );
}

export function initializeUIPreferences(value?: UIPreferences) {
  configureDefaults(value);
  const base = currentDefaults();
  const inherited = userPreferencePatch({
    preferences: getLoginPagePreferences(),
  });
  const pending = readPending();
  applyUIPreferences(
    overlayPreferences(
      overlayPreferences(base, inherited, base),
      expandPreferences(valuesOf(pending)),
      base,
    ),
  );
}

/** Local user actions are immediate; only their sparse patches enter this serialized writer. */
export function createUIPreferenceSync() {
  let pending: Record<string, null | PreferenceValue> = {};
  let anonymous: PendingValues = {};
  let resetPending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: Promise<void> | undefined;
  let generation = 0;
  let isCurrent = () => false;
  let latestSaved: UIPreferences | undefined;
  let inFlightValues: Record<string, null | PreferenceValue> = {};
  let inFlightReset = false;

  function applyServer(value: UIPreferences) {
    const base = resetPending || inFlightReset ? currentDefaults() : value;
    const changes = resetPending ? pending : { ...inFlightValues, ...pending };
    applyUIPreferences(
      overlayPreferences(base, expandPreferences(changes), currentDefaults()),
    );
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (flight) {
      await flight;
      return flush();
    }
    if ((!resetPending && Object.keys(pending).length === 0) || !isCurrent())
      return;
    const revision = generation;
    const current = isCurrent;
    const changes = pending;
    const acknowledgements = anonymous;
    let needsReset = resetPending;
    inFlightValues = changes;
    inFlightReset = needsReset;
    pending = {};
    anonymous = {};
    resetPending = false;
    const request = (async () => {
      let result: undefined | { ui_preferences: { vben_pc: UIPreferences } };
      try {
        if (needsReset) {
          result = await updateUIPreferencesApi(null);
          needsReset = false;
          if (revision !== generation || !current()) return;
        }
        if (Object.keys(changes).length > 0)
          result = await updateUIPreferencesApi(expandPreferences(changes));
        if (revision !== generation || !current()) return;
        inFlightValues = {};
        inFlightReset = false;
        for (const [key, entry] of Object.entries(acknowledgements))
          acknowledgeDraft(key, entry);
        if (result) {
          latestSaved = result.ui_preferences.vben_pc;
          applyServer(latestSaved);
        }
      } catch (error) {
        if (revision === generation && current() && !resetPending) {
          pending = { ...changes, ...pending };
          anonymous = { ...acknowledgements, ...anonymous };
          resetPending = needsReset;
        }
        throw error;
      }
    })();
    flight = request;
    try {
      await request;
    } finally {
      if (flight === request) flight = undefined;
      if (revision === generation) {
        inFlightValues = {};
        inFlightReset = false;
      }
    }
  }

  function select(
    change: UserPreferenceChange,
    authenticated: boolean,
    current: () => boolean,
  ) {
    const patch = change.reset
      ? Object.fromEntries(
          Object.keys(flattenPreferences(currentDefaults())).map((key) => [
            key,
            null,
          ]),
        )
      : flattenPreferences(userPreferencePatch(change));
    if (!change.reset && Object.keys(patch).length === 0) return;
    if (!authenticated) {
      for (const [key, value] of Object.entries(patch))
        writeDraft(key, { value, changed_at: Date.now() });
      return;
    }
    isCurrent = current;
    if (userCache.account) {
      for (const [key, value] of Object.entries(patch)) {
        const draft = { value, changed_at: Date.now() };
        writeDraft(key, draft);
        anonymous[key] = draft;
      }
    }
    if (change.reset) {
      pending = {};
      anonymous = readPending();
      resetPending = true;
    } else pending = { ...pending, ...patch };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flush().catch(() => {
        /* Request client reports failures; retain edits for retry. */
      });
    }, 250);
  }

  async function sync(
    effective: UIPreferences | undefined,
    current: () => boolean,
    acceptedAt: number,
    base?: UIPreferences,
  ) {
    if (!current()) return;
    configureDefaults(base);
    isCurrent = current;
    const saved = latestSaved ?? effective ?? currentDefaults();
    const recent = readPending(acceptedAt);
    for (const [key, entry] of Object.entries(recent)) {
      if (!Object.hasOwn(pending, key)) {
        pending[key] = entry.value;
        anonymous[key] = entry;
      }
    }
    applyServer(saved);
    await flush();
  }

  function reset() {
    generation++;
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending = {};
    anonymous = {};
    resetPending = false;
    latestSaved = undefined;
    inFlightValues = {};
    inFlightReset = false;
    isCurrent = () => false;
  }
  return { select, sync, flush, reset };
}
