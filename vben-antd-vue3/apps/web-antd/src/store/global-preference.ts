import { userCache } from '@vben/utils/cache';

import { acknowledgeDraft, readDraft, writeDraft } from './preference-drafts';

type PreferenceField = 'language' | 'timezone';
const day = 86_400_000;

export function pendingSelection(
  field: PreferenceField,
  acceptedAt = Date.now(),
) {
  const entry = readDraft(field);
  if (!entry) return;
  if (
    typeof entry.value === 'string' &&
    entry.value &&
    Number.isFinite(entry.changed_at) &&
    entry.changed_at <= Date.now() &&
    acceptedAt - entry.changed_at <= day
  ) {
    return { value: entry.value, changed_at: entry.changed_at };
  }
  acknowledgeDraft(field, entry);
}

interface Options {
  fallback: () => string;
  field: PreferenceField;
  current: () => string;
  resolve: (value: string) => string;
  apply: (value: string) => Promise<void> | void;
  save: (value: string) => Promise<void>;
}

/** Language and timezone share precedence, one-day expiry, ordered writes and stale-session protection. */
export function createGlobalPreferenceSync(options: Options) {
  let revision = 0;
  let confirmedManual: undefined | { value: string; isCurrent: () => boolean };
  let writes = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = writes.then(work);
    writes = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  function select(
    value: string,
    authenticated: boolean,
    isCurrent: () => boolean,
  ) {
    const selectionRevision = ++revision;
    if (!authenticated) {
      writeDraft(options.field, { value, changed_at: Date.now() });
      return Promise.resolve();
    }
    confirmedManual = undefined;
    if (userCache.account)
      writeDraft(options.field, { value, changed_at: Date.now() });
    const pending = pendingSelection(options.field);
    return enqueue(async () => {
      if (!isCurrent()) return;
      await options.save(value);
      if (isCurrent() && revision === selectionRevision)
        confirmedManual = { value, isCurrent };
      if (isCurrent() && pending) acknowledgeDraft(options.field, pending);
    });
  }
  function sync(
    saved: string | undefined,
    isCurrent: () => boolean,
    acceptedAt = Date.now(),
  ) {
    const started = revision;
    return enqueue(async () => {
      if (!isCurrent() || started !== revision) return false;
      const pending = pendingSelection(options.field, acceptedAt);
      const selected =
        pending && options.resolve(pending.value) === pending.value
          ? pending
          : undefined;
      if (pending && !selected) acknowledgeDraft(options.field, pending);
      // /info may have started before a just-completed manual write. Its older
      // snapshot cannot undo a confirmed selection belonging to this session.
      const manual =
        !selected && confirmedManual?.isCurrent()
          ? confirmedManual.value
          : undefined;
      const value = options.resolve(
        manual || selected?.value || saved || options.fallback(),
      );
      if (!manual && (selected || !saved)) {
        await options.save(value);
        if (!isCurrent()) return false;
        if (selected) acknowledgeDraft(options.field, selected);
      }
      if (started !== revision || !isCurrent()) return false;
      if (options.current() !== value) await options.apply(value);
      return isCurrent() && started === revision;
    });
  }
  return { select, sync };
}
