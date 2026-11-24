<script setup lang="ts">
import type { CatalogNavigate, ResourceDetailTab } from './catalog-model';
import type {
  ResourceDestination,
  ResourceKeyChange,
} from './resource-movement';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { normalizePlaceholder } from '@vben/locales';
import { preferences } from '@vben/preferences';

import {
  Button,
  Collapse,
  CollapsePanel,
  Empty,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Segmented,
  Select,
  TabPane,
  Tabs,
  Tag,
  Tree,
} from 'ant-design-vue';

import { $t } from '#/locales';
import { requiredEntry } from '#/utils/required-entry';

import { resourceBreadcrumb } from '../components/resource-catalog';
import { childOrderKey, resourceChildren } from '../components/resource-order';
import {
  referencedOperations,
  referenceTreeKey,
  resourceReferenceTree,
  supportsResourceReferences,
} from '../components/resource-references';
import { useCatalogEditor } from './catalog-editor-context';
import { text } from './catalog-model';
import groupPreview from './data/permission-groups.json';
import {
  applyResourceEditor,
  createResourceEditor,
  ResourceEditorError,
  restoreResourceBuffer,
} from './resource-editor-model';
import ResourceFeatureMappings from './resource-feature-mappings.vue';
import {
  canMoveResource,
  moveReference,
  moveResource,
  resourceStep,
} from './resource-movement';
import ResourceNodeEditor from './resource-node-editor.vue';
import { mergeKeyRenames } from './resource-renames';

const props = defineProps<{
  disabled: boolean;
  navigate: CatalogNavigate;
}>();
const { ui, catalog } = useCatalogEditor();
const t = (key: string) => $t(`developer.${key}`);
const keyChanges = ref<ResourceKeyChange[]>([]);
const movementVersion = ref(0);
const moveDialogOpen = ref(false);
const moveParent = ref<string>();
const movePending = ref(false);
const dragKey = ref('');
const dropPreview = ref<null | {
  key: string;
  mode: 'after' | 'before' | 'inside';
  destination: ResourceDestination;
}>(null);
let expandTimer: ReturnType<typeof setTimeout> | undefined;
let expandCandidate = '';

const formError = ref('');
const errorPath = ref('');
const treeContainer = ref<HTMLElement>();
const jumpTarget = ref('');
let jumpTimeout: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => {
  clearTimeout(jumpTimeout);
  clearTimeout(expandTimer);
});
const resources = computed(() => catalog.value.resource_catalog.resources);
const selected = computed(() =>
  ui.value.resource.startsWith(`${ui.value.scope}:`)
    ? resources.value[ui.value.resource]
    : undefined,
);
const selectedSiblings = computed(() =>
  resourceChildren(
    catalog.value.resource_catalog,
    selected.value?.parent ?? '',
    ui.value.scope,
  ),
);
const selectedPosition = computed(
  () =>
    selectedSiblings.value.findIndex(
      (item) => item.kind === 'node' && item.key === ui.value.resource,
    ) + 1,
);
const label = (key: string) =>
  text(catalog.value, preferences.app.locale, 'resources', key) ||
  text(catalog.value, 'en-US', 'resources', key) ||
  key;
const nodeType = (key: string) => {
  if (resources.value[key]?.kind === 'resource') {
    return 'resource';
  }
  if (resources.value[key]?.parent) {
    return 'subdirectory';
  }
  return 'directory';
};
const breadcrumb = (key: string) =>
  resourceBreadcrumb(catalog.value.resource_catalog, key, label);
const moveOptions = computed(() => {
  const key = ui.value.resource;
  const parent = selected.value?.parent ?? '';
  const options = Object.keys(resources.value)
    .filter(
      (target) =>
        target !== parent && canMoveResource(catalog.value, key, target),
    )
    .map((value) => ({ value, label: breadcrumb(value) }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
  if (parent && canMoveResource(catalog.value, key, ''))
    options.unshift({ value: '', label: t('rootDirectory') });
  return options;
});
const tree = computed(() =>
  resourceReferenceTree(
    catalog.value.resource_catalog,
    ui.value.scope,
    ui.value.query,
    label,
    (key) =>
      catalog.value.locales
        .map(({ tag }) => text(catalog.value, tag, 'resources', key))
        .join(' '),
  ),
);
const references = computed(
  () =>
    new Map(
      Object.entries(resources.value).flatMap(([owner, node]) =>
        (node.references ?? []).map(
          (target) => [referenceTreeKey(owner, target), target] as const,
        ),
      ),
    ),
);
const referenceCollection = computed(() =>
  supportsResourceReferences(selected.value),
);
const detailTab = computed<ResourceDetailTab>({
  get() {
    const tab = ui.value.resourceTab;
    if (tab === 'references' && referenceCollection.value) return tab;
    if (
      (tab === 'entries' || tab === 'operations') &&
      selected.value?.kind === 'resource'
    )
      return tab;
    return 'basic';
  },
  set(value) {
    ui.value.resourceTab = value;
  },
});
const upDestination = computed(() =>
  resourceStep(catalog.value, ui.value.resource, -1),
);
const downDestination = computed(() =>
  resourceStep(catalog.value, ui.value.resource, 1),
);
const stepHint = (direction: -1 | 1) => {
  const destination =
    direction < 0 ? upDestination.value : downDestination.value;
  if (!destination) return t(direction < 0 ? 'up' : 'down');
  return destination.parent === (selected.value?.parent ?? '')
    ? t('moveSiblingHint')
    : `${t('moveTo')} ${destination.parent ? breadcrumb(destination.parent) : t('rootDirectory')}`;
};
const referenceOwners = computed(
  () =>
    new Map(
      Object.entries(resources.value).flatMap(([owner, node]) =>
        (node.references ?? []).map(
          (target) => [referenceTreeKey(owner, target), owner] as const,
        ),
      ),
    ),
);
const dragEnabled = computed(
  () => !props.disabled && !ui.value.resourceEditor && !ui.value.query.trim(),
);
function dropDestination(
  target: string,
  position: number,
): null | ResourceDestination {
  const reference = references.value.get(target);
  if (reference) {
    if (position === 0) return null;
    const parent = requiredEntry(
      referenceOwners.value.get(target),
      'resource catalog entry',
    );
    const anchor = { kind: 'reference', key: reference } as const;
    return {
      parent,
      ...(position < 0 ? { before: anchor } : { after: anchor }),
    };
  }
  if (!resources.value[target]) return null;
  const parent =
    position === 0 ? target : (resources.value[target]?.parent ?? '');
  const anchor = { kind: 'node', key: target } as const;
  let placement = {};
  if (position < 0) {
    placement = { before: anchor };
  } else if (position > 0) {
    placement = { after: anchor };
  }
  return {
    parent,
    ...placement,
  };
}
function beginDrag(event: DragEvent, key: string) {
  if (!dragEnabled.value) {
    event.preventDefault();
    return;
  }
  dragKey.value = key;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
  }
}
function finishDrag() {
  dragKey.value = '';
  dropPreview.value = null;
  clearTimeout(expandTimer);
  expandCandidate = '';
}
function pointerDestination(event: DragEvent, target: string) {
  const source = dragKey.value;
  if (!source || source === target) return null;
  const owner = referenceOwners.value.get(source);
  const sourceParent = owner ?? resources.value[source]?.parent ?? '';
  const targetReference = references.value.get(target);
  const targetParent =
    referenceOwners.value.get(target) ?? resources.value[target]?.parent ?? '';
  const row = event.currentTarget as HTMLElement;
  const bounds = row.getBoundingClientRect();
  const ratio = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
  const sameParent = sourceParent === targetParent;
  const middle = ratio > 0.25 && ratio < 0.75;
  const enterDirectory =
    !targetReference &&
    (!owner || target === owner) &&
    resources.value[target]?.kind === 'directory' &&
    middle;
  let position = 1;
  if (enterDirectory) {
    position = 0;
  } else if (ratio < 0.5) {
    position = -1;
  }
  if (!enterDirectory && sameParent) {
    const order = resourceChildren(
      catalog.value.resource_catalog,
      sourceParent,
      ui.value.scope,
    );
    const from = order.findIndex(
      (item) =>
        item.kind === (owner ? 'reference' : 'node') &&
        item.key === (references.value.get(source) ?? source),
    );
    const to = order.findIndex(
      (item) =>
        item.kind === (targetReference ? 'reference' : 'node') &&
        item.key === (targetReference ?? target),
    );
    if (from === -1 || to === -1) return null;
    // A drop onto an adjacent sibling must exchange their order, including
    // the row edge that Ant's resolver previously treated as the old gap.
    if (
      middle ||
      (position < 0 && from === to - 1) ||
      (position > 0 && from === to + 1)
    )
      position = from > to ? -1 : 1;
  }
  const destination = dropDestination(target, position);
  if (
    !destination ||
    (owner
      ? destination.parent !== owner
      : !canMoveResource(catalog.value, source, destination.parent))
  )
    return null;
  let mode: 'after' | 'before' | 'inside' = 'inside';
  if (position < 0) mode = 'before';
  else if (position > 0) mode = 'after';
  return {
    key: target,
    mode,
    destination,
  };
}
function previewDrop(event: DragEvent, target: string) {
  const preview = pointerDestination(event, target);
  dropPreview.value = preview;
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = preview ? 'move' : 'none';
  const candidate =
    preview?.mode === 'inside' && !references.value.has(target) ? target : '';
  if (candidate !== expandCandidate) {
    clearTimeout(expandTimer);
    expandCandidate = candidate;
    if (candidate && !ui.value.expanded.includes(candidate))
      expandTimer = setTimeout(() => {
        if (expandCandidate === candidate)
          ui.value.expanded = [...new Set([...ui.value.expanded, candidate])];
      }, 550);
  }
}
function commitDrop(event: DragEvent, target: string) {
  const key = dragKey.value;
  const preview = pointerDestination(event, target);
  finishDrag();
  if (!preview || !dragEnabled.value) return;
  const owner = referenceOwners.value.get(key);
  if (owner)
    reorderReference(
      owner,
      requiredEntry(references.value.get(key), 'resource catalog entry'),
      preview.destination,
    );
  else void relocate(key, preview.destination);
}
function reorderReference(
  owner: string,
  key: string,
  destination: ResourceDestination,
) {
  try {
    const before = resourceChildren(
      catalog.value.resource_catalog,
      owner,
      ui.value.scope,
    )
      .map((item) => childOrderKey(item))
      .join('|');
    const next = moveReference(catalog.value, owner, key, destination);
    const after = resourceChildren(next.resource_catalog, owner, ui.value.scope)
      .map((item) => childOrderKey(item))
      .join('|');
    if (before === after) {
      message.info(t('positionUnchanged'));
      return;
    }
    Object.assign(catalog.value, next);
    message.success(t('referenceOrderSaved'));
  } catch {
    message.error(t('invalidMove'));
  }
}
function referenceStep(owner: string, key: string, direction: -1 | 1) {
  const order = resourceChildren(
    catalog.value.resource_catalog,
    owner,
    ui.value.scope,
  );
  const index = order.findIndex(
    (item) => item.kind === 'reference' && item.key === key,
  );
  return order[index + direction];
}
function stepReference(treeKey: string, direction: -1 | 1) {
  const owner = requiredEntry(
    referenceOwners.value.get(treeKey),
    'resource catalog entry',
  );
  const key = requiredEntry(
    references.value.get(treeKey),
    'resource catalog entry',
  );
  const anchor = referenceStep(owner, key, direction);
  if (!anchor || props.disabled) return;
  reorderReference(owner, key, {
    parent: owner,
    ...(direction < 0 ? { before: anchor } : { after: anchor }),
  });
}
async function relocate(key: string, destination: ResourceDestination) {
  if (props.disabled) return false;
  let target = '';
  await props.navigate(() => {
    try {
      const result = moveResource(
        catalog.value,
        key,
        destination,
        ui.value.resourceRenames,
      );
      if (!result.moved) {
        message.info(t('positionUnchanged'));
        return;
      }
      ui.value.resourceRenames = mergeKeyRenames(
        ui.value.resourceRenames,
        result.resourceKeys,
      );
      ui.value.featureRenames = mergeKeyRenames(
        ui.value.featureRenames,
        result.featureKeys,
      );
      Object.assign(catalog.value, result.document);
      ui.value.resource = result.key;
      ui.value.expanded = [
        ...new Set(
          ui.value.expanded.map((id) => result.resourceKeys[id] ?? id),
        ),
      ];
      keyChanges.value = result.changes;
      movementVersion.value++;
      target = result.key;
      message.success(
        t(result.changes.length > 0 ? 'movedWithWords' : 'orderSaved'),
      );
    } catch (error) {
      message.error(
        t(
          error instanceof Error && error.message === 'identifierTooLong'
            ? 'identifierTooLong'
            : 'invalidMove',
        ),
      );
    }
  });
  if (target) await jumpToResource(target);
  return !!target;
}
function openMoveDialog() {
  moveParent.value = undefined;
  moveDialogOpen.value = true;
}
async function confirmMove() {
  if (
    props.disabled ||
    movePending.value ||
    moveParent.value === undefined ||
    !moveOptions.value.some((option) => option.value === moveParent.value)
  )
    return;
  movePending.value = true;
  try {
    if (await relocate(ui.value.resource, { parent: moveParent.value }))
      moveDialogOpen.value = false;
  } finally {
    movePending.value = false;
  }
}
function moveStep(direction: -1 | 1) {
  const destination =
    direction < 0 ? upDestination.value : downDestination.value;
  if (destination) void relocate(ui.value.resource, destination);
}
const entries = computed(() => Object.entries(selected.value?.entries ?? {}));
watch(
  () => ui.value.buffer,
  (buffer) => {
    if (!buffer || buffer.kind === 'message' || ui.value.resourceEditor) return;
    ui.value.resourceEditor = restoreResourceBuffer(
      catalog.value,
      ui.value.scope,
      ui.value.resource,
      buffer,
    );
    ui.value.buffer = null;
  },
  { immediate: true },
);
watch(
  () =>
    JSON.stringify(ui.value.resourceEditor, (key, value) =>
      key === 'editorTab' || key === 'editorOperation' ? undefined : value,
    ),
  () => {
    formError.value = '';
    errorPath.value = '';
  },
);
function create() {
  void props.navigate(() => {
    const parent =
      selected.value?.kind === 'directory' ? ui.value.resource : '';
    ui.value.resourceEditor = createResourceEditor(
      catalog.value,
      ui.value.scope,
      '',
      parent,
    );
  });
}
function edit(
  section: 'basic' | 'entries' | 'operations' = 'basic',
  operation = '',
) {
  if (!selected.value) return;
  void props.navigate(() => {
    ui.value.resourceEditor = createResourceEditor(
      catalog.value,
      ui.value.scope,
      ui.value.resource,
    );
    ui.value.resourceEditor.editorTab = section;
    ui.value.resourceEditor.editorOperation = operation;
  });
}
function selectResource(key: string) {
  const target = references.value.get(key);
  if (target) {
    void jumpToResource(target);
    return;
  }
  if (key === ui.value.resource && !ui.value.resourceEditor) return;
  void props.navigate(() => {
    ui.value.resource = key;
  });
}
async function jumpToResource(key: string) {
  if (!resources.value[key] || !key.startsWith(`${ui.value.scope}:`)) {
    message.error(t('invalidReference'));
    return;
  }
  if (
    !(await props.navigate(() => {
      ui.value.resource = key;
      ui.value.query = '';
      const expanded = new Set(ui.value.expanded);
      const ancestors = new Set<string>();
      for (
        let parent = resources.value[key]?.parent;
        parent && !ancestors.has(parent);
        parent = resources.value[parent]?.parent
      ) {
        ancestors.add(parent);
        expanded.add(parent);
      }
      ui.value.expanded = [...expanded];
    }))
  )
    return;
  clearTimeout(jumpTimeout);
  jumpTarget.value = '';
  await nextTick();
  jumpTarget.value = key;
  await nextTick();
  const element = [
    ...(treeContainer.value?.querySelectorAll<HTMLElement>(
      '[data-resource-key]',
    ) ?? []),
  ].find((element) => element.dataset.resourceKey === key);
  element?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
    block: 'nearest',
    inline: 'nearest',
  });
  jumpTimeout = setTimeout(() => {
    jumpTarget.value = '';
  }, 1800);
}
const scopeViews = new Map<string, { query: string; resource: string }>();
function selectScope(value: unknown) {
  const scope = String(value);
  if (scope === ui.value.scope) return;
  void props.navigate(() => {
    scopeViews.set(ui.value.scope, {
      query: ui.value.query,
      resource: ui.value.resource,
    });
    const view = scopeViews.get(scope);
    ui.value.scope = scope;
    ui.value.resource =
      view && resources.value[view.resource] ? view.resource : '';
    ui.value.query = view?.query ?? '';
  });
}
function save() {
  const editor = ui.value.resourceEditor;
  if (!editor || props.disabled) return;
  formError.value = '';
  errorPath.value = '';
  try {
    const next = applyResourceEditor(
      catalog.value,
      ui.value.scope,
      editor,
      ui.value.resourceRenames,
    );
    Object.assign(catalog.value, next);
    ui.value.resource = editor.key;
    ui.value.query = '';
    const expanded = new Set(ui.value.expanded);
    for (
      let parent = editor.parent;
      parent;
      parent = resources.value[parent]?.parent ?? ''
    )
      expanded.add(parent);
    ui.value.expanded = [...expanded];
    ui.value.resourceTab = editor.editorTab || 'basic';
    ui.value.resourceEditor = null;
    message.success(t('savedToDraft'));
  } catch (error) {
    formError.value =
      error instanceof ResourceEditorError ? error.code : 'invalid';
    errorPath.value = error instanceof ResourceEditorError ? error.path : '';
  }
}
function cancel() {
  void props.navigate(() => {});
}
function remove() {
  const key = ui.value.resource;
  if (
    Object.values(resources.value).some((node) =>
      node.references?.includes(key),
    )
  ) {
    message.error(t('referenceInUse'));
    return;
  }
  if (Object.values(resources.value).some((node) => node.parent === key)) {
    message.error(t('hasChildren'));
    return;
  }
  Modal.confirm({
    title: t('deleteConfirm'),
    content: label(key),
    okText: t('delete'),
    cancelText: t('cancel'),
    okButtonProps: { danger: true },
    onOk() {
      const node = resources.value[key];
      for (const binding of Object.values(node?.operations ?? {}))
        for (const feature of binding.button_keys)
          Reflect.deleteProperty(
            catalog.value.resource_catalog.buttons,
            feature,
          );
      Reflect.deleteProperty(resources.value, key);
      for (const node of Object.values(resources.value))
        if (node.child_order)
          node.child_order = node.child_order.filter(
            (item) => item.key !== key,
          );
      ui.value.resource = '';
    },
  });
}
</script>

<template>
  <Modal
    v-model:open="moveDialogOpen"
    :title="t('moveTo')"
    :ok-text="t('confirmMove')"
    :cancel-text="t('cancel')"
    :confirm-loading="movePending"
    :ok-button-props="{ disabled: disabled || moveParent === undefined }"
    :cancel-button-props="{ disabled: movePending }"
    :closable="!movePending"
    :mask-closable="!movePending"
    :keyboard="!movePending"
    @ok="confirmMove"
  >
    <p class="catalog-muted">{{ breadcrumb(ui.resource) }}</p>
    <Form layout="vertical">
      <FormItem :label="t('parent')" :extra="t('moveDestinationHint')">
        <Select
          v-model:value="moveParent"
          :options="moveOptions"
          :disabled="disabled || movePending"
          :placeholder="normalizePlaceholder(t('selectMoveDirectory'))"
          :aria-label="t('parent')"
          option-filter-prop="label"
          show-search
        />
      </FormItem>
    </Form>
  </Modal>
  <div class="catalog-scope">
    <span>{{ t('scope') }}</span>
    <Segmented
      :value="ui.scope"
      class="catalog-scope-switch"
      :aria-label="t('scope')"
      :disabled="disabled"
      :options="catalog.scopes"
      @change="selectScope"
    />
  </div>
  <div class="catalog-workspace">
    <aside ref="treeContainer" class="catalog-tree">
      <span class="sr-only" role="status" aria-live="polite">{{
        jumpTarget ? `${t('jumpedToResource')} ${breadcrumb(jumpTarget)}` : ''
      }}</span>
      <div class="catalog-row">
        <h3>{{ t('resourceTree') }}</h3>
        <Button
          type="primary"
          :disabled="disabled"
          data-testid="add-resource-node"
          @click="create"
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template
          >{{ t('add') }}
        </Button>
      </div>
      <Input
        v-model:value="ui.query"
        :aria-label="t('searchResources')"
        :placeholder="t('searchResources')"
        allow-clear
      />
      <p class="catalog-muted catalog-tree-hint">
        {{ t('treeHierarchyHint') }}
      </p>
      <Tree
        block-node
        :tree-data="tree"
        :selected-keys="ui.resource ? [ui.resource] : []"
        :expanded-keys="ui.expanded"
        @expand="(keys) => (ui.expanded = keys.map(String))"
        @select="(keys) => selectResource(String(keys[0] ?? ''))"
      >
        <template #title="{ key, title }">
          <span
            class="catalog-tree-title"
            :class="{
              'catalog-tree-reference': references.has(String(key)),
              'catalog-tree-jump': jumpTarget === String(key),
              'catalog-tree-dragging': dragKey === String(key),
              'catalog-tree-drop-before':
                dropPreview?.key === String(key) &&
                dropPreview.mode === 'before',
              'catalog-tree-drop-after':
                dropPreview?.key === String(key) &&
                dropPreview.mode === 'after',
              'catalog-tree-drop-inside':
                dropPreview?.key === String(key) &&
                dropPreview.mode === 'inside',
            }"
            :draggable="dragEnabled"
            :data-tree-key="String(key)"
            @dragstart.stop="beginDrag($event, String(key))"
            @dragend.stop="finishDrag"
            @dragover.prevent.stop="previewDrop($event, String(key))"
            @drop.prevent.stop="commitDrop($event, String(key))"
            :data-resource-key="
              references.has(String(key)) ? undefined : String(key)
            "
            :title="
              references.has(String(key))
                ? `${t('goToOriginal')}: ${breadcrumb(
                    references.get(String(key))!,
                  )}`
                : undefined
            "
            ><IconifyIcon
              :icon="
                nodeType(references.get(String(key)) || String(key)) ===
                'resource'
                  ? 'lucide:box'
                  : nodeType(references.get(String(key)) || String(key)) ===
                      'subdirectory'
                    ? 'lucide:folders'
                    : 'lucide:folder'
              "
              aria-hidden="true"
            /><span :title="title">{{ title }}</span
            ><IconifyIcon
              v-if="references.has(String(key))"
              icon="lucide:link-2"
              aria-hidden="true"
            /><span
              v-if="references.has(String(key))"
              class="catalog-reference-order-actions"
            >
              <Button
                size="small"
                type="text"
                :disabled="
                  disabled ||
                  !referenceStep(
                    referenceOwners.get(String(key))!,
                    references.get(String(key))!,
                    -1,
                  )
                "
                :aria-label="t('referenceUp')"
                @click.stop="stepReference(String(key), -1)"
                ><template #icon
                  ><IconifyIcon icon="lucide:arrow-up" /></template
              ></Button>
              <Button
                size="small"
                type="text"
                :disabled="
                  disabled ||
                  !referenceStep(
                    referenceOwners.get(String(key))!,
                    references.get(String(key))!,
                    1,
                  )
                "
                :aria-label="t('referenceDown')"
                @click.stop="stepReference(String(key), 1)"
                ><template #icon
                  ><IconifyIcon icon="lucide:arrow-down" /></template
              ></Button> </span
            ><small>{{
              references.has(String(key))
                ? t('reference')
                : t(nodeType(String(key)))
            }}</small></span
          >
        </template>
      </Tree>
      <Empty v-if="!tree.length" :description="t('empty')" />
    </aside>
    <ResourceNodeEditor
      v-if="ui.resourceEditor"
      :catalog="catalog"
      :scope="ui.scope"
      :disabled="disabled"
      :error="formError"
      :error-path="errorPath"
      @save="save"
      @cancel="cancel"
    />
    <section
      v-else-if="selected"
      class="catalog-resource"
      data-testid="developer-resource"
    >
      <div class="catalog-row">
        <div>
          <h2>
            {{ label(ui.resource) }}
            <Tag color="blue">{{ t(nodeType(ui.resource)) }}</Tag>
          </h2>
          <code
            :key="ui.resource + movementVersion"
            :class="{
              'catalog-word-changed': keyChanges.some(
                (change) => change.after === ui.resource,
              ),
            }"
            >{{ ui.resource }}</code
          >
          <p v-if="selected.parent" class="catalog-muted">
            {{ breadcrumb(ui.resource) }}
          </p>
        </div>
        <div class="catalog-actions">
          <Button
            :disabled="disabled || !moveOptions.length"
            @click="openMoveDialog"
          >
            <template #icon><IconifyIcon icon="lucide:folder-input" /></template
            >{{ t('moveTo') }}
          </Button>
          <Button
            :disabled="disabled || !upDestination"
            :aria-label="t('up')"
            :title="stepHint(-1)"
            @click="moveStep(-1)"
          >
            <template #icon><IconifyIcon icon="lucide:arrow-up" /></template>
          </Button>
          <Button
            :disabled="disabled || !downDestination"
            :aria-label="t('down')"
            :title="stepHint(1)"
            @click="moveStep(1)"
          >
            <template #icon><IconifyIcon icon="lucide:arrow-down" /></template>
          </Button>
          <Button
            :disabled="disabled"
            @click="edit(detailTab === 'references' ? 'basic' : detailTab)"
          >
            <template #icon><IconifyIcon icon="lucide:pencil" /></template
            >{{ t('edit') }} </Button
          ><Button danger :disabled="disabled" @click="remove">
            {{ t('delete') }}
          </Button>
        </div>
      </div>
      <section
        v-if="keyChanges.some((change) => change.after === ui.resource)"
        :key="movementVersion"
        class="catalog-word-migration"
        role="status"
        aria-live="polite"
      >
        <strong
          ><IconifyIcon icon="lucide:replace" />{{ t('wordsChanged') }}</strong
        >
        <p>{{ t('wordMigrationHint') }}</p>
        <div class="catalog-word-migration-list">
          <div v-for="change in keyChanges" :key="change.after">
            <code>{{ change.before }}</code
            ><IconifyIcon icon="lucide:arrow-right" /><code
              class="catalog-word-changed"
              >{{ change.after }}</code
            ><Tag v-if="change.numbered" color="orange">
              {{ t('conflictNumbered') }}
            </Tag>
          </div>
        </div>
      </section>
      <Tabs
        v-model:active-key="detailTab"
        class="catalog-detail-tabs"
        :animated="false"
      >
        <TabPane key="basic">
          <template #tab>
            <span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:box" />{{ t('basicInfo') }}</span
            >
          </template>
          <div class="catalog-editor-section-heading">
            <h3>{{ t('basicInfo') }}</h3>
            <p>{{ t('basicInfoDescription') }}</p>
            <p>{{ t('resourceNameHint') }}</p>
          </div>
          <dl class="catalog-basic catalog-node-summary">
            <div>
              <dt>{{ t('zh') }}</dt>
              <dd>
                {{ text(catalog, 'zh-CN', 'resources', ui.resource) || '—' }}
              </dd>
            </div>
            <div>
              <dt>English</dt>
              <dd>
                {{ text(catalog, 'en-US', 'resources', ui.resource) || '—' }}
              </dd>
            </div>
            <div>
              <dt>{{ t('parent') }}</dt>
              <dd>
                {{
                  selected.parent
                    ? breadcrumb(selected.parent)
                    : t('rootDirectory')
                }}
              </dd>
            </div>
            <div>
              <dt :title="t('positionHint')">{{ t('position') }}</dt>
              <dd data-testid="resource-position">
                {{ selectedPosition }} / {{ selectedSiblings.length }}
              </dd>
            </div>
            <div v-if="selected.permission_group">
              <dt>{{ t('linkedPermissionGroup') }}</dt>
              <dd data-testid="resource-permission-group">
                {{
                  groupPreview.groups.find(
                    (group) => group.key === selected?.permission_group,
                  )?.names[preferences.app.locale as 'zh-CN' | 'en-US'] ||
                  selected.permission_group
                }}
              </dd>
            </div>
            <div v-if="selected.kind === 'resource'">
              <dt>{{ t('permissionScope') }}</dt>
              <dd data-testid="resource-permission-scope">
                {{
                  selected.permission_scope === '*' ? '*' : t('configuredScope')
                }}
              </dd>
            </div>
            <div v-if="selected.kind === 'directory' && !selected.parent">
              <dt>{{ t('frontendVisible') }}</dt>
              <dd data-testid="resource-frontend-visible">
                {{
                  t(
                    (selected.frontend_visible ?? true)
                      ? 'frontendShown'
                      : 'frontendHidden',
                  )
                }}
              </dd>
            </div>
          </dl>
          <p v-if="selected.kind === 'directory'" class="catalog-muted">
            {{ t('directoryContentsHint') }}
          </p>
        </TabPane>
        <TabPane v-if="selected.kind === 'resource'" key="entries">
          <template #tab>
            <span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:panels-top-left" />{{ t('entries')
              }}<span class="catalog-count">{{ entries.length }}</span></span
            >
          </template>
          <section class="catalog-detail-section">
            <div class="catalog-section-title">
              <div class="catalog-section-identity">
                <span class="catalog-section-icon"
                  ><IconifyIcon
                    icon="lucide:panels-top-left"
                    aria-hidden="true"
                /></span>
                <div>
                  <h3>
                    {{ t('entries') }}
                    <span class="catalog-count">{{ entries.length }}</span>
                  </h3>
                  <p>{{ t('entriesDescription') }}</p>
                </div>
              </div>
              <Button :disabled="disabled" @click="edit('entries')">
                <template #icon><IconifyIcon icon="lucide:pencil" /></template
                >{{ t('editEntry') }}
              </Button>
            </div>
            <div v-if="!entries.length" class="catalog-inline-empty">
              <IconifyIcon icon="lucide:panel-top-dashed" aria-hidden="true" />
              <div>
                <strong>{{ t('noEntries') }}</strong>
                <p>{{ t('noEntriesDescription') }}</p>
              </div>
              <Button type="link" :disabled="disabled" @click="edit('entries')">
                {{ t('addEntry') }}
              </Button>
            </div>
            <div v-else class="catalog-entry-list">
              <article
                v-for="[key, entry] in entries"
                :key="key"
                class="catalog-entry-card"
              >
                <div class="catalog-entry-identity">
                  <IconifyIcon icon="lucide:panel-top" aria-hidden="true" />
                  <div>
                    <strong>{{
                      text(catalog, preferences.app.locale, 'menus', key) || key
                    }}</strong
                    ><code>{{ key }}</code>
                  </div>
                </div>
                <dl class="catalog-entry-details">
                  <div>
                    <dt>{{ t('route') }}</dt>
                    <dd>
                      <code>{{ entry.path }}</code>
                    </dd>
                  </div>
                </dl>
              </article>
            </div>
          </section>
        </TabPane>
        <TabPane v-if="selected.kind === 'resource'" key="operations">
          <template #tab>
            <span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:sliders-horizontal" />{{
                t('operations')
              }}<span class="catalog-count">{{
                selected.permission_scope === '*'
                  ? '*'
                  : Object.keys(selected.operations ?? {}).length
              }}</span></span
            >
          </template>
          <section class="catalog-detail-section">
            <div class="catalog-section-title">
              <div class="catalog-section-identity">
                <span class="catalog-section-icon"
                  ><IconifyIcon
                    icon="lucide:sliders-horizontal"
                    aria-hidden="true"
                /></span>
                <div>
                  <h3>
                    {{ t('operations') }}
                    <span class="catalog-count">{{
                      selected.permission_scope === '*'
                        ? '*'
                        : Object.keys(selected.operations ?? {}).length
                    }}</span>
                  </h3>
                  <p v-if="selected.permission_scope !== '*'">
                    {{ t('operationsDescription') }}
                  </p>
                </div>
              </div>
              <Button :disabled="disabled" @click="edit('operations')">
                <template #icon>
                  <IconifyIcon icon="lucide:settings-2" /> </template
                >{{ t('configure') }}
              </Button>
            </div>
            <div
              v-if="selected.permission_scope === '*'"
              class="catalog-feature-card"
              data-testid="resource-all-permissions"
            >
              <div class="catalog-operation-title">
                <span class="catalog-operation-symbol">
                  <IconifyIcon icon="lucide:shield-check" aria-hidden="true" />
                </span>
                <strong>{{ t('allScope') }}</strong>
              </div>
              <p class="catalog-muted">{{ t('allScopeDescription') }}</p>
            </div>
            <div
              v-else-if="!Object.keys(selected.operations ?? {}).length"
              class="catalog-inline-empty"
            >
              <IconifyIcon
                icon="lucide:sliders-horizontal"
                aria-hidden="true"
              />
              <div>
                <strong>{{ t('noOperations') }}</strong>
                <p>{{ t('operationsDescription') }}</p>
              </div>
            </div>
            <Collapse
              v-else
              :key="ui.resource"
              class="catalog-operation-list"
              expand-icon-position="end"
            >
              <CollapsePanel
                v-for="(binding, operation) in selected.operations"
                :key="operation"
              >
                <template #header>
                  <div class="catalog-operation-title">
                    <span class="catalog-operation-symbol"
                      ><IconifyIcon
                        :icon="
                          (
                            {
                              read: 'lucide:eye',
                              create: 'lucide:plus',
                              update: 'lucide:pencil',
                              delete: 'lucide:trash-2',
                            } as Record<string, string>
                          )[operation] || 'lucide:zap'
                        "
                        aria-hidden="true"
                    /></span>
                    <strong>{{ $t(`operations.${operation}`) }}</strong
                    ><code>{{ operation }}</code>
                    <span class="catalog-operation-counts"
                      >{{ binding.button_keys.length }}
                      {{ t('featureCountLabel') }}</span
                    >
                  </div>
                </template>
                <template #extra>
                  <Button
                    size="small"
                    type="text"
                    :disabled="disabled"
                    :aria-label="`${t('configure')} ${$t(`operations.${operation}`)}`"
                    @click.stop="edit('operations', operation)"
                  >
                    {{ t('configure') }}
                  </Button>
                </template>
                <article
                  v-for="key in binding.button_keys"
                  :key="key"
                  class="catalog-feature-card"
                >
                  <div class="catalog-feature-identity">
                    <IconifyIcon icon="lucide:blocks" aria-hidden="true" />
                    <div>
                      <strong>{{
                        text(
                          catalog,
                          preferences.app.locale,
                          'features',
                          key,
                        ) || key
                      }}</strong
                      ><code>{{ key }}</code>
                    </div>
                  </div>
                  <ResourceFeatureMappings
                    :feature="catalog.resource_catalog.buttons[key]"
                  />
                </article>
                <p
                  v-if="!binding.button_keys.length"
                  class="catalog-muted catalog-mapping-empty"
                >
                  {{ t('noFeaturesHint') }}
                </p>
              </CollapsePanel>
            </Collapse>
          </section>
        </TabPane>
        <TabPane v-if="referenceCollection" key="references">
          <template #tab>
            <span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:link-2" />{{ t('references')
              }}<span class="catalog-count">{{
                selected.references?.length ?? 0
              }}</span></span
            >
          </template>
          <section class="catalog-reference-summary">
            <div class="catalog-row">
              <h3>{{ t('references') }}</h3>
              <Button :disabled="disabled" @click="edit()">
                <template #icon><IconifyIcon icon="lucide:link-2" /></template
                >{{ t('manageReferences') }}
              </Button>
            </div>
            <p class="catalog-muted">{{ t('referenceOwnershipHint') }}</p>
            <div class="catalog-reference-list">
              <button
                v-for="key in selected.references ?? []"
                :key="key"
                type="button"
                class="catalog-reference-card"
                :disabled="!resources[key]"
                :aria-label="`${t('goToOriginal')} ${breadcrumb(key)}`"
                @click="jumpToResource(key)"
              >
                <IconifyIcon
                  :icon="
                    resources[key]?.kind === 'directory'
                      ? 'lucide:folder'
                      : 'lucide:box'
                  "
                  aria-hidden="true"
                />
                <span
                  ><strong>{{ label(key) }}</strong>
                  <small>{{ breadcrumb(key) }}</small>
                  <span class="catalog-reference-operation-tags">
                    <Tag
                      v-for="operation in referencedOperations(
                        catalog.resource_catalog,
                        ui.resource,
                        key,
                      )"
                      :key="operation"
                      color="blue"
                      >{{ $t(`operations.${operation}`) }}</Tag
                    >
                  </span></span
                >
                <IconifyIcon icon="lucide:corner-up-right" aria-hidden="true" />
              </button>
            </div>
            <p v-if="!selected.references?.length" class="catalog-muted">
              {{ t('noReferences') }}
            </p>
          </section>
        </TabPane>
      </Tabs>
    </section>
    <Empty
      v-else
      :description="t('selectResource')"
      class="catalog-resource catalog-resource-empty"
    />
  </div>
</template>
