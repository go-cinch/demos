/* oxlint-disable react/set-state-in-effect -- Hydrate and reset local request state when the authenticated owner changes. */
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { listRecords, updateRecord } from '@/features/system/api';
import { refreshCatalog } from '@/features/permissions/catalog-context';
import { pendingGroupRenames } from '@/features/permissions/action-group-model';
import {
  assign,
  clone,
  differences,
  initialUI,
  isCatalog,
  merge,
  normalizeCatalog,
  validate,
  type Catalog,
  type Draft
} from './catalog-model';
import { DraftStorage } from './draft-storage';
import { pendingResourceRenames } from './resource-renames';
export function useCatalogDraft() {
  const auth = useAuth();
  const permission = auth.user?.permission;
  const userID = auth.user?.id;
  const canRead = !!permission?.menus.includes('/system/developer');
  const canPublish = !!permission?.btns.includes('admin:btn:system:developer:publish');
  const [draft, setDraft] = useState<Draft>();
  const [online, setOnline] = useState<Catalog>();
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [external, setExternal] = useState(false);
  const [restored, setRestored] = useState(false);
  const repository = useRef<DraftStorage>(undefined);
  const record = useRef<{ id: number; raw: Catalog; enabled: boolean }>(undefined);
  const current = useRef<Draft>(undefined);
  const writer = useRef('');
  const generation = useRef(0);
  const fetchOnline = useCallback(async () => {
    const result = await listRecords('dictionary', {
      key: 'I18N_CATALOG',
      p: 1,
      s: 100,
      f: 'id,key,value,enabled,updated_at'
    });
    const item = result.items.find((item) => item.key === 'I18N_CATALOG');
    if (!item || !isCatalog(item.value)) throw new Error('catalogMissing');
    record.current = { id: item.id, raw: clone(item.value), enabled: item.enabled === true };
    return normalizeCatalog(item.value);
  }, []);
  const persist = useCallback(
    (next: Draft) => {
      current.current = next;
      setDraft(next);
      if (!canPublish || external || !repository.current) return;
      try {
        next.savedAt = Date.now();
        next.owner = writer.current;
        next.sequence++;
        repository.current.save(next);
        setStorageError(false);
      } catch (error) {
        setStorageError(true);
        if (error instanceof Error && error.message === 'LOCAL_DRAFT_CHANGED') setExternal(true);
      }
    },
    [canPublish, external]
  );
  const initialize = useCallback(async () => {
    const run = ++generation.current;
    setDraft(undefined);
    current.current = undefined;
    setOnline(undefined);
    setError('');
    setExternal(false);
    setStorageError(false);
    setRestored(false);
    repository.current = undefined;
    setLoading(false);
    if (!userID || !canRead) return;
    setLoading(true);
    writer.current ||= crypto.randomUUID();
    try {
      const key = `go-cinch:catalog-draft:v1:${encodeURIComponent(`${location.origin}|${API_BASE}|${userID}|I18N_CATALOG`)}`;
      let saved: Draft | null = null;
      try {
        repository.current = new DraftStorage(localStorage, key);
        saved = repository.current.load();
      } catch {
        // Preserve unreadable drafts and still allow viewing the online catalog.
        setStorageError(true);
        setExternal(true);
      }
      setRestored(!!saved);
      const latest = await fetchOnline();
      if (run !== generation.current) return;
      setOnline(latest);
      const next = saved ?? {
        version: 1,
        owner: writer.current,
        sequence: 0,
        savedAt: 0,
        base: clone(latest),
        document: clone(latest),
        ui: initialUI()
      };
      if (!saved) {
        next.ui.resource = latest.resource_catalog.resources['admin:system:user'] ? 'admin:system:user' : '';
        next.ui.expanded = Object.entries(latest.resource_catalog.resources)
          .filter(([key, node]) => key.startsWith('admin:') && node.kind === 'directory')
          .map(([key, node]) => `${node.parent ?? ''}|node|${key}`);
      }
      if (
        saved &&
        !saved.ui.resourceEditor &&
        !saved.ui.groupEditor &&
        differences(saved.base, saved.document).length === 0
      ) {
        next.base = clone(latest);
        next.document = clone(latest);
      }
      current.current = next;
      setDraft(next);
    } catch {
      if (run === generation.current) setError('loadFailed');
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, [userID, canRead, fetchOnline]);
  useEffect(() => {
    void initialize();
    return () => {
      generation.current++;
    };
  }, [initialize]);
  useEffect(() => {
    const check = () => {
      if (repository.current?.changed()) setExternal(true);
    };
    window.addEventListener('storage', check);
    window.addEventListener('focus', check);
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  const mutate = (action: (value: Draft) => void) => {
    if (!current.current || !canRead || external) return;
    const next = clone(current.current);
    action(next);
    persist(next);
  };
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const next = await fetchOnline();
      setOnline(next);
      return next;
    } catch {
      setError('loadFailed');
    } finally {
      setLoading(false);
    }
  }
  const changes = draft && online ? differences(online, draft.document) : [];
  const pending = draft ? differences(draft.base, draft.document) : [];
  const merged = draft && online ? merge(draft.base, draft.document, online) : undefined;
  const problems = draft ? validate(draft.document) : [];
  async function preparePublish() {
    if (!current.current || !canPublish || external || storageError ||
      current.current.ui.buffer || current.current.ui.resourceEditor || current.current.ui.groupEditor) return;
    const latest = await refresh();
    if (!latest || !current.current) return;
    const combined = merge(current.current.base, current.current.document, latest);
    if (combined.conflicts.length || validate(current.current.document).some((problem) => !problem.warning) ||
      validate(combined.document).some((problem) => !problem.warning)) {
      mutate((draft) => { draft.ui.tab = 'diff'; });
      setError('validationFailed');
      return;
    }
    return latest;
  }
  async function publish() {
    const latest = await preparePublish();
    if (!latest || !current.current) return false;
    if (!record.current?.enabled) {
      setError('catalogDisabled');
      return false;
    }
    const next = clone(current.current);
    const combined = merge(next.base, next.document, latest);
    if (!differences(latest, combined.document).length) return false;
    // Recheck synchronous persistence immediately before making a remote write.
    try {
      if (!repository.current) return false;
      next.savedAt = Date.now();
      next.owner = writer.current;
      next.sequence++;
      repository.current.save(next);
    } catch (error) {
      setStorageError(true);
      if (error instanceof Error && error.message === 'LOCAL_DRAFT_CHANGED') setExternal(true);
      return false;
    }
    setPublishing(true);
    try {
      const renames = pendingResourceRenames(
        next.base,
        combined.document,
        next.ui.resourceRenames,
        next.ui.featureRenames
      );
      const response = await updateRecord('dictionary', record.current.id, {
        value: normalizeCatalog(combined.document),
        expected_value: clone(record.current.raw),
        group_renames: pendingGroupRenames(next.base, combined.document, next.ui.groupRenames),
        resource_renames: renames.resources,
        feature_renames: renames.features
      });
      if (!isCatalog(response.value)) throw new Error('Invalid catalog');
      const document = normalizeCatalog(response.value);
      setOnline(document);
      next.base = clone(document);
      next.document = clone(document);
      next.ui.groupRenames = {};
      next.ui.resourceRenames = {};
      next.ui.featureRenames = {};
      persist(next);
      await refreshCatalog();
      await auth.reload();
      return true;
    } catch {
      await refresh();
      setError('submitFailed');
      mutate((draft) => { draft.ui.tab = 'diff'; });
      return false;
    } finally {
      setPublishing(false);
    }
  }
  function rebase(latest: Catalog | undefined = online) {
    if (!current.current || !latest || external) return;
    const combined = merge(current.current.base, current.current.document, latest);
    const base = clone(latest);
    for (const conflict of combined.conflicts) {
      if (!conflict.path.length) return;
      assign(base, conflict.path, conflict.base);
    }
    mutate((draft) => {
      draft.base = base;
      draft.document = clone(combined.document);
    });
  }
  function resolve(path: string[], value: unknown) {
    if (!online) return;
    mutate((draft) => {
      assign(draft.document, path, clone(value));
      assign(
        draft.base,
        path,
        clone(
          online &&
            path.reduce<unknown>(
              (value, key) =>
                value && typeof value === 'object'
                  ? (value as Record<string, unknown>)[key]
                  : undefined,
              online
            )
        )
      );
    });
  }
  function discard() {
    if (online)
      mutate((draft) => {
        draft.base = clone(online);
        draft.document = clone(online);
        draft.ui = initialUI();
      });
  }
  return {
    draft,
    online,
    loading,
    publishing,
    error,
    storageError,
    external,
    restored,
    canRead,
    canEdit: !!draft && canPublish && !external && !loading && !publishing,
    changes,
    pending,
    problems,
    conflicts: merged?.conflicts ?? [],
    mutate,
    initialize,
    refresh,
    publish,
    preparePublish,
    rebase,
    resolve,
    discard
  };
}
