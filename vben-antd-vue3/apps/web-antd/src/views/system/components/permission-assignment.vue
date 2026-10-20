<script setup lang="ts">
import type { ActionResourceBinding, PermissionCatalog } from '#/api/system';
import type { AssignmentAction } from './permission-selection';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Alert, Button, Form, FormItemRest, Spin } from 'ant-design-vue';
import { getPermissionCatalog, listActions } from '#/api/system';
import { $t, refreshI18nCatalog } from '#/locales';

import PermissionResourceEditor from './permission-resource-editor.vue';
import { actionSelection, normalizeSelection, selectionFingerprint } from './permission-selection';
import { actionResourceBindings, resolveResourceBindings } from './resource-catalog';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{
  value?: string[];
  bindings?: ActionResourceBinding[];
  disabled?: boolean;
}>(), { value: () => [], bindings: undefined, disabled: false });
const emit = defineEmits<{
  'update:bindings': [ActionResourceBinding[] | undefined];
  validity: [string];
}>();
const formItem = Form.useInjectFormItemContext();
const catalog = ref<PermissionCatalog>();
const loading = ref(false);
const failed = ref(false);
const missingCodes = ref<string[]>([]);
const scope = ref('admin');
const selection = ref<ActionResourceBinding[]>([]);
let original = '';
let generation = 0;
const scopeConfig = computed(() => {
  const bindings = selection.value.filter((binding) => binding.resource_key.startsWith(`${scope.value}:`));
  return catalog.value ? resolveResourceBindings(catalog.value.resource_catalog, scope.value, bindings) : { bindings, ui: [], endpoints: [] };
});
const problem = computed(() => loading.value ? 'action-editor.catalogLoading' : failed.value ? 'permission-assignment.resourceLoadError' : '');
watch(problem, (value) => emit('validity', value), { immediate: true });

async function load() {
  const request = ++generation;
  loading.value = true;
  failed.value = false;
  try {
    const [document] = await Promise.all([getPermissionCatalog('scopes,operations,resource_catalog'), refreshI18nCatalog()]);
    const codes = [...new Set(props.value)];
    const actions = new Map<string, AssignmentAction>();
    // Hydrate the actual definitions in batches; role/user associations omit config.
    for (let offset = 0; offset < codes.length; offset += 100) {
      const chunk = codes.slice(offset, offset + 100);
      let page = 1;
      while (true) {
        const response = await listActions({ code: `${chunk.join(',')},`, f: 'id,code,word,config', p: page, s: 100 });
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
    const initial = normalizeSelection(document.resource_catalog, codes.filter((code) => actions.has(code)).flatMap((code) => actionSelection(document.resource_catalog, actions.get(code)!)));
    catalog.value = document;
    original = selectionFingerprint(initial);
    selection.value = props.bindings ? normalizeSelection(document.resource_catalog, props.bindings) : initial;
    missingCodes.value = missing;
    // Existing orphan references are removed only when the user saves the form.
    if (missing.length) emit('update:bindings', selection.value);
    scope.value = selection.value[0]?.resource_key.split(':')[0] ?? document.scopes[0] ?? 'admin';
  } catch { if (request === generation) failed.value = true; }
  finally { if (request === generation) loading.value = false; }
}
function update(config: Parameters<typeof actionResourceBindings>[0]) {
  if (props.disabled || loading.value || failed.value || !catalog.value) return;
  selection.value = normalizeSelection(catalog.value.resource_catalog, [
    ...selection.value.filter((binding) => !binding.resource_key.startsWith(`${scope.value}:`)),
    ...actionResourceBindings(config),
  ]);
  emit('update:bindings', !missingCodes.value.length && selectionFingerprint(selection.value) === original ? undefined : selection.value);
  formItem.onFieldChange();
}
watch(() => props.value.join(','), load, { immediate: true });
onBeforeUnmount(() => { ++generation; });
</script>

<template>
  <FormItemRest>
    <div v-bind="$attrs" class="permission-assignment" data-testid="association-action">
      <Alert v-if="failed" class="mb-4" type="error" show-icon :message="$t('permission-assignment.resourceLoadError')"><template #action><Button size="small" @click="load">{{ $t('system-cards.retry') }}</Button></template></Alert>
      <Alert v-if="!failed && !loading && missingCodes.length" class="mb-4" type="info" show-icon :message="$t('permission-assignment.deletedActions', { count: missingCodes.length })" />
      <Spin :spinning="loading" :tip="$t('action-editor.catalogLoading')">
        <PermissionResourceEditor v-if="catalog" :catalog="catalog" :scope="scope" :config="scopeConfig" :disabled="disabled || loading || failed" assignment @update:scope="scope = $event" @update:config="update" />
        <div v-else class="permission-loading" :aria-busy="loading"></div>
      </Spin>
    </div>
  </FormItemRest>
</template>

<style scoped>
.permission-assignment { min-width: 0; }
.permission-loading { min-height: 300px; }
</style>
