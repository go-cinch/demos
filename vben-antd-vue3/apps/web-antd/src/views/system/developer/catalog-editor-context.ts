import type { ComputedRef, InjectionKey } from 'vue';

import type { Catalog, EditorUI, ResourceEditor } from './catalog-model';

import { computed, inject } from 'vue';

interface CatalogEditorContext {
  catalog: ComputedRef<Catalog>;
  ui: ComputedRef<EditorUI>;
}

export const catalogEditorKey: InjectionKey<CatalogEditorContext> =
  Symbol('catalog editor');

export function useCatalogEditor() {
  const context = inject(catalogEditorKey);
  if (!context) throw new Error('Catalog editor requires an active draft');
  return context;
}

export function useResourceDraft() {
  const { ui } = useCatalogEditor();
  const initial = ui.value.resourceEditor;
  if (!initial) throw new Error('Resource editor requires an open resource');
  // A closing editor can finish rendering before Vue unmounts its subtree.
  return computed<ResourceEditor>(
    (previous) => ui.value.resourceEditor ?? previous ?? initial,
  );
}
