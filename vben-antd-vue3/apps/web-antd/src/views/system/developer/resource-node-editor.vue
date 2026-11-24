<script setup lang="ts">
import type { Catalog, ResourceFeatureDraft } from './catalog-model';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  toRaw,
  watch,
} from 'vue';

import { IconifyIcon } from '@vben/icons';
import { preferences } from '@vben/preferences';

import {
  Alert,
  Button,
  Collapse,
  CollapsePanel,
  Form,
  FormItem,
  Input,
  InputNumber,
  Segmented,
  Select,
  Switch,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { $t } from '#/locales';

import { resourceBreadcrumb } from '../components/resource-catalog';
import { resourceChildren } from '../components/resource-order';
import { supportsResourceReferences } from '../components/resource-references';
import { useResourceDraft } from './catalog-editor-context';
import { text } from './catalog-model';
import { resourceTypeChangeIssue } from './resource-editor-model';
import ResourceFeatureEditor from './resource-feature-editor.vue';
import ResourceReferencePicker from './resource-reference-picker.vue';

const props = defineProps<{
  catalog: Catalog;

  scope: string;
  disabled: boolean;
  error: string;
  errorPath: string;
}>();
const emit = defineEmits<{ save: []; cancel: [] }>();
const draft = useResourceDraft();
const t = (key: string) => $t(`developer.${key}`);
const siblings = computed(() =>
  resourceChildren(
    props.catalog.resource_catalog,
    draft.value.parent,
    props.scope,
  ),
);
const positionCount = computed(
  () =>
    siblings.value.filter(
      (item) => !(item.kind === 'node' && item.key === draft.value.original),
    ).length + 1,
);
const initialPosition = computed(() =>
  draft.value.original
    ? siblings.value.findIndex(
        (item) => item.kind === 'node' && item.key === draft.value.original,
      ) + 1
    : positionCount.value,
);
const referenceCollection = computed(() =>
  supportsResourceReferences({
    kind: draft.value.nodeKind,
    parent: draft.value.parent,
    references: draft.value.references,
  }),
);
const typeChangeIssue = computed(() =>
  resourceTypeChangeIssue(
    props.catalog,
    draft.value,
    draft.value.nodeKind === 'resource' ? 'directory' : 'resource',
  ),
);
const typeChangeError = computed(() =>
  [
    'directoryTypeHasChildren',
    'directoryTypeHasReferences',
    'resourceTypeHasConfiguration',
    'rootTypeFixed',
  ].includes(props.error),
);
const identifierError = computed(
  () =>
    /^(nodeIdentifier|directoryIdentifier|resourceIdentifier)/.test(
      props.error,
    ) ||
    (props.error === 'duplicate' && props.errorPath === draft.value.key),
);
const expanded = reactive<Record<string, string[]>>({});
const entryExpanded = ref<string[]>(
  draft.value.entries.length > 0 ? ['0'] : [],
);
const editorRoot = ref<HTMLElement>();
const featureIds = new WeakMap<ResourceFeatureDraft, string>();
const pendingFeature = ref<string>();
const highlightedFeature = ref<string>();
let nextFeatureId = 0;
let highlightTimeout: ReturnType<typeof setTimeout> | undefined;

function featureId(feature: ResourceFeatureDraft) {
  const draft = toRaw(feature);
  const existing = featureIds.get(draft);
  if (existing !== undefined) return existing;
  const id = String(++nextFeatureId);
  featureIds.set(draft, id);
  return id;
}

onMounted(() => {
  editorRoot.value?.scrollIntoView({ block: 'start' });
});
onBeforeUnmount(() => clearTimeout(highlightTimeout));
const section = computed({
  get: () => draft.value.editorTab || 'basic',
  set: (value: 'basic' | 'entries' | 'operations') => {
    draft.value.editorTab = value;
  },
});
const activeOperation = computed({
  get: () =>
    draft.value.editorOperation ||
    draft.value.operations[0] ||
    props.catalog.operations[0] ||
    'read',
  set: (value: string) => {
    draft.value.editorOperation = value;
  },
});
draft.value.editorOperation ||= activeOperation.value;
const activeFeatures = computed(() =>
  draft.value.features.filter(
    (feature) => feature.operation === activeOperation.value,
  ),
);
watch(
  activeOperation,
  (operation) => {
    const [first] = activeFeatures.value;
    expanded[operation] ??= first ? [featureId(first)] : [];
  },
  { immediate: true },
);
watch(
  () => props.error,
  async (error) => {
    if (!error) return;
    const matchesPath = (key: string) =>
      !!key &&
      (key === props.errorPath || props.errorPath.split(' / ').includes(key));
    const missing = (item: { key: string; zh: string; en: string }) =>
      !item.key.trim() || !item.zh.trim() || !item.en.trim();
    const basicInvalid = missing(draft.value) || identifierError.value;
    const entryIndex = draft.value.entries.findIndex(
      (entry, index, items) =>
        matchesPath(entry.key) ||
        (!basicInvalid &&
          !props.errorPath &&
          ((error === 'required' &&
            (!entry.key.trim() || !entry.path.trim())) ||
            (error === 'duplicate' &&
              items.some(
                (other, i) => i !== index && other.key === entry.key,
              )))),
    );
    const featureIndex = draft.value.features.findIndex(
      (feature, index, items) =>
        matchesPath(feature.key) ||
        (!basicInvalid &&
          !props.errorPath &&
          ((error === 'required' && missing(feature)) ||
            (error === 'duplicate' &&
              items.some(
                (other, i) => i !== index && other.key === feature.key,
              )))),
    );
    if (entryIndex !== -1) {
      section.value = 'entries';
      entryExpanded.value = [String(entryIndex)];
    } else if (featureIndex === -1) {
      section.value = 'basic';
    } else {
      const feature = draft.value.features[featureIndex];
      if (!feature) return;
      section.value = 'operations';
      activeOperation.value = feature.operation;
      expanded[feature.operation] = [featureId(feature)];
    }
    await nextTick();
    editorRoot.value
      ?.querySelector<HTMLElement>('.ant-form-item-has-error input')
      ?.focus();
  },
);
const label = (key: string) =>
  text(props.catalog, preferences.app.locale, 'resources', key) || key;
const parents = computed(() =>
  Object.entries(props.catalog.resource_catalog.resources)
    .filter(([key, node]) => {
      if (node.kind !== 'directory' || !key.startsWith(`${props.scope}:`))
        return false;
      const seen = new Set<string>();
      for (
        let current: string | undefined = key;
        current;
        current = props.catalog.resource_catalog.resources[current]?.parent
      ) {
        if (current === draft.value.original || seen.has(current)) return false;
        seen.add(current);
      }
      return true;
    })
    .map(([value]) => ({
      value,
      label: resourceBreadcrumb(props.catalog.resource_catalog, value, label),
    })),
);
const operationOptions = computed(() =>
  draft.value.operations.map((value) => ({
    value,
    label: $t(`operations.${value}`),
  })),
);
const status = (value: string) =>
  props.error && !value.trim() ? 'error' : undefined;
const help = (value: string) =>
  props.error && !value.trim() ? t('required') : undefined;
function changeParent(value: unknown) {
  const previous = draft.value.parent || props.scope;
  draft.value.parent = String(value ?? '');
  draft.value.position = positionCount.value;
  if (!draft.value.original && draft.value.key.startsWith(`${previous}:`))
    draft.value.key = `${draft.value.parent || props.scope}:${draft.value.key.slice(previous.length + 1)}`;
  if (!draft.value.parent && !draft.value.original)
    draft.value.nodeKind = 'directory';
}
function changeKind(value: unknown) {
  const kind = value === 'resource' ? 'resource' : 'directory';
  if (
    props.disabled ||
    kind === draft.value.nodeKind ||
    resourceTypeChangeIssue(props.catalog, draft.value, kind)
  )
    return;
  draft.value.nodeKind = kind;
  draft.value.editorTab = 'basic';
  if (
    !draft.value.original &&
    value === 'resource' &&
    draft.value.key.split(':').length === 2 &&
    !draft.value.key.endsWith(':')
  )
    draft.value.key += ':';
}
function toggleOperation(operation: string, checked: boolean) {
  draft.value.operations = props.catalog.operations.filter((op) =>
    op === operation ? checked : draft.value.operations.includes(op),
  );
}
function addEntry() {
  if (draft.value.entries.length > 0) return;
  entryExpanded.value = [String(draft.value.entries.length)];
  draft.value.entries.push({
    key: draft.value.key.replace(':', ':menu:'),
    path: '',
    parentMenu: '',
    operations: draft.value.operations.includes('read') ? ['read'] : [],
  });
}
async function addFeature(operation: string) {
  const feature: ResourceFeatureDraft = {
    key: `${draft.value.key}:`,
    zh: '',
    en: '',
    operation,
    buttons: [],
    http: [],
    grpc: [],
  };
  const id = featureId(feature);
  // Settle the panel heights before scrolling to the new header.
  pendingFeature.value = id;
  draft.value.features.push(feature);
  expanded[operation] = [id];
  clearTimeout(highlightTimeout);
  highlightedFeature.value = undefined;
  await nextTick();
  if (pendingFeature.value !== id) return;
  pendingFeature.value = undefined;
  if (operation !== activeOperation.value) return;

  const header = editorRoot.value
    ?.querySelector(`[data-feature-panel="${id}"]`)
    ?.querySelector<HTMLElement>('.ant-collapse-header');
  if (!header) return;

  header.focus({ preventScroll: true });
  header.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
    block: 'start',
    inline: 'nearest',
  });
  highlightedFeature.value = id;
  highlightTimeout = setTimeout(() => {
    highlightedFeature.value = undefined;
  }, 2200);
}
function removeFeature(feature: ResourceFeatureDraft) {
  const index = draft.value.features.indexOf(feature);
  if (index === -1) return;
  const id = featureId(feature);
  expanded[feature.operation] = (expanded[feature.operation] ?? []).filter(
    (key) => key !== id,
  );
  draft.value.features.splice(index, 1);
}
</script>

<template>
  <section
    ref="editorRoot"
    class="catalog-resource catalog-node-editor"
    data-testid="resource-node-editor"
  >
    <header class="catalog-row catalog-node-heading">
      <div>
        <div class="catalog-actions">
          <h2>
            {{
              draft.original
                ? t(
                    draft.nodeKind === 'directory'
                      ? 'editDirectory'
                      : 'editResource',
                  )
                : t(
                    draft.nodeKind === 'resource'
                      ? 'newResource'
                      : draft.parent
                        ? 'newSubdirectory'
                        : 'newDirectory',
                  )
            }}
          </h2>
          <Tag color="orange">{{ t('unsaved') }}</Tag>
        </div>
        <p class="catalog-muted">{{ t('saveNodeHint') }}</p>
      </div>
      <div class="catalog-actions">
        <Button @click="emit('cancel')">{{ t('cancel') }}</Button>
        <Button
          type="primary"
          :disabled="disabled"
          data-testid="save-resource-node"
          @click="emit('save')"
        >
          <template #icon><IconifyIcon icon="lucide:save" /></template
          >{{ t('saveToDraft') }}
        </Button>
      </div>
    </header>
    <Alert
      v-if="error && (error !== 'invalidPosition' || section !== 'basic')"
      class="catalog-node-error"
      type="error"
      show-icon
      :message="t(error)"
      :description="errorPath || undefined"
    />
    <Form layout="vertical" :model="draft" class="catalog-node-form">
      <Tabs
        v-model:active-key="section"
        class="catalog-node-tabs"
        :animated="false"
      >
        <TabPane key="basic">
          <template #tab>
            <span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:box" />{{ t('basicInfo') }}</span
            >
          </template>
          <div class="catalog-editor-section-heading">
            <h3>{{ t('basicInfo') }}</h3>
            <p>{{ t('basicInfoDescription') }}</p>
            <p>{{ t('resourceNameHint') }}</p>
          </div>
          <FormItem
            :label="t('type')"
            :validate-status="typeChangeError ? 'error' : undefined"
            :help="
              t(
                typeChangeError
                  ? error
                  : typeChangeIssue || 'typeChangeAvailable',
              )
            "
          >
            <Segmented
              v-if="draft.parent"
              class="catalog-scope-switch"
              :value="draft.nodeKind"
              :disabled="disabled || !!typeChangeIssue"
              :aria-label="t('type')"
              :options="[
                { value: 'directory', label: t('subdirectory') },
                { value: 'resource', label: t('resource') },
              ]"
              @change="changeKind"
            />
            <Tag v-else color="blue">
              {{
                t(
                  draft.nodeKind === 'resource'
                    ? 'resource'
                    : draft.parent
                      ? 'subdirectory'
                      : 'directory',
                )
              }}
            </Tag>
          </FormItem>
          <div class="catalog-node-fields">
            <FormItem
              class="catalog-node-wide"
              :label="t('identifier')"
              required
              :validate-status="identifierError ? 'error' : undefined"
              :help="
                identifierError
                  ? [t(error), errorPath].filter(Boolean).join(' · ')
                  : t('nodeIdentifierHint')
              "
            >
              <Input
                v-model:value="draft.key"
                :disabled="disabled || !!draft.original"
                :aria-label="t('identifier')"
                data-testid="editor-key"
              />
            </FormItem>
            <FormItem
              :label="t('zh')"
              :extra="t('resourceNameUsage')"
              required
              :validate-status="status(draft.zh)"
              :help="help(draft.zh)"
            >
              <Input
                v-model:value="draft.zh"
                :disabled="disabled"
                :aria-label="t('zh')"
                data-testid="editor-zh"
              />
            </FormItem>
            <FormItem
              label="English"
              :extra="t('resourceNameUsage')"
              required
              :validate-status="status(draft.en)"
              :help="help(draft.en)"
            >
              <Input
                v-model:value="draft.en"
                :disabled="disabled"
                aria-label="English"
                data-testid="editor-en"
              />
            </FormItem>
            <FormItem
              :label="t('parent')"
              :extra="draft.original ? t('useTreeToMove') : undefined"
            >
              <Select
                :value="draft.parent || undefined"
                :disabled="disabled || !!draft.original"
                :options="parents"
                allow-clear
                :aria-label="t('parent')"
                :placeholder="t('rootDirectory')"
                @change="changeParent"
              />
            </FormItem>
            <FormItem
              :label="t('position')"
              :validate-status="
                error === 'invalidPosition' ? 'error' : undefined
              "
              :help="
                error === 'invalidPosition'
                  ? t('invalidPosition')
                  : t('positionHint')
              "
            >
              <InputNumber
                :value="
                  draft.position === null
                    ? undefined
                    : (draft.position ?? initialPosition)
                "
                :disabled="disabled"
                :aria-valuemin="1"
                :aria-valuemax="positionCount"
                :aria-label="t('position')"
                @update:value="
                  draft.position = typeof $event === 'number' ? $event : null
                "
              />
            </FormItem>
            <FormItem
              v-if="draft.nodeKind === 'directory' && !draft.parent"
              :label="t('frontendVisible')"
              :extra="t('frontendVisibleHint')"
            >
              <Switch
                :checked="draft.frontendVisible ?? true"
                :disabled="disabled"
                :aria-label="t('frontendVisible')"
                data-testid="editor-frontend-visible"
                @update:checked="draft.frontendVisible = !!$event"
              />
            </FormItem>
          </div>
          <FormItem
            v-if="referenceCollection"
            class="catalog-node-reference-field"
            :label="t('references')"
            :validate-status="
              ['invalidReference', 'invalidReferenceOperations'].includes(error)
                ? 'error'
                : undefined
            "
            :help="
              ['invalidReference', 'invalidReferenceOperations'].includes(error)
                ? t(error)
                : undefined
            "
          >
            <ResourceReferencePicker
              :catalog="catalog"
              :scope="scope"
              :disabled="disabled"
            />
          </FormItem>
        </TabPane>
        <TabPane v-if="draft.nodeKind === 'resource'" key="entries">
          <template #tab>
            <span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:panels-top-left" />{{ t('entries')
              }}<span class="catalog-count">{{
                draft.entries.length
              }}</span></span
            >
          </template>
          <div class="catalog-section-title">
            <div class="catalog-editor-section-heading">
              <h3>{{ t('entries') }}</h3>
              <p>{{ t('entriesDescription') }}</p>
            </div>
            <Button
              v-if="!draft.entries.length"
              :disabled="disabled"
              @click="addEntry"
            >
              <template #icon><IconifyIcon icon="lucide:plus" /></template
              >{{ t('addEntry') }}
            </Button>
          </div>
          <div v-if="!draft.entries.length" class="catalog-editor-empty">
            <IconifyIcon
              icon="lucide:panel-top-dashed"
              aria-hidden="true"
            /><strong>{{ t('noEntries') }}</strong>
            <p>{{ t('noEntriesHint') }}</p>
            <Button
              v-if="!draft.entries.length"
              :disabled="disabled"
              @click="addEntry"
            >
              <template #icon><IconifyIcon icon="lucide:plus" /></template
              >{{ t('addEntry') }}
            </Button>
          </div>
          <Collapse
            v-else
            v-model:active-key="entryExpanded"
            class="catalog-entry-editor"
            expand-icon-position="end"
          >
            <CollapsePanel
              v-for="(entry, index) in draft.entries"
              :key="String(index)"
            >
              <template #header>
                <div class="catalog-entry-editor-title">
                  <IconifyIcon icon="lucide:monitor" aria-hidden="true" />
                  <div>
                    <strong>{{ draft.zh || draft.en || t('newEntry') }}</strong
                    ><code>{{ entry.path || t('routePending') }}</code>
                  </div>
                </div>
              </template>
              <template #extra>
                <Button
                  type="text"
                  danger
                  size="small"
                  :disabled="disabled"
                  @click.stop="draft.entries.splice(index, 1)"
                >
                  {{ t('remove') }}
                </Button>
              </template>
              <div class="catalog-node-fields">
                <FormItem
                  class="catalog-node-wide"
                  :label="t('identifier')"
                  required
                  :validate-status="status(entry.key)"
                  :help="help(entry.key)"
                >
                  <Input
                    v-model:value="entry.key"
                    :disabled="disabled"
                    :aria-label="`${t('entries')} ${index + 1} ${t('identifier')}`"
                  />
                </FormItem>
                <FormItem
                  class="catalog-node-wide"
                  :label="t('route')"
                  required
                  :validate-status="status(entry.path)"
                  :help="help(entry.path)"
                >
                  <Input
                    v-model:value="entry.path"
                    :disabled="disabled"
                    :aria-label="t('route')"
                    placeholder="/system/resource"
                  />
                </FormItem>
              </div>
            </CollapsePanel>
          </Collapse>
        </TabPane>
        <TabPane v-if="draft.nodeKind === 'resource'" key="operations">
          <template #tab>
            <span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:sliders-horizontal" />{{
                t('operations')
              }}<span class="catalog-count">{{
                draft.permissionScope === '*' ? '*' : draft.operations.length
              }}</span></span
            >
          </template>
          <div class="catalog-operation-settings">
            <div class="catalog-editor-section-heading">
              <h3>{{ t('operations') }}</h3>
              <p v-if="draft.permissionScope !== '*'">
                {{ t('operationsHint') }}
              </p>
            </div>
            <FormItem
              class="catalog-resource-permission-scope"
              :label="t('permissionScope')"
              :extra="t('permissionScopeHint')"
            >
              <Segmented
                :value="draft.permissionScope ?? ''"
                :disabled="disabled"
                :aria-label="t('permissionScope')"
                data-testid="editor-permission-scope"
                :options="[
                  { value: '', label: t('configuredScope') },
                  { value: '*', label: t('allScope') },
                ]"
                @change="draft.permissionScope = $event === '*' ? '*' : ''"
              />
            </FormItem>
          </div>
          <div
            v-if="draft.permissionScope !== '*'"
            class="catalog-operation-workbench"
          >
            <nav class="catalog-operation-nav" :aria-label="t('operation')">
              <div
                v-for="operation in catalog.operations"
                :key="operation"
                class="catalog-operation-choice"
                :class="{
                  'catalog-operation-choice--active':
                    activeOperation === operation,
                }"
              >
                <button
                  class="catalog-operation-select"
                  type="button"
                  :aria-current="
                    activeOperation === operation ? 'true' : undefined
                  "
                  @click="activeOperation = operation"
                >
                  <IconifyIcon
                    :icon="
                      (
                        {
                          read: 'lucide:eye',
                          create: 'lucide:plus',
                          update: 'lucide:pencil',
                          delete: 'lucide:trash-2',
                        } as Record<string, string>
                      )[operation] || 'lucide:zap'
                    "
                    aria-hidden="true"
                  />
                  <span
                    ><strong>{{ $t(`operations.${operation}`) }}</strong
                    ><code>{{ operation }}</code></span
                  >
                </button>
                <Switch
                  size="small"
                  :checked="draft.operations.includes(operation)"
                  :disabled="disabled"
                  :aria-label="`${t('enable')} ${operation}`"
                  @change="
                    (value) => toggleOperation(operation, Boolean(value))
                  "
                />
              </div>
            </nav>
            <div class="catalog-operation-config">
              <div
                class="catalog-section-title catalog-operation-config-heading"
              >
                <div class="catalog-actions">
                  <h3>{{ $t(`operations.${activeOperation}`) }}</h3>
                  <Tag
                    :color="
                      draft.operations.includes(activeOperation)
                        ? 'blue'
                        : undefined
                    "
                  >
                    {{
                      draft.operations.includes(activeOperation)
                        ? t('enabled')
                        : t('notEnabled')
                    }}
                  </Tag>
                </div>
                <Button
                  v-if="draft.operations.includes(activeOperation)"
                  :disabled="disabled"
                  @click="addFeature(activeOperation)"
                >
                  <template #icon><IconifyIcon icon="lucide:plus" /></template
                  >{{ t('addFeature') }}
                </Button>
              </div>
              <div
                v-if="!draft.operations.includes(activeOperation)"
                class="catalog-editor-empty catalog-disabled-operation"
              >
                <IconifyIcon
                  icon="lucide:toggle-left"
                  aria-hidden="true"
                /><strong>{{ t('operationDisabled') }}</strong>
                <p>{{ t('enableOperationHint') }}</p>
                <Button
                  :disabled="disabled"
                  @click="toggleOperation(activeOperation, true)"
                >
                  {{ t('enable') }}
                  {{ $t(`operations.${activeOperation}`) }}
                </Button>
              </div>
              <template v-else>
                <div v-if="!activeFeatures.length" class="catalog-editor-empty">
                  <IconifyIcon
                    icon="lucide:blocks"
                    aria-hidden="true"
                  /><strong>{{ t('noFeatures') }}</strong>
                  <p>{{ t('noFeaturesHint') }}</p>
                  <Button
                    :disabled="disabled"
                    @click="addFeature(activeOperation)"
                  >
                    {{ t('addFeature') }}
                  </Button>
                </div>
                <Collapse
                  v-else
                  v-model:active-key="expanded[activeOperation]"
                  :open-animation="pendingFeature ? { css: false } : undefined"
                  class="catalog-feature-editor"
                  expand-icon-position="end"
                >
                  <CollapsePanel
                    v-for="feature in activeFeatures"
                    :key="featureId(feature)"
                    :data-feature-panel="featureId(feature)"
                    :class="{
                      'catalog-feature-panel--highlighted':
                        highlightedFeature === featureId(feature),
                    }"
                  >
                    <template #header>
                      <div class="catalog-feature-editor-title">
                        <strong>{{
                          feature.zh || feature.en || t('newFeature')
                        }}</strong
                        ><code>{{ feature.key }}</code
                        ><span class="catalog-muted"
                          >{{ feature.buttons.length }}
                          {{ t('buttonCountLabel') }} /
                          {{ feature.http.length + feature.grpc.length }}
                          {{ t('endpointCountLabel') }}</span
                        >
                      </div>
                    </template>
                    <template #extra>
                      <Button
                        type="text"
                        danger
                        size="small"
                        :disabled="disabled"
                        @click.stop="removeFeature(feature)"
                      >
                        {{ t('remove') }}
                      </Button>
                    </template>
                    <ResourceFeatureEditor
                      :feature="feature"
                      @patch="Object.assign(feature, $event)"
                      :catalog="catalog.resource_catalog"
                      :resource-key="draft.key"
                      :disabled="disabled"
                      :error="error"
                      :operation-options="operationOptions"
                    />
                  </CollapsePanel>
                </Collapse>
              </template>
            </div>
          </div>
        </TabPane>
      </Tabs>
    </Form>
  </section>
</template>
