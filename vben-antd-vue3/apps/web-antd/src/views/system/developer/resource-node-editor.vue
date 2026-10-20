<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { IconifyIcon } from '@vben/icons';
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
  Tag,
  Tabs,
  TabPane,
} from 'ant-design-vue';
import { $t } from '#/locales';
import { preferences } from '@vben/preferences';
import type {
  Catalog,
  ResourceEditor,
  ResourceFeatureDraft,
} from './catalog-model';
import { text } from './catalog-model';
import { resourceBreadcrumb } from '../components/resource-catalog';
import { supportsResourceReferences } from '../components/resource-references';
import { resourceChildren } from '../components/resource-order';
import { resourceTypeChangeIssue } from './resource-editor-model';
import ResourceReferencePicker from './resource-reference-picker.vue';
import ResourceFeatureEditor from './resource-feature-editor.vue';

const props = defineProps<{
  catalog: Catalog;
  draft: ResourceEditor;
  scope: string;
  disabled: boolean;
  error: string;
  errorPath: string;
}>();
const emit = defineEmits<{ save: []; cancel: [] }>();
const t = (key: string) => $t(`developer.${key}`);
const siblings = computed(() =>
  resourceChildren(
    props.catalog.resource_catalog,
    props.draft.parent,
    props.scope,
  ),
);
const positionCount = computed(
  () =>
    siblings.value.filter(
      (item) => !(item.kind === 'node' && item.key === props.draft.original),
    ).length + 1,
);
const initialPosition = computed(() =>
  props.draft.original
    ? siblings.value.findIndex(
        (item) => item.kind === 'node' && item.key === props.draft.original,
      ) + 1
    : positionCount.value,
);
const referenceCollection = computed(
  () =>
    supportsResourceReferences({ kind: props.draft.nodeKind, parent: props.draft.parent, references: props.draft.references }),
);
const typeChangeIssue = computed(() =>
  resourceTypeChangeIssue(
    props.catalog,
    props.draft,
    props.draft.nodeKind === 'resource' ? 'directory' : 'resource',
  ),
);
const typeChangeError = computed(() =>
  [
    'rootTypeFixed',
    'resourceTypeHasConfiguration',
    'directoryTypeHasChildren',
    'directoryTypeHasReferences',
  ].includes(props.error),
);
const identifierError = computed(
  () =>
    /^(nodeIdentifier|directoryIdentifier|resourceIdentifier)/.test(
      props.error,
    ) ||
    (props.error === 'duplicate' && props.errorPath === props.draft.key),
);
const expanded = reactive<Record<string, string[]>>({});
const entryExpanded = ref<string[]>(props.draft.entries.length ? ['0'] : []);
const editorRoot = ref<HTMLElement>();
onMounted(() => {
  editorRoot.value?.scrollIntoView({ block: 'start' });
});
const section = computed({
  get: () => props.draft.editorTab || 'basic',
  set: (value: 'basic' | 'entries' | 'operations') => {
    props.draft.editorTab = value;
  },
});
const activeOperation = computed({
  get: () =>
    props.draft.editorOperation ||
    props.draft.operations[0] ||
    props.catalog.operations[0] ||
    'read',
  set: (value: string) => {
    props.draft.editorOperation = value;
  },
});
props.draft.editorOperation ||= activeOperation.value;
watch(
  activeOperation,
  (operation) => {
    const index = props.draft.features.findIndex(
      (feature) => feature.operation === operation,
    );
    if (!expanded[operation])
      expanded[operation] = index < 0 ? [] : [String(index)];
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
    const basicInvalid = missing(props.draft) || identifierError.value;
    const entryIndex = props.draft.entries.findIndex(
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
    const featureIndex = props.draft.features.findIndex(
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
    if (entryIndex >= 0) {
      section.value = 'entries';
      entryExpanded.value = [String(entryIndex)];
    } else if (featureIndex >= 0) {
      const operation = props.draft.features[featureIndex]!.operation;
      section.value = 'operations';
      activeOperation.value = operation;
      expanded[operation] = [String(featureIndex)];
    } else section.value = 'basic';
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
        if (current === props.draft.original || seen.has(current)) return false;
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
  props.draft.operations.map((value) => ({
    value,
    label: $t(`operations.${value}`),
  })),
);
const status = (value: string) =>
  props.error && !value.trim() ? 'error' : undefined;
const help = (value: string) =>
  props.error && !value.trim() ? t('required') : undefined;
const features = (operation: string) =>
  props.draft.features.filter((feature) => feature.operation === operation);
function changeParent(value: unknown) {
  const previous = props.draft.parent || props.scope;
  props.draft.parent = String(value ?? '');
  props.draft.position = positionCount.value;
  if (!props.draft.original && props.draft.key.startsWith(`${previous}:`))
    props.draft.key = `${props.draft.parent || props.scope}:${props.draft.key.slice(previous.length + 1)}`;
  if (!props.draft.parent && !props.draft.original)
    props.draft.nodeKind = 'directory';
}
function changeKind(value: unknown) {
  const kind = value === 'resource' ? 'resource' : 'directory';
  if (
    props.disabled ||
    kind === props.draft.nodeKind ||
    resourceTypeChangeIssue(props.catalog, props.draft, kind)
  )
    return;
  props.draft.nodeKind = kind;
  props.draft.editorTab = 'basic';
  if (
    !props.draft.original &&
    value === 'resource' &&
    props.draft.key.split(':').length === 2 &&
    !props.draft.key.endsWith(':')
  )
    props.draft.key += ':';
}
function toggleOperation(operation: string, checked: boolean) {
  props.draft.operations = props.catalog.operations.filter((op) =>
    op === operation ? checked : props.draft.operations.includes(op),
  );
}
function addEntry() {
  if (props.draft.entries.length) return;
  entryExpanded.value = [String(props.draft.entries.length)];
  props.draft.entries.push({
    key: props.draft.key.replace(':', ':menu:'),
    path: '',
    parentMenu: '',
    operations: props.draft.operations.includes('read') ? ['read'] : [],
  });
}
function addFeature(operation: string) {
  props.draft.features.push({
    key: `${props.draft.key}:`,
    zh: '',
    en: '',
    operation,
    buttons: [],
    http: [],
    grpc: [],
  });
  (expanded[operation] ??= []).push(String(props.draft.features.length - 1));
}
function removeFeature(feature: ResourceFeatureDraft) {
  props.draft.features.splice(props.draft.features.indexOf(feature), 1);
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
      v-if="error"
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
          <template #tab
            ><span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:box" />{{ t('basicInfo') }}</span
            ></template
          >
          <div class="catalog-editor-section-heading">
            <h3>{{ t('basicInfo') }}</h3>
            <p>{{ t('basicInfoDescription') }}</p>
            <p>{{ t('resourceNameHint') }}</p>
          </div>
          <FormItem
            :label="t('type')"
            :validate-status="typeChangeError ? 'error' : undefined"
            :help="t(typeChangeError ? error : typeChangeIssue || 'typeChangeAvailable')"
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
            <Tag v-else color="blue">{{
              t(
                draft.nodeKind === 'resource'
                  ? 'resource'
                  : draft.parent
                    ? 'subdirectory'
                    : 'directory',
              )
            }}</Tag>
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
              ><Input
                v-model:value="draft.zh"
                :disabled="disabled"
                :aria-label="t('zh')"
                data-testid="editor-zh"
            /></FormItem>
            <FormItem
              label="English"
              :extra="t('resourceNameUsage')"
              required
              :validate-status="status(draft.en)"
              :help="help(draft.en)"
              ><Input
                v-model:value="draft.en"
                :disabled="disabled"
                aria-label="English"
                data-testid="editor-en"
            /></FormItem>
            <FormItem
              :label="t('parent')"
              :extra="draft.original ? t('useTreeToMove') : undefined"
              ><Select
                :value="draft.parent || undefined"
                :disabled="disabled || !!draft.original"
                :options="parents"
                allow-clear
                :aria-label="t('parent')"
                :placeholder="t('rootDirectory')"
                @change="changeParent"
            /></FormItem>
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
              ><InputNumber
                :value="
                  draft.position === null
                    ? undefined
                    : (draft.position ?? initialPosition)
                "
                :disabled="disabled"
                :min="1"
                :max="positionCount"
                :precision="0"
                :aria-label="t('position')"
                @update:value="
                  draft.position = typeof $event === 'number' ? $event : null
                "
            /></FormItem>
            <FormItem v-if="draft.nodeKind === 'directory' && !draft.parent" :label="t('frontendVisible')" :extra="t('frontendVisibleHint')">
              <Switch :checked="draft.frontendVisible ?? true" :disabled="disabled" :aria-label="t('frontendVisible')" data-testid="editor-frontend-visible" @update:checked="draft.frontendVisible = !!$event" />
            </FormItem>
          </div>
          <FormItem
            v-if="referenceCollection"
            class="catalog-node-reference-field"
            :label="t('references')"
            :validate-status="
              ['invalidReference', 'invalidReferenceOperations'].includes(error) ? 'error' : undefined
            "
            :help="
              ['invalidReference', 'invalidReferenceOperations'].includes(error) ? t(error) : undefined
            "
          >
            <ResourceReferencePicker
              :catalog="catalog"
              :draft="draft"
              :scope="scope"
              :disabled="disabled"
            />
          </FormItem>
        </TabPane>
        <TabPane v-if="draft.nodeKind === 'resource'" key="entries">
          <template #tab
            ><span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:panels-top-left" />{{ t('entries')
              }}<span class="catalog-count">{{
                draft.entries.length
              }}</span></span
            ></template
          >
          <div class="catalog-section-title">
            <div class="catalog-editor-section-heading">
              <h3>{{ t('entries') }}</h3>
              <p>{{ t('entriesDescription') }}</p>
            </div>
            <Button
              v-if="!draft.entries.length"
              :disabled="disabled"
              @click="addEntry"
              ><template #icon><IconifyIcon icon="lucide:plus" /></template
              >{{ t('addEntry') }}</Button
            >
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
              ><template #icon><IconifyIcon icon="lucide:plus" /></template
              >{{ t('addEntry') }}</Button
            >
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
              <template #header
                ><div class="catalog-entry-editor-title">
                  <IconifyIcon icon="lucide:monitor" aria-hidden="true" />
                  <div>
                    <strong>{{ draft.zh || draft.en || t('newEntry') }}</strong
                    ><code>{{ entry.path || t('routePending') }}</code>
                  </div>
                </div></template
              >
              <template #extra
                ><Button
                  type="text"
                  danger
                  size="small"
                  :disabled="disabled"
                  @click.stop="draft.entries.splice(index, 1)"
                  >{{ t('remove') }}</Button
                ></template
              >
              <div class="catalog-node-fields">
                <FormItem
                  class="catalog-node-wide"
                  :label="t('identifier')"
                  required
                  :validate-status="status(entry.key)"
                  :help="help(entry.key)"
                  ><Input
                    v-model:value="entry.key"
                    :disabled="disabled"
                    :aria-label="`${t('entries')} ${index + 1} ${t('identifier')}`"
                /></FormItem>
                <FormItem
                  class="catalog-node-wide"
                  :label="t('route')"
                  required
                  :validate-status="status(entry.path)"
                  :help="help(entry.path)"
                  ><Input
                    v-model:value="entry.path"
                    :disabled="disabled"
                    :aria-label="t('route')"
                    placeholder="/system/resource"
                /></FormItem>
              </div>
            </CollapsePanel>
          </Collapse>
        </TabPane>
        <TabPane v-if="draft.nodeKind === 'resource'" key="operations">
          <template #tab
            ><span class="catalog-editor-tab"
              ><IconifyIcon icon="lucide:sliders-horizontal" />{{
                t('operations')
              }}<span class="catalog-count">{{
                draft.permissionScope === '*' ? '*' : draft.operations.length
              }}</span></span
            ></template
          >
          <div class="catalog-operation-settings">
            <div class="catalog-editor-section-heading">
              <h3>{{ t('operations') }}</h3>
              <p v-if="draft.permissionScope !== '*'">{{ t('operationsHint') }}</p>
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
          <div v-if="draft.permissionScope !== '*'" class="catalog-operation-workbench">
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
                    >{{
                      draft.operations.includes(activeOperation)
                        ? t('enabled')
                        : t('notEnabled')
                    }}</Tag
                  >
                </div>
                <Button
                  v-if="draft.operations.includes(activeOperation)"
                  :disabled="disabled"
                  @click="addFeature(activeOperation)"
                  ><template #icon><IconifyIcon icon="lucide:plus" /></template
                  >{{ t('addFeature') }}</Button
                >
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
                  >{{ t('enable') }}
                  {{ $t(`operations.${activeOperation}`) }}</Button
                >
              </div>
              <template v-else>
                <div
                  v-if="!features(activeOperation).length"
                  class="catalog-editor-empty"
                >
                  <IconifyIcon
                    icon="lucide:blocks"
                    aria-hidden="true"
                  /><strong>{{ t('noFeatures') }}</strong>
                  <p>{{ t('noFeaturesHint') }}</p>
                  <Button
                    :disabled="disabled"
                    @click="addFeature(activeOperation)"
                    >{{ t('addFeature') }}</Button
                  >
                </div>
                <Collapse
                  v-else
                  v-model:active-key="expanded[activeOperation]"
                  class="catalog-feature-editor"
                  expand-icon-position="end"
                >
                  <CollapsePanel
                    v-for="feature in features(activeOperation)"
                    :key="String(draft.features.indexOf(feature))"
                  >
                    <template #header
                      ><div class="catalog-feature-editor-title">
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
                      </div></template
                    >
                    <template #extra
                      ><Button
                        type="text"
                        danger
                        size="small"
                        :disabled="disabled"
                        @click.stop="removeFeature(feature)"
                        >{{ t('remove') }}</Button
                      ></template
                    >
                    <ResourceFeatureEditor
                      :feature="feature"
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
