<script setup lang="ts">
import type { AssignmentAction } from './permission-selection';

import type { ActionResourceBinding, PermissionCatalog } from '#/api/system';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Button, Empty, Spin } from 'ant-design-vue';

import { getPermissionCatalog, listActions } from '#/api/system';
import { $t, refreshI18nCatalog } from '#/locales';

import PermissionResourceEditor from './permission-resource-editor.vue';
import { actionSelection, normalizeSelection } from './permission-selection';
import { resolveResourceBindings } from './resource-catalog';

const props = withDefaults(defineProps<{ actions?: AssignmentAction[]; codes?: string[] }>(), { actions: () => [], codes: () => [] });
const catalog = ref<PermissionCatalog>();
const selections = ref<ActionResourceBinding[]>([]);
const scope = ref('admin');
const loading = ref(false);
const failed = ref(false);
const unresolved = ref(0);
let request = 0;
const config = computed(() => catalog.value ? resolveResourceBindings(catalog.value.resource_catalog, scope.value, selections.value.filter((item) => item.resource_key.startsWith(`${scope.value}:`))) : undefined);
const hasAssignments = computed(() => props.codes.length > 0 || props.actions.length > 0);
async function load() {
  const current = ++request;
  catalog.value = undefined;
  selections.value = [];
  unresolved.value = 0;
  failed.value = false;
  if (!hasAssignments.value) { loading.value = false; return; }
  loading.value = true;
  try {
    const [document] = await Promise.all([getPermissionCatalog('scopes,operations,resource_catalog'), refreshI18nCatalog()]);
    if (current !== request) return;
    const definitions = new Map(props.actions.filter((item) => item.config).map((item) => [item.code, item]));
    const codes = [...new Set([...props.codes, ...props.actions.map((item) => item.code)])];
    const missing = codes.filter((code) => !definitions.has(code));
    for (let offset = 0; offset < missing.length; offset += 100) {
      const chunk = missing.slice(offset, offset + 100);
      let page = 1;
      while (true) {
        const result = await listActions({ code: `${chunk.join(',')},`, f: 'code,word,config', p: page, s: 100 });
        if (current !== request) return;
        for (const item of result.items) definitions.set(item.code, item);
        if (result.p * result.s >= result.t) break;
        page++;
      }
    }
    if (current !== request) return;
    const valid: ActionResourceBinding[] = [];
    let unknown = 0;
    for (const code of codes) {
      const definition = definitions.get(code);
      try {
        if (!definition) throw new Error('Missing definition');
        valid.push(...actionSelection(document.resource_catalog, definition));
      } catch { unknown++; }
    }
    selections.value = normalizeSelection(document.resource_catalog, valid);
    unresolved.value = unknown;
    scope.value = selections.value[0]?.resource_key.split(':')[0] ?? document.scopes[0] ?? 'admin';
    catalog.value = document;
  } catch { if (current === request) failed.value = true; }
  finally { if (current === request) loading.value = false; }
}
watch(() => [props.actions, props.codes], load, { immediate: true, deep: true });
onBeforeUnmount(() => { request++; });
</script>
<template>
  <div class="permission-detail" data-testid="permission-detail" :aria-busy="loading">
    <Alert v-if="failed" type="warning" show-icon :message="$t('permission-display.loadError')"><template #action><Button size="small" @click="load">{{ $t('system-cards.retry') }}</Button></template></Alert>
    <Alert v-if="!failed && !loading && unresolved" class="unresolved" type="warning" show-icon :message="$t('permission-display.unresolved', { count: unresolved })" />
    <Empty v-if="!hasAssignments" :image="Empty.PRESENTED_IMAGE_SIMPLE" :description="$t('system-cards.noPermissions')" />
    <Spin v-else :spinning="loading" :tip="$t('action-editor.catalogLoading')">
      <PermissionResourceEditor v-if="catalog && config" :catalog="catalog" :scope="scope" :config="config" read-only @update:scope="scope = $event" />
      <div v-else-if="loading" class="permission-loading"></div>
    </Spin>
  </div>
</template>
<style scoped>
.permission-detail { min-width: 0; }
.permission-loading { min-height: 240px; }
.unresolved { margin-bottom: 16px; }
</style>
