import type { ComputedRef } from 'vue';

import type {
  FilterHistory,
  FilterSuggestionGroup,
  FilterSuggestionOption,
  FilterSuggestionSegment,
  FormModel,
  ResourceConfig,
  ResourceKind,
} from './management-types';

import { onBeforeUnmount, onDeactivated, reactive, ref } from 'vue';

import { useDebounceFn, useTimeoutFn } from '@vueuse/core';

import { $t } from '#/locales';

import { apiByResource } from './management-resources';
import { matchingSegments } from './management-search-utils';
export function useManagementFilters(
  resource: () => ResourceKind,
  config: ComputedRef<ResourceConfig>,
  filters: FormModel,
  autoSearch: () => Promise<void>,
) {
  const filtersDirty = ref(false);
  const { start: scheduleFilterSearch, stop: cancelFilterSearch } =
    useTimeoutFn(autoSearch, 500, { immediate: false });
  const filterHistoryStorageKey = 'vben-system-filter-history';

  function loadFilterHistory(): FilterHistory {
    try {
      const stored = JSON.parse(
        localStorage.getItem(filterHistoryStorageKey) || '{}',
      ) as FilterHistory;
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
        return {};
      }
      const normalizedHistory = Object.fromEntries(
        Object.entries(stored).map(([key, values]) => [
          key,
          Array.isArray(values)
            ? values.filter((value) => typeof value === 'string').slice(0, 10)
            : [],
        ]),
      );
      localStorage.setItem(
        filterHistoryStorageKey,
        JSON.stringify(normalizedHistory),
      );
      return normalizedHistory;
    } catch {
      return {};
    }
  }

  const filterHistory = reactive<FilterHistory>(loadFilterHistory());
  const backendFilterSuggestions = reactive<Record<string, string[]>>({});
  const filterSuggestionQueries = reactive<Record<string, string>>({});
  const filterSuggestionsLoading = reactive<Record<string, boolean>>({});
  const backendSuggestionRequestIds = new Map<string, number>();
  function filterHistoryKey(fieldKey: string) {
    return `${resource()}:${fieldKey}`;
  }

  function normalizeTextFilterValue(fieldKey: string, value: string) {
    return (resource() === 'user' || resource() === 'action') &&
      fieldKey === 'code'
      ? value.toUpperCase()
      : value;
  }

  function updateTextFilterValue(fieldKey: string, value: unknown) {
    const normalizedValue =
      typeof value === 'string'
        ? normalizeTextFilterValue(fieldKey, value)
        : value;
    if (filters[fieldKey] === normalizedValue) return;
    filters[fieldKey] = normalizedValue;
    filtersDirty.value = true;
  }

  function normalizeMultiFilterValue(fieldKey: string, values: unknown) {
    if (!Array.isArray(values)) return [];
    return [
      ...new Set(
        values
          .filter((value): value is string => typeof value === 'string')
          .flatMap((value) => value.split(','))
          .map((value) => normalizeTextFilterValue(fieldKey, value).trim())
          .filter(Boolean),
      ),
    ];
  }

  function updateMultiFilterValue(fieldKey: string, value: unknown) {
    const normalizedValue = normalizeMultiFilterValue(fieldKey, value);
    const currentValue = Array.isArray(filters[fieldKey])
      ? filters[fieldKey]
      : [];
    if (
      currentValue.length !== normalizedValue.length ||
      currentValue.some((item, index) => item !== normalizedValue[index])
    ) {
      filters[fieldKey] = normalizedValue;
      filtersDirty.value = true;
    }
    clearBackendFilterSuggestion(fieldKey);
  }

  function markFiltersChanged() {
    filtersDirty.value = true;
  }

  function handleFilterFocus() {
    cancelFilterSearch();
  }

  function handleFilterBlur(fieldKey?: string) {
    if (fieldKey) clearBackendFilterSuggestion(fieldKey);
    scheduleFilterSearch();
  }

  function filterSuggestionOptions(fieldKey: string): FilterSuggestionGroup[] {
    const key = filterHistoryKey(fieldKey);
    const backendOptions = filterSuggestionQueries[key]
      ? (backendFilterSuggestions[key] || []).map(
          (value): FilterSuggestionOption => ({
            label: value,
            source: 'backend',
            value,
          }),
        )
      : [];
    const historyOptions = normalizeMultiFilterValue(
      fieldKey,
      filterHistory[key] || [],
    ).map((value): FilterSuggestionOption => ({
      label: value,
      source: 'history',
      value,
    }));
    return [
      ...(backendOptions.length > 0
        ? [{ label: $t('system.suggestions.backend'), options: backendOptions }]
        : []),
      ...(historyOptions.length > 0
        ? [{ label: $t('system.suggestions.history'), options: historyOptions }]
        : []),
    ];
  }

  function filterSuggestionSegments(
    value: string,
    fieldKey: string,
  ): FilterSuggestionSegment[] {
    return matchingSegments(
      value,
      filterSuggestionQueries[filterHistoryKey(fieldKey)] || '',
    );
  }

  function persistFilterHistory() {
    localStorage.setItem(
      filterHistoryStorageKey,
      JSON.stringify(filterHistory),
    );
  }

  function saveFilterHistory() {
    let changed = false;
    for (const field of config.value.filters) {
      if (field.type !== 'input' && field.type !== 'input-multi-select') {
        continue;
      }
      const value = filters[field.key];
      const values = Array.isArray(value) ? value : [value];
      const normalizedValues = values
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
      if (normalizedValues.length === 0) continue;
      const key = filterHistoryKey(field.key);
      filterHistory[key] = [
        ...normalizedValues,
        ...(filterHistory[key] || []).filter(
          (item) => !normalizedValues.includes(item),
        ),
      ].slice(0, 10);
      changed = true;
    }
    if (changed) persistFilterHistory();
  }

  function removeFilterHistory(fieldKey: string, value: string) {
    const key = filterHistoryKey(fieldKey);
    const remainingValues = normalizeMultiFilterValue(
      fieldKey,
      filterHistory[key] || [],
    ).filter((item) => item !== value);
    if (remainingValues.length > 0) {
      filterHistory[key] = remainingValues;
    } else {
      delete filterHistory[key];
    }
    persistFilterHistory();
  }

  const loadBackendFilterSuggestions = useDebounceFn(
    async (
      requestKey: string,
      suggestionResource: ResourceKind,
      suggestionFieldKey: string,
      query: string,
      requestId: number,
    ) => {
      if (backendSuggestionRequestIds.get(requestKey) !== requestId) return;
      try {
        const result = await apiByResource[suggestionResource].list({
          [suggestionFieldKey]: query,
          f: suggestionFieldKey,
          p: 1,
          s: 10,
        });
        if (backendSuggestionRequestIds.get(requestKey) !== requestId) return;
        backendFilterSuggestions[requestKey] = [
          ...new Set(
            result.items
              .map(
                (record) =>
                  (record as unknown as Record<string, unknown>)[
                    suggestionFieldKey
                  ],
              )
              .filter(
                (value): value is number | string =>
                  typeof value === 'number' || typeof value === 'string',
              )
              .map(String),
          ),
        ];
      } catch {
        if (backendSuggestionRequestIds.get(requestKey) === requestId) {
          backendFilterSuggestions[requestKey] = [];
        }
      } finally {
        if (backendSuggestionRequestIds.get(requestKey) === requestId)
          filterSuggestionsLoading[requestKey] = false;
      }
    },
    250,
  );

  function searchBackendFilterSuggestions(fieldKey: string, value: string) {
    const key = filterHistoryKey(fieldKey);
    const requestId = (backendSuggestionRequestIds.get(key) || 0) + 1;
    backendSuggestionRequestIds.set(key, requestId);
    const query = normalizeTextFilterValue(fieldKey, value).trim();
    filterSuggestionQueries[key] = query;
    filterSuggestionsLoading[key] = !!query;
    if (!query) {
      backendFilterSuggestions[key] = [];
      return;
    }
    const field = config.value.filters.find((item) => item.key === fieldKey);
    const suggestionResource = field?.suggestion?.resource ?? resource();
    const suggestionFieldKey = field?.suggestion?.fieldKey ?? fieldKey;
    void loadBackendFilterSuggestions(
      key,
      suggestionResource,
      suggestionFieldKey,
      query,
      requestId,
    );
  }

  function clearBackendFilterSuggestion(fieldKey: string) {
    const key = filterHistoryKey(fieldKey);
    backendSuggestionRequestIds.set(
      key,
      (backendSuggestionRequestIds.get(key) || 0) + 1,
    );
    backendFilterSuggestions[key] = [];
    filterSuggestionQueries[key] = '';
    filterSuggestionsLoading[key] = false;
  }

  function clearBackendFilterSuggestions() {
    for (const key of new Set([
      ...Object.keys(backendFilterSuggestions),
      ...Object.keys(filterSuggestionsLoading),
    ])) {
      backendSuggestionRequestIds.set(
        key,
        (backendSuggestionRequestIds.get(key) || 0) + 1,
      );
      backendFilterSuggestions[key] = [];
      filterSuggestionQueries[key] = '';
      filterSuggestionsLoading[key] = false;
    }
  }

  function dispose() {
    cancelFilterSearch();
    clearBackendFilterSuggestions();
  }
  onDeactivated(dispose);
  onBeforeUnmount(dispose);
  return {
    filters,
    filtersDirty,
    cancelFilterSearch,
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
    saveFilterHistory,
    clearBackendFilterSuggestions,
    normalizeMultiFilterValue,
    normalizeTextFilterValue,
  };
}
export type ManagementFilters = ReturnType<typeof useManagementFilters>;
