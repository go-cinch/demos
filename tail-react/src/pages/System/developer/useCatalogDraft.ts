import { useCallback, useEffect, useRef, useState } from 'react';
import { listRecords, updateRecord, type DictionaryRecord } from '@/api/system';
import { useAuth } from '@/context/AuthContext';
import { assign, clone, differences, initialUI, isCatalog, merge, normalizeCatalog, validate, type Catalog, type Draft } from './catalog-model';
import { DraftStorage } from './draft-storage';
import { pendingGroupRenames } from '../components/action-group-model';
import { pendingResourceRenames } from './resource-renames';
import { refreshCatalogMessages } from '@/i18n/catalog';

export default function useCatalogDraft() {
  const auth = useAuth();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [online, setOnline] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const generation = useRef(0);
  const [external, setExternal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const repository = useRef<DraftStorage | null>(null);
  const current = useRef<Draft | null>(null);
  const record = useRef<DictionaryRecord | null>(null);
  const canRead = auth.canMenu('/system/developer');
  const canEdit = canRead && auth.canButton('system.developer.publish') && !external && !loading && !publishing;
  const fetchOnline = async (run = generation.current) => {
    const response = await listRecords<DictionaryRecord>('dictionary', { key: 'I18N_CATALOG', p: 1, s: 100, f: 'id,key,value,enabled,updated_at' });
    const value = response.items.find(item => item.key === 'I18N_CATALOG');
    if (!value || !isCatalog(value.value)) throw new Error('catalogMissing');
    if (run !== generation.current) throw new Error("staleRequest");
    record.current = value;
    const normalized = normalizeCatalog(value.value);
    setOnline(normalized);
    return normalized;
  };
  const initialize = useCallback(async () => {
    const run = ++generation.current;
    current.current = null; record.current = null; setDraft(null); setOnline(null); repository.current = null;
    if (!canRead || !auth.user) return;
    setLoading(true); setPublishing(false); setError(''); setExternal(false); setStorageError(false);
    try {
      const key = `go-cinch:tail:catalog-draft:v1:${encodeURIComponent(`${location.origin}|${import.meta.env.VITE_GLOB_AUTH_API_URL ?? '/api/auth'}|${auth.user.id}|I18N_CATALOG`)}`;
      let restored: Draft | null = null;
      try {
        const storage = new DraftStorage(localStorage, key);
        repository.current = storage;
        restored = storage.load();
      } catch { setStorageError(true); setError("storageFailed"); }
      const value = await fetchOnline(run);
      if (run !== generation.current) return;
      const next: Draft = restored ?? { version: 1, owner: crypto.randomUUID(), sequence: 0, savedAt: Date.now(), base: clone(value), document: clone(value), ui: initialUI() };
      if (restored && !restored.ui.resourceEditor && !restored.ui.groupEditor && !restored.ui.buffer) {
        const result = merge(restored.base, restored.document, value);
        const base = clone(value);
        for (const conflict of result.conflicts) assign(base, conflict.path, conflict.base);
        next.base = base; next.document = result.document;
      }
      current.current = next;
      setDraft(next);
    } catch (cause) { if (run === generation.current) setError(cause instanceof Error ? cause.message : 'loadFailed'); }
    finally { if (run === generation.current) setLoading(false); }
  }, [auth.user?.id, canRead]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void initialize(); return () => { generation.current++; current.current = null; }; }, [initialize]);
  useEffect(() => {
    const changed = (event: StorageEvent) => { if ((event.key === null || event.key === repository.current?.key) && repository.current?.changed()) setExternal(true); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  function persist(value: Draft) {
    try {
      if (!repository.current) throw new Error('storageFailed');
      repository.current.save(value);
      setStorageError(false); setError('');
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'storageFailed';
      setStorageError(true); setError(message);
      if (message === 'LOCAL_DRAFT_CHANGED') setExternal(true);
      return false;
    }
  }
  function update(transform: (draft: Draft) => void) {
    if (!current.current) return;
    const next = clone(current.current);
    try { transform(next); } catch (cause) { setError(cause instanceof Error ? cause.message : 'invalid'); return; }
    if (!canEdit) {
      if (differences(current.current.document, next.document).length || JSON.stringify(next.ui.resourceEditor) !== JSON.stringify(current.current.ui.resourceEditor) || JSON.stringify(next.ui.groupEditor) !== JSON.stringify(current.current.ui.groupEditor) || JSON.stringify(next.ui.buffer) !== JSON.stringify(current.current.ui.buffer)) return;
      current.current = next; setDraft(next); return;
    }
    next.sequence++; next.savedAt = Date.now();
    current.current = next; setDraft(next);
    persist(next);
  }
  async function refresh() {
    const run = generation.current;
    setLoading(true);
    try { return await fetchOnline(run); }
    catch { if (run === generation.current) setError('loadFailed'); return null; }
    finally { if (run === generation.current) setLoading(false); }
  }
  async function preparePublish() {
    if (!canEdit || storageError || !current.current || current.current.ui.resourceEditor || current.current.ui.groupEditor || current.current.ui.buffer) return false;
    const run = generation.current;
    setLoading(true); setError('');
    try {
      const latest = await fetchOnline(run);
      if (run !== generation.current || !current.current) return false;
      const value = current.current;
      const candidate = merge(value.base, value.document, latest);
      if (candidate.conflicts.length) { setError('conflicts'); return false; }
      if (validate(candidate.document).some(problem => !problem.warning)) { setError('validationFailed'); return false; }
      if (!record.current?.enabled) { setError('catalogDisabled'); return false; }
      if (!differences(latest, candidate.document).length) { setError('noChanges'); return false; }
      return true;
    } catch (cause) { if (run === generation.current) setError(cause instanceof Error ? cause.message : 'loadFailed'); return false; }
    finally { if (run === generation.current) setLoading(false); }
  }
  async function publish() {
    if (!canEdit || storageError || !current.current || current.current.ui.resourceEditor || current.current.ui.groupEditor || current.current.ui.buffer) return false;
    const run = generation.current;
    setPublishing(true); setError('');
    try {
      if (!persist(current.current)) return false;
      const latest = await fetchOnline();
      if (run !== generation.current || !current.current) return false;
      const value = current.current;
      const merged = merge(value.base, value.document, latest);
      if (merged.conflicts.length) { setError('conflicts'); return false; }
      if (!record.current?.enabled) throw new Error('catalogDisabled');
      if (validate(merged.document).some(issue => !issue.warning)) throw new Error('validationFailed');
      if (!differences(latest, merged.document).length) throw new Error('noChanges');
      const renames = pendingResourceRenames(value.base, merged.document, value.ui.resourceRenames, value.ui.featureRenames);
      const result = await updateRecord('dictionary', record.current.id, { value: normalizeCatalog(merged.document), expected_value: clone(record.current.value), group_renames: pendingGroupRenames(value.base, merged.document, value.ui.groupRenames), resource_renames: renames.resources, feature_renames: renames.features }) as DictionaryRecord;
      if (run !== generation.current) return false;
      if (!isCatalog(result.value)) throw new Error('submitFailed');
      const next: Draft = { ...value, base: clone(result.value), document: clone(result.value), sequence: value.sequence + 1, savedAt: Date.now(), ui: { ...value.ui, groupRenames: {}, resourceRenames: {}, featureRenames: {} } };
      current.current = next; setDraft(next); setOnline(clone(result.value));
      persist(next);
      await Promise.all([auth.reloadUser(), refreshCatalogMessages()]);
      return true;
    } catch (cause) { if (run === generation.current) setError(cause instanceof Error ? cause.message : 'submitFailed'); return false; }
    finally { if (run === generation.current) setPublishing(false); }
  }
  return { draft, online, loading, error, setError, external, storageError, publishing, canRead, canEdit, initialize, update, refresh, preparePublish, publish,
    changes: draft && online ? differences(online, draft.document) : [],
    conflicts: draft && online ? merge(draft.base, draft.document, online).conflicts : [],
    problems: draft ? validate(draft.document) : [],
  };
}
