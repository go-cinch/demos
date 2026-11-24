<script setup lang="ts">
import type { SelectOption } from '@vben/types';

import { computed, onMounted, onUnmounted, ref } from 'vue';

import { GripVertical } from '@vben/icons';
import { $t } from '@vben/locales';

import Sortable from 'sortablejs';

import SelectItem from './select-item.vue';

interface Item {
  key: string;
  label: string;
  position: 'auto' | 'fixed' | 'header' | 'none' | 'user-dropdown';
  /** 每项可选的 position 选项；不传则用 props.positionItems */
  positionItems?: SelectOption[];
}

const props = defineProps<{
  items: Item[];
  positionItems: SelectOption[];
}>();

const emit = defineEmits<{
  updateOrder: [keys: string[]];
  updatePosition: [
    key: string,
    position: 'auto' | 'fixed' | 'header' | 'none' | 'user-dropdown',
  ];
}>();

const listRef = ref<HTMLElement>();
let sortableInstance: null | Sortable = null;

// 划分规则：
// - hidden：position === 'none'（不显示）
// - sortable：其它（含 auto/fixed，偏好按钮的智能模式视觉归入顶栏组参与排序，
//   避免 preferences 从 widget.order 丢失）
const sortableList = computed(() =>
  props.items.filter((item) => item.position !== 'none'),
);

const hiddenList = computed(() =>
  props.items.filter((item) => item.position === 'none'),
);
function initSortable() {
  const container = listRef.value;
  if (!container) return;
  sortableInstance?.destroy();
  sortableInstance = Sortable.create(container, {
    animation: 200,
    handle: '.drag-handle',
    onEnd({ newIndex, oldIndex }) {
      if (
        oldIndex === undefined ||
        newIndex === undefined ||
        oldIndex === newIndex
      )
        return;
      const moved = sortableList.value[oldIndex];
      const target = sortableList.value[newIndex];
      if (!moved || !target) return;

      // Move only the dragged item in the full order, keeping hidden items in sequence.
      const order = props.items
        .map(({ key }) => key)
        .filter((key) => key !== moved.key);
      const index = order.indexOf(target.key) + (newIndex > oldIndex ? 1 : 0);
      order.splice(index, 0, moved.key);
      emit('updateOrder', order);
    },
  });
}

onMounted(initSortable);
onUnmounted(() => {
  sortableInstance?.destroy();
  sortableInstance = null;
});

function setPosition(key: string, value: string | undefined) {
  if (!value) return;
  emit(
    'updatePosition',
    key,
    value as 'auto' | 'fixed' | 'header' | 'none' | 'user-dropdown',
  );
}
</script>

<template>
  <div class="space-y-1">
    <div ref="listRef" class="space-y-1">
      <div
        v-for="item in sortableList"
        :key="item.key"
        :data-key="item.key"
        class="bg-accent flex items-center rounded-md pl-2"
      >
        <GripVertical
          class="drag-handle size-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
        />
        <SelectItem
          :items="item.positionItems ?? positionItems"
          :model-value="item.position"
          class="min-w-0 flex-1"
          @update:model-value="
            (v: string | undefined) => setPosition(item.key, v)
          "
        >
          <span class="truncate">{{ item.label }}</span>
        </SelectItem>
      </div>
    </div>
    <div v-if="hiddenList.length > 0" class="pt-2">
      <div class="text-muted-foreground mb-1 text-xs font-medium">
        {{ $t('preferences.widget.hidden') }}
      </div>
      <div
        v-for="item in hiddenList"
        :key="item.key"
        class="flex items-center rounded-md"
      >
        <SelectItem
          :items="item.positionItems ?? positionItems"
          :model-value="item.position"
          class="min-w-0 flex-1"
          @update:model-value="
            (v: string | undefined) => setPosition(item.key, v)
          "
        >
          <span
            class="text-muted-foreground truncate line-through decoration-dotted"
          >
            {{ item.label }}
          </span>
        </SelectItem>
      </div>
    </div>
  </div>
</template>
