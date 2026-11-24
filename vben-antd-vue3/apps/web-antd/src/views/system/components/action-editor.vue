<script setup lang="ts">
import type { LoadFailure } from '#/api/request-error';
import type { ActionConfig, PermissionCatalog } from '#/api/system';

import { computed, onMounted, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { $placeholder, $te } from '@vben/locales';

import {
  Alert,
  Button,
  FormItem,
  Input,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import { loadFailure } from '#/api/request-error';
import { showRequestErrorToast } from '#/api/request-feedback';
import { getPermissionCatalog } from '#/api/system';
import LoadWarning from '#/components/load-warning.vue';
import { $t, catalogLabel } from '#/locales';
import {
  catalogDefaultLocale,
  catalogGroupOrder,
  catalogGroupWords,
  catalogLanguages,
} from '#/locales/catalog';

import { actionWordPattern } from './action-config';
import ActionGroupDialog from './action-group-dialog.vue';
import { applyGroupOrder } from './action-group-model';
import { automaticActionName } from './action-name';
import PermissionResourceEditor from './permission-resource-editor.vue';
import {
  actionResourceBindings,
  menuResourceKeys,
  permissionOperations,
  resolveResourceBindings,
  resolveResourceConfig,
  resolveResourceSelectionConfig,
  resourceBreadcrumb,
} from './resource-catalog';
import { orderPermissionResourceKeys } from './resource-references';

const props = defineProps<{
  word?: string;
  names?: Record<string, string>;
  group?: string;
  groups?: string[];
  config?: ActionConfig;
  disabled?: boolean;
  canCreateGroup?: boolean;
  recordId?: number;
  recordScope?: string;
}>();
const emit = defineEmits<{
  'update:word': [string];
  'update:names': [Record<string, string>];
  'update:group': [string];
  'update:config': [ActionConfig];
  validity: [string];
  editExisting: [number];
}>();
const catalog = ref<PermissionCatalog>();
const loading = ref(false);
const failed = ref<LoadFailure>(false);
const scope = ref(props.recordScope || 'admin');
const technical = ref(false);
const languages = computed(catalogLanguages);
const groupDialogOpen = ref(false);
const groupWords = computed(() => {
  const words = [
    ...new Set([
      ...(props.groups ?? []),
      ...catalogGroupWords(),
      ...(props.group ? [props.group] : []),
    ]),
  ];
  const order = props.groups?.length ? props.groups : catalogGroupOrder();
  return applyGroupOrder(
    words.map((name) => ({ name })),
    order,
  ).map((group) => group.name);
});
const groupOptions = computed(() =>
  groupWords.value
    .filter((key) => key.startsWith(`${scope.value}:`))
    .map((value) => {
      const name = catalogLabel('groups', value);
      return { value, label: name === value ? value : `${name} (${value})` };
    }),
);
const automaticWord = ref(!props.recordId && !props.word);
const label = (kind: string, key: string) =>
  $te(`${kind}.${key}`) ? $t(`${kind}.${key}`) : key;
const defaultMode = computed(() => props.config?.builtin === 'default');
const bindings = computed(() => actionResourceBindings(props.config));
const defaultResources = computed(() => props.config?.resource_keys ?? []);
const generated = computed(() => {
  if (!catalog.value) return undefined;
  try {
    return defaultMode.value
      ? resolveResourceSelectionConfig(
          catalog.value.resource_catalog,
          scope.value,
          defaultResources.value,
          props.config?.feature_keys ??
            defaultResources.value.flatMap(
              (key) =>
                catalog.value?.resource_catalog.resources[key]?.operations?.read
                  ?.button_keys ?? [],
            ),
        )
      : resolveResourceBindings(
          catalog.value.resource_catalog,
          scope.value,
          bindings.value,
        );
  } catch {
    return undefined;
  }
});
const effectResources = computed(() => {
  if (!catalog.value || !generated.value) return [];
  const resourceCatalog = catalog.value.resource_catalog;
  const menuOwners = menuResourceKeys(resourceCatalog);
  const selections = defaultMode.value
    ? defaultResources.value.map((resource_key) => ({
        resource_key,
        operation: 'read',
        feature_keys:
          resourceCatalog.resources[
            resource_key
          ]?.operations?.read?.button_keys.filter(
            (key) =>
              props.config?.feature_keys === null ||
              props.config?.feature_keys === undefined ||
              props.config.feature_keys.includes(key),
          ) ?? [],
      }))
    : bindings.value;
  return orderPermissionResourceKeys(
    resourceCatalog,
    scope.value,
    selections.map((binding) => binding.resource_key),
  ).map((key) => {
    const operations = ['*', ...permissionOperations].flatMap((operation) => {
      const binding = selections.find(
        (item) => item.resource_key === key && item.operation === operation,
      );
      if (!binding) return [];
      const features =
        binding.feature_keys ??
        resourceCatalog.resources[key]?.operations?.[operation]?.button_keys ??
        [];
      return [
        {
          key: operation,
          name: label('operations', operation),
          features: features.map((feature) => ({
            key: feature,
            name: label('features', feature),
          })),
          config: resolveResourceConfig(
            resourceCatalog,
            key,
            operation,
            features,
          ),
        },
      ];
    });
    const entries = operations.flatMap((operation) =>
      operation.config.ui.filter((entry) => entry.page_entry),
    );
    return {
      key,
      name: label('resources', key),
      breadcrumb: `${label('scopes', scope.value)} / ${resourceBreadcrumb(resourceCatalog, key, (id) => label('resources', id))}`,
      pages: [
        ...new Map(
          entries.map((entry) => [
            entry.menu_key,
            {
              key: entry.menu_key,
              name: label('resources', menuOwners.get(entry.menu_key) ?? key),
              path: entry.menu_path,
            },
          ]),
        ).values(),
      ],
      operations,
    };
  });
});
function permissionPaths(config?: ActionConfig) {
  return {
    btn: [...new Set(config?.ui.flatMap((entry) => entry.button_keys ?? []))],
    http:
      config?.endpoints
        .filter((endpoint) => endpoint.protocol === 'http')
        .map((endpoint) => ({
          method: endpoint.method || '',
          path: endpoint.path,
        })) ?? [],
    grpc:
      config?.endpoints
        .filter((endpoint) => endpoint.protocol === 'grpc')
        .map((endpoint) => endpoint.path) ?? [],
  };
}
const technicalGroups = computed(() =>
  effectResources.value.flatMap((resource) =>
    resource.operations.map((operation) => ({
      key: `${resource.key}:${operation.key}`,
      title: `${resource.breadcrumb} / ${operation.name}`,
      paths: permissionPaths(operation.config),
    })),
  ),
);
const duplicate = computed(() =>
  catalog.value?.defined_actions?.find(
    (entry) => entry.word === props.word && entry.id !== props.recordId,
  ),
);
const problem = computed(() => {
  if (failed.value) {
    return 'action-editor.catalogError';
  }
  if (loading.value) {
    return 'action-editor.catalogLoading';
  }
  if (duplicate.value) {
    return 'action-editor.alreadyExists';
  }
  if (
    !actionWordPattern.test(props.word || '') ||
    (props.word?.length ?? 0) > 128
  ) {
    return 'action-editor.invalidWord';
  }
  if (props.word?.split(':')[0] === scope.value) {
    if (!generated.value) {
      return 'action-editor.invalidConfig';
    }
    return '';
  }
  return 'action-editor.wordScopeMismatch';
});
watch(problem, (value) => emit('validity', value), { immediate: true });
watch(
  () => props.recordId,
  () => {
    automaticWord.value = !props.recordId && !props.word;
  },
);
watch(
  () => props.recordScope,
  (value) => {
    if (value) scope.value = value;
  },
);
watch(
  () => props.config,
  () => {
    const first = bindings.value[0]?.resource_key;
    if (first) scope.value = first.split(':')[0] ?? '';
  },
  { immediate: true },
);
function updateResourceConfig(config: ActionConfig) {
  if (!defaultMode.value) {
    const first = actionResourceBindings(config)[0];
    if (first && automaticWord.value) {
      const [bindingScope, ...path] = first.resource_key.split(':');
      emit(
        'update:word',
        `${bindingScope}:${first.operation === '*' ? 'all' : first.operation}:${path.join(':')}`,
      );
    }
  }
  emit('update:config', config);
}
function selectScope(value: string) {
  scope.value = value;
  if (automaticWord.value) emit('update:word', '');
  if (props.group && !props.group.startsWith(`${value}:`))
    emit('update:group', '');
  emit('update:config', { bindings: [], ui: [], endpoints: [] });
}
function editWord(value: string) {
  automaticWord.value = false;
  emit('update:word', value);
}
function editName(tag: string, value: string) {
  emit('update:names', { ...props.names, [tag]: value });
}
async function loadCatalog() {
  loading.value = true;
  failed.value = false;
  try {
    const result = await getPermissionCatalog();
    catalog.value = result;
    if (languages.value.length === 0)
      throw new Error('Missing catalog languages');
  } catch (requestError) {
    failed.value = loadFailure(requestError);
    showRequestErrorToast(requestError);
  } finally {
    loading.value = false;
  }
}
onMounted(loadCatalog);
</script>
<template>
  <div class="action-editor" data-testid="action-editor">
    <LoadWarning
      v-if="failed"
      :failure="failed"
      :retry-label="$t('common.retry')"
      retry-size="small"
      @retry="loadCatalog"
    />
    <Spin :spinning="loading" :tip="$t('action-editor.catalogLoading')">
      <section
        class="permission-identity"
        :aria-label="$t('system-editor.basic')"
      >
        <FormItem
          name="group"
          :label="$t('system-insights.businessGroups')"
          data-editor-field="group"
          required
          validate-first
        >
          <div class="group-control">
            <Select
              :value="group || undefined"
              :options="groupOptions"
              show-search
              option-filter-prop="label"
              :disabled="Boolean(disabled || loading || failed)"
              :placeholder="$placeholder('action-editor.selectGroup')"
              :aria-label="$t('system-insights.businessGroups')"
              @update:value="emit('update:group', String($event))"
            />
            <Button
              v-if="canCreateGroup"
              :disabled="Boolean(disabled || loading || failed)"
              :aria-label="$t('action-editor.createGroup')"
              data-permission-key="admin:btn:system:action:create-group"
              @click="groupDialogOpen = true"
              ><IconifyIcon icon="lucide:plus" />{{
                $t('system.common.create')
              }}</Button
            >
          </div>
        </FormItem>
        <FormItem
          name="word"
          :label="$t('system.fields.word')"
          data-editor-field="word"
          html-for="action-identifier"
          required
          validate-first
          :validate-status="!loading && word && problem ? 'error' : undefined"
          :help="
            failed !== 'gateway' && !loading && word && problem
              ? $t(problem)
              : undefined
          "
        >
          <Input
            id="action-identifier"
            :value="word"
            :disabled="Boolean(disabled || loading || failed)"
            :maxlength="128"
            autocomplete="off"
            :placeholder="$placeholder('action-editor.wordPlaceholder')"
            data-testid="action-word-input"
            @update:value="editWord"
            @blur="editWord((word || '').trim())"
          />
          <div class="secondary">{{ $t('action-editor.wordHint') }}</div>
        </FormItem>
        <div class="identity-heading">{{ $t('action-editor.names') }}</div>
        <div class="permission-names">
          <FormItem
            v-for="locale in languages"
            :key="locale.tag"
            :name="['names', locale.tag]"
            :html-for="`action-name-${locale.tag}`"
          >
            <template #label>
              <span
                >{{ locale.name }}
                <span class="secondary">{{ locale.tag }}</span></span
              >
              <Tag
                v-if="locale.tag === catalogDefaultLocale()"
                class="language-tag"
                >{{ $t('action-editor.defaultLanguage') }}</Tag
              >
              <Tag v-else-if="!locale.enabled" class="language-tag">{{
                $t('action-editor.disabledLanguage')
              }}</Tag>
            </template>
            <Input
              :id="`action-name-${locale.tag}`"
              :value="names?.[locale.tag] || ''"
              :disabled="Boolean(disabled || loading || failed)"
              :placeholder="
                names?.[catalogDefaultLocale()]?.trim() ||
                automaticActionName(props.config, locale.tag) ||
                $placeholder('action-editor.namePlaceholder')
              "
              @update:value="editName(locale.tag, $event)"
            />
          </FormItem>
        </div>
        <div class="secondary">{{ $t('action-editor.namesHint') }}</div>
      </section>
      <PermissionResourceEditor
        v-if="catalog"
        :catalog="catalog"
        :scope="scope"
        :config="props.config"
        :record-id="recordId"
        :default-mode="defaultMode"
        :disabled="Boolean(disabled || loading || failed)"
        @update:scope="selectScope"
        @update:config="updateResourceConfig"
      />
      <Alert
        v-if="duplicate"
        class="mb-4"
        type="info"
        show-icon
        :message="$t('action-editor.alreadyExists')"
      >
        <template #action>
          <Button
            size="small"
            :disabled="disabled"
            @click="emit('editExisting', duplicate.id)"
          >
            {{ $t('action-editor.editExisting') }}
          </Button>
        </template>
      </Alert>
      <Button
        type="text"
        class="technical-toggle"
        :aria-expanded="technical"
        data-testid="action-technical-toggle"
        @click="technical = !technical"
      >
        <IconifyIcon
          :icon="technical ? 'lucide:chevron-down' : 'lucide:chevron-right'"
        />{{ $t('action-editor.technical')
        }}<span class="secondary">{{ $t('action-editor.generated') }}</span>
      </Button>
      <div v-if="technical" class="technical-content">
        <dl>
          <dt>{{ $t('system.fields.word') }}</dt>
          <dd data-testid="action-word">{{ word || '—' }}</dd>
          <dt>{{ $t('system.fields.group') }}</dt>
          <dd>{{ group || '—' }}</dd>
        </dl>
        <section
          v-for="section in technicalGroups"
          :key="section.key"
          class="technical-group"
        >
          <h3 v-if="section.title" class="technical-group-title">
            {{ section.title }}
          </h3>
          <div class="path-group">
            <div class="path-heading">
              {{ $t('action-editor.frontendButtons') }}
              <Tag>{{ section.paths.btn.length }}</Tag>
            </div>
            <div class="path-values">
              <code v-for="key in section.paths.btn" :key="key">{{ key }}</code
              ><span v-if="!section.paths.btn.length" class="secondary">{{
                $t('action-editor.none')
              }}</span>
            </div>
          </div>
          <div class="path-group">
            <div class="path-heading">
              HTTP <Tag>{{ section.paths.http.length }}</Tag>
            </div>
            <div class="path-values">
              <code
                v-for="entry in section.paths.http"
                :key="entry.method + entry.path"
                >{{ entry.method }} {{ entry.path }}</code
              ><span v-if="!section.paths.http.length" class="secondary">{{
                $t('action-editor.none')
              }}</span>
            </div>
          </div>
          <div class="path-group">
            <div class="path-heading">
              gRPC <Tag>{{ section.paths.grpc.length }}</Tag>
            </div>
            <div class="path-values">
              <code v-for="path in section.paths.grpc" :key="path">{{
                path
              }}</code
              ><span v-if="!section.paths.grpc.length" class="secondary">{{
                $t('action-editor.none')
              }}</span>
            </div>
          </div>
        </section>
      </div>
    </Spin>
    <ActionGroupDialog
      v-if="canCreateGroup"
      v-model:open="groupDialogOpen"
      :scope="scope"
      :existing-words="groupWords"
      @created="emit('update:group', $event)"
    />
  </div>
</template>
<style scoped>
.action-editor {
  --editor-border: hsl(var(--border));
  --editor-muted: hsl(var(--muted-foreground));
  --editor-soft: hsl(var(--muted) / 55%);
}

.scope-heading,
.identity-heading,
.effect-heading {
  font-weight: 500;
}

.permission-identity {
  padding-bottom: 22px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--editor-border);
}

.identity-heading {
  margin-bottom: 12px;
}

.group-control {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.group-control :deep(.ant-select) {
  flex: 1;
  min-width: 0;
}

.permission-names {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  max-height: 280px;
  padding: 2px 2px 8px;
  overflow: auto;
}

.permission-names :deep(.ant-form-item) {
  min-width: 0;
  margin-bottom: 0;
}

.permission-names :deep(.ant-form-item-label > label) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.language-tag {
  margin: 0;
  font-size: 11px;
}

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
  flex-direction: column;
  gap: 1px;
  align-items: center;
  justify-content: center;
  height: auto;
  min-height: 58px;
  padding: 8px;
}

.scope-options small {
  font-size: 12px;
  color: var(--editor-muted);
}

.scope-options .selected {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-color: hsl(var(--primary));
}

.secondary {
  font-size: 12px;
  font-weight: 400;
  color: var(--editor-muted);
}

.permission-effect {
  padding: 14px 16px;
  background: var(--editor-soft);
  border-radius: calc(var(--radius) * 0.75);
}

.effect-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.effect-heading :deep(svg) {
  color: hsl(var(--primary));
}

.effect-resources {
  display: grid;
  gap: 14px;
}

.effect-resource {
  min-width: 0;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid var(--editor-border);
  border-radius: calc(var(--radius) * 0.75);
}

.effect-resource-header {
  padding: 12px 14px;
}

.effect-resource h3 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}

.effect-resource .secondary {
  overflow-wrap: anywhere;
}

.page-access {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 10px;
  font-size: 12px;
}

.page-access :deep(.ant-tag),
.effect-features :deep(.ant-tag) {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.effect-operations {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

.effect-operation-column {
  width: 112px;
}

.effect-operations th,
.effect-operations td {
  padding: 10px 14px;
  vertical-align: top;
  text-align: left;
  border-top: 1px solid var(--editor-border);
}

.effect-operations thead th {
  font-size: 12px;
  font-weight: 400;
  color: var(--editor-muted);
  background: hsl(var(--muted) / 25%);
}

.effect-operations tbody th {
  font-size: 13px;
  font-weight: 500;
}

.effect-features {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.technical-toggle {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-left: 0;
  margin: 12px 0 4px;
}

.technical-content {
  padding: 12px 0;
}

.technical-group + .technical-group {
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid var(--editor-border);
}

.technical-group-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

dl {
  display: grid;
  grid-template-columns: 90px minmax(0, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

dt {
  color: var(--editor-muted);
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.path-group {
  margin-bottom: 12px;
}

.path-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
  font-weight: 500;
}

.default-resource-features {
  margin-top: 20px;
}

.path-values {
  max-height: 180px;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--editor-border);
  border-radius: calc(var(--radius) * 0.75);
}

.path-values code {
  display: block;
  font-size: 12px;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .permission-names {
    grid-template-columns: 1fr;
  }

  .scope-options :deep(.ant-btn) {
    padding-inline: 2px;
    font-size: 12px;
  }
}
</style>
