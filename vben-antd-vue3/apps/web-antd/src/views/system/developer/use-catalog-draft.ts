import { computed, nextTick, onBeforeUnmount, reactive, watch } from 'vue';
import { useUserStore } from '@vben/stores';
import { usePermissions } from '#/composables/use-permissions';
import { listDictionaries, updateDictionary } from '#/api/system';
import type { DictionaryRecord } from '#/api/system';
import {
  assign,
  clone,
  differences,
  equal,
  initialUI,
  isCatalog,
  normalizeCatalog,
  merge,
  validate,
} from './catalog-model';
import type { Catalog, Draft } from './catalog-model';
import { DraftStorage } from './draft-storage';
import { createResourceEditor } from './resource-editor-model';
import { harmonizeResourceModelDraft, repairResourcePreviewDraft, seedResourceCatalog, upgradeResourceCatalog } from './resource-preview';
import { pendingGroupRenames } from '../components/action-group-model';
import { pendingResourceRenames } from './resource-renames';

export function useCatalogDraft() {
  const user = useUserStore();
  const { canReadDeveloper, canManageDeveloper } = usePermissions();
  const state = reactive({
    draft: null as Draft | null,
    online: null as Catalog | null,
    record: null as Pick<
      DictionaryRecord,
      'id' | 'key' | 'value' | 'enabled' | 'updated_at'
    > & { rawValue?: unknown } | null,
    fetchedAt: 0,
    restored: false,
    loading: false,
    publishing: false,
    error: '',
    storageError: false,
    external: false,
    ready: false,
  });
  let repository: DraftStorage | undefined;
  let run = 0;
  let paused = false;
  const writer = crypto.randomUUID();
  const owner = computed(() => String(user.userInfo?.userId ?? ''));
  const canEdit = computed(
    () =>
      canManageDeveloper.value &&
      state.ready &&
      !state.external &&
      !state.publishing &&
      !state.loading,
  );
  const changes = computed(() =>
    state.draft && state.online
      ? differences(state.online, state.draft.document)
      : [],
  );
  const pending = computed(() =>
    state.draft ? differences(state.draft.base, state.draft.document) : [],
  );
  const problems = computed(() =>
    state.draft ? validate(state.draft.document) : [],
  );
  const merged = computed(() =>
    state.draft && state.online
      ? merge(state.draft.base, state.draft.document, state.online)
      : null,
  );
  const conflicts = computed(() => merged.value?.conflicts ?? []);
  const onlineChanged = computed(
    () =>
      !!state.draft &&
      !!state.online &&
      differences(state.draft.base, state.online).length > 0,
  );

  async function fetchOnline() {
    // Lists read the authoritative database. The ordinary detail endpoint may
    // serve the ten-minute dictionary cache and cannot be used for live diff.
    const result = await listDictionaries({
      key: 'I18N_CATALOG',
      p: 1,
      s: 100,
      f: 'id,key,value,enabled,updated_at',
    });
    const record = result.items.find((item) => item.key === 'I18N_CATALOG');
    if (!record || !isCatalog(record.value)) throw new Error('catalogMissing');
    return { ...record, rawValue: clone(record.value), value: normalizeCatalog(record.value) };
  }
  function syncUnchangedEditor(previous: Catalog, next: Catalog) {
    const editor = state.draft?.ui.resourceEditor;
    if (!editor || !previous.resource_catalog.resources[editor.original] || !next.resource_catalog.resources[editor.original]) return;
    const scope = editor.original.split(':')[0]!;
    const before = createResourceEditor(previous, scope, editor.original);
    const after = createResourceEditor(next, scope, editor.original);
    for (const field of ['permissionScope', 'sort', 'position', 'operations', 'entries', 'features', 'zh', 'en'] as const)
      if (equal(editor[field], before[field])) Object.assign(editor, { [field]: clone(after[field]) });
  }
  function persist() {
    if (
      paused ||
      !state.ready ||
      !state.draft ||
      !repository ||
      state.external ||
      !canManageDeveloper.value
    )
      return;
    try {
      paused = true;
      state.draft.savedAt = Date.now();
      state.draft.owner = writer;
      state.draft.sequence++;
      repository.save(state.draft);
      state.storageError = false;
    } catch (error) {
      state.storageError = true;
      if (error instanceof Error && error.message === 'LOCAL_DRAFT_CHANGED')
        state.external = true;
    } finally {
      paused = false;
    }
  }
  async function initialize() {
    const current = ++run;
    let upgradedCatalog = false;
    state.ready = false;
    state.draft = null;
    state.online = null;
    state.error = '';
    state.external = false;
    state.storageError = false;
    state.restored = false;
    repository = undefined;
    if (!owner.value || !canReadDeveloper.value) return;
    state.loading = true;
    try {
      const environment = `${location.origin}|${
        import.meta.env.VITE_GLOB_AUTH_API_URL ?? '/api/auth'
      }`;
      const key = `go-cinch:catalog-draft:v1:${encodeURIComponent(
        `${environment}|${owner.value}|I18N_CATALOG`,
      )}`;
      try {
        repository = new DraftStorage(localStorage, key);
        state.draft = repository.load();
        state.restored = !!state.draft;
      } catch {
        state.storageError = true;
        // Never replace an unreadable existing draft. Users may export it.
        state.external = true;
      }
      const record = await fetchOnline();
      if (current !== run) return;
      state.record = record;
      state.online = clone(record.value);
      state.fetchedAt = Date.now();
      const referenceUpgrade =
        state.draft &&
        Object.entries(record.value.resource_catalog.resources).some(
          ([key, node]) =>
            node.reference_operations !== undefined &&
            state.draft!.base.resource_catalog.resources[key]?.reference_operations === undefined,
        );
      if (
        state.draft && referenceUpgrade
      ) {
        const upgrade = merge(
          state.draft.base,
          state.draft.document,
          record.value,
        );
        if (upgrade.conflicts.length === 0) {
          const editor = state.draft.ui.resourceEditor;
          if (referenceUpgrade && editor?.original) {
            const baseNode =
              state.draft.base.resource_catalog.resources[editor.original];
            const onlineNode =
              record.value.resource_catalog.resources[editor.original];
            if (onlineNode) {
              if (editor.parent === (baseNode?.parent ?? ''))
                editor.parent = onlineNode.parent ?? '';
              if (baseNode?.references === undefined)
                editor.references = clone(onlineNode.references ?? []);
              if (baseNode?.reference_operations === undefined && onlineNode.reference_operations)
                editor.referenceOperations = clone(onlineNode.reference_operations);
            }
          }
          const directories = Object.entries(
            record.value.resource_catalog.resources,
          )
            .filter(
              ([key, node]) =>
                node.kind === 'directory' &&
                !state.draft!.base.resource_catalog.resources[key],
            )
            .map(([key]) => key);
          state.draft.ui.expanded = [
            ...new Set([...state.draft.ui.expanded, ...directories]),
          ];
          state.draft.base = clone(record.value);
          state.draft.document = upgrade.document;
          upgradedCatalog = true;
        }
      }
      if (
        state.draft && !state.draft.ui.buffer && !state.draft.ui.resourceEditor &&
        differences(state.draft.base, state.draft.document).length === 0
      ) {
        state.draft.base = clone(record.value);
        state.draft.document = clone(record.value);
        upgradedCatalog = true;
      }
      if (!state.draft)
        state.draft = {
          version: 1,
          owner: writer,
          sequence: 0,
          savedAt: 0,
          base: clone(record.value),
          document: clone(record.value),
          ui: initialUI(),
        };
      if (!state.restored) {
        state.draft.ui.resource = record.value.resource_catalog.resources[
          'admin:system:user'
        ]
          ? 'admin:system:user'
          : '';
        state.draft.ui.expanded = Object.entries(
          record.value.resource_catalog.resources,
        )
          .filter(
            ([key, node]) =>
              key.startsWith('admin:') && node.kind === 'directory',
          )
          .map(([key]) => key);
      }
      if (import.meta.env.DEV && state.draft.ui.resourcePreviewVersion < 1) {
        const seeded = seedResourceCatalog(state.draft.document);
        if (seeded !== state.draft.document) {
          state.draft.document = seeded;
          state.draft.ui.expanded = [...new Set([...state.draft.ui.expanded,
            ...Object.entries(seeded.resource_catalog.resources).filter(([, node]) => node.kind === 'directory').map(([key]) => key),
          ])];
          upgradedCatalog = true;
        }
        state.draft.ui.resourcePreviewVersion = 1;
      }
      if (import.meta.env.DEV && state.draft.ui.resourcePreviewVersion < 3 && state.draft.document.resource_catalog.resources['admin:high-risk']) {
        const previous = state.draft.document;
        state.draft.document = upgradeResourceCatalog(previous);
        syncUnchangedEditor(previous, state.draft.document);
        const editor = state.draft.ui.resourceEditor;
        if (editor && editor.permissionScope === undefined) editor.permissionScope = state.draft.document.resource_catalog.resources[editor.original]?.permission_scope ?? '';
        state.draft.ui.resourcePreviewVersion = 3;
        upgradedCatalog = true;
      }
      if (import.meta.env.DEV && state.draft.ui.resourcePreviewVersion < 4) {
        if (record.value.resource_catalog.resources['admin:high-risk:all']?.permission_scope === '*') {
          const document = harmonizeResourceModelDraft(state.draft.document, record.value);
          const rebased = merge(state.draft.base, document, record.value);
          const previous = state.draft.document;
          state.draft.document = rebased.document;
          syncUnchangedEditor(previous, state.draft.document);
          if (rebased.conflicts.length === 0) state.draft.base = clone(record.value);
        }
        state.draft.ui.resourcePreviewVersion = 4;
        upgradedCatalog = true;
      }
      if (state.draft.ui.resourcePreviewVersion < 5) {
        const previous = state.draft.document;
        state.draft.document = repairResourcePreviewDraft(previous, state.draft.base, record.value);
        syncUnchangedEditor(previous, state.draft.document);
        state.draft.ui.resourcePreviewVersion = 5;
        upgradedCatalog = true;
      }
      state.ready = true;
      if (!state.restored || upgradedCatalog) persist();
    } catch (error) {
      if (current !== run) return;
      state.error =
        error instanceof Error && error.message === 'catalogMissing'
          ? 'catalogMissing'
          : 'loadFailed';
      // An already persisted draft remains editable/exportable while offline.
      state.ready = !!state.draft;
    } finally {
      if (current === run) state.loading = false;
    }
  }
  async function refresh() {
    if (!canReadDeveloper.value) return false;
    const current = run;
    state.loading = true;
    state.error = '';
    try {
      const record = await fetchOnline();
      if (current !== run) return false;
      state.record = record;
      state.online = clone(record.value);
      state.fetchedAt = Date.now();
      return true;
    } catch {
      state.error = 'loadFailed';
      return false;
    } finally {
      if (current === run) state.loading = false;
    }
  }
  function rebase(document: Catalog, base: Catalog | null = state.online) {
    if (!state.draft || !base) return;
    paused = true;
    state.draft.base = clone(base);
    state.draft.document = clone(document);
    paused = false;
    persist();
  }
  function mergeOnlineUpdates() {
    if (!state.draft || !state.online || state.external) return;
    const latest = merge(state.draft.base, state.draft.document, state.online);
    const base = clone(state.online);
    // Advance independent fields while retaining the original comparison point
    // for unresolved conflicts, such as a locally reordered group list.
    for (const conflict of latest.conflicts) {
      if (!conflict.path.length) return;
      assign(base, conflict.path, conflict.base);
    }
    rebase(latest.document, base);
  }
  async function publish() {
    if (
      !canEdit.value ||
      state.storageError ||
      state.draft?.ui.buffer ||
      state.draft?.ui.resourceEditor ||
      state.draft?.ui.groupEditor ||
      !state.draft ||
      !(await refresh())
    )
      return false;
    if (!state.record?.enabled) {
      state.error = 'catalogDisabled';
      return false;
    }
    if (conflicts.value.length > 0) {
      state.draft.ui.tab = 'diff';
      return false;
    }
    if (onlineChanged.value && merged.value) rebase(merged.value.document);
    if (problems.value.some((problem) => !problem.warning)) {
      state.draft.ui.tab = 'diff';
      state.error = 'validationFailed';
      return false;
    }
    if (pending.value.length === 0) return false;
    persist();
    if (state.storageError || state.external) return false;
    const current = run;
    state.publishing = true;
    try {
      const renames = pendingResourceRenames(state.draft.base, state.draft.document, state.draft.ui.resourceRenames, state.draft.ui.featureRenames);
      const response = await updateDictionary(state.record.id, {
        value: normalizeCatalog(state.draft.document),
        expected_value: clone(state.record.rawValue ?? state.draft.base),
        group_renames: pendingGroupRenames(state.draft.base, state.draft.document, state.draft.ui.groupRenames),
        resource_renames: renames.resources,
        feature_renames: renames.features,
      });
      if (current !== run) return false;
      state.record = response;
      state.online = clone(response.value as Catalog);
      state.fetchedAt = Date.now();
      rebase(response.value as Catalog);
      state.draft.ui.groupRenames = {};
      state.draft.ui.resourceRenames = {};
      state.draft.ui.featureRenames = {};
      return true;
    } catch {
      if (current === run) {
        state.error = 'submitFailed';
        await refresh();
        state.error = 'submitFailed';
        state.draft.ui.tab = 'diff';
      }
      return false;
    } finally {
      if (current === run) state.publishing = false;
    }
  }
  function exportDraft() {
    let raw = '';
    if (state.draft) raw = JSON.stringify(state.draft, null, 2);
    else if (repository) raw = localStorage.getItem(repository.key) ?? '';
    const url = URL.createObjectURL(
      new Blob([raw], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'I18N_CATALOG-draft.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function receiveStorage(event: StorageEvent) {
    if (
      (event.key === null || event.key === repository?.key) &&
      repository?.changed()
    )
      state.external = true;
  }
  function checkStorage() {
    if (state.ready && repository?.changed()) state.external = true;
  }
  watch(() => state.draft, persist, { deep: true, flush: 'sync' });
  watch([owner, canReadDeveloper], initialize, {
    immediate: true,
    flush: 'sync',
  });
  window.addEventListener('storage', receiveStorage);
  window.addEventListener('focus', checkStorage);
  onBeforeUnmount(() => {
    run++;
    window.removeEventListener('storage', receiveStorage);
    window.removeEventListener('focus', checkStorage);
  });
  async function discard() {
    if (!state.online || !state.draft || !canEdit.value) return;
    rebase(state.online);
    state.draft.ui.groupRenames = {};
    state.draft.ui.resourceRenames = {};
    state.draft.ui.featureRenames = {};
    state.draft.ui.buffer = null;
    state.draft.ui.resourceEditor = null;
    await nextTick();
  }
  return {
    state,
    canEdit,
    canReadDeveloper,
    changes,
    pending,
    problems,
    conflicts,
    onlineChanged,
    persist,
    refresh,
    publish,
    rebase,
    mergeOnlineUpdates,
    exportDraft,
    initialize,
    discard,
  };
}
