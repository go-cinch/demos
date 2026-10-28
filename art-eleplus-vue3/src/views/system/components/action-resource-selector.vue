<script setup lang="ts">
  import type {
    ActionConfig,
    ActionResourceBinding,
    ResourceCatalog
  } from '@/api/permission-catalog'

  import { computed, ref } from 'vue'

  import { IconifyIcon } from '@/components/catalog/element-adapter'
  import { $te } from '@/locales'

  import {
    Button,
    Checkbox,
    CheckboxGroup,
    Empty,
    Input,
    Tag,
    Tree
  } from '@/components/catalog/element-adapter'

  import { $t } from '@/locales'

  import {
    actionResourceBindings,
    permissionOperations,
    resolveResourceBindings,
    resolveResourceSelectionConfig,
    resourceBreadcrumb
  } from './resource-catalog'
  import {
    orderPermissionResourceKeys,
    referencedOperations,
    referenceResourceBindings,
    resourceReferenceTree
  } from './resource-references'

  const props = defineProps<{
    catalog: ResourceCatalog
    config?: ActionConfig
    scope: string
    disabled?: boolean
    readOnly?: boolean
    defaultMode?: boolean
    assignment?: boolean
    effectiveView?: boolean
  }>()
  const emit = defineEmits<{ 'update:config': [ActionConfig] }>()
  const search = ref('')
  const workspace = ref<HTMLElement>()
  const label = (kind: string, key: string) => ($te(`${kind}.${key}`) ? $t(`${kind}.${key}`) : key)
  const breadcrumb = (key: string) =>
    resourceBreadcrumb(props.catalog, key, (id) => label('resources', id))
  const operationKeys = (key: string) =>
    props.defaultMode
      ? ['read']
      : [
          ...(props.catalog.resources[key]?.permission_scope === '*' ? ['*'] : []),
          ...permissionOperations.filter(
            (operation) => props.catalog.resources[key]?.operations?.[operation]
          )
        ]
  const featureKeys = (binding: ActionResourceBinding) =>
    props.catalog.resources[binding.resource_key]?.operations?.[binding.operation]?.button_keys ??
    []
  const featureOptions = (binding: ActionResourceBinding) =>
    featureKeys(binding).map((value: any) => ({ value, label: label('features', value) }))
  const bindings = computed<ActionResourceBinding[]>(() => {
    if (!props.defaultMode) return actionResourceBindings(props.config)
    return (props.config?.resource_keys ?? []).map((resource_key) => ({
      resource_key,
      operation: 'read',
      feature_keys:
        props.config?.feature_keys == null
          ? (props.catalog.resources[resource_key]?.operations?.read?.button_keys ?? [])
          : props.config.feature_keys.filter((key) =>
              props.catalog.resources[resource_key]?.operations?.read?.button_keys.includes(key)
            )
    }))
  })
  const pendingResources = ref<string[]>([])
  const resources = computed(() => {
    const available = [
      ...bindings.value.map((binding) => binding.resource_key),
      ...pendingResources.value
    ]
    return orderPermissionResourceKeys(props.catalog, props.scope, available).map(
      (resource_key) => ({
        resource_key,
        bindings: bindings.value.filter((binding) => binding.resource_key === resource_key)
      })
    )
  })
  const selectedOperations = (key: string) =>
    bindings.value
      .filter((binding) => binding.resource_key === key)
      .map((binding) => binding.operation)
  const canEnter = (key: string) =>
    bindings.value.some(
      (binding) =>
        binding.resource_key === key &&
        (binding.operation === '*' ||
          props.catalog.resources[key]?.operations?.[binding.operation]?.entry_keys.length)
    )
  function operationRows(key: string) {
    return operationKeys(key)
      .map((operation) => {
        const binding = bindings.value.find(
          (item) => item.resource_key === key && item.operation === operation
        )
        const draft = binding ?? { resource_key: key, operation, feature_keys: [] }
        return {
          operation,
          selected: Boolean(binding),
          partial: Boolean(
            props.assignment &&
              binding &&
              featureKeys(draft).length &&
              (binding.feature_keys ?? featureKeys(draft)).length < featureKeys(draft).length
          ),
          features: featureOptions(draft).filter(
            (feature) =>
              !props.effectiveView ||
              (binding && (binding.feature_keys ?? featureKeys(binding)).includes(feature.value))
          ),
          selectedFeatures: binding ? (binding.feature_keys ?? featureKeys(binding)) : []
        }
      })
      .filter((row) => !props.effectiveView || row.selected)
  }
  function toggleOperation(key: string, operation: string, checked: boolean) {
    if (props.assignment && checked) {
      const next = bindings.value.filter(
        (binding) => binding.resource_key !== key || binding.operation !== operation
      )
      publish([
        ...next,
        {
          resource_key: key,
          operation,
          feature_keys: [
            ...(props.catalog.resources[key]?.operations?.[operation]?.button_keys ?? [])
          ]
        }
      ])
      return
    }
    const current = selectedOperations(key)
    updateOperations(
      key,
      checked ? [...current, operation] : current.filter((item) => item !== operation)
    )
  }
  function allSelected(key: string) {
    const operations = operationKeys(key)
    return (
      operations.length > 0 &&
      operations.every((operation) => {
        const binding = bindings.value.find(
          (item) => item.resource_key === key && item.operation === operation
        )
        return (
          binding &&
          featureKeys(binding).every((feature) =>
            (binding.feature_keys ?? featureKeys(binding)).includes(feature)
          )
        )
      })
    )
  }
  // Keep the full catalog visible; grants determine selection, never visibility.
  const tree = computed(() =>
    resourceReferenceTree(props.catalog, props.scope, search.value, (key) =>
      label('resources', key)
    )
  )

  function resourceSelections(key: string, owner?: string) {
    const allowed = owner
      ? referencedOperations(props.catalog, owner, key)
      : [...permissionOperations, '*']
    return new Map(
      [...referenceResourceBindings(props.catalog, key, allowed)]
        .map(
          ([resource, operations]) =>
            [
              resource,
              operations.filter((operation) => operationKeys(resource).includes(operation))
            ] as const
        )
        .filter(([, operations]) => operations.length)
    )
  }
  function rowState(key: string, owner?: string) {
    const selections = [...resourceSelections(key, owner)]
    const hasOperation = (resource: string, operation: string) =>
      bindings.value.some(
        (binding) => binding.resource_key === resource && binding.operation === operation
      )
    const selected = selections.map(([resource, operations]) =>
      owner
        ? operations.every((operation) => hasOperation(resource, operation))
        : pendingResources.value.includes(resource) ||
          operations.some((operation) => hasOperation(resource, operation))
    )
    const all = selected.length > 0 && selected.every(Boolean)
    const partial =
      !all &&
      selections.some(
        ([resource, operations]) =>
          pendingResources.value.includes(resource) ||
          operations.some((operation) => hasOperation(resource, operation))
      )
    return { all, partial }
  }

  const selectedTreeKeys = computed(() => {
    const keys: string[] = []
    const visit = (nodes: typeof tree.value) => {
      for (const node of nodes) {
        if (rowState(node.referenceTarget ?? node.key, node.referenceOwner).all) keys.push(node.key)
        visit(node.children)
      }
    }
    visit(tree.value)
    return keys
  })
  function publish(next: ActionResourceBinding[]) {
    if (props.readOnly || props.disabled) return
    const keys = [...new Set(next.map((binding) => binding.resource_key))]
    const features = [
      ...new Set(next.flatMap((binding) => binding.feature_keys ?? featureKeys(binding)))
    ]
    try {
      emit(
        'update:config',
        props.defaultMode
          ? resolveResourceSelectionConfig(props.catalog, props.scope, keys, features)
          : resolveResourceBindings(props.catalog, props.scope, next)
      )
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
              endpoints: []
            }
          : { bindings: next, ui: [], endpoints: [] }
      )
    }
  }
  function toggle(key: string, owner?: string) {
    if (props.disabled) return
    const selections = resourceSelections(key, owner)
    if (!selections.size) return
    const removing = rowState(key, owner).all
    const next = bindings.value.filter(
      (binding) => !removing || !selections.get(binding.resource_key)?.includes(binding.operation)
    )
    if (removing)
      pendingResources.value = pendingResources.value.filter((item) => !selections.has(item))
    else
      for (const [resource_key, operations] of selections) {
        if (
          !owner &&
          next.some(
            (binding) =>
              binding.resource_key === resource_key && operations.includes(binding.operation)
          )
        )
          continue
        // Canonical rows start with one operation. A linked row selects exactly
        // the operations configured on that reference.
        const selected = owner ? operations : operations.slice(0, 1)
        for (const operation of selected) {
          if (
            next.some(
              (binding) => binding.resource_key === resource_key && binding.operation === operation
            )
          )
            continue
          next.push({
            resource_key,
            operation,
            feature_keys: [
              ...(props.catalog.resources[resource_key]?.operations?.[operation]?.button_keys ?? [])
            ]
          })
        }
      }
    publish(next)
  }
  function selectNode(_keys: unknown, info: { node: { key: number | string } }) {
    const key = String(info.node.key)
    const find = (nodes: typeof tree.value): (typeof tree.value)[number] | undefined => {
      for (const node of nodes) {
        if (node.key === key) return node
        const child = find(node.children)
        if (child) return child
      }
    }
    const node = find(tree.value)
    if (props.readOnly) {
      const target = node?.referenceTarget ?? key
      const card = [
        ...(workspace.value?.querySelectorAll<HTMLElement>('[data-resource-key]') ?? [])
      ].find((element) => element.dataset.resourceKey === target)
      card?.scrollIntoView({ block: 'nearest' })
      return
    }
    if (node) toggle(node.referenceTarget ?? node.key, node.referenceOwner)
  }
  function remove(key: string) {
    pendingResources.value = pendingResources.value.filter((item) => item !== key)
    publish(bindings.value.filter((binding) => binding.resource_key !== key))
  }
  function updateOperations(key: string, values: (boolean | number | string)[]) {
    const operations = operationKeys(key).filter((operation) =>
      values.map(String).includes(operation)
    )
    const previous = bindings.value.filter((binding) => binding.resource_key === key)
    const next = operations.map(
      (operation) =>
        previous.find((binding) => binding.operation === operation) ?? {
          resource_key: key,
          operation,
          feature_keys: [
            ...(props.catalog.resources[key]?.operations?.[operation]?.button_keys ?? [])
          ]
        }
    )
    pendingResources.value = operations.length
      ? pendingResources.value.filter((item) => item !== key)
      : [...new Set([...pendingResources.value, key])]
    replaceResourceBindings(key, next)
  }
  function replaceResourceBindings(key: string, replacements: ActionResourceBinding[]) {
    const order = [...new Set([...bindings.value.map((binding) => binding.resource_key), key])]
    publish(
      order.flatMap((resource) =>
        resource === key
          ? replacements
          : bindings.value.filter((binding) => binding.resource_key === resource)
      )
    )
  }
  function selectAll(key: string) {
    pendingResources.value = pendingResources.value.filter((item) => item !== key)
    replaceResourceBindings(
      key,
      operationKeys(key).map((operation) => ({
        resource_key: key,
        operation,
        feature_keys: [
          ...(props.catalog.resources[key]?.operations?.[operation]?.button_keys ?? [])
        ]
      }))
    )
  }
  function toggleAll(key: string, checked: boolean) {
    if (checked) selectAll(key)
    else updateOperations(key, [])
  }
  function updateFeatures(key: string, operation: string, values: (boolean | number | string)[]) {
    if (props.assignment) {
      const next = bindings.value.filter(
        (binding) => binding.resource_key !== key || binding.operation !== operation
      )
      if (values.length)
        next.push({ resource_key: key, operation, feature_keys: values.map(String) })
      pendingResources.value = [...new Set([...pendingResources.value, key])]
      publish(next)
      return
    }
    publish(
      bindings.value.map((binding) =>
        binding.resource_key === key && binding.operation === operation
          ? { ...binding, feature_keys: values.map(String) }
          : binding
      )
    )
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
      <div class="panel-heading"
        ><span>{{ $t('action-editor.page') }}</span
        ><span class="secondary">{{ label('scopes', scope) }}</span></div
      >
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
              :data-permission-resource-key="node.referenceTarget ? undefined : node.key"
              :title="breadcrumb(node.referenceTarget ?? node.key)"
            >
              <span>{{ node.title }}</span>
              <Tag v-if="node.referenceTarget" class="reference-tag"
                ><IconifyIcon icon="lucide:link-2" aria-hidden="true" />{{
                  $t('action-editor.reference')
                }}</Tag
              >
              <IconifyIcon
                v-if="rowState(node.referenceTarget ?? node.key, node.referenceOwner).partial"
                icon="lucide:minus"
                class="selection-marker"
                :aria-label="$t('action-editor.partialSelection')"
              />
              <IconifyIcon
                v-else-if="rowState(node.referenceTarget ?? node.key, node.referenceOwner).all"
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
                  : 'action-editor.noResources'
            )
          "
        />
      </div>
    </section>
    <section
      class="resource-config"
      data-permission-region="button"
      :aria-label="$t('action-editor.selectedResources')"
    >
      <div class="panel-heading"
        ><span>{{
          $t(
            effectiveView
              ? 'permission-display.effectiveResources'
              : 'action-editor.selectedResources'
          )
        }}</span
        ><span class="secondary" role="status" aria-live="polite">{{
          $t(effectiveView ? 'permission-display.total' : 'action-editor.selectedCount', {
            count: resources.length
          })
        }}</span></div
      >
      <p v-if="defaultMode && !readOnly" class="secondary default-hint">{{
        $t('action-editor.defaultPermissionHint')
      }}</p>
      <div class="selected-resources">
        <article
          v-for="resource in resources"
          :key="resource.resource_key"
          class="selected-resource"
          :data-resource-key="resource.resource_key"
        >
          <header class="resource-card-header">
            <div class="resource-card-title">
              <h3>{{ label('resources', resource.resource_key) }}</h3>
              <div class="secondary resource-breadcrumb">{{
                breadcrumb(resource.resource_key)
              }}</div>
            </div>
            <div class="resource-card-actions">
              <Checkbox
                class="select-all"
                :checked="allSelected(resource.resource_key)"
                :indeterminate="resource.bindings.length > 0 && !allSelected(resource.resource_key)"
                :disabled="readOnly || disabled || !operationKeys(resource.resource_key).length"
                :title="
                  $t(
                    allSelected(resource.resource_key)
                      ? 'action-editor.clearAllResource'
                      : 'action-editor.selectAllResource',
                    { name: label('resources', resource.resource_key) }
                  )
                "
                :aria-label="
                  $t(
                    allSelected(resource.resource_key)
                      ? 'action-editor.clearAllResource'
                      : 'action-editor.selectAllResource',
                    { name: label('resources', resource.resource_key) }
                  )
                "
                @change="toggleAll(resource.resource_key, $event.target.checked)"
              />
              <Button
                v-if="!readOnly"
                type="text"
                size="small"
                class="remove-resource"
                :disabled="disabled"
                :aria-label="
                  $t('action-editor.removeResource', {
                    name: label('resources', resource.resource_key)
                  })
                "
                @click="remove(resource.resource_key)"
                ><IconifyIcon icon="lucide:x"
              /></Button>
            </div>
          </header>
          <table class="permission-matrix" :aria-label="label('resources', resource.resource_key)">
            <colgroup><col class="operation-column" /><col /></colgroup>
            <thead>
              <tr>
                <th scope="col"
                  ><span class="matrix-heading"
                    >{{ $t('action-editor.operation')
                    }}<span v-if="!defaultMode && !readOnly" class="secondary multi-select-label">{{
                      $t('action-editor.multiSelect')
                    }}</span></span
                  ></th
                >
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
                      toggleOperation(resource.resource_key, row.operation, $event.target.checked)
                    "
                    >{{ label('operations', row.operation) }}</Checkbox
                  >
                </th>
                <td>
                  <CheckboxGroup
                    v-if="row.features.length"
                    :value="row.selectedFeatures"
                    :disabled="readOnly || disabled || (!assignment && !row.selected)"
                    class="feature-options"
                    :aria-label="`${label('resources', resource.resource_key)} / ${label('operations', row.operation)}`"
                    @change="updateFeatures(resource.resource_key, row.operation, $event)"
                  >
                    <Checkbox
                      v-for="feature in row.features"
                      :key="feature.value"
                      :value="feature.value"
                      :data-permission-feature-key="
                        row.selectedFeatures.includes(feature.value) ? feature.value : undefined
                      "
                      >{{ feature.label }}</Checkbox
                    >
                  </CheckboxGroup>
                  <span v-else class="secondary">{{
                    $t(
                      effectiveView
                        ? 'action-editor.noSelectedFeatures'
                        : 'action-editor.noFeatures'
                    )
                  }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!resource.bindings.length" class="secondary operation-note">{{
            $t('action-editor.noSelectedOperations')
          }}</p>
          <p v-else-if="!canEnter(resource.resource_key)" class="secondary operation-note">{{
            $t('action-editor.requiresRead')
          }}</p>
        </article>
        <Empty
          v-if="!resources.length"
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          :description="
            $t(effectiveView ? 'permission-display.emptyScope' : 'action-editor.selectResource')
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
    border: 1px solid var(--el-border-color);
    border-radius: var(--custom-radius);
  }
  .resource-directory {
    min-width: 0;
    padding: 18px 14px;
    border-right: 1px solid var(--el-border-color);
  }
  .panel-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 14px;
    font-weight: 500;
  }
  .secondary {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 400;
  }
  .resource-tree-area {
    padding-top: 16px;
    max-height: 540px;
    overflow: auto;
  }
  .resource-tree-area :deep(.el-tree-node__content) {
    height: auto;
    min-height: 32px;
    align-items: flex-start;
  }
  .resource-tree-area :deep(.el-tree-node__expand-icon) {
    flex: none;
    margin-block-start: 4px;
  }
  .resource-title {
    display: flex;
    flex: 1;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 6px;
    min-width: 0;
    overflow-wrap: anywhere;
    padding-block: 5px;
    padding-inline-end: 6px;
    line-height: 22px;
    white-space: normal;
  }
  .reference-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin: 0;
    font-size: 11px;
    line-height: 18px;
    border-style: dashed;
    color: var(--el-text-color-secondary);
  }
  .reference-tag {
    flex: none;
    height: auto;
    white-space: nowrap;
  }
  .reference-tag :deep(.el-tag__content) {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }
  .reference-tag :deep(svg) {
    width: 12px;
    height: 12px;
  }
  .selection-marker {
    flex: none;
    color: var(--el-color-primary);
    width: 14px;
    height: 14px;
  }
  .resource-config {
    min-width: 0;
    padding: 18px;
    background: color-mix(in srgb, var(--el-fill-color-light) 18%, transparent);
    container: permission-resources / inline-size;
  }
  .selected-resources {
    max-height: 640px;
    overflow: auto;
    overscroll-behavior: contain;
    padding-right: 4px;
  }
  .default-hint {
    margin: 0 0 18px;
    line-height: 1.7;
  }
  .selected-resource {
    overflow: hidden;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color);
    border-radius: var(--custom-radius);
  }
  .selected-resource + .selected-resource {
    margin-top: 16px;
  }
  .resource-card-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 16px;
    padding: 16px;
    border-bottom: 1px solid var(--el-border-color);
  }
  .resource-card-title {
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 16px;
    line-height: 1.5;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .resource-breadcrumb {
    margin-top: 4px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .resource-card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }
  .select-all {
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    margin: 0;
  }
  .select-all :deep(.el-checkbox) {
    top: 0;
  }
  .remove-resource {
    display: inline-grid;
    width: 30px;
    height: 30px;
    place-items: center;
    padding: 0;
  }
  .permission-matrix {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .operation-column {
    width: 112px;
  }
  .permission-matrix thead th {
    padding: 10px 12px;
    background: color-mix(in srgb, var(--el-fill-color-light) 35%, transparent);
    color: var(--el-text-color-secondary);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.6;
    text-align: left;
  }
  .matrix-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px;
  }
  .multi-select-label {
    font-size: 11px;
  }
  .permission-matrix tbody th,
  .permission-matrix tbody td {
    padding: 13px 12px;
    border-top: 1px solid var(--el-border-color);
    text-align: left;
    vertical-align: top;
  }
  .operation-control {
    font-weight: 500;
  }
  .operation-control :deep(.el-checkbox) {
    margin: 0;
    white-space: nowrap;
    line-height: 24px;
  }
  .operation-row.is-selected {
    background: color-mix(in srgb, var(--el-color-primary) 3%, transparent);
  }
  .fixed-operation {
    display: inline-block;
    line-height: 24px;
    color: var(--el-color-primary);
  }
  .feature-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px 12px;
    width: 100%;
  }
  .feature-options :deep(.el-checkbox) {
    align-items: flex-start;
    min-width: 0;
    margin-inline-start: 0;
    font-size: 13px;
    line-height: 24px;
  }
  .feature-options :deep(.el-checkbox > span:last-child) {
    min-width: 0;
    padding-inline-end: 0;
    overflow-wrap: anywhere;
  }
  .operation-note {
    margin: 0;
    padding: 12px 16px;
    border-top: 1px solid var(--el-border-color);
    line-height: 1.7;
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
      border-bottom: 1px solid var(--el-border-color);
    }
    .resource-tree-area {
      max-height: 260px;
    }
  }
  .read-only {
    grid-template-columns: minmax(260px, 40%) minmax(0, 1fr);
  }
  .read-only .feature-options {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
  }
  .read-only :deep(.el-checkbox-disabled > span:last-child) {
    color: var(--el-text-color-primary);
  }
  .read-only :deep(.el-checkbox-disabled.el-checkbox-checked .el-checkbox-inner) {
    border-color: var(--el-color-primary);
    background-color: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
  }
  .read-only :deep(.el-checkbox-disabled.el-checkbox-checked .el-checkbox-inner::after) {
    border-color: var(--el-color-primary);
  }
  @media (max-width: 640px) {
    .read-only {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
