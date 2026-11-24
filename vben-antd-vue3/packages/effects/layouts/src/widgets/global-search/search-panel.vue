<script setup lang="ts">
import type { MenuRecordRaw } from '@vben/types';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { SearchX, X } from '@vben/icons';
import { $t } from '@vben/locales';
import { traverseTreeValues, uniqueByField } from '@vben/utils';

import { VbenIcon, VbenScrollbar } from '@vben-core/shadcn-ui';
import { userCache } from '@vben-core/shared/cache';
import { isHttpUrl } from '@vben-core/shared/utils';

import { onKeyStroke } from '@vueuse/core';

defineOptions({ name: 'SearchPanel' });
const props = withDefaults(
  defineProps<{
    active?: boolean;
    keyword?: string;
    menus?: MenuRecordRaw[];
  }>(),
  { active: true, keyword: '', menus: () => [] },
);
const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const historyKey = 'menu-search-history';
const cache = userCache.current();
const history = () => {
  const paths = cache.get<unknown>(historyKey);
  return Array.isArray(paths)
    ? paths.filter((path): path is string => typeof path === 'string')
    : [];
};
const searchHistory = ref(history());
function saveHistory(paths: string[]) {
  searchHistory.value = paths;
  cache.set(historyKey, paths);
}
function reload(event: StorageEvent) {
  if (!event.key || event.key === cache.key(historyKey))
    searchHistory.value = history();
}
window.addEventListener('storage', reload);
onBeforeUnmount(() => window.removeEventListener('storage', reload));
const activeIndex = ref(0);
const available = computed(() => {
  const items: MenuRecordRaw[] = [];
  traverseTreeValues(props.menus, (item) => {
    items.push({ ...item, name: $t(item.name) });
  });
  return uniqueByField(items, 'path');
});
const query = computed(() => props.keyword.trim().toLocaleLowerCase());
const rows = computed(() => {
  if (!query.value) {
    return searchHistory.value
      .map((saved) => available.value.find((item) => item.path === saved))
      .filter((item): item is MenuRecordRaw => !!item);
  }
  return available.value.filter((item) => {
    let cursor = 0;
    const name = item.name.toLocaleLowerCase();
    for (const character of query.value) {
      cursor = name.indexOf(character, cursor);
      if (cursor < 0) return false;
      cursor++;
    }
    return true;
  });
});
function close() {
  emit('close');
}
async function choose(item: MenuRecordRaw) {
  saveHistory(
    [item.path, ...history().filter((path) => path !== item.path)].slice(0, 10),
  );
  close();
  await nextTick();
  if (isHttpUrl(item.path)) window.open(item.path, '_blank', 'noopener');
  else await router.push({ path: item.path });
}
function remove(item: MenuRecordRaw) {
  saveHistory(history().filter((path) => path !== item.path));
  activeIndex.value = Math.min(
    activeIndex.value,
    Math.max(0, rows.value.length - 1),
  );
}
async function move(delta: number) {
  if (rows.value.length === 0) return;
  activeIndex.value =
    (activeIndex.value + delta + rows.value.length) % rows.value.length;
  await nextTick();
  document
    .querySelector(`[data-search-item="${activeIndex.value}"]`)
    ?.scrollIntoView({ block: 'nearest' });
}
function highlighted(name: string) {
  const index = name.toLocaleLowerCase().indexOf(query.value);
  return index === -1
    ? [{ text: name, match: false }]
    : [
        { text: name.slice(0, index), match: false },
        { text: name.slice(index, index + query.value.length), match: true },
        { text: name.slice(index + query.value.length), match: false },
      ];
}
watch(
  () => props.keyword,
  () => {
    activeIndex.value = 0;
  },
);
onKeyStroke('ArrowUp', (event) => {
  if (!props.active) return;
  event.preventDefault();
  void move(-1);
});
onKeyStroke('ArrowDown', (event) => {
  if (!props.active) return;
  event.preventDefault();
  void move(1);
});
onKeyStroke('Enter', (event) => {
  if (!props.active || event.isComposing) return;
  event.preventDefault();
  const item = rows.value[activeIndex.value] ?? rows.value[0];
  if (item) void choose(item);
});
onKeyStroke('Escape', () => {
  if (props.active) close();
});
</script>
<template>
  <VbenScrollbar>
    <div class="px-2 sm:max-h-112.5">
      <div
        v-if="!rows.length"
        class="py-8 text-center text-xs text-muted-foreground"
      >
        <SearchX v-if="query" class="mx-auto mb-3 size-8" />
        {{
          $t(
            query
              ? 'ui.widgets.search.noResults'
              : 'ui.widgets.search.noRecent',
          )
        }}
      </div>
      <ul v-else class="w-full" :aria-label="$t('ui.widgets.search.results')">
        <li class="px-3 py-2 text-xs text-muted-foreground">
          {{
            $t(
              query ? 'ui.widgets.search.results' : 'ui.widgets.search.history',
            )
          }}
        </li>
        <li
          v-for="(item, index) in rows"
          :key="item.path"
          class="mb-1 flex items-center gap-2 rounded-md px-3 py-2"
          :class="{ 'bg-accent': index === activeIndex }"
          :data-search-item="index"
          @mouseenter="activeIndex = index"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="choose(item)"
            @keydown.enter.prevent.stop="choose(item)"
            @keydown.space.prevent.stop="choose(item)"
          >
            <VbenIcon
              v-if="query"
              :icon="item.icon"
              class="size-4 shrink-0"
              fallback
            />
            <span
              v-if="!query"
              class="max-w-full truncate rounded-sm border bg-muted px-2 py-0.5 text-sm"
              >{{ item.name }}</span
            >
            <span v-else class="min-w-0 break-words text-sm"
              ><span
                v-for="(part, partIndex) in highlighted(item.name)"
                :key="partIndex"
                :class="{ 'font-semibold text-destructive': part.match }"
                >{{ part.text }}</span
              ></span
            >
          </button>
          <button
            v-if="!query"
            type="button"
            class="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :aria-label="
              $t('ui.widgets.search.removeHistory', { value: item.name })
            "
            @click.stop="remove(item)"
            @keydown.enter.prevent.stop="remove(item)"
            @keydown.space.prevent.stop="remove(item)"
          >
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  </VbenScrollbar>
</template>
