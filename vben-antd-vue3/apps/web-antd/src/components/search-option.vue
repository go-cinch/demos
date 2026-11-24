<script setup lang="ts">
import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Tag } from 'ant-design-vue';

import { $t } from '#/locales';

const props = defineProps<{
  value: string;
  query?: string;
  source: 'backend' | 'history';
}>();
const emit = defineEmits<{ remove: [value: string] }>();
const parts = computed(() => {
  const query = props.query?.trim().toLocaleLowerCase();
  if (!query) return [{ text: props.value, matched: false }];
  const text = props.value.toLocaleLowerCase();
  const result: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  let start = text.indexOf(query);
  while (start >= 0) {
    if (start > cursor)
      result.push({ text: props.value.slice(cursor, start), matched: false });
    result.push({
      text: props.value.slice(start, start + query.length),
      matched: true,
    });
    cursor = start + query.length;
    start = text.indexOf(query, cursor);
  }
  if (cursor < props.value.length)
    result.push({ text: props.value.slice(cursor), matched: false });
  return result;
});
</script>
<template>
  <div
    v-if="source === 'history'"
    class="search-history-option"
    data-testid="search-history-option"
  >
    <Tag class="search-history-value">{{ value }}</Tag>
    <button
      type="button"
      :aria-label="$t('system.suggestions.removeHistory', { value })"
      @mousedown.prevent.stop
      @click.prevent.stop="emit('remove', value)"
      @keydown.enter.stop
      @keydown.space.stop
    >
      <IconifyIcon icon="lucide:x" aria-hidden="true" />
    </button>
  </div>
  <span v-else class="search-backend-option" data-testid="search-backend-result"
    ><span
      v-for="(part, index) in parts"
      :key="index"
      :class="{ 'search-match': part.matched }"
      >{{ part.text }}</span
    ></span
  >
</template>
<style scoped>
.search-history-option {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
}

.search-history-value {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-history-option button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: calc(var(--radius) * 0.5);
}

.search-history-option button svg {
  width: 14px;
  height: 14px;
}

.search-history-option button:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--accent));
}

.search-history-option button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

.search-backend-option {
  overflow-wrap: anywhere;
  white-space: normal;
}

.search-match {
  font-weight: 600;
  color: hsl(var(--destructive));
}
</style>
