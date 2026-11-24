<script setup lang="ts">
import type {
  ActionConfig,
  ActionResourceBinding,
  ResourceCatalog,
} from '#/api/system';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { $te } from '@vben/locales';

import {
  Button,
  Checkbox,
  CheckboxGroup,
  Empty,
  Input,
  Tag,
  Tree,
} from 'ant-design-vue';

import { $t } from '#/locales';

import {
  actionResourceBindings,
  permissionOperations,
  resolveResourceBindings,
  resolveResourceSelectionConfig,
  resourceBreadcrumb,
} from './resource-catalog';
import {
  orderPermissionResourceKeys,
  referencedOperations,
  referenceResourceBindings,
  resourceReferenceTree,
} from './resource-references';

const props = defineProps<{
  catalog: ResourceCatalog;
  config?: ActionConfig;
  scope: string;
  disabled?: boolean;
  readOnly?: boolean;
  defaultMode?: boolean;
  assignment?: boolean;
  effectiveView?: boolean;
}>();
const emit = defineEmits<{ 'update:config': [ActionConfig] }>();
const search = ref('');
const workspace = ref<HTMLElement>();
const label = (kind: string, key: string) =>
  $te(`${kind}.${key}`) ? $t(`${kind}.${key}`) : key;
const breadcrumb = (key: string) =>
  resourceBreadcrumb(props.catalog, key, (id) => label('resources', id));
const operationKeys = (key: string) =>
  props.defaultMode
    ? ['read']
    : [
        ...(props.catalog.resources[key]?.permission_scope === '*'
          ? ['*']
          : []),
        ...permissionOperations.filter(
          (operation) => props.catalog.resources[key]?.operations?.[operation],
        ),
      ];
const featureKeys = (binding: ActionResourceBinding) =>
  props.catalog.resources[binding.resource_key]?.operations?.[binding.operation]
    ?.button_keys ?? [];
const featureOptions = (binding: ActionResourceBinding) =>
  featureKeys(binding).map((value) => ({
    value,
    label: label('features', value),
  }));
function completeBinding(
  resource_key: string,
  operation: string,
): ActionResourceBinding {
  const binding = { resource_key, operation };
  return { ...binding, feature_keys: [...featureKeys(binding)] };
}
function hasAllFeatures(binding: ActionResourceBinding) {
  const selected = binding.feature_keys ?? featureKeys(binding);
  return featureKeys(binding).every((feature) => selected.includes(feature));
}
const bindings = computed<ActionResourceBinding[]>(() => {
  if (!props.defaultMode) return actionResourceBindings(props.config);
  return (props.config?.resource_keys ?? []).map((resource_key) => {
    const binding = { resource_key, operation: 'read' };
    const features = featureKeys(binding);
    return {
      ...binding,
      feature_keys:
        props.config?.feature_keys?.filter((key) => features.includes(key)) ??
        features,
    };
  });
});
const pendingResources = ref<string[]>([]);
const resources = computed(() => {
  const available = [
    ...bindings.value.map((binding) => binding.resource_key),
    ...pendingResources.value,
  ];
  return orderPermissionResourceKeys(props.catalog, props.scope, available).map(
    (resource_key) => ({
      resource_key,
      bindings: bindings.value.filter(
        (binding) => binding.resource_key === resource_key,
      ),
    }),
  );
});
const selectedOperations = (key: string) =>
  bindings.value
    .filter((binding) => binding.resource_key === key)
    .map((binding) => binding.operation);
const bindingFor = (key: string, operation: string) =>
  bindings.value.find(
    (binding) =>
      binding.resource_key === key && binding.operation === operation,
  );
const canEnter = (key: string) =>
  bindings.value.some(
    (binding) =>
      binding.resource_key === key &&
      (binding.operation === '*' ||
        props.catalog.resources[key]?.operations?.[binding.operation]
          ?.entry_keys.length),
  );
function operationRows(key: string) {
  return operationKeys(key)
    .map((operation) => {
      const binding = bindingFor(key, operation);
      const draft = binding ?? {
        resource_key: key,
        operation,
        feature_keys: [],
      };
      return {
        operation,
        selected: Boolean(binding),
        partial: Boolean(
          props.assignment && binding && !hasAllFeatures(binding),
        ),
        features: featureOptions(draft).filter(
          (feature) =>
            !props.effectiveView ||
            (binding &&
              (binding.feature_keys ?? featureKeys(binding)).includes(
                feature.value,
              )),
        ),
        selectedFeatures: binding
          ? (binding.feature_keys ?? featureKeys(binding))
          : [],
      };
    })
    .filter((row) => !props.effectiveView || row.selected);
}
function toggleOperation(key: string, operation: string, checked: boolean) {
  if (props.assignment && checked) {
    const next = bindings.value.filter(
      (binding) =>
        binding.resource_key !== key || binding.operation !== operation,
    );
    publish([...next, completeBinding(key, operation)]);
    return;
  }
  const current = selectedOperations(key);
  updateOperations(
    key,
    checked
      ? [...current, operation]
      : current.filter((item) => item !== operation),
  );
}
function allSelected(key: string) {
  const operations = operationKeys(key);
  return (
    operations.length > 0 &&
    operations.every((operation) => {
      const binding = bindingFor(key, operation);
      return binding && hasAllFeatures(binding);
    })
  );
}
// Keep the full catalog visible; grants determine selection, never visibility.
const tree = computed(() =>
  resourceReferenceTree(props.catalog, props.scope, search.value, (key) =>
    label('resources', key),
  ),
);

function resourceSelections(key: string, owner?: string) {
  const allowed = owner
    ? referencedOperations(props.catalog, owner, key)
    : [...permissionOperations, '*'];
  return new Map(
    [...referenceResourceBindings(props.catalog, key, allowed)]
      .map(([resource, operations]) => {
        const available = operationKeys(resource);
        const supported = operations.filter((operation) =>
          available.includes(operation),
        );
        // Select wildcard-only resources through the tree. A resource that also
        // offers CRUD operations keeps its wildcard as a separate card control.
        return [
          resource,
          !owner && supported.length > 1
            ? supported.filter((operation) => operation !== '*')
            : supported,
        ] as const;
      })
      .filter(([, operations]) => operations.length),
  );
}
function rowState(selections: ReturnType<typeof resourceSelections>) {
  let selected = false;
  let complete = true;
  for (const [resource, operations] of selections) {
    for (const operation of operations) {
      const binding = bindingFor(resource, operation);
      if (binding) selected = true;
      if (!binding || !hasAllFeatures(binding)) complete = false;
    }
  }
  return { all: selected && complete, partial: selected && !complete };
}

const treeStates = computed(() => {
  const states = new Map<string, ReturnType<typeof rowState>>();
  const visit = (nodes: typeof tree.value) => {
    for (const node of nodes) {
      states.set(
        node.key,
        rowState(
          resourceSelections(
            node.referenceTarget ?? node.key,
            node.referenceOwner,
          ),
        ),
      );
      visit(node.children);
    }
  };
  visit(tree.value);
  return states;
});
const selectedTreeKeys = computed(() =>
  [...treeStates.value].filter(([, state]) => state.all).map(([key]) => key),
);
function publish(next: ActionResourceBinding[]) {
  if (props.readOnly || props.disabled) return;
  const keys = [...new Set(next.map((binding) => binding.resource_key))];
  const features = [
    ...new Set(
      next.flatMap((binding) => binding.feature_keys ?? featureKeys(binding)),
    ),
  ];
  try {
    emit(
      'update:config',
      props.defaultMode
        ? resolveResourceSelectionConfig(
            props.catalog,
            props.scope,
            keys,
            features,
          )
        : resolveResourceBindings(props.catalog, props.scope, next),
    );
  } catch {
    // Keep invalid/stale selections visible so they can be removed individually.
    emit(
      'update:config',
      props.defaultMode
        ? {
            builtin: 'default',
            resource_keys: keys,
            feature_keys: features,
            ui: [],
            endpoints: [],
          }
        : { bindings: next, ui: [], endpoints: [] },
    );
  }
}
function toggle(key: string, owner?: string) {
  if (props.disabled) return;
  const selections = resourceSelections(key, owner);
  if (selections.size === 0) return;
  const removing = rowState(selections).all;
  const next = bindings.value.filter(
    (binding) =>
      !removing ||
      !selections.get(binding.resource_key)?.includes(binding.operation),
  );
  pendingResources.value = pendingResources.value.filter(
    (item) => !selections.has(item),
  );
  if (!removing) {
    for (const [resource, operations] of selections) {
      for (const operation of operations) {
        const index = next.findIndex(
          (binding) =>
            binding.resource_key === resource &&
            binding.operation === operation,
        );
        const existing = next[index];
        if (!existing) next.push(completeBinding(resource, operation));
        else if (!hasAllFeatures(existing))
          next[index] = completeBinding(resource, operation);
      }
    }
  }
  publish(next);
}
function selectNode(_keys: unknown, info: { node: { key: number | string } }) {
  const key = String(info.node.key);
  const find = (
    nodes: typeof tree.value,
  ): (typeof tree.value)[number] | undefined => {
    for (const node of nodes) {
      if (node.key === key) return node;
      const child = find(node.children);
      if (child) return child;
    }
  };
  const node = find(tree.value);
  if (props.readOnly) {
    const target = node?.referenceTarget ?? key;
    const card = [
      ...(workspace.value?.querySelectorAll<HTMLElement>(
        '[data-resource-key]',
      ) ?? []),
    ].find((element) => element.dataset.resourceKey === target);
    card?.scrollIntoView({ block: 'nearest' });
    return;
  }
  if (node) toggle(node.referenceTarget ?? node.key, node.referenceOwner);
}
function remove(key: string) {
  pendingResources.value = pendingResources.value.filter(
    (item) => item !== key,
  );
  publish(bindings.value.filter((binding) => binding.resource_key !== key));
}
function updateOperations(key: string, values: (boolean | number | string)[]) {
  const operations = operationKeys(key).filter((operation) =>
    values.map(String).includes(operation),
  );
  const previous = bindings.value.filter(
    (binding) => binding.resource_key === key,
  );
  const next = operations.map(
    (operation) =>
      previous.find((binding) => binding.operation === operation) ??
      completeBinding(key, operation),
  );
  pendingResources.value =
    operations.length > 0
      ? pendingResources.value.filter((item) => item !== key)
      : [...new Set([...pendingResources.value, key])];
  replaceResourceBindings(key, next);
}
function replaceResourceBindings(
  key: string,
  replacements: ActionResourceBinding[],
) {
  const order = [
    ...new Set([...bindings.value.map((binding) => binding.resource_key), key]),
  ];
  publish(
    order.flatMap((resource) =>
      resource === key
        ? replacements
        : bindings.value.filter((binding) => binding.resource_key === resource),
    ),
  );
}
function selectAll(key: string) {
  pendingResources.value = pendingResources.value.filter(
    (item) => item !== key,
  );
  replaceResourceBindings(
    key,
    operationKeys(key).map((operation) => completeBinding(key, operation)),
  );
}
function toggleAll(key: string, checked: boolean) {
  if (checked) selectAll(key);
  else updateOperations(key, []);
}
function updateFeatures(
  key: string,
  operation: string,
  values: (boolean | number | string)[],
) {
  if (props.assignment) {
    const next = bindings.value.filter(
      (binding) =>
        binding.resource_key !== key || binding.operation !== operation,
    );
    if (values.length > 0)
      next.push({
        resource_key: key,
        operation,
        feature_keys: values.map(String),
      });
    pendingResources.value = [...new Set([...pendingResources.value, key])];
    publish(next);
    return;
  }
  publish(
    bindings.value.map((binding) =>
      binding.resource_key === key && binding.operation === operation
        ? { ...binding, feature_keys: values.map(String) }
        : binding,
    ),
  );
}
</script>

<template>
  <div
    ref="workspace"
    class="resource-workspace"
    :class="{ 'read-only': readOnly }"
    :data-readonly="readOnly || undefined"
    data-testid="action-resource-selector"
  >
    <section
      class="resource-directory"
      data-permission-region="menu"
      :aria-label="$t('action-editor.page')"
    >
      <div class="panel-heading">
        <span>{{ $t('action-editor.page') }}</span
        ><span class="secondary">{{ label('scopes', scope) }}</span>
      </div>
      <Input
        v-model:value="search"
        allow-clear
        :disabled="disabled"
        :placeholder="$t('action-editor.searchResources')"
        :aria-label="$t('action-editor.searchResources')"
        data-testid="action-resource-search"
      >
        <template #prefix><IconifyIcon icon="lucide:search" /></template>
      </Input>
      <div class="resource-tree-area">
        <Tree
          v-if="tree.length"
          :key="`${scope}:${search}`"
          multiple
          block-node
          default-expand-all
          :tree-data="tree"
          :selected-keys="selectedTreeKeys"
          :disabled="disabled"
          @select="selectNode"
        >
          <template #title="node">
            <span
              class="resource-title"
              :data-permission-resource-key="
                node.referenceTarget ? undefined : node.key
              "
              :title="breadcrumb(node.referenceTarget ?? node.key)"
            >
              <span>{{ node.title }}</span>
              <Tag v-if="node.referenceTarget" class="reference-tag"
                ><IconifyIcon icon="lucide:link-2" aria-hidden="true" />{{
                  $t('action-editor.reference')
                }}</Tag
              >
              <IconifyIcon
                v-if="treeStates.get(node.key)?.partial"
                icon="lucide:minus"
                class="selection-marker"
                :aria-label="$t('action-editor.partialSelection')"
              />
              <IconifyIcon
                v-else-if="treeStates.get(node.key)?.all"
                icon="lucide:check"
                class="selection-marker"
                aria-hidden="true"
              />
            </span>
          </template>
        </Tree>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          :description="
            $t(
              search
                ? 'action-editor.noMatches'
                : effectiveView
                  ? 'permission-display.emptyScope'
                  : 'action-editor.noResources',
            )
          "
        />
      </div>
    </section>
    <section class="resource-config" data-permission-region="button">
      <div class="panel-heading">
        <span>{{
          $t(
            effectiveView
              ? 'permission-display.effectiveResources'
              : 'action-editor.selectedResources',
          )
        }}</span
        ><span class="secondary" role="status" aria-live="polite">{{
          $t(
            effectiveView
              ? 'permission-display.total'
              : 'action-editor.selectedCount',
            { count: resources.length },
          )
        }}</span>
      </div>
      <p v-if="defaultMode && !readOnly" class="secondary default-hint">
        {{ $t('action-editor.defaultPermissionHint') }}
      </p>
      <div
        class="selected-resources"
        role="region"
        :aria-label="
          $t(
            effectiveView
              ? 'permission-display.effectiveResources'
              : 'action-editor.selectedResources',
          )
        "
        tabindex="0"
      >
        <article
          v-for="resource in resources"
          :key="resource.resource_key"
          class="selected-resource"
          :data-resource-key="resource.resource_key"
        >
          <header class="resource-card-header">
            <div class="resource-card-title">
              <h3>{{ label('resources', resource.resource_key) }}</h3>
              <div class="secondary resource-breadcrumb">
                {{ breadcrumb(resource.resource_key) }}
              </div>
            </div>
            <div class="resource-card-actions">
              <Checkbox
                class="select-all"
                :checked="allSelected(resource.resource_key)"
                :indeterminate="
                  resource.bindings.length > 0 &&
                  !allSelected(resource.resource_key)
                "
                :disabled="
                  readOnly ||
                  disabled ||
                  !operationKeys(resource.resource_key).length
                "
                :title="
                  $t(
                    allSelected(resource.resource_key)
                      ? 'action-editor.clearAllResource'
                      : 'action-editor.selectAllResource',
                    { name: label('resources', resource.resource_key) },
                  )
                "
                :aria-label="
                  $t(
                    allSelected(resource.resource_key)
                      ? 'action-editor.clearAllResource'
                      : 'action-editor.selectAllResource',
                    { name: label('resources', resource.resource_key) },
                  )
                "
                @change="
                  toggleAll(resource.resource_key, $event.target.checked)
                "
              />
              <Button
                v-if="!readOnly"
                type="text"
                size="small"
                class="remove-resource"
                :disabled="disabled"
                :aria-label="
                  $t('action-editor.removeResource', {
                    name: label('resources', resource.resource_key),
                  })
                "
                @click="remove(resource.resource_key)"
                ><IconifyIcon icon="lucide:x"
              /></Button>
            </div>
          </header>
          <table
            class="permission-matrix"
            :aria-label="label('resources', resource.resource_key)"
          >
            <colgroup>
              <col class="operation-column" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <span class="matrix-heading"
                    >{{ $t('action-editor.operation')
                    }}<span
                      v-if="!defaultMode && !readOnly"
                      class="secondary multi-select-label"
                      >{{ $t('action-editor.multiSelect') }}</span
                    ></span
                  >
                </th>
                <th scope="col">{{ $t('action-editor.features') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in operationRows(resource.resource_key)"
                :key="row.operation"
                class="operation-row"
                :class="{ 'is-selected': row.selected }"
              >
                <th scope="row" class="operation-control">
                  <span v-if="defaultMode" class="fixed-operation">{{
                    label('operations', row.operation)
                  }}</span>
                  <Checkbox
                    v-else
                    :checked="row.selected && !row.partial"
                    :indeterminate="row.partial"
                    :disabled="disabled || readOnly"
                    @change="
                      toggleOperation(
                        resource.resource_key,
                        row.operation,
                        $event.target.checked,
                      )
                    "
                    >{{ label('operations', row.operation) }}</Checkbox
                  >
                </th>
                <td>
                  <CheckboxGroup
                    v-if="row.features.length"
                    :value="row.selectedFeatures"
                    :disabled="
                      readOnly || disabled || (!assignment && !row.selected)
                    "
                    class="feature-options"
                    :aria-label="`${label('resources', resource.resource_key)} / ${label('operations', row.operation)}`"
                    @change="
                      updateFeatures(
                        resource.resource_key,
                        row.operation,
                        $event,
                      )
                    "
                  >
                    <Checkbox
                      v-for="feature in row.features"
                      :key="feature.value"
                      :value="feature.value"
                      :data-permission-feature-key="
                        row.selectedFeatures.includes(feature.value)
                          ? feature.value
                          : undefined
                      "
                      >{{ feature.label }}</Checkbox
                    >
                  </CheckboxGroup>
                  <span v-else class="secondary">{{
                    $t(
                      effectiveView
                        ? 'action-editor.noSelectedFeatures'
                        : 'action-editor.noFeatures',
                    )
                  }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!resource.bindings.length" class="secondary operation-note">
            {{ $t('action-editor.noSelectedOperations') }}
          </p>
          <p
            v-else-if="!canEnter(resource.resource_key)"
            class="secondary operation-note"
          >
            {{ $t('action-editor.requiresRead') }}
          </p>
        </article>
        <Empty
          v-if="!resources.length"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          :description="
            $t(
              effectiveView
                ? 'permission-display.emptyScope'
                : 'action-editor.selectResource',
            )
          "
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.resource-workspace {
  display: grid;
  grid-template-columns: minmax(300px, 34%) minmax(0, 1fr);
  margin-bottom: 20px;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.resource-directory {
  min-width: 0;
  padding: 18px 14px;
  border-right: 1px solid hsl(var(--border));
}

.panel-heading {
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
  font-weight: 500;
}

.secondary {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.resource-tree-area {
  max-height: min(540px, 55dvh);
  padding-top: 16px;
  overflow: auto;
}

.resource-title {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  align-items: center;
  min-width: 0;
  padding-block: 2px;
  overflow-wrap: anywhere;
}

.reference-tag {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  margin: 0;
  font-size: 11px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
  border-style: dashed;
}

.reference-tag :deep(svg) {
  width: 12px;
  height: 12px;
}

.selection-marker {
  flex: none;
  width: 14px;
  height: 14px;
  color: hsl(var(--primary));
}

.resource-config {
  min-width: 0;
  padding: 18px;
  container: permission-resources / inline-size;
  background: hsl(var(--muted) / 18%);
}

.selected-resources {
  max-height: min(640px, 55dvh);
  padding-right: 4px;
  overflow: auto;
  scrollbar-gutter: stable;
}

.selected-resources:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.default-hint {
  margin: 0 0 18px;
  line-height: 1.7;
}

.selected-resource {
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.selected-resource + .selected-resource {
  margin-top: 16px;
}

.resource-card-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.resource-card-title {
  min-width: 0;
}

h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.resource-breadcrumb {
  margin-top: 4px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.resource-card-actions {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
}

.select-all {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin: 0;
}

.select-all :deep(.ant-checkbox) {
  top: 0;
}

.remove-resource {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
}

.permission-matrix {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

.operation-column {
  width: 112px;
}

.permission-matrix thead th {
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
  text-align: left;
  background: hsl(var(--muted) / 35%);
}

.matrix-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: baseline;
}

.multi-select-label {
  font-size: 11px;
}

.permission-matrix tbody th,
.permission-matrix tbody td {
  padding: 13px 12px;
  vertical-align: top;
  text-align: left;
  border-top: 1px solid hsl(var(--border));
}

.operation-control {
  font-weight: 500;
}

.operation-control :deep(.ant-checkbox-wrapper) {
  margin: 0;
  line-height: 24px;
  white-space: nowrap;
}

.operation-row.is-selected {
  background: hsl(var(--primary) / 3%);
}

.fixed-operation {
  display: inline-block;
  line-height: 24px;
  color: hsl(var(--primary));
}

.feature-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 12px;
  width: 100%;
}

.feature-options :deep(.ant-checkbox-wrapper) {
  align-items: flex-start;
  min-width: 0;
  margin-inline-start: 0;
  font-size: 13px;
  line-height: 24px;
}

.feature-options :deep(.ant-checkbox-wrapper > span:last-child) {
  min-width: 0;
  padding-inline-end: 0;
  overflow-wrap: anywhere;
}

.operation-note {
  padding: 12px 16px;
  margin: 0;
  line-height: 1.7;
  border-top: 1px solid hsl(var(--border));
}

@container permission-resources (max-width: 540px) {
  .feature-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container permission-resources (max-width: 360px) {
  .feature-options {
    grid-template-columns: minmax(0, 1fr);
  }

  .operation-column {
    width: 96px;
  }

  .resource-card-header {
    gap: 8px;
    padding: 12px;
  }
}

@media (max-width: 760px) {
  .resource-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .resource-directory {
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  .resource-tree-area {
    max-height: min(260px, 40dvh);
  }
}

.read-only {
  grid-template-columns: minmax(150px, 30%) minmax(0, 1fr);
}

.read-only .feature-options {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
}

.read-only :deep(.ant-checkbox-wrapper-disabled > span:last-child) {
  color: hsl(var(--foreground));
}

.read-only
  :deep(.ant-checkbox-disabled.ant-checkbox-checked .ant-checkbox-inner) {
  background-color: hsl(var(--primary) / 12%);
  border-color: hsl(var(--primary));
}

.read-only
  :deep(
    .ant-checkbox-disabled.ant-checkbox-checked .ant-checkbox-inner::after
  ) {
  border-color: hsl(var(--primary));
}

@media (max-width: 640px) {
  .read-only {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
