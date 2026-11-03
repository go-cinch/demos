<script setup lang="ts">
import type { FilterDefinition } from './management-types';
import type { ManagementFilters } from './use-management-filters';
import type { ManagementPermissions } from './use-management-permissions';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, FormItem, Select, Space, Tag } from 'ant-design-vue';

import SearchAutocomplete from '#/components/search-autocomplete.vue';
import { renderSkeletonOptions } from '#/components/skeleton-options';
import { $t } from '#/locales';

import ManagementSearch from './management-search.vue';
const props = defineProps<{
  fields: FilterDefinition[];
  controller: ManagementFilters;
  permissions: ManagementPermissions;
  loading: boolean;
}>();
const emit = defineEmits<{ search: []; reset: [] }>();
const { canRead, hasButtonAccess, buttonLabel } = props.permissions;
const {
  filters,
  filterSuggestionsLoading,
  filterHistoryKey,
  filterSuggestionOptions,
  filterSuggestionSegments,
  handleFilterBlur,
  handleFilterFocus,
  markFiltersChanged,
  searchBackendFilterSuggestions,
  updateTextFilterValue,
  updateMultiFilterValue,
  removeFilterHistory,
} = props.controller;
const searchExpanded = ref(false);
const visibleFilters = computed(() =>
  searchExpanded.value ? props.fields : props.fields.slice(0, 3),
);
const search = () => emit('search');
const resetSearch = () => emit('reset');
function resourceRules(value: string) {
  return value
    .split(/\r?\n/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}
</script>
<template>
  <ManagementSearch
    data-testid="management-search"
    :model="filters"
    @finish="search"
  >
    <FormItem
      v-for="field in visibleFilters"
      :key="field.key"
      class="w-full sm:w-auto sm:shrink-0"
      :label="field.label"
      :name="field.key"
    >
      <Select
        v-if="field.type === 'status' || field.type === 'status-multi-select'"
        v-model:value="filters[field.key]"
        allow-clear
        :mode="field.type === 'status-multi-select' ? 'multiple' : undefined"
        :placeholder="$t('system.common.select', { field: field.label })"
        class="system-filter-control"
        :data-testid="`system-filter-${field.key}`"
        style="--filter-width: 280px"
        :options="[
          { label: $t('system.status.pending'), value: 0 },
          { label: $t('system.status.active'), value: 1 },
          { label: $t('system.status.locked'), value: 2 },
        ]"
        @blur="handleFilterBlur()"
        @change="markFiltersChanged"
        @focus="handleFilterFocus"
      />
      <Select
        v-else-if="field.type === 'enabled'"
        v-model:value="filters[field.key]"
        allow-clear
        :placeholder="$t('system.common.select', { field: field.label })"
        class="system-filter-control"
        :data-testid="`system-filter-${field.key}`"
        style="--filter-width: 160px"
        :options="[
          { label: $t('system.enabled.yes'), value: 'true' },
          { label: $t('system.enabled.no'), value: 'false' },
        ]"
        @blur="handleFilterBlur()"
        @change="markFiltersChanged"
        @focus="handleFilterFocus"
      />
      <Select
        v-else-if="field.type === 'category'"
        v-model:value="filters[field.key]"
        allow-clear
        :placeholder="$t('system.common.select', { field: field.label })"
        class="system-filter-control"
        :data-testid="`system-filter-${field.key}`"
        style="--filter-width: 160px"
        :options="[
          { label: $t('system.category.permission'), value: 0 },
          { label: $t('system.category.jwt'), value: 1 },
        ]"
        @blur="handleFilterBlur()"
        @change="markFiltersChanged"
        @focus="handleFilterFocus"
      />
      <Select
        v-else-if="field.type === 'input-multi-select'"
        :value="filters[field.key]"
        allow-clear
        class="system-multi-filter system-filter-control"
        :data-testid="`system-filter-${field.key}`"
        style="--filter-width: 280px"
        :default-active-first-option="false"
        :filter-option="false"
        mode="tags"
        :not-found-content="null"
        :options="filterSuggestionOptions(field.key)"
        :placeholder="$t('system.common.enter', { field: field.label })"
        :show-action="['focus']"
        :token-separators="[',']"
        @blur="handleFilterBlur(field.key)"
        @focus="handleFilterFocus"
        @search="searchBackendFilterSuggestions(field.key, $event)"
        @update:value="updateMultiFilterValue(field.key, $event)"
        :dropdown-render="
          ({ menuNode } = {}) =>
            renderSkeletonOptions(
              menuNode,
              !!filterSuggestionsLoading[filterHistoryKey(field.key)],
            )
        "
      >
        <template
          v-if="field.splitLines"
          #tagRender="{ closable, label, onClose }"
        >
          <Tag
            class="system-multiline-filter-tag"
            :closable="closable"
            @close="onClose"
          >
            <span class="system-multiline-filter-tag-content">
              <span v-for="item in resourceRules(String(label))" :key="item">
                {{ item }}
              </span>
            </span>
          </Tag>
        </template>
        <template #option="{ label, source, value }">
          <div
            v-if="source === 'history'"
            class="flex w-full min-w-0 items-center justify-between gap-2"
          >
            <div
              v-if="field.splitLines"
              class="flex min-w-0 flex-1 flex-wrap gap-1"
            >
              <Tag
                v-for="item in resourceRules(String(value))"
                :key="item"
                class="m-0 max-w-full truncate"
              >
                {{ item }}
              </Tag>
            </div>
            <Tag v-else class="m-0 min-w-0 truncate">{{ value }}</Tag>
            <button
              :aria-label="$t('system.suggestions.removeHistory', { value })"
              class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              tabindex="-1"
              type="button"
              @click.prevent.stop="
                removeFilterHistory(field.key, String(value))
              "
              @mousedown.prevent.stop
            >
              <IconifyIcon class="size-3.5" icon="lucide:x" />
            </button>
          </div>
          <template v-else-if="source === 'backend'">
            <Space v-if="field.splitLines" :size="[4, 4]" wrap>
              <Tag
                v-for="item in resourceRules(String(value))"
                :key="item"
                class="m-0"
              >
                <span
                  v-for="(segment, index) in filterSuggestionSegments(
                    item,
                    field.key,
                  )"
                  :key="index"
                  :class="{
                    'font-bold text-red-500': segment.matched,
                  }"
                >
                  {{ segment.text }}
                </span>
              </Tag>
            </Space>
            <span v-else>
              <span
                v-for="(segment, index) in filterSuggestionSegments(
                  String(label),
                  field.key,
                )"
                :key="index"
                :class="{ 'font-bold text-red-500': segment.matched }"
              >
                {{ segment.text }}
              </span>
            </span>
          </template>
          <span v-else>{{ label }}</span>
        </template>
      </Select>
      <SearchAutocomplete
        v-else
        :value="filters[field.key]"
        class="system-filter-control"
        :data-testid="`system-filter-${field.key}`"
        :dropdown-match-select-width="true"
        :options="filterSuggestionOptions(field.key)"
        :loading="!!filterSuggestionsLoading[filterHistoryKey(field.key)]"
        :placeholder="$t('system.common.enter', { field: field.label })"
        @blur="handleFilterBlur()"
        @focus="handleFilterFocus"
        @search="searchBackendFilterSuggestions(field.key, $event)"
        @update:value="updateTextFilterValue(field.key, $event)"
        @submit="search"
        @remove-history="removeFilterHistory(field.key, $event)"
      />
    </FormItem>
    <template #actions>
      <Button
        v-if="hasButtonAccess('reset-query')"
        html-type="button"
        @click="resetSearch"
      >
        {{ buttonLabel('reset-query', 'system.common.reset') }}
      </Button>
      <Button
        v-if="hasButtonAccess('query')"
        html-type="submit"
        type="primary"
        :loading="loading"
        :aria-busy="loading"
      >
        {{ buttonLabel('query', 'system.common.search') }}
      </Button>
      <Button
        v-if="canRead && fields.length > 3"
        type="link"
        @click="searchExpanded = !searchExpanded"
      >
        {{
          searchExpanded ? $t('system.common.less') : $t('system.common.more')
        }}
        <IconifyIcon
          :icon="searchExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'"
        />
      </Button>
    </template>
  </ManagementSearch>
</template>
<style scoped>
:deep(.system-multi-filter .ant-select-selection-overflow) {
  row-gap: 4px;
  padding-block: 2px;
}

:deep(.system-multiline-filter-tag) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: auto;
  padding-block: 2px;
  text-align: left;
  white-space: normal;
}

.system-multiline-filter-tag-content {
  display: flex;
  flex-direction: column;
}
</style>
