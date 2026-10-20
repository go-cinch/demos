<script setup lang="ts">
import type { ActionConfig, PermissionCatalog } from '#/api/system';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { $te } from '@vben/locales';

import { Button, Tag } from 'ant-design-vue';

import { $t } from '#/locales';

import ActionResourceSelector from './action-resource-selector.vue';
import { actionResourceBindings, menuResourceKeys, permissionOperations, resolveResourceBindings, resolveResourceConfig, resolveResourceSelectionConfig, resourceBreadcrumb } from './resource-catalog';

const props = defineProps<{ catalog: PermissionCatalog; scope: string; config?: ActionConfig; disabled?: boolean; readOnly?: boolean; assignment?: boolean; defaultMode?: boolean; recordId?: number }>();
const emit = defineEmits<{ 'update:scope': [string]; 'update:config': [ActionConfig] }>();
const catalog = computed(() => props.catalog);
const scope = computed(() => props.scope);
const defaultMode = computed(() => props.defaultMode);
const bindings = computed(() => actionResourceBindings(props.config));
const defaultResources = computed(() => props.config?.resource_keys ?? []);
const label = (kind: string, key: string) => $te(`${kind}.${key}`) ? $t(`${kind}.${key}`) : key;
const generated = computed(() => {
  try {
    return props.defaultMode
      ? resolveResourceSelectionConfig(props.catalog.resource_catalog, props.scope, defaultResources.value, props.config?.feature_keys ?? defaultResources.value.flatMap((key) => props.catalog.resource_catalog.resources[key]?.operations?.read?.button_keys ?? []))
      : resolveResourceBindings(props.catalog.resource_catalog, props.scope, bindings.value);
  } catch { return undefined; }
});
const effectResources = computed(() => {
  if (!catalog.value || !generated.value) return [];
  const resourceCatalog = catalog.value.resource_catalog;
  const menuOwners = menuResourceKeys(resourceCatalog);
  const selections = defaultMode.value ? defaultResources.value.map((resource_key) => ({
    resource_key,
    operation: 'read',
    feature_keys: resourceCatalog.resources[resource_key]?.operations?.read?.button_keys.filter((key) => props.config?.feature_keys == null || props.config.feature_keys.includes(key)) ?? [],
  })) : bindings.value;
  return [...new Set(selections.map((binding) => binding.resource_key))].map((key) => {
    const operations = ['*', ...permissionOperations].flatMap((operation) => {
      const binding = selections.find((item) => item.resource_key === key && item.operation === operation);
      if (!binding) return [];
      const features = binding.feature_keys ?? resourceCatalog.resources[key]?.operations?.[operation]?.button_keys ?? [];
      return [{
        key: operation,
        name: label('operations', operation),
        features: features.map((feature) => ({ key: feature, name: label('features', feature) })),
        config: resolveResourceConfig(resourceCatalog, key, operation, features),
      }];
    });
    const entries = operations.flatMap((operation) => operation.config.ui.filter((entry) => entry.page_entry));
    return {
      key,
      name: label('resources', key),
      breadcrumb: `${label('scopes', scope.value)} / ${resourceBreadcrumb(resourceCatalog, key, (id) => label('resources', id))}`,
      pages: [...new Map(entries.map((entry) => [entry.menu_key, {
        key: entry.menu_key,
        name: label('resources', menuOwners.get(entry.menu_key) ?? key),
        path: entry.menu_path,
      }])).values()],
      operations,
    };
  });
});
</script>
<template>
  <div class="permission-resource-editor" :class="{ 'read-only': readOnly }">
      <div class="scope-heading">{{ $t('action-editor.scope') }}</div>
      <div class="scope-options" data-testid="action-scope">
        <Button
          v-for="key in catalog?.scopes ?? ['admin', 'h5', 'mini', 'app']"
          :key="key"
          :class="{ selected: key === scope }"
          :aria-pressed="key === scope"
          :disabled="disabled || (defaultMode && !readOnly)"
          @click="emit('update:scope', key)"
          >
<span>{{ label('scopes', key) }}</span><small>{{ key }}</small>
</Button>
      </div>
      <ActionResourceSelector
        v-if="catalog"
        :key="`${recordId ?? 'create'}:${scope}`"
        :catalog="catalog.resource_catalog"
        :config="config"
        :scope="scope"
        :default-mode="defaultMode"
        :assignment="assignment"
        :disabled="disabled"
        :read-only="readOnly"
        @update:config="emit('update:config', $event)"
      />
      <section class="permission-effect" aria-live="polite">
        <div class="effect-heading"><IconifyIcon icon="lucide:shield-check" /><span>{{ $t('action-editor.effect') }}</span></div>
        <div v-if="effectResources.length" class="effect-resources">
          <article v-for="resource in effectResources" :key="resource.key" class="effect-resource" :data-effect-resource="resource.key">
            <header class="effect-resource-header">
              <h3>{{ resource.name }}</h3>
              <Tag v-if="generated?.permission_scope === '*'" color="red">{{ $t('developer.permissionScope') }} *</Tag>
              <div class="secondary">{{ resource.breadcrumb }}</div>
              <div v-if="generated?.permission_scope === '*'" class="page-access">{{ $t('permission-display.allResources') }}</div>
              <div v-else-if="resource.pages.length" class="page-access">
                <span>{{ $t('action-editor.accessiblePages') }}</span>
                <Tag v-for="page in resource.pages" :key="page.key" :title="page.path">{{ page.name }}</Tag>
              </div>
              <div v-else class="secondary page-access">{{ $t('action-editor.noEntry') }}</div>
            </header>
            <table class="effect-operations" :aria-label="resource.name">
              <colgroup><col class="effect-operation-column" /><col /></colgroup>
              <thead><tr><th scope="col">{{ $t('action-editor.operation') }}</th><th scope="col">{{ $t('action-editor.features') }}</th></tr></thead>
              <tbody>
                <tr v-for="operation in resource.operations" :key="operation.key">
                  <th scope="row">{{ operation.name }}</th>
                  <td>
                    <div v-if="operation.features.length" class="effect-features"><Tag v-for="feature in operation.features" :key="feature.key">{{ feature.name }}</Tag></div>
                    <span v-else class="secondary">{{ $t('action-editor.noSelectedFeatures') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </article>
        </div>
        <span v-else class="secondary">{{ $t('action-editor.effectPlaceholder') }}</span>
      </section>
  </div>
</template>
<style scoped>
.permission-resource-editor { --editor-border: hsl(var(--border)); --editor-muted: hsl(var(--muted-foreground)); --editor-soft: hsl(var(--muted) / 55%); }
.scope-heading {
  margin-bottom: 10px;
}
.scope-options {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 22px;
}
.scope-options :deep(.ant-btn) {
  display: flex;
  height: auto;
  min-height: 58px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 8px;
}
.scope-options small {
  color: var(--editor-muted);
  font-size: 12px;
}
.scope-options .selected {
  color: hsl(var(--primary));
  border-color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
}
.secondary {
  color: var(--editor-muted);
  font-size: 12px;
  font-weight: 400;
}
.permission-effect {
  padding: 14px 16px;
  border-radius: 6px;
  background: var(--editor-soft);
}
.effect-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.effect-heading :deep(svg) {
  color: hsl(var(--primary));
}
.effect-resources { display: grid; gap: 14px; }
.effect-resource { min-width: 0; overflow: hidden; border: 1px solid var(--editor-border); border-radius: 6px; background: hsl(var(--card)); }
.effect-resource-header { padding: 12px 14px; }
.effect-resource h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; }
.effect-resource .secondary { overflow-wrap: anywhere; }
.page-access { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; }
.page-access :deep(.ant-tag), .effect-features :deep(.ant-tag) { margin: 0; white-space: normal; overflow-wrap: anywhere; }
.effect-operations { width: 100%; table-layout: fixed; border-collapse: collapse; }
.effect-operation-column { width: 112px; }
.effect-operations th, .effect-operations td { padding: 10px 14px; border-top: 1px solid var(--editor-border); text-align: left; vertical-align: top; }
.effect-operations thead th { color: var(--editor-muted); background: hsl(var(--muted) / 25%); font-size: 12px; font-weight: 400; }
.effect-operations tbody th { font-size: 13px; font-weight: 500; }
.effect-features { display: flex; flex-wrap: wrap; gap: 6px; }

@media (max-width: 640px) { .scope-options { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
