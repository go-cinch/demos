<script setup lang="ts">
  import type { SystemSummaryGroup } from '@/utils/admin/catalog-insights'

  import { computed, ref } from 'vue'

  import { IconifyIcon } from '@/components/catalog/element-adapter'

  import { Alert, Button } from '@/components/catalog/element-adapter'

  import { vSkeleton } from '@/directives/skeleton'
  import { $t, catalogLabel, refreshI18nCatalog } from '@/locales'

  import { applyGroupOrder, savePermissionGroupOrder } from './action-groups'

  const props = withDefaults(
    defineProps<{
      groups: SystemSummaryGroup[]
      selected: string[]
      total?: number
      editable: boolean
      loading: boolean
      disabled?: boolean
      queryEnabled?: boolean
      showDelete?: boolean
      showCreate?: boolean
      allowReorder?: boolean
      groupLabel?: (word: string) => string
      saveOrder?: (order: string[]) => Promise<void> | void
    }>(),
    {
      showDelete: true,
      queryEnabled: true,
      total: undefined,
      groupLabel: undefined,
      saveOrder: undefined
    }
  )
  const emit = defineEmits<{ select: [string?]; create: []; remove: [string] }>()
  const saving = ref(false)
  const failed = ref(false)
  const draftOrder = ref<string[]>()
  const dragged = ref<string>()
  const target = ref<{ key: string; edge: 'after' | 'before' }>()
  let ignoreClick = false
  const canDrag = computed(
    () =>
      props.editable &&
      props.allowReorder !== false &&
      !props.disabled &&
      !props.loading &&
      !saving.value
  )
  const groups = computed(() => applyGroupOrder(props.groups, draftOrder.value ?? []))
  const groupName = (key: string) =>
    props.groupLabel
      ? props.groupLabel(key)
      : key
        ? catalogLabel('groups', key)
        : $t('system-insights.ungrouped')

  function select(key?: string) {
    if (!ignoreClick && !props.disabled && props.queryEnabled !== false) emit('select', key)
  }
  function startDrag(event: DragEvent, key: string) {
    if (!canDrag.value || !event.dataTransfer) {
      event.preventDefault()
      return
    }
    dragged.value = key
    ignoreClick = true
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', key)
  }
  function overGroup(event: DragEvent, key: string) {
    if (!canDrag.value || dragged.value === undefined || key === dragged.value) {
      target.value = undefined
      return
    }
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const row = event.currentTarget as HTMLElement
    const bounds = row.getBoundingClientRect()
    target.value = {
      key,
      edge: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
    }
  }
  function endDrag() {
    dragged.value = undefined
    target.value = undefined
    window.setTimeout(() => {
      ignoreClick = false
    }, 0)
  }
  async function commit(order: string[]) {
    if (!canDrag.value || order.every((key, index) => key === groups.value[index]?.name)) return
    draftOrder.value = order
    saving.value = true
    failed.value = false
    try {
      await (props.saveOrder ? props.saveOrder(order) : savePermissionGroupOrder(order))
    } catch {
      failed.value = true
      await refreshI18nCatalog()
    } finally {
      saving.value = false
      draftOrder.value = undefined
    }
  }
  function dropGroup(event: DragEvent) {
    event.preventDefault()
    if (dragged.value === undefined || !target.value || !canDrag.value) return
    const order = groups.value.map((group) => group.name).filter((key) => key !== dragged.value)
    const index = order.indexOf(target.value.key)
    if (index < 0) return
    order.splice(index + (target.value.edge === 'after' ? 1 : 0), 0, dragged.value)
    void commit(order)
    endDrag()
  }
  function moveGroup(key: string, direction: number) {
    const order = groups.value.map((group) => group.name)
    const index = order.indexOf(key)
    const next = index + direction
    if (index < 0 || next < 0 || next >= order.length) return
    ;[order[index], order[next]] = [order[next]!, order[index]!]
    void commit(order)
  }
</script>

<template>
  <nav
    v-skeleton="loading"
    class="system-group-nav"
    :aria-label="$t('system-insights.businessGroups')"
    :aria-busy="saving"
    data-testid="management-permission-groups"
  >
    <div class="system-group-heading">
      <h2>{{ $t('system-insights.businessGroups') }}</h2>
      <IconifyIcon
        v-if="saving"
        icon="lucide:loader-circle"
        class="saving-icon"
        role="status"
        :aria-label="$t('action-editor.groupOrderSaving')"
      />
      <Button
        v-if="editable && showCreate !== false"
        type="text"
        size="small"
        class="system-group-add"
        data-permission-key="admin:btn:system:action:create-group"
        :disabled="saving || disabled"
        :aria-label="$t('action-editor.createGroup')"
        @click="emit('create')"
        ><IconifyIcon icon="lucide:plus" />{{ $t('system.common.create') }}</Button
      >
    </div>
    <button
      type="button"
      class="group-row all-groups"
      :disabled="disabled || queryEnabled === false"
      :aria-pressed="selected.length === 0"
      @click="select()"
    >
      <span class="group-label">{{ $t('system-insights.allGroups') }}</span
      ><b v-if="total !== undefined">{{ total }}</b>
    </button>
    <div class="group-items" data-permission-key="admin:btn:system:action:reorder-groups">
      <div
        v-for="group in groups"
        :key="group.name"
        class="group-row"
        data-testid="permission-group-row"
        :class="{
          'is-selected': selected.includes(group.name),
          'is-dragging': dragged === group.name,
          'drop-before': target?.key === group.name && target.edge === 'before',
          'drop-after': target?.key === group.name && target.edge === 'after'
        }"
        :draggable="canDrag"
        @dragstart="startDrag($event, group.name)"
        @dragover="overGroup($event, group.name)"
        @drop="dropGroup"
        @dragend="endDrag"
      >
        <button
          type="button"
          class="group-select"
          :disabled="disabled || queryEnabled === false"
          :aria-pressed="selected.includes(group.name)"
          :aria-label="$t('system-insights.selectGroup', { name: groupName(group.name) })"
          :title="
            editable ? $t('action-editor.reorderGroup', { name: groupName(group.name) }) : undefined
          "
          :aria-keyshortcuts="editable ? 'Alt+ArrowUp Alt+ArrowDown' : undefined"
          @click="select(group.name)"
          @keydown.alt.up.prevent="moveGroup(group.name, -1)"
          @keydown.alt.down.prevent="moveGroup(group.name, 1)"
        >
          <IconifyIcon
            v-if="editable"
            icon="lucide:grip-vertical"
            class="drag-handle"
            aria-hidden="true"
          />
          <span class="group-label">{{ groupName(group.name) }}</span
          ><b>{{ group.count }}</b>
        </button>
        <Button
          v-if="editable && showDelete !== false && group.count === 0"
          type="text"
          danger
          size="small"
          class="group-actions"
          data-permission-key="admin:btn:system:action:delete-group"
          :disabled="disabled || saving || loading"
          :title="$t('action-editor.deleteGroupName', { name: groupName(group.name) })"
          :aria-label="$t('action-editor.deleteGroupName', { name: groupName(group.name) })"
          @click.stop="emit('remove', group.name)"
          ><IconifyIcon icon="lucide:trash-2"
        /></Button>
      </div>
    </div>
    <Alert
      v-if="failed"
      class="order-error"
      type="error"
      show-icon
      closable
      :message="$t('action-editor.groupOrderFailed')"
      @close="failed = false"
    />
  </nav>
</template>

<style scoped>
  .system-group-nav {
    min-width: 0;
    padding: 12px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    align-self: start;
  }
  .system-group-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    padding-left: 9px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--el-text-color-secondary);
  }
  .system-group-add {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 6px;
  }
  .group-items {
    max-height: clamp(360px, 52vh, 620px);
    overflow: auto;
    scrollbar-gutter: stable;
    padding-block: 3px;
  }
  .group-row {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 44px;
    padding: 0;
    border: 0;
    border-radius: calc(var(--el-border-radius-base) * 0.75);
    background: transparent;
    font-size: 12px;
    line-height: 1.6;
    text-align: left;
  }
  .all-groups {
    padding: 8px 9px;
    cursor: pointer;
  }
  .group-label {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .group-select {
    display: flex;
    flex: 1;
    align-self: stretch;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 44px;
    padding: 8px 9px;
    border: 0;
    border-radius: inherit;
    text-align: left;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
  .group-select:disabled,
  .all-groups:disabled {
    cursor: not-allowed;
  }
  .group-actions {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    margin-right: 9px;
    padding: 0;
  }
  .group-actions :deep(svg) {
    width: 14px;
    height: 14px;
  }
  .group-row b {
    flex: none;
    padding: 0 5px;
    border-radius: calc(var(--el-border-radius-base) * 0.5);
    background: var(--el-fill-color-light);
    font-size: 11px;
    font-weight: 500;
  }
  .group-row:has(.group-select:enabled):hover,
  .all-groups:enabled:hover,
  .group-row[aria-pressed='true'],
  .group-row.is-selected {
    color: var(--el-color-primary);
    background: hsl(var(--primary) / 0.08);
  }
  .group-row:focus-visible,
  .group-select:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: -2px;
  }
  .drag-handle {
    flex: none;
    width: 12px;
    height: 16px;
    color: var(--el-text-color-secondary);
    cursor: grab;
    opacity: 0.5;
  }
  .group-row:hover .drag-handle,
  .group-row:focus-visible .drag-handle {
    opacity: 1;
  }
  .group-row.is-dragging {
    opacity: 0.4;
  }
  .drop-before::before,
  .drop-after::after {
    position: absolute;
    left: 4px;
    right: 4px;
    height: 2px;
    background: var(--el-color-primary);
    content: '';
    pointer-events: none;
  }
  .drop-before::before {
    top: 0;
  }
  .drop-after::after {
    bottom: 0;
  }
  .order-error {
    margin-top: 10px;
    font-size: 12px;
  }
  .saving-icon {
    width: 14px;
    height: 14px;
    color: var(--el-color-primary);
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .saving-icon {
      animation: none;
    }
  }
  @media (max-width: 1000px) {
    .system-group-nav {
      padding: 8px;
    }
  }
  @media (max-width: 700px) {
    .group-items {
      max-height: 240px;
    }
  }
</style>
