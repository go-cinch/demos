<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IconifyIcon } from '@vben/icons';
import { preferences } from '@vben/preferences';
import {
  Button,
  Collapse,
  CollapsePanel,
  Empty,
  Form,
  FormItem,
  Input,
  Modal,
  Segmented,
  Select,
  Tag,
  Tabs,
  TabPane,
  Tree,
  message,
} from 'ant-design-vue';
import { $t } from '#/locales';
import type {
  Catalog,
  CatalogNavigate,
  EditorUI,
  ResourceDetailTab,
} from './catalog-model';
import { text } from './catalog-model';
import groupPreview from './data/permission-groups.json';
import { resourceBreadcrumb } from '../components/resource-catalog';
import {
  supportsResourceReferences,
  referenceTreeKey,
  resourceReferenceTree,
  referencedOperations,
} from '../components/resource-references';
import {
  applyResourceEditor,
  createResourceEditor,
  ResourceEditorError,
  restoreResourceBuffer,
} from './resource-editor-model';
import ResourceNodeEditor from './resource-node-editor.vue';
import ResourceFeatureMappings from './resource-feature-mappings.vue';
import {
  canMoveResource,
  moveResource,
  moveReference,
  resourceStep,
} from './resource-movement';
import type {
  ResourceDestination,
  ResourceKeyChange,
} from './resource-movement';
import { childOrderKey, resourceChildren } from '../components/resource-order';
import { mergeKeyRenames } from './resource-renames';

const props = defineProps<{
  catalog: Catalog;
  ui: EditorUI;
  disabled: boolean;
  navigate: CatalogNavigate;
}>();
const t = (key: string) => $t(`developer.${key}`);
const keyChanges = ref<ResourceKeyChange[]>([]);
const movementVersion = ref(0);
const moveDialogOpen = ref(false);
const moveParent = ref<string>();
const movePending = ref(false);
const dragKey = ref('');
const dropPreview = ref<{
  key: string;
  mode: 'before' | 'after' | 'inside';
  destination: ResourceDestination;
} | null>(null);
let expandTimer: ReturnType<typeof setTimeout> | undefined;
let expandCandidate = '';

const error = ref('');
const errorPath = ref('');
const treeContainer = ref<HTMLElement>();
const jumpTarget = ref('');
let jumpTimeout: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => {
  clearTimeout(jumpTimeout);
  clearTimeout(expandTimer);
});
const resources = computed(() => props.catalog.resource_catalog.resources);
const selected = computed(() =>
  props.ui.resource.startsWith(`${props.ui.scope}:`)
    ? resources.value[props.ui.resource]
    : undefined,
);
const selectedSiblings = computed(() =>
  resourceChildren(
    props.catalog.resource_catalog,
    selected.value?.parent ?? '',
    props.ui.scope,
  ),
);
const selectedPosition = computed(
  () =>
    selectedSiblings.value.findIndex(
      (item) => item.kind === 'node' && item.key === props.ui.resource,
    ) + 1,
);
const label = (key: string) =>
  text(props.catalog, preferences.app.locale, 'resources', key) ||
  text(props.catalog, 'en-US', 'resources', key) ||
  key;
const nodeType = (key: string) =>
  resources.value[key]?.kind === 'resource'
    ? 'resource'
    : resources.value[key]?.parent
      ? 'subdirectory'
      : 'directory';
const breadcrumb = (key: string) =>
  resourceBreadcrumb(props.catalog.resource_catalog, key, label);
const moveOptions = computed(() => {
  const key = props.ui.resource;
  const parent = selected.value?.parent ?? '';
  const options = Object.keys(resources.value)
    .filter((target) => target !== parent && canMoveResource(props.catalog, key, target))
    .map((value) => ({ value, label: breadcrumb(value) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (parent && canMoveResource(props.catalog, key, ''))
    options.unshift({ value: '', label: t('rootDirectory') });
  return options;
});
const tree = computed(() =>
  resourceReferenceTree(
    props.catalog.resource_catalog,
    props.ui.scope,
    props.ui.query,
    label,
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
const referenceCollection = computed(
  () => supportsResourceReferences(selected.value),
);
const detailTab = computed<ResourceDetailTab>({
  get() {
    const tab = props.ui.resourceTab;
    if (tab === 'references' && referenceCollection.value) return tab;
    if (
      (tab === 'entries' || tab === 'operations') &&
      selected.value?.kind === 'resource'
    )
      return tab;
    return 'basic';
  },
  set(value) {
    props.ui.resourceTab = value;
  },
});
const upDestination = computed(() =>
  resourceStep(props.catalog, props.ui.resource, -1),
);
const downDestination = computed(() =>
  resourceStep(props.catalog, props.ui.resource, 1),
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
  () => !props.disabled && !props.ui.resourceEditor && !props.ui.query.trim(),
);
function dropDestination(
  target: string,
  position: number,
): ResourceDestination | null {
  const reference = references.value.get(target);
  if (reference) {
    if (position === 0) return null;
    const parent = referenceOwners.value.get(target)!;
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
  return {
    parent,
    ...(position < 0
      ? { before: anchor }
      : position > 0
        ? { after: anchor }
        : {}),
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
  let position = enterDirectory ? 0 : ratio < 0.5 ? -1 : 1;
  if (!enterDirectory && sameParent) {
    const order = resourceChildren(
      props.catalog.resource_catalog,
      sourceParent,
      props.ui.scope,
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
    if (from < 0 || to < 0) return null;
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
      : !canMoveResource(props.catalog, source, destination.parent))
  )
    return null;
  return {
    key: target,
    mode:
      position === 0
        ? ('inside' as const)
        : position < 0
          ? ('before' as const)
          : ('after' as const),
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
    if (candidate && !props.ui.expanded.includes(candidate))
      expandTimer = setTimeout(() => {
        if (expandCandidate === candidate)
          props.ui.expanded = [...new Set([...props.ui.expanded, candidate])];
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
    reorderReference(owner, references.value.get(key)!, preview.destination);
  else void relocate(key, preview.destination);
}
function reorderReference(
  owner: string,
  key: string,
  destination: ResourceDestination,
) {
  try {
    const before = resourceChildren(
      props.catalog.resource_catalog,
      owner,
      props.ui.scope,
    )
      .map(childOrderKey)
      .join('|');
    const next = moveReference(props.catalog, owner, key, destination);
    const after = resourceChildren(next.resource_catalog, owner, props.ui.scope)
      .map(childOrderKey)
      .join('|');
    if (before === after) {
      message.info(t('positionUnchanged'));
      return;
    }
    Object.assign(props.catalog, next);
    message.success(t('referenceOrderSaved'));
  } catch {
    message.error(t('invalidMove'));
  }
}
function referenceStep(owner: string, key: string, direction: -1 | 1) {
  const order = resourceChildren(
    props.catalog.resource_catalog,
    owner,
    props.ui.scope,
  );
  const index = order.findIndex(
    (item) => item.kind === 'reference' && item.key === key,
  );
  return order[index + direction];
}
function stepReference(treeKey: string, direction: -1 | 1) {
  const owner = referenceOwners.value.get(treeKey)!;
  const key = references.value.get(treeKey)!;
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
      const result = moveResource(props.catalog, key, destination, props.ui.resourceRenames);
      if (!result.moved) {
        message.info(t('positionUnchanged'));
        return;
      }
      props.ui.resourceRenames = mergeKeyRenames(props.ui.resourceRenames, result.resourceKeys);
      props.ui.featureRenames = mergeKeyRenames(props.ui.featureRenames, result.featureKeys);
      Object.assign(props.catalog, result.document);
      props.ui.resource = result.key;
      props.ui.expanded = [
        ...new Set(
          props.ui.expanded.map((id) => result.resourceKeys[id] ?? id),
        ),
      ];
      keyChanges.value = result.changes;
      movementVersion.value++;
      target = result.key;
      message.success(
        t(result.changes.length ? 'movedWithWords' : 'orderSaved'),
      );
    } catch (issue) {
      message.error(
        t(
          issue instanceof Error && issue.message === 'identifierTooLong'
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
    if (await relocate(props.ui.resource, { parent: moveParent.value }))
      moveDialogOpen.value = false;
  } finally {
    movePending.value = false;
  }
}
function moveStep(direction: -1 | 1) {
  const destination =
    direction < 0 ? upDestination.value : downDestination.value;
  if (destination) void relocate(props.ui.resource, destination);
}
const entries = computed(() => Object.entries(selected.value?.entries ?? {}));
watch(
  () => props.ui.buffer,
  (buffer) => {
    if (!buffer || buffer.kind === 'message' || props.ui.resourceEditor) return;
    props.ui.resourceEditor = restoreResourceBuffer(
      props.catalog,
      props.ui.scope,
      props.ui.resource,
      buffer,
    );
    props.ui.buffer = null;
  },
  { immediate: true },
);
watch(
  () =>
    JSON.stringify(props.ui.resourceEditor, (key, value) =>
      key === 'editorTab' || key === 'editorOperation' ? undefined : value,
    ),
  () => {
    error.value = '';
    errorPath.value = '';
  },
);
function create() {
  void props.navigate(() => {
    const parent =
      selected.value?.kind === 'directory' ? props.ui.resource : '';
    props.ui.resourceEditor = createResourceEditor(
      props.catalog,
      props.ui.scope,
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
    props.ui.resourceEditor = createResourceEditor(
      props.catalog,
      props.ui.scope,
      props.ui.resource,
    );
    props.ui.resourceEditor.editorTab = section;
    props.ui.resourceEditor.editorOperation = operation;
  });
}
function selectResource(key: string) {
  const target = references.value.get(key);
  if (target) {
    void jumpToResource(target);
    return;
  }
  if (key === props.ui.resource && !props.ui.resourceEditor) return;
  void props.navigate(() => {
    props.ui.resource = key;
  });
}
async function jumpToResource(key: string) {
  if (!resources.value[key] || !key.startsWith(`${props.ui.scope}:`)) {
    message.error(t('invalidReference'));
    return;
  }
  if (
    !(await props.navigate(() => {
      props.ui.resource = key;
      props.ui.query = '';
      const expanded = new Set(props.ui.expanded);
      const ancestors = new Set<string>();
      for (
        let parent = resources.value[key]?.parent;
        parent && !ancestors.has(parent);
        parent = resources.value[parent]?.parent
      ) {
        ancestors.add(parent);
        expanded.add(parent);
      }
      props.ui.expanded = [...expanded];
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
function selectScope(value: unknown) {
  const scope = String(value);
  if (scope === props.ui.scope) return;
  void props.navigate(() => {
    props.ui.scope = scope;
    props.ui.resource = '';
  });
}
function save() {
  const editor = props.ui.resourceEditor;
  if (!editor || props.disabled) return;
  error.value = '';
  errorPath.value = '';
  try {
    const next = applyResourceEditor(props.catalog, props.ui.scope, editor, props.ui.resourceRenames);
    Object.assign(props.catalog, next);
    props.ui.resource = editor.key;
    props.ui.query = '';
    const expanded = new Set(props.ui.expanded);
    for (
      let parent = editor.parent;
      parent;
      parent = resources.value[parent]?.parent ?? ''
    )
      expanded.add(parent);
    props.ui.expanded = [...expanded];
    props.ui.resourceTab = editor.editorTab || 'basic';
    props.ui.resourceEditor = null;
    message.success(t('savedToDraft'));
  } catch (issue) {
    error.value = issue instanceof ResourceEditorError ? issue.code : 'invalid';
    errorPath.value = issue instanceof ResourceEditorError ? issue.path : '';
  }
}
function cancel() {
  void props.navigate(() => {});
}
function remove() {
  const key = props.ui.resource;
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
          delete props.catalog.resource_catalog.buttons[feature];
      delete resources.value[key];
      for (const node of Object.values(resources.value))
        if (node.child_order)
          node.child_order = node.child_order.filter(
            (item) => item.key !== key,
          );
      props.ui.resource = '';
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
          :placeholder="t('selectMoveDirectory')"
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
        jumpTarget ? t('jumpedToResource') + ' ' + breadcrumb(jumpTarget) : ''
      }}</span>
      <div class="catalog-row">
        <h3>{{ t('resourceTree') }}</h3>
        <Button
          type="primary"
          :disabled="disabled"
          data-testid="add-resource-node"
          @click="create"
          ><template #icon><IconifyIcon icon="lucide:plus" /></template
          >{{ t('add') }}</Button
        >
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
        <template #title="{ key, title }"
          ><span
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
                ? t('goToOriginal') +
                  ': ' +
                  breadcrumb(references.get(String(key))!)
                : undefined
            "
            ><IconifyIcon
              :icon="
                nodeType(references.get(String(key)) || String(key)) === 'resource'
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
          ></template
        >
      </Tree>
      <Empty v-if="!tree.length" :description="t('empty')" />
    </aside>
    <ResourceNodeEditor
      v-if="ui.resourceEditor"
      :catalog="catalog"
      :draft="ui.resourceEditor"
      :scope="ui.scope"
      :disabled="disabled"
      :error="error"
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
            ><template #icon><IconifyIcon icon="lucide:folder-input" /></template
            >{{ t('moveTo') }}</Button
          >
          <Button
            :disabled="disabled || !upDestination"
            :aria-label="t('up')"
            :title="stepHint(-1)"
            @click="moveStep(-1)"
            ><template #icon><IconifyIcon icon="lucide:arrow-up" /></template
          ></Button>
          <Button
            :disabled="disabled || !downDestination"
            :aria-label="t('down')"
            :title="stepHint(1)"
            @click="moveStep(1)"
            ><template #icon><IconifyIcon icon="lucide:arrow-down" /></template
          ></Button>
          <Button
            :disabled="disabled"
            @click="edit(detailTab === 'references' ? 'basic' : detailTab)"
            ><template #icon><IconifyIcon icon="lucide:pencil" /></template
            >{{ t('edit') }}</Button
          ><Button danger :disabled="disabled" @click="remove">{{
            t('delete')
          }}</Button>
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
            ><Tag v-if="change.numbered" color="orange">{{
              t('conflictNumbered')
            }}</Tag>
          </div>
        </div>
      </section>
      <Tabs
        v-model:active-key="detailTab"
        class="catalog-detail-tabs"
        :animated="false"
      >
        <TabPane key="basic">
          <template #tab
            ><span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:box" />{{ t('basicInfo') }}</span
            ></template
          >
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
              <dd data-testid="resource-permission-group">{{ groupPreview.groups.find((group) => group.key === selected?.permission_group)?.names[preferences.app.locale as 'zh-CN' | 'en-US'] || selected.permission_group }}</dd>
            </div>
            <div v-if="selected.kind === 'resource'">
              <dt>{{ t('permissionScope') }}</dt>
              <dd data-testid="resource-permission-scope">{{ selected.permission_scope === '*' ? '*' : t('configuredScope') }}</dd>
            </div>
            <div v-if="selected.kind === 'directory' && !selected.parent">
              <dt>{{ t('frontendVisible') }}</dt>
              <dd data-testid="resource-frontend-visible">{{ t((selected.frontend_visible ?? true) ? 'frontendShown' : 'frontendHidden') }}</dd>
            </div>
          </dl>
          <p v-if="selected.kind === 'directory'" class="catalog-muted">
            {{ t('directoryContentsHint') }}
          </p>
        </TabPane>
        <TabPane v-if="selected.kind === 'resource'" key="entries">
          <template #tab
            ><span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:panels-top-left" />{{ t('entries')
              }}<span class="catalog-count">{{ entries.length }}</span></span
            ></template
          >
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
              <Button :disabled="disabled" @click="edit('entries')"
                ><template #icon><IconifyIcon icon="lucide:pencil" /></template
                >{{ t('editEntry') }}</Button
              >
            </div>
            <div v-if="!entries.length" class="catalog-inline-empty">
              <IconifyIcon icon="lucide:panel-top-dashed" aria-hidden="true" />
              <div>
                <strong>{{ t('noEntries') }}</strong>
                <p>{{ t('noEntriesDescription') }}</p>
              </div>
              <Button
                type="link"
                :disabled="disabled"
                @click="edit('entries')"
                >{{ t('addEntry') }}</Button
              >
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
          <template #tab
            ><span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:sliders-horizontal" />{{
                t('operations')
              }}<span class="catalog-count">{{
                selected.permission_scope === '*'
                  ? '*'
                  : Object.keys(selected.operations ?? {}).length
              }}</span></span
            ></template
          >
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
                  <p v-if="selected.permission_scope !== '*'">{{ t('operationsDescription') }}</p>
                </div>
              </div>
              <Button :disabled="disabled" @click="edit('operations')"
                ><template #icon
                  ><IconifyIcon icon="lucide:settings-2" /></template
                >{{ t('configure') }}</Button
              >
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
                    <strong>{{ $t('operations.' + operation) }}</strong
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
                    :aria-label="
                      t('configure') + ' ' + $t('operations.' + operation)
                    "
                    @click.stop="edit('operations', operation)"
                    >{{ t('configure') }}</Button
                  >
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
          <template #tab
            ><span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:link-2" />{{ t('references')
              }}<span class="catalog-count">{{
                selected.references?.length ?? 0
              }}</span></span
            ></template
          >
          <section class="catalog-reference-summary">
            <div class="catalog-row">
              <h3>{{ t('references') }}</h3>
              <Button :disabled="disabled" @click="edit()"
                ><template #icon><IconifyIcon icon="lucide:link-2" /></template
                >{{ t('manageReferences') }}</Button
              >
            </div>
            <p class="catalog-muted">{{ t('referenceOwnershipHint') }}</p>
            <div class="catalog-reference-list">
              <button
                v-for="key in selected.references ?? []"
                :key="key"
                type="button"
                class="catalog-reference-card"
                :disabled="!resources[key]"
                :aria-label="t('goToOriginal') + ' ' + breadcrumb(key)"
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
                  ><strong>{{ label(key) }}</strong
                  > <small>{{ breadcrumb(key) }}</small>
                  <span class="catalog-reference-operation-tags">
                    <Tag v-for="operation in referencedOperations(catalog.resource_catalog, ui.resource, key)" :key="operation" color="blue">{{ $t(`operations.${operation}`) }}</Tag>
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
