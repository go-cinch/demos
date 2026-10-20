<script setup lang="ts">
import type { Catalog, EditorUI } from './catalog-model';
import groupPreview from './data/permission-groups.json';
import type { PermissionGroupType } from '../components/action-group-model';
import type { GroupCatalog } from '../components/action-groups';
import type { SystemSummaryGroup } from '#/api/system/insights';
import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { Alert, Button, Empty, Modal, Tag } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { i18n } from '@vben/locales';
import { authRequestClient } from '#/api/request';
import { $t } from '#/locales';
import { catalogGroupWords } from '#/locales/catalog';
import ActionGroupForm from '../components/action-group-form.vue';
import ActionGroupNav from '../components/action-group-nav.vue';
import { applyGroupOrder, groupNames, groupWords, removePermissionGroup, recordGroupRename } from '../components/action-groups';
import { pendingGroupRenames } from '../components/action-group-model';

const props = defineProps<{ base: Catalog; catalog: Catalog; ui: EditorUI; renames: Record<string, string>; active: boolean; disabled: boolean }>();
const emit = defineEmits<{ 'update:catalog': [Catalog]; 'update:renames': [Record<string, string>]; 'refresh-catalog': [] }>();
const loading = ref(false);
const failed = ref(false);
const counts = ref<SystemSummaryGroup[]>([]);
const selected = computed({ get: () => props.ui.group || undefined, set: (word: string | undefined) => { props.ui.group = word ?? ''; } });
const editing = computed(() => props.ui.groupEditor !== null);
const original = computed(() => props.ui.groupEditor?.original || undefined);
let loaded = false;
const editable = computed(() => !props.disabled && !loading.value && !failed.value);
// Legacy presentation types never determine default permission assignment.
const previewGroups = import.meta.env.DEV ? groupPreview.groups : [];
const previewGroup = (word: string) => previewGroups.find((group) => group.key === word);
function namesForGroup(word: string) {
  const names = groupNames(props.catalog, word);
  const fallback = previewGroup(word)?.names as Record<string, string> | undefined;
  return Object.fromEntries(props.catalog.locales.map((locale) => [locale.tag, names[locale.tag] || fallback?.[locale.tag] || '']));
}
const pendingRenames = computed(() => pendingGroupRenames(props.base, props.catalog, props.renames));
const groups = computed(() => {
  const usage = new Map<string, number>();
  for (const group of counts.value) {
    const key = pendingRenames.value[group.name] ?? group.name;
    usage.set(key, (usage.get(key) ?? 0) + group.count);
  }
  const words = [...new Set([...usage.keys(), ...groupWords(props.catalog)])];
  return applyGroupOrder(words.map((name) => ({ name, count: usage.get(name) ?? 0 })), props.catalog.group_order ?? []);
});
const current = computed(() => groups.value.find((group) => group.name === selected.value));
const displayName = (word: string) => {
  const values = namesForGroup(word);
  return values[String(i18n.global.locale.value)] || values[props.catalog.default_locale] || Object.values(values).find(Boolean) || word;
};
watch(groups, (values) => { if (!editing.value && !values.some((group) => group.name === selected.value)) selected.value = values[0]?.name; }, { immediate: true });
async function refreshCounts() {
  emit('refresh-catalog');
  loading.value = true; failed.value = false;
  try { const result = await authRequestClient.get<{ groups: SystemSummaryGroup[] }>('/action/summary', { params: { f: 'groups' } }); counts.value = result.groups; }
  catch { failed.value = true; }
  finally { loading.value = false; loaded = true; }
}
function refreshIfActive() { if (props.active && loaded && !loading.value && !editing.value) void refreshCounts(); }
watch(() => props.active, refreshIfActive);
watch(() => catalogGroupWords().join('|'), refreshIfActive);
onActivated(refreshIfActive);
function edit(word?: string) {
  props.ui.groupEditor = { original: word ?? '', word: word ?? '', names: word ? namesForGroup(word) : {}, type: word ? groupType(word) : 0, isDefault: word ? props.catalog.group_defaults?.[word] === true : false, attempted: false };
}
const existingWords = computed(() => [...new Set([...groups.value.map((group) => group.name), ...Object.entries(props.renames).filter(([, to]) => to !== original.value).map(([from]) => from)])]);
function groupType(word: string) { return props.ui.groupTypes[word] ?? (previewGroup(word)?.type as PermissionGroupType | undefined) ?? 0; }
function groupTypeLabel(word: string) {
  return $t(['action-editor.groupTypeNormal', 'action-editor.groupTypeDefault', 'action-editor.groupTypeRisk'][groupType(word)]!);
}
function saved(word: string, document?: GroupCatalog, type: PermissionGroupType = 0) {
  if (original.value && original.value !== word) delete props.ui.groupTypes[original.value];
  props.ui.groupTypes[word] = type;
  if (original.value && original.value !== word) emit('update:renames', recordGroupRename(props.renames, original.value, word));
  if (document) emit('update:catalog', document as Catalog);
  selected.value = word; props.ui.groupEditor = null;
}
function saveOrder(order: string[]) { emit('update:catalog', { ...props.catalog, group_order: order }); }
function remove(word: string) {
  if (!editable.value || groups.value.find((group) => group.name === word)?.count !== 0) return;
  Modal.confirm({ title: $t('action-editor.deleteGroup'), content: $t('action-editor.deleteGroupConfirm', { name: displayName(word) }), okText: $t('system.common.delete'), cancelText: $t('system-editor.cancel'), okButtonProps: { danger: true }, onOk() { delete props.ui.groupTypes[word]; emit('update:catalog', removePermissionGroup(props.catalog, word)); } });
}
onMounted(refreshCounts);
</script>

<template>
  <div class="catalog-group-workspace">
    <ActionGroupNav :groups="groups" :selected="selected ? [selected] : []" :total="counts.reduce((total, group) => total + group.count, 0)" :editable="editable" :disabled="editing" :show-delete="false" :loading="loading" :group-label="displayName" :save-order="saveOrder" @select="selected = $event" @create="edit()" />
    <section class="catalog-group-detail">
      <Alert v-if="failed" type="error" show-icon :message="$t('action-editor.groupCountsFailed')"><template #action><Button size="small" @click="refreshCounts">{{ $t('common.retry') }}</Button></template></Alert>
      <template v-if="editing">
        <header class="group-detail-heading"><h2>{{ $t(original ? 'action-editor.editGroup' : 'action-editor.createGroup') }}</h2></header>
        <ActionGroupForm :key="original ?? 'new-group'" :document="catalog" :draft="ui.groupEditor ?? undefined" :original-word="original" :existing-words="existingWords" :disabled="!editable" show-actions @saved="saved" @cancel="ui.groupEditor = null" />
      </template>
      <template v-else-if="current">
        <header class="group-detail-heading"><h2>{{ displayName(current.name) }}</h2><div class="group-detail-actions">
          <Button :disabled="loading" :title="$t('system.common.refresh')" :aria-label="$t('system.common.refresh')" @click="refreshCounts"><IconifyIcon icon="lucide:refresh-cw" /></Button>
          <Button :disabled="!editable" @click="edit(current.name)"><IconifyIcon icon="lucide:pencil" />{{ $t('system.common.edit') }}</Button>
          <Button v-if="!loading && !failed && current.count === 0" danger :disabled="!editable" @click="remove(current.name)"><IconifyIcon icon="lucide:trash-2" />{{ $t('system.common.delete') }}</Button>
        </div></header>
        <dl><dt>{{ $t('action-editor.groupWord') }}</dt><dd>{{ current.name }}</dd><dt>{{ $t('action-editor.groupType') }}</dt><dd data-testid="permission-group-type-value"><Tag :color="groupType(current.name) === 2 ? 'red' : groupType(current.name) === 1 ? 'blue' : undefined">{{ groupTypeLabel(current.name) }}</Tag></dd><dt>{{ $t('action-editor.groupIsDefault') }}</dt><dd data-testid="permission-group-default-value"><Tag :color="catalog.group_defaults?.[current.name] ? 'green' : undefined">{{ $t(catalog.group_defaults?.[current.name] ? 'action-editor.groupDefaultYes' : 'action-editor.groupDefaultNo') }}</Tag><p class="group-default-hint">{{ $t('action-editor.groupDefaultHint') }}</p></dd><dt>{{ $t('action-editor.groupPermissionCount') }}</dt><dd><Tag>{{ loading || failed ? '—' : current.count }}</Tag></dd></dl>
      </template>
      <Empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" :description="$t('action-editor.selectGroup')" />
    </section>
  </div>
</template>

<style scoped>
.catalog-group-workspace { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 20px; }
.catalog-group-detail { min-width: 0; padding: 22px; border: 1px solid hsl(var(--border)); border-radius: var(--radius); background: hsl(var(--card)); }
.group-detail-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 22px; }
.group-detail-heading h2 { flex: 1; margin: 0; font-size: 18px; font-weight: 600; }
.group-default-hint { margin: 8px 0 0; color: hsl(var(--muted-foreground)); font-size: 12px; line-height: 1.6; }
.group-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; }
dl { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 12px; margin-bottom: 28px; }
dt { color: hsl(var(--muted-foreground)); } dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 900px) { .catalog-group-workspace { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .catalog-group-detail { padding: 16px; } }
</style>
