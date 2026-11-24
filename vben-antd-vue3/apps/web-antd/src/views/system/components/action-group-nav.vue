<script setup lang="ts">
import type { SystemSummaryGroup } from '#/api/system/insights';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Button } from 'ant-design-vue';

import { vSkeleton } from '#/directives/skeleton';
import { $t, catalogLabel } from '#/locales';
import { requiredEntry } from '#/utils/required-entry';

import { applyGroupOrder, savePermissionGroupOrder } from './action-groups';

const props = withDefaults(
  defineProps<{
    groups: SystemSummaryGroup[];
    selected: string[];
    total?: number;
    countsUnavailable?: boolean;
    editable: boolean;
    loading: boolean;
    disabled?: boolean;
    showEdit?: boolean;
    showDelete?: boolean;
    showCreate?: boolean;
    allowReorder?: boolean;
    groupLabel?: (word: string) => string;
    saveOrder?: (order: string[]) => Promise<void> | void;
  }>(),
  {
    allowReorder: true,
    showCreate: true,
    showDelete: true,
    showEdit: false,
    total: undefined,
    groupLabel: undefined,
    saveOrder: undefined,
  },
);
const emit = defineEmits<{
  select: [string?];
  create: [];
  edit: [string];
  remove: [string];
}>();
const saving = ref(false);
const failed = ref(false);
const draftOrder = ref<string[]>();
const dragged = ref<string>();
const target = ref<{ key: string; edge: 'after' | 'before' }>();
let ignoreClick = false;
const canReorder = computed(() => props.editable && props.allowReorder);
const canDrag = computed(
  () => canReorder.value && !props.disabled && !props.loading && !saving.value,
);
const groups = computed(() =>
  applyGroupOrder(props.groups, draftOrder.value ?? []),
);
const groupName = (key: string) => {
  if (props.groupLabel) {
    return props.groupLabel(key);
  }
  if (key) {
    return catalogLabel('groups', key);
  }
  return $t('system-insights.ungrouped');
};

function select(key?: string) {
  if (!ignoreClick) emit('select', key);
}
function startDrag(event: DragEvent, key: string) {
  if (!canDrag.value || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  dragged.value = key;
  ignoreClick = true;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', key);
}
function overGroup(event: DragEvent, key: string) {
  if (!canDrag.value || dragged.value === undefined || key === dragged.value) {
    target.value = undefined;
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const row = event.currentTarget as HTMLElement;
  const bounds = row.getBoundingClientRect();
  target.value = {
    key,
    edge: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
  };
}
function endDrag() {
  dragged.value = undefined;
  target.value = undefined;
  window.setTimeout(() => {
    ignoreClick = false;
  }, 0);
}
async function commit(order: string[]) {
  if (
    !canDrag.value ||
    order.every((key, index) => key === groups.value[index]?.name)
  )
    return;
  draftOrder.value = order;
  saving.value = true;
  failed.value = false;
  try {
    await (props.saveOrder
      ? props.saveOrder(order)
      : savePermissionGroupOrder(order));
  } catch {
    failed.value = true;
  } finally {
    saving.value = false;
    draftOrder.value = undefined;
  }
}
function dropGroup(event: DragEvent) {
  event.preventDefault();
  if (dragged.value === undefined || !target.value || !canDrag.value) return;
  const order = groups.value
    .map((group) => group.name)
    .filter((key) => key !== dragged.value);
  const index = order.indexOf(target.value.key);
  if (index === -1) return;
  order.splice(
    index + (target.value.edge === 'after' ? 1 : 0),
    0,
    dragged.value,
  );
  void commit(order);
  endDrag();
}
function moveGroup(event: KeyboardEvent, key: string, direction: number) {
  if (!canDrag.value) return;
  event.preventDefault();
  const order = groups.value.map((group) => group.name);
  const index = order.indexOf(key);
  const next = index + direction;
  if (index === -1 || next < 0 || next >= order.length) return;
  [order[index], order[next]] = [
    requiredEntry(order[next], 'permission group'),
    requiredEntry(order[index], 'permission group'),
  ];
  void commit(order);
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
        v-if="editable && showCreate"
        type="text"
        size="small"
        class="system-group-add"
        data-permission-key="admin:btn:system:action:create-group"
        :disabled="saving || disabled"
        :aria-label="$t('action-editor.createGroup')"
        @click="emit('create')"
        ><IconifyIcon icon="lucide:plus" />{{
          $t('system.common.create')
        }}</Button
      >
    </div>
    <button
      type="button"
      class="group-row all-groups"
      :disabled="disabled"
      :aria-pressed="selected.length === 0"
      @click="select()"
    >
      <span class="group-label">{{ $t('system-insights.allGroups') }}</span
      ><b v-if="countsUnavailable || total !== undefined">{{
        countsUnavailable ? '—' : total
      }}</b>
    </button>
    <div
      class="group-items"
      data-permission-key="admin:btn:system:action:reorder-groups"
    >
      <div
        v-for="group in groups"
        :key="group.name"
        class="group-row"
        data-testid="permission-group-row"
        :class="{
          'is-selected': selected.includes(group.name),
          'is-dragging': dragged === group.name,
          'drop-before': target?.key === group.name && target.edge === 'before',
          'drop-after': target?.key === group.name && target.edge === 'after',
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
          :disabled="disabled"
          :aria-pressed="selected.includes(group.name)"
          :aria-label="
            $t('system-insights.selectGroup', { name: groupName(group.name) })
          "
          :title="
            canReorder
              ? $t('action-editor.reorderGroup', {
                  name: groupName(group.name),
                })
              : undefined
          "
          :aria-keyshortcuts="
            canReorder ? 'Alt+ArrowUp Alt+ArrowDown' : undefined
          "
          @click="select(group.name)"
          @keydown.alt.up="moveGroup($event, group.name, -1)"
          @keydown.alt.down="moveGroup($event, group.name, 1)"
        >
          <IconifyIcon
            v-if="canReorder"
            icon="lucide:grip-vertical"
            class="drag-handle"
            aria-hidden="true"
          />
          <span class="group-label">{{ groupName(group.name) }}</span
          ><b>{{ countsUnavailable ? '—' : group.count }}</b>
        </button>
        <Button
          v-if="editable && showEdit"
          type="text"
          size="small"
          data-permission-key="admin:btn:system:action:edit-group"
          :disabled="disabled || saving || loading"
          :aria-label="
            $t('action-editor.editGroupName', { name: groupName(group.name) })
          "
          :title="
            $t('action-editor.editGroupName', { name: groupName(group.name) })
          "
          @click.stop="emit('edit', group.name)"
          ><IconifyIcon icon="lucide:pencil"
        /></Button>
        <Button
          v-if="editable && showDelete !== false && group.count === 0"
          type="text"
          danger
          size="small"
          class="group-actions"
          data-permission-key="admin:btn:system:action:delete-group"
          :disabled="disabled || saving || loading"
          :title="
            $t('action-editor.deleteGroupName', { name: groupName(group.name) })
          "
          :aria-label="
            $t('action-editor.deleteGroupName', { name: groupName(group.name) })
          "
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
  align-self: start;
  min-width: 0;
  padding: 12px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.system-group-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-left: 9px;
  margin-bottom: 8px;
}

h2 {
  flex: 1;
  margin: 0;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}

.system-group-add {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  height: 30px;
  padding: 0 6px;
}

.group-items {
  max-height: clamp(360px, 52vh, 620px);
  padding-block: 3px;
  overflow: auto;
  scrollbar-gutter: stable;
}

.group-row {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0;
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius) * 0.75);
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
  gap: 6px;
  align-items: center;
  align-self: stretch;
  min-width: 0;
  min-height: 44px;
  padding: 8px 9px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: inherit;
}

.group-select:disabled,
.all-groups:disabled {
  cursor: not-allowed;
}

.group-actions {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  margin-right: 9px;
}

.group-actions :deep(svg) {
  width: 14px;
  height: 14px;
}

.group-row b {
  flex: none;
  padding: 0 5px;
  font-size: 11px;
  font-weight: 500;
  background: hsl(var(--muted));
  border-radius: calc(var(--radius) * 0.5);
}

.group-row:has(.group-select:enabled):hover,
.all-groups:enabled:hover,
.group-row[aria-pressed='true'],
.group-row.is-selected {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
}

.group-row:focus-visible,
.group-select:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.drag-handle {
  flex: none;
  width: 12px;
  height: 16px;
  color: hsl(var(--muted-foreground));
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
  right: 4px;
  left: 4px;
  height: 2px;
  pointer-events: none;
  content: '';
  background: hsl(var(--primary));
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
  color: hsl(var(--primary));
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
