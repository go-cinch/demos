<script setup lang="ts">
import type { UserSummary } from '#/api';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Avatar, Button, FormItemRest, Input, Pagination } from 'ant-design-vue';

import { listUserGroupMembers } from '#/api';
import LoadWarning from '#/components/load-warning.vue';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import AssociationEditor from './association-editor.vue';

interface Delta { added: number[]; removed: number[] }
const props = withDefaults(defineProps<{
  groupId: number; count: number; editable?: boolean; disabled?: boolean; value?: Delta;
}>(), { editable: false, disabled: false, value: () => ({ added: [], removed: [] }) });
const emit = defineEmits<{ 'update:value': [value: Delta] }>();
const members = ref<UserSummary[]>([]);
const page = ref(1);
const total = ref(0);
const query = ref('');
const history = ref<string[]>([]);
const loading = ref(false);
const failed = ref(false);
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const displayedCount = computed(() => props.count + props.value.added.length - props.value.removed.length);
function remove(id: number) {
  if (props.disabled) return;
  const removed = props.value.removed.includes(id) ? props.value.removed.filter((value) => value !== id) : [...props.value.removed, id];
  emit('update:value', { added: [...props.value.added], removed });
}
function updateAdded(values: (number | string)[]) {
  if (!props.disabled) emit('update:value', { added: values.map(Number), removed: [...props.value.removed] });
}
async function load(request = ++generation) {
  loading.value = true; failed.value = false;
  try {
    const result = await listUserGroupMembers(props.groupId, { p: page.value, s: 20, q: query.value.trim() || undefined });
    if (request !== generation) return;
    members.value = result.items; total.value = result.t;
    if (!result.items.length && result.t > 0 && page.value > 1) { page.value = Math.ceil(result.t / 20); await load(); }
  } catch { if (request === generation) failed.value = true; }
  finally { if (request === generation) loading.value = false; }
}
function search(value: string, immediate = false) {
  query.value = value; page.value = 1; members.value = []; total.value = 0;
  failed.value = false; loading.value = true; clearTimeout(timer);
  const request = ++generation;
  if (immediate) void load(request); else timer = setTimeout(() => void load(request), 250);
}
function rememberSearch() {
  const text = query.value.trim();
  if (text) history.value = [text, ...history.value.filter((item) => item !== text)].slice(0, 5);
}
function changePage(value: number) {
  if (loading.value || props.disabled) return;
  page.value = value; members.value = []; void load();
}
function segments(text: string) {
  const needle = query.value.trim();
  const index = needle ? text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase()) : -1;
  return index < 0 ? [{ text, match: false }] : [
    { text: text.slice(0, index), match: false },
    { text: text.slice(index, index + needle.length), match: true },
    { text: text.slice(index + needle.length), match: false },
  ];
}
watch(() => props.groupId, () => { history.value = []; search('', true); }, { immediate: true });
onBeforeUnmount(() => { ++generation; clearTimeout(timer); });
</script>
<template>
  <FormItemRest>
    <div class="group-members" data-testid="group-members">
      <header><strong v-if="!editable">{{ $t('system.fields.members') }}</strong><span>{{ $t('system-members.count', { count: displayedCount }) }}</span></header>
      <Input :value="query" :disabled="disabled" allow-clear :placeholder="$t('system-editor.searchMember')" :aria-label="$t('system-editor.searchMember')" @update:value="search" @blur="rememberSearch" @press-enter="rememberSearch" />
      <div v-if="history.length && !query" class="member-history">
        <span>{{ $t('system.suggestions.history') }}</span>
        <Button v-for="item in history" :key="item" type="text" size="small" :disabled="disabled" @click="search(item, true)">{{ item }}</Button>
      </div>
      <LoadWarning v-if="failed"><template #action><Button :disabled="disabled" @click="load()">{{ $t('system-cards.retry') }}</Button></template></LoadWarning>
      <div v-skeleton="loading" class="member-page" :aria-busy="loading">
        <article v-for="member in members" :key="member.id" class="member-row" :class="{ removed: value.removed.includes(member.id) }">
          <Avatar :size="32">{{ [...member.username][0]?.toUpperCase() || '?' }}</Avatar>
          <div class="member-identity">
            <strong><span v-for="(part, index) in segments(member.username)" :key="index" :class="{ matched: part.match }">{{ part.text }}</span></strong>
            <span><span v-for="(part, index) in segments(member.code)" :key="index" :class="{ matched: part.match }">{{ part.text }}</span></span>
          </div>
          <Button v-if="editable" size="small" :disabled="disabled || loading" :aria-label="value.removed.includes(member.id) ? $t('system-editor.undo') : $t('system-editor.removeItem', { name: member.username })" @click="remove(member.id)">{{ $t(value.removed.includes(member.id) ? 'system-editor.undo' : 'system-members.remove') }}</Button>
        </article>
        <div v-if="loading && !members.length" class="member-placeholder" aria-hidden="true">────────────────</div>
        <p v-else-if="!failed && !members.length">{{ $t(query ? 'system-editor.noMatches' : 'system-cards.noMembers') }}</p>
      </div>
      <Pagination v-if="total > 20" :current="page" :page-size="20" :total="total" :show-size-changer="false" :disabled="disabled || loading" size="small" @change="changePage" />
      <template v-if="editable">
        <p v-if="value.added.length || value.removed.length" class="member-changes" role="status">{{ $t('system-members.changes', { added: value.added.length, removed: value.removed.length }) }}</p>
        <AssociationEditor kind="user" :group-id="groupId" :value="value.added" :disabled="disabled" @update:value="updateAdded" />
      </template>
    </div>
  </FormItemRest>
</template>
<style scoped>
.group-members { display: grid; gap: 12px; min-width: 0; }
.group-members header { display: flex; align-items: center; gap: 8px; }
.group-members header > span, .member-identity > span, .member-changes, .member-history { color: hsl(var(--muted-foreground)); font-size: 12px; }
.member-page { max-height: 360px; overflow: auto; scrollbar-gutter: stable; }
.member-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid hsl(var(--border)); }
.member-identity { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.member-identity > strong, .member-identity > span { display: block; }
.member-row :deep(.ant-avatar) { flex: none; color: hsl(var(--primary)); background: hsl(var(--primary) / 10%); }
.removed .member-identity { opacity: .55; text-decoration: line-through; }
.member-placeholder { min-height: 160px; padding: 16px; }
.member-history { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
.matched { color: hsl(var(--primary)); font-weight: 600; }
p { margin: 0; }
</style>
