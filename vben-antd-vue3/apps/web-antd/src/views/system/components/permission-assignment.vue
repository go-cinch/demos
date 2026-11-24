<script setup lang="ts">
import type { AssignmentAction } from './permission-selection';

import type { LoadFailure } from '#/api/request-error';
import type { ActionResourceBinding, PermissionCatalog } from '#/api/system';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Form, FormItemRest, Spin } from 'ant-design-vue';

import { isForbiddenError, loadFailure } from '#/api/request-error';
import { getPermissionCatalog, listActions } from '#/api/system';
import LoadWarning from '#/components/load-warning.vue';
import { $t } from '#/locales';

import PermissionResourceEditor from './permission-resource-editor.vue';
import {
  actionSelection,
  normalizeSelection,
  selectionFingerprint,
} from './permission-selection';
import {
  actionResourceBindings,
  resolveResourceBindings,
} from './resource-catalog';

defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    value?: string[];
    bindings?: ActionResourceBinding[];
    disabled?: boolean;
  }>(),
  { value: () => [], bindings: undefined, disabled: false },
);
const emit = defineEmits<{
  'update:bindings': [ActionResourceBinding[] | undefined];
  validity: [string];
}>();
const formItem = Form.useInjectFormItemContext();
const catalog = ref<PermissionCatalog>();
const loading = ref(false);
const failed = ref<LoadFailure>(false);
const forbidden = ref(false);
const missingCodes = ref<string[]>([]);
const scope = ref('admin');
const selection = ref<ActionResourceBinding[]>([]);
let original = '';
let generation = 0;
const scopeConfig = computed(() => {
  const bindings = selection.value.filter((binding) =>
    binding.resource_key.startsWith(`${scope.value}:`),
  );
  return catalog.value
    ? resolveResourceBindings(
        catalog.value.resource_catalog,
        scope.value,
        bindings,
      )
    : { bindings, ui: [], endpoints: [] };
});
const problem = computed(() => {
  if (loading.value) {
    return 'action-editor.catalogLoading';
  }
  if (failed.value) {
    return 'permission-assignment.resourceLoadError';
  }
  return '';
});
watch(problem, (value) => emit('validity', value), { immediate: true });

async function load() {
  const request = ++generation;
  loading.value = true;
  failed.value = false;
  forbidden.value = false;
  try {
    const document = await getPermissionCatalog(
      'scopes,operations,resource_catalog',
    );
    const codes = [...new Set(props.value)];
    const actions = new Map<string, AssignmentAction>();
    // Hydrate the actual definitions in batches; role/user associations omit config.
    for (let offset = 0; offset < codes.length; offset += 100) {
      const chunk = codes.slice(offset, offset + 100);
      let page = 1;
      while (true) {
        const response = await listActions({
          code: `${chunk.join(',')},`,
          f: 'id,code,word,config',
          p: page,
          s: 100,
        });
        if (request !== generation) return;
        response.items.forEach((action) => actions.set(action.code, action));
        if (response.p * response.s >= response.t) break;
        page++;
      }
    }
    if (request !== generation) return;
    // Missing rows after a successful, complete query are revoked definitions,
    // not a catalog/network failure. Never recreate them from a stale cache.
    const missing = codes.filter((code) => !actions.has(code));
    const initial = normalizeSelection(
      document.resource_catalog,
      codes.flatMap((code) => {
        const action = actions.get(code);
        return action ? actionSelection(document.resource_catalog, action) : [];
      }),
    );
    catalog.value = document;
    original = selectionFingerprint(initial);
    selection.value = props.bindings
      ? normalizeSelection(document.resource_catalog, props.bindings)
      : initial;
    missingCodes.value = missing;
    // Existing orphan references are removed only when the user saves the form.
    if (missing.length > 0) emit('update:bindings', selection.value);
    scope.value =
      selection.value[0]?.resource_key.split(':')[0] ??
      document.scopes[0] ??
      'admin';
  } catch (requestError) {
    if (request !== generation) return;
    if (isForbiddenError(requestError)) {
      forbidden.value = true;
      if (props.bindings !== undefined) emit('update:bindings', undefined);
    } else {
      failed.value = loadFailure(requestError);
    }
  } finally {
    if (request === generation) loading.value = false;
  }
}
function update(config: Parameters<typeof actionResourceBindings>[0]) {
  if (
    props.disabled ||
    loading.value ||
    failed.value ||
    forbidden.value ||
    !catalog.value
  )
    return;
  selection.value = normalizeSelection(catalog.value.resource_catalog, [
    ...selection.value.filter(
      (binding) => !binding.resource_key.startsWith(`${scope.value}:`),
    ),
    ...actionResourceBindings(config),
  ]);
  emit(
    'update:bindings',
    missingCodes.value.length === 0 &&
      selectionFingerprint(selection.value) === original
      ? undefined
      : selection.value,
  );
  formItem.onFieldChange();
}
watch(() => props.value.join(','), load, { immediate: true });
onBeforeUnmount(() => {
  ++generation;
});
</script>

<template>
  <FormItemRest>
    <div
      v-bind="$attrs"
      class="permission-assignment"
      data-testid="association-action"
    >
      <LoadWarning
        v-if="failed"
        :failure="failed"
        class="mb-4"
        :retry-label="$t('system-cards.retry')"
        retry-size="small"
        @retry="load"
      />
      <Alert
        v-if="!forbidden && !failed && !loading && missingCodes.length"
        class="mb-4"
        type="info"
        show-icon
        :message="
          $t('permission-assignment.deletedActions', {
            count: missingCodes.length,
          })
        "
      />
      <Alert
        v-if="forbidden"
        type="info"
        show-icon
        :message="$t('permission-assignment.catalogForbidden')"
      />
      <Spin
        v-else
        :spinning="loading"
        :tip="$t('action-editor.catalogLoading')"
      >
        <PermissionResourceEditor
          v-if="catalog"
          :catalog="catalog"
          :scope="scope"
          :config="scopeConfig"
          :disabled="Boolean(disabled || loading || failed)"
          assignment
          @update:scope="scope = $event"
          @update:config="update"
        />
        <div v-else class="permission-loading" :aria-busy="loading"></div>
      </Spin>
    </div>
  </FormItemRest>
</template>

<style scoped>
.permission-assignment {
  min-width: 0;
}

.permission-loading {
  min-height: 300px;
}
</style>
