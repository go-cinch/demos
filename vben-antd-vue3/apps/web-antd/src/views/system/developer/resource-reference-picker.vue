<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Alert, Button, Checkbox, Empty, Input, Tag, Tree } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { preferences } from '@vben/preferences';
import { $t } from '#/locales';
import type { Catalog, ResourceEditor } from './catalog-model';
import { text } from './catalog-model';
import {
  resourceBreadcrumb,
  resourceTree,
} from '../components/resource-catalog';
import { availableReferenceOperations, canReferenceResource, referencedOperations } from '../components/resource-references';

const props = defineProps<{
  catalog: Catalog;
  draft: ResourceEditor;
  scope: string;
  disabled: boolean;
}>();
const query = ref('');
const pendingReference = ref('');
const pendingOperations = ref<string[]>([]);
watch(() => props.draft, cancelAdd);
const t = (key: string) => $t(`developer.${key}`);
const label = (key: string) =>
  text(props.catalog, preferences.app.locale, 'resources', key) || key;
const breadcrumb = (key: string) =>
  resourceBreadcrumb(props.catalog.resource_catalog, key, label);
const candidateCatalog = computed(() => ({
  ...props.catalog.resource_catalog,
  resources: {
    ...props.catalog.resource_catalog.resources,
    [props.draft.key]: {
      kind: 'directory' as const,
      sort: props.draft.sort,
      parent: props.draft.parent || undefined,
      references: props.draft.references,
      reference_operations: props.draft.referenceOperations,
    },
  },
}));
const tree = computed(() =>
  resourceTree(
    props.catalog.resource_catalog,
    props.scope,
    query.value,
    label,
  ),
);
const isReferenced = (key: string) => props.draft.references.includes(key);
const canAdd = (key: string) =>
  canReferenceResource(candidateCatalog.value, props.draft.key, key);
const isDirectory = (key: string) =>
  props.catalog.resource_catalog.resources[key]?.kind === 'directory';
const availableOperations = computed(() => Object.fromEntries(
  Object.keys(props.catalog.resource_catalog.resources).map((key) => [key, availableReferenceOperations(candidateCatalog.value, key)]),
));
const selectedOperations = (key: string) => isReferenced(key)
  ? props.draft.referenceOperations?.[key] ?? referencedOperations(candidateCatalog.value, props.draft.key, key)
  : [];
function remove(key: string) {
  if (props.disabled) return;
  props.draft.references = props.draft.references.filter((target) => target !== key);
  if (props.draft.referenceOperations) delete props.draft.referenceOperations[key];
}
function toggleOperation(key: string, operation: string, checked: boolean) {
  if (props.disabled || !isReferenced(key)) return;
  if (checked && !availableOperations.value[key]?.includes(operation)) return;
  const previous = selectedOperations(key);
  const selected = props.catalog.operations.filter((op) => op === operation ? checked : previous.includes(op));
  if (!selected.length) return remove(key);
  props.draft.referenceOperations ??= {};
  props.draft.referenceOperations[key] = selected;
}
function cancelAdd() {
  pendingReference.value = '';
  pendingOperations.value = [];
}
function beginAdd(key: string) {
  if (props.disabled || isReferenced(key) || !canAdd(key) || !availableOperations.value[key]?.length) return;
  pendingReference.value = key;
  pendingOperations.value = [];
}
function togglePending(operation: string, checked: boolean) {
  if (props.disabled) return;
  pendingOperations.value = props.catalog.operations.filter((op) => op === operation ? checked : pendingOperations.value.includes(op));
}
function confirmAdd() {
  const key = pendingReference.value;
  const operations = pendingOperations.value;
  if (props.disabled || !key || isReferenced(key) || !canAdd(key) || !operations.length || operations.some((operation) => !availableOperations.value[key]?.includes(operation))) return;
  props.draft.referenceOperations ??= {};
  props.draft.referenceOperations[key] = [...operations];
  props.draft.references = [...props.draft.references, key];
  cancelAdd();
}
</script>

<template>
  <section
    class="catalog-reference-picker"
    data-testid="resource-reference-picker"
  >
    <Alert
      type="info"
      show-icon
      :message="t('referenceOperationsTitle')"
      :description="t('referencePermissionHint')"
    />
    <p class="catalog-muted">{{ t('referencePickerHint') }}</p>
    <Input
      v-model:value="query"
      allow-clear
      :disabled="disabled"
      :placeholder="t('searchReferences')"
      :aria-label="t('searchReferences')"
    />
    <div class="catalog-reference-selector">
      <Tree
        v-if="tree.length"
        :key="scope + ':' + query"
        block-node
        default-expand-all
        :selectable="false"
        :tree-data="tree"
        :disabled="disabled"
      >
        <template #title="{ key, title }">
          <div class="catalog-reference-option">
            <span class="catalog-reference-option-name" :title="breadcrumb(String(key))">
              <IconifyIcon
                :icon="isDirectory(String(key)) ? 'lucide:folder' : 'lucide:box'"
                aria-hidden="true"
              />
              <span>{{ title }}</span>
            </span>
            <Tag v-if="isReferenced(String(key))" class="catalog-reference-status">
              {{ t('referenceAdded') }}
            </Tag>
            <Button
              v-else-if="canAdd(String(key))"
              type="link"
              size="small"
              :disabled="disabled || !availableOperations[String(key)]?.length"
              :title="availableOperations[String(key)]?.length ? undefined : t('referenceNoOperations')"
              :aria-label="t('addReference') + ' ' + breadcrumb(String(key))"
              :aria-expanded="pendingReference === String(key)"
              @click.stop="beginAdd(String(key))"
            >
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              {{ t('addReference') }}
            </Button>
            <span v-else class="catalog-muted" :title="t('referenceUnavailableHint')">
              {{ t('referenceUnavailable') }}
            </span>
            <div v-if="isReferenced(String(key))" class="catalog-reference-operation-options" :aria-label="label(String(key)) + ' / ' + t('operation')">
              <Checkbox
                v-for="operation in catalog.operations"
                :key="operation"
                :checked="selectedOperations(String(key)).includes(operation)"
                :disabled="disabled || ((!canAdd(String(key)) || !availableOperations[String(key)]?.includes(operation)) && !selectedOperations(String(key)).includes(operation))"
                :aria-label="breadcrumb(String(key)) + ' / ' + $t(`operations.${operation}`)"
                @change="toggleOperation(String(key), operation, !!$event.target.checked)"
              >{{ $t(`operations.${operation}`) }}</Checkbox>
            </div>
            <div v-else-if="pendingReference === String(key)" class="catalog-reference-add-form" @click.stop>
              <strong>{{ t('referenceOperationsTitle') }}</strong>
              <div class="catalog-reference-operation-options">
                <Checkbox
                  v-for="operation in catalog.operations"
                  :key="operation"
                  :checked="pendingOperations.includes(operation)"
                  :disabled="disabled || !availableOperations[String(key)]?.includes(operation)"
                  :aria-label="breadcrumb(String(key)) + ' / ' + $t(`operations.${operation}`)"
                  @change="togglePending(operation, !!$event.target.checked)"
                >{{ $t(`operations.${operation}`) }}</Checkbox>
              </div>
              <div class="catalog-actions">
                <span class="catalog-muted">{{ t('referenceChooseOperations') }}</span>
                <Button size="small" :disabled="disabled" @click="cancelAdd">{{ t('cancel') }}</Button>
                <Button type="primary" size="small" :disabled="disabled || !pendingOperations.length" @click="confirmAdd">{{ t('confirmAddReference') }}</Button>
              </div>
            </div>
          </div>
        </template>
      </Tree>
      <Empty v-else :description="t('noReferenceMatches')" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
    </div>
    <div class="catalog-reference-selected">
      <div class="catalog-actions">
        <strong>{{ t('selectedReferences') }} {{ draft.references.length }}</strong>
        <span class="catalog-muted">{{ t('referenceSelectedOperationsHint') }}</span>
      </div>
      <div v-for="key in draft.references" :key="key" class="catalog-reference-selected-row">
        <IconifyIcon icon="lucide:link-2" aria-hidden="true" />
        <span class="catalog-reference-selected-name">{{ breadcrumb(key) }}</span>
        <div class="catalog-reference-selected-operations">
          <Tag v-for="operation in selectedOperations(key)" :key="operation" color="blue">{{ $t(`operations.${operation}`) }}</Tag>
        </div>
        <Button
          type="text"
          size="small"
          :disabled="disabled"
          :aria-label="t('removeReference') + ' ' + breadcrumb(key)"
          @click="remove(key)"
        >{{ t('removeReference') }}</Button>
      </div>
      <p v-if="!draft.references.length" class="catalog-muted">{{ t('noReferences') }}</p>
    </div>
  </section>
</template>
