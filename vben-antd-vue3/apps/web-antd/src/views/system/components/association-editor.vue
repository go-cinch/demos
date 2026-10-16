<script setup lang="ts">
import type { ActionRecord, UserSummary } from '#/api';
import type { MsgUser } from '#/api/msg';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Avatar,
  Button,
  Checkbox,
  Form,
  FormItemRest,
  Input,
  Tag,
} from 'ant-design-vue';

import { listActions, listUsers } from '#/api';
import { msgApi } from '#/api/msg';
import SearchAutocomplete from '#/components/search-autocomplete.vue';
import { searchSuggestionGroups } from '#/components/search-suggestions';
import LoadWarning from '#/components/load-warning.vue';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import PermissionCard from './permission-card.vue';
import { splitLines } from './system-record-format';

type Key = number | string;
type ActionOption = Omit<ActionRecord, 'created_at' | 'updated_at'>;
type Entry = ActionOption | MsgUser | UserSummary;
defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    value?: Key[];
    kind: 'action' | 'recipient' | 'user';
    records?: Entry[];
    disabled?: boolean;
    groupId?: number;
  }>(),
  { value: () => [], records: () => [], disabled: false },
);
const emit = defineEmits<{ 'update:value': [value: Key[]] }>();
const formItem = Form.useInjectFormItemContext();
const open = ref(false);
const query = ref('');
const searchInput = ref<InstanceType<typeof SearchAutocomplete>>();
const addButton = ref<InstanceType<typeof Button>>();
const loading = ref(false);
const failed = ref(false);
const results = ref<Entry[]>([]);
const cache = ref(new Map<Key, Entry>());
const pending = ref<Key[]>([]);
const history = ref<string[]>([]);
const searchOptions = computed(() => searchSuggestionGroups(query.value.trim() ? results.value.map(name).slice(0, 8) : [], history.value));
function removeHistory(value: string) { history.value = history.value.filter((item) => item !== value); }
const page = ref(1);
const more = ref(false);
const removed = ref<{ index: number; key: Key }>();
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const selected = computed(() => new Set(props.value));
const label = computed(() => $t(`system-editor.associations.${props.kind}`));
function key(item: Entry): Key {
  return 'resource' in item ? item.code : item.id;
}
function name(item: Entry) {
  return 'name' in item ? item.name : item.username;
}
function entryLabel(value: Key) {
  const item = cache.value.get(value);
  return item ? name(item) : String(value);
}
function permission(value: Key) {
  const item = cache.value.get(value);
  return item && 'resource' in item ? item : undefined;
}
function secondary(item: Entry) {
  return 'word' in item
    ? item.word
    : 'code' in item
      ? item.code
      : `#${item.id}`;
}
function permissionDetails(item: ActionOption) {
  return [
    { key: 'resource', label: 'system.fields.resourceRules', color: 'cyan', values: splitLines(item.resource) },
    { key: 'menu', label: 'system.fields.menuPaths', color: 'blue', values: splitLines(item.menu) },
    { key: 'button', label: 'system.fields.buttonPermission', color: 'purple', values: splitLines(item.button) },
  ];
}
function remember(items: Entry[]) {
  const next = new Map(cache.value);
  for (const item of items) next.set(key(item), item);
  cache.value = next;
}
watch(() => props.records, remember, { immediate: true });
function update(value: Key[]) {
  emit('update:value', [...new Set(value)]);
  formItem.onFieldChange();
}
function remove(value: Key) {
  if (props.disabled) return;
  removed.value = { index: props.value.indexOf(value), key: value };
  update(props.value.filter((item) => item !== value));
}
function undo() {
  if (!removed.value || props.disabled) return;
  const values = [...props.value];
  if (!values.includes(removed.value.key))
    values.splice(removed.value.index, 0, removed.value.key);
  update(values);
  removed.value = undefined;
}
async function load(request: number, append = false) {
  const text = query.value.trim();
  try {
    let items: Entry[];
    let hasMore = false;
    if (props.kind === 'recipient') items = await msgApi.users(text);
    else {
      const params = { p: page.value, q: text || undefined, s: 20 };
      const result =
        props.kind === 'action'
          ? await listActions({ ...params, f: 'id,code,name,group,word,resource,menu,button' })
          : await listUsers({ ...params, f: 'id,username,code', ...(props.groupId ? { exclude_user_group_id: props.groupId } : {}) });
      items = result.items;
      hasMore = result.p * result.s < result.t;
    }
    if (request !== generation || !open.value) return;
    remember(items);
    const unique = new Map(
      (append ? results.value : []).map((item) => [key(item), item]),
    );
    for (const item of items) unique.set(key(item), item);
    results.value = [...unique.values()];
    more.value = hasMore;
  } catch {
    if (request === generation) failed.value = true;
  } finally {
    if (request === generation) loading.value = false;
  }
}
function search(value: string, immediate = false) {
  query.value = value;
  const request = ++generation;
  clearTimeout(timer);
  page.value = 1;
  more.value = false;
  failed.value = false;
  results.value = [];
  loading.value = true;
  if (immediate) void load(request);
  else
    timer = setTimeout(() => {
      void load(request);
    }, 250);
}
async function show() {
  if (props.disabled) return;
  open.value = true;
  pending.value = [];
  search('', true);
  await nextTick();
  searchInput.value?.focus();
}
async function close() {
  ++generation;
  clearTimeout(timer);
  loading.value = false;
  open.value = false;
  pending.value = [];
  await nextTick();
  addButton.value?.$el?.focus();
}
function add() {
  if (props.disabled) return;
  update([...props.value, ...pending.value]);
  if (query.value.trim())
    history.value = [
      query.value.trim(),
      ...history.value.filter((item) => item !== query.value.trim()),
    ].slice(0, 5);
  removed.value = undefined;
  void close();
}
function toggle(value: Key, checked: boolean) {
  pending.value = checked
    ? [...new Set([...pending.value, value])]
    : pending.value.filter((item) => item !== value);
}
function loadMore() {
  if (loading.value) return;
  page.value++;
  loading.value = true;
  failed.value = false;
  void load(++generation, true);
}
function segments(text: string) {
  const needle = query.value.trim();
  if (!needle) return [{ text, match: false }];
  const start = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  return start < 0
    ? [{ text, match: false }]
    : [
        { text: text.slice(0, start), match: false },
        { text: text.slice(start, start + needle.length), match: true },
        { text: text.slice(start + needle.length), match: false },
      ];
}
onBeforeUnmount(() => {
  ++generation;
  clearTimeout(timer);
});
</script>
<template>
  <FormItemRest>
    <div
      v-bind="$attrs"
      class="association-editor"
      :data-testid="`association-${kind}`"
      :aria-label="label"
    >
      <div class="association-cards">
        <template v-for="selectedKey in props.value" :key="selectedKey">
          <PermissionCard
            v-if="kind === 'action'"
            :permission="permission(selectedKey)"
            :code="String(selectedKey)"
          >
            <template #action>
<Button
                class="remove-association"
                :disabled="disabled"
                :aria-label="
                  $t('system-editor.removeItem', {
                    name: entryLabel(selectedKey),
                  })
                "
                @click="remove(selectedKey)"
                >
<IconifyIcon icon="lucide:minus" />
</Button>
</template>
          </PermissionCard>
          <article
            v-else
            class="member-card"
            :aria-label="entryLabel(selectedKey)"
          >
            <Avatar :size="34">
{{
              [...entryLabel(selectedKey)][0]?.toUpperCase()
            }}
</Avatar>
            <div>
              <strong>{{ entryLabel(selectedKey) }}</strong><span v-if="kind !== 'recipient'">{{
                cache.get(selectedKey)
                  ? secondary(cache.get(selectedKey)!)
                  : `#${selectedKey}`
              }}</span>
            </div>
            <Button
              class="remove-association"
              :disabled="disabled"
              :aria-label="
                $t('system-editor.removeItem', {
                  name: entryLabel(selectedKey),
                })
              "
              @click="remove(selectedKey)"
              >
<IconifyIcon icon="lucide:minus" />
</Button>
          </article>
        </template>
      </div>
      <div v-if="removed" class="association-undo" role="status">
        <span>{{
          $t('system-editor.removedItem', { name: entryLabel(removed.key) })
        }}</span><Button type="link" size="small" :disabled="disabled" @click="undo">
{{
          $t('system-editor.undo')
        }}
</Button>
      </div>
      <Button
        v-if="!open"
        ref="addButton"
        block
        type="dashed"
        class="association-add"
        :disabled="disabled"
        @click="show"
        >
<IconifyIcon icon="lucide:plus" />{{
          $t('system-editor.addItem', { entity: label })
        }}
</Button>
      <section
        v-else
        class="association-picker"
        :aria-label="$t('system-editor.chooseExisting', { entity: label })"
        @keydown.esc.stop.prevent="close"
      >
        <header>
          <h4>{{ $t('system-editor.chooseExisting', { entity: label }) }}</h4>
          <Button
            type="text"
            :aria-label="$t('system-cards.close')"
            @click="close"
            >
<IconifyIcon icon="lucide:x" />
</Button>
        </header>
        <div class="association-search">
          <SearchAutocomplete
            ref="searchInput"
            :value="query"
            :options="searchOptions"
            :loading="loading"
            :disabled="disabled"
            class="w-full"
            @search="search"
            @select="search($event, true)"
            @remove-history="removeHistory"
          >
            <template #input>
              <Input
                :disabled="disabled"
                allow-clear
                :aria-label="$t('system-editor.searchAssociation', { entity: label })"
                :placeholder="$t(kind === 'action' ? 'system-editor.searchPermission' : kind === 'recipient' ? 'system-editor.searchRecipient' : 'system-editor.searchMember')"
              ><template #prefix><IconifyIcon icon="lucide:search" /></template></Input>
            </template>
          </SearchAutocomplete>
        </div>
        <LoadWarning
          v-if="failed"
          class="association-warning"
          >
<template #action>
<Button size="small" @click="search(query, true)">
{{
              $t('system-cards.retry')
            }}
</Button>
</template>
</LoadWarning>
        <div v-skeleton="loading" class="association-results" :aria-busy="loading">
          <Checkbox
            v-for="item in results"
            :key="key(item)"
            class="association-result"
            :disabled="disabled || selected.has(key(item)) || loading"
            :checked="selected.has(key(item)) || pending.includes(key(item))"
            @change="toggle(key(item), $event.target.checked)"
          >
            <span class="result-content">
              <strong class="result-title">
                <span><span
                    v-for="(part, index) in segments(name(item))"
                    :key="index"
                    :class="{ matched: part.match }"
                    >{{ part.text }}</span></span>
                <Tag
                  v-if="'resource' in item && item.resource.includes('*')"
                  color="red"
                  class="result-risk"
                >
                  <IconifyIcon icon="lucide:triangle-alert" />
                  {{ $t('system-editor.highRiskPermission') }}
                </Tag>
              </strong>
              <span v-if="'resource' in item" class="result-tags">
                <Tag :title="$t('system.fields.word')">
                  <span
                    v-for="(part, index) in segments(item.word)"
                    :key="index"
                    :class="{ matched: part.match }"
                    >{{ part.text }}</span>
                </Tag>
                <Tag :title="$t('system.fields.code')">
                  <span
                    v-for="(part, index) in segments(item.code)"
                    :key="index"
                    :class="{ matched: part.match }"
                    >{{ part.text }}</span>
                </Tag>
              </span>
              <span v-else><span
                  v-for="(part, index) in segments(secondary(item))"
                  :key="index"
                  :class="{ matched: part.match }"
                  >{{ part.text }}</span></span>
              <span v-if="'resource' in item" class="result-rules">
                <span
                  v-for="field in permissionDetails(item)"
                  :key="field.key"
                  class="result-rule"
                  :data-permission-field="field.key"
                >
                  <Tag :color="field.color" class="result-rule-label">{{ $t(field.label) }}</Tag>
                  <span class="result-rule-values">
                    <code v-for="(ruleValue, index) in field.values" :key="index">{{ ruleValue }}</code>
                    <span v-if="!field.values.length">—</span>
                  </span>
                </span>
              </span>
            </span>
            <Tag v-if="selected.has(key(item))">
{{
              $t('system-editor.alreadyAdded')
            }}
</Tag><span v-else-if="'group' in item" class="result-group">{{
              item.group
            }}</span>
          </Checkbox>
          <div v-if="loading && !results.length" class="association-placeholders" aria-hidden="true"><div v-for="index in 5" :key="index" class="association-result"><span>────────────────</span></div></div>
          <p v-else-if="!failed && !results.length" class="picker-state">
            {{ $t('system-editor.noMatches') }}
          </p>
          <Button
            v-if="more && !failed"
            type="link"
            block
            :disabled="loading"
            @click="loadMore"
            >
{{ $t('system-editor.loadMore') }}
</Button>
        </div>
        <footer>
          <span aria-live="polite">{{
            $t('system-editor.selectedCount', { count: pending.length })
          }}</span><Button
            type="primary"
            :disabled="disabled || !pending.length || loading"
            @click="add"
            >
{{
              $t('system-editor.addSelected', { count: pending.length })
            }}
</Button>
        </footer>
      </section>
    </div>
  </FormItemRest>
</template>
<style scoped>
.association-cards {
  display: grid;
  gap: 12px;
}
.association-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  margin-top: 12px;
  color: hsl(var(--primary));
}
.member-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.875);
}
.member-card > div {
  flex: 1;
  min-width: 0;
}
.member-card strong,
.member-card span {
  display: block;
  overflow-wrap: anywhere;
}
.member-card strong {
  font-size: 14px;
  font-weight: 500;
}
.member-card span {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.member-card :deep(.ant-avatar) {
  flex: none;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}
.remove-association {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: hsl(var(--muted-foreground));
}
.remove-association:hover:not(:disabled) {
  color: hsl(var(--destructive));
  border-color: hsl(var(--destructive));
}
.association-undo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  margin-top: 12px;
  background: hsl(var(--muted) / 40%);
  font-size: 12px;
}
.association-picker {
  margin-top: 12px;
  border: 1px solid hsl(var(--primary) / 50%);
  border-radius: calc(var(--radius) * 0.875);
  overflow: hidden;
  background: hsl(var(--card));
}
.association-picker header,
.association-picker footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
}
.association-picker header h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}
.association-picker footer {
  border-top: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 25%);
}
.association-picker footer > span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.association-search {
  padding: 0 14px 12px;
}
.association-picker .association-warning {
  margin: 0 14px 12px;
}
.association-results {
  max-height: 300px;
  overflow: auto;
  border-top: 1px solid hsl(var(--border));
}
.association-result {
  display: flex;
  align-items: flex-start;
  width: 100%;
  padding: 12px 14px;
  margin: 0;
  border-bottom: 1px solid hsl(var(--border));
}
.association-result :deep(.ant-checkbox) {
  top: 4px;
}
.association-result :deep(.ant-checkbox + span) {
  display: flex;
  flex: 1;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding-right: 0;
}
.result-content {
  display: block;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.result-content > strong,
.result-content > span,
.result-content > code {
  display: block;
}
.result-content strong {
  font-weight: 500;
}
.result-content > span,
.result-content code,
.result-group {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.result-content code {
  max-height: 54px;
  overflow: auto;
  white-space: pre-wrap;
}
.result-content > .result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0;
}
.result-tags :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.result-content > .result-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.result-risk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
}
.result-content > .result-rules {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}
.result-rule {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}
.result-rule-label {
  margin: 0;
}
.result-rule-values {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 96px;
  overflow: auto;
}
.result-rule-values code {
  display: block;
  max-height: none;
  overflow: visible;
}
.matched {
  color: #ef4444;
  font-weight: 600;
}
.picker-state {
  display: grid;
  place-items: center;
  padding: 24px;
  margin: 0;
  color: hsl(var(--muted-foreground));
}
</style>

<style scoped>
.association-results { height: 320px; overflow: auto; scrollbar-gutter: stable; }
</style>
