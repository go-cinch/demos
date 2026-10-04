<script setup lang="ts">
import { message, type Feedback } from '../lib/form-feedback';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import dayjs from 'dayjs';
import { can, listResource, saveResource, deleteResources } from '../lib/api';
import type { RecordData, ResourceKind } from '../lib/types';
import { configs } from '../lib/resource-config';
import { dateTime, initials, labelFor, parseDateTime } from '../lib/format';
import { t } from '../locales';
import Icon from '../components/Icon.vue';
import RecordPagination from '../components/RecordPagination.vue';
import ResultToolbar from '../components/ResultToolbar.vue';
import ResultOptions from '../components/ResultOptions.vue';
import Sheet from '../components/Sheet.vue';
import Field from '../components/Field.vue';
import SearchField from '../components/SearchField.vue';
import RecordEditor from '../components/RecordEditor.vue';
import RecordValue from '../components/RecordValue.vue';
import DateTimeField from '../components/DateTimeField.vue';
import PageSkeleton from '../components/PageSkeleton.vue';
import { defaultColumns, identityColumn } from '../lib/resource-presentation';
const props = defineProps<{ resource: ResourceKind }>();
const route = useRoute();
const config = computed(() => configs.value[props.resource]);
const records = ref<RecordData[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);
const loading = ref(false);
const error = ref('');
const notice = ref('');
const filters = ref<Record<string, unknown>>({});
const expanded = ref(false);
const selected = ref<number[]>([]);
const selecting = ref(false);
const primaryFilter = computed(
  () =>
    config.value.filters.find((x) => x.type === 'input') ||
    config.value.filters.find((x) => x.key === 'resource') ||
    config.value.filters[0],
);
const promotedFilterKeys = computed(
  () => new Set([primaryFilter.value.key, ...(props.resource === 'user' ? ['status'] : [])]),
);
const additionalFilters = computed(() =>
  config.value.filters.filter((x) => !promotedFilterKeys.value.has(x.key)),
);
const statuses = computed(() => {
  const value = filters.value.status;
  return (
    Array.isArray(value)
      ? value
      : value === undefined || value === ''
        ? []
        : String(value).split(',')
  )
    .map(Number)
    .filter((item) => [0, 1, 2].includes(item));
});
function statusActive(value: string) {
  return value === 'all' ? !statuses.value.length : statuses.value.includes(Number(value));
}
function selectStatus(value: string) {
  filters.value.status = value === 'all' ? undefined : [Number(value)];
  search();
}
const record = ref<RecordData | null>(null);
const detail = ref(false);
const editor = ref(false);
const options = ref('');
const density = ref('default');
const visibleColumns = ref<string[]>([...defaultColumns[props.resource]]);
const fixedColumn = computed(() => identityColumn[props.resource]);
const hasColumn = (key: string) => visibleColumns.value.includes(key);
const summaryColumns = computed(() => [
  fixedColumn.value,
  ...{
    user: ['role', 'status'],
    role: ['word', 'action_codes'],
    'user-group': ['word', 'users', 'action_codes'],
    action: ['word'],
    dictionary: ['key', 'enabled'],
    whitelist: [],
  }[props.resource],
]);
const extraColumns = computed(() =>
  config.value.columns.filter(
    (column) => hasColumn(column.key) && !summaryColumns.value.includes(column.key),
  ),
);
const recordTitle = (item: RecordData) =>
  props.resource === 'whitelist' ? `#${item.id}` : labelFor(item);

const bordered = ref(false);
const striped = ref(false);
const sticky = ref(true);
const operation = ref('');
const operationOpen = computed({
  get: () => !!operation.value,
  set: (v: boolean) => {
    if (!v) operation.value = '';
  },
});
const busy = ref(false);
const operationError = ref('');
const warning = ref<Feedback>('');
const reason = ref('');
const decision = ref('approve');
const lockMode = ref('until');
const lockUntil = ref('');
const deletion = ref<number[]>([]);
const deletionLabel = ref('');
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  if (!can(props.resource, 'read')) return;
  const current = ++generation;
  loading.value = true;
  error.value = '';
  try {
    const result = await listResource(props.resource, {
      ...filters.value,
      p: page.value,
      s: size.value,
    });
    if (current !== generation) return;
    records.value = result.items;
    total.value = result.t;
    selected.value = [];
  } catch (e) {
    if (current === generation) {
      error.value = (e as Error).message;
      records.value = [];
      total.value = 0;
      selected.value = [];
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}
function search() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    page.value = 1;
    void load();
  }, 100);
}
function reset() {
  filters.value = {};
  page.value = 1;
  void load();
}
watch(
  () => route.query,
  () => {
    filters.value = { ...route.query };
    if (route.query.status !== undefined)
      filters.value.status = String(route.query.status).split(',').map(Number);
    page.value = 1;
    void load();
  },
  { immediate: true },
);
function openEditor(item: RecordData | null) {
  if (!can(props.resource, item ? 'update' : 'create')) return;
  record.value = item;
  detail.value = false;
  editor.value = true;
}
function openDetail(item: RecordData) {
  record.value = item;
  detail.value = true;
}
function toggleSelected(id: number) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id];
}
function act(value: string) {
  operation.value = value;
  operationError.value = '';
  warning.value = '';
  decision.value = 'approve';
  reason.value = '';
  lockMode.value = 'until';
  lockUntil.value = dateTime(dayjs().add(1, 'day').valueOf());
}
function remove(ids: number[], label = '') {
  deletion.value = ids;
  deletionLabel.value = label;
  act('delete');
}
async function operate() {
  if (busy.value) return;
  operationError.value = '';
  warning.value = '';
  const item = record.value;
  if (operation.value === 'review' && decision.value === 'reject' && !reason.value.trim()) {
    warning.value = message('system.validation.rejectionRequired');
    return;
  }
  const until = parseDateTime(lockUntil.value);
  if (
    operation.value === 'lock' &&
    lockMode.value === 'until' &&
    (!until.isValid() || !until.isAfter(dayjs()))
  ) {
    warning.value = message('system.validation.futureLock');
    return;
  }
  busy.value = true;
  try {
    if (operation.value === 'delete') {
      await deleteResources(props.resource, deletion.value);
      if (records.value.length === deletion.value.length && page.value > 1) page.value--;
    } else if (item) {
      const metadata = { ...item.metadata };
      let status = item.status;
      if (operation.value === 'review') {
        if (decision.value === 'approve') delete metadata.reject_register_reason;
        else metadata.reject_register_reason = reason.value.trim();
        status = decision.value === 'approve' ? 1 : 0;
      }
      if (operation.value === 'lock') {
        metadata.lock_expired_at = lockMode.value === 'permanent' ? 0 : until.valueOf();
        status = 2;
      }
      if (operation.value === 'unlock') {
        delete metadata.lock_expired_at;
        status = 1;
      }
      if (operation.value === 'unlockPassword') delete metadata.password_change_failures;
      await saveResource(
        'user',
        { metadata, ...(operation.value === 'unlockPassword' ? {} : { status }) },
        item.id,
      );
    }
    notice.value = t(
      operation.value === 'delete' ? 'system.messages.deleted' : 'system.messages.updated',
    );
    operation.value = '';
    detail.value = false;
    await load();
  } catch (e) {
    operationError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function changed() {
  notice.value = t('system.messages.updated');
  void load();
}
onBeforeUnmount(() => {
  generation++;
  clearTimeout(timer);
});
</script>
<template>
  <section
    class="page management"
    :class="[`density-${density}`, { bordered, striped, 'sticky-toolbar': sticky }]"
    :aria-busy="loading"
  >
    <header class="page-heading">
      <RouterLink to="/dashboard/overview?tab=manage" class="back-link" :aria-label="t('manage')">
        <Icon name="chevron-left" :size="22" />
      </RouterLink>
      <div>
        <h1>{{ config.title }}</h1>
      </div>
    </header>
    <template v-if="can(resource, 'read')"
      ><section class="search-region">
        <SearchField
          :key="`${resource}-${primaryFilter.key}`"
          v-model="filters[primaryFilter.key]"
          :field="primaryFilter"
          :resource="resource"
          @search="search"
        />
        <div v-if="resource === 'user'" class="segmented" role="group" :aria-label="t('status')">
          <button
            v-for="value in ['all', '1', '0', '2']"
            :key="value"
            :class="{ active: statusActive(value) }"
            :aria-pressed="statusActive(value)"
            @click="selectStatus(value)"
          >
            {{
              value === 'all'
                ? t('all')
                : t(
                    value === '1'
                      ? 'system.status.active'
                      : value === '0'
                        ? 'system.status.pending'
                        : 'system.status.locked',
                  )
            }}
          </button>
        </div>
        <p v-if="statuses.length > 1" class="filter-status" role="status">
          {{ t('filterMultiStatus', { count: statuses.length }) }}
        </p>
        <div v-if="expanded" class="advanced-filters">
          <SearchField
            v-for="field in additionalFilters"
            :key="field.key"
            v-model="filters[field.key]"
            :field="field"
            :resource="resource"
            @search="search"
          />
        </div>
        <div class="search-actions">
          <button
            class="action-chip action-chip-quiet"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          >
            <span>{{ t(expanded ? 'system.common.less' : 'system.common.more') }}</span>
            <Icon :name="expanded ? 'chevron-up' : 'chevron-down'" :size="13" /></button
          ><button class="action-chip action-chip-quiet" @click="reset">
            <span>{{ t('system.common.reset') }}</span></button
          ><button class="action-chip action-chip-primary" @click="search">
            <span>{{ t('system.common.search') }}</span>
          </button>
        </div>
      </section>
      <div class="results-region">
        <ResultToolbar @refresh="load" @options="options = $event">
          <button
            v-if="can(resource, 'create')"
            class="create-button create-labeled"
            :aria-label="t('system.common.create')"
            @click="openEditor(null)"
          >
            <Icon name="add" :size="20" /><span>{{ t('system.common.create') }}</span>
          </button>
        </ResultToolbar>
        <div class="selection-tools">
          <div class="selection-actions">
            <button
              v-if="can(resource, 'delete') && records.length"
              class="action-chip action-chip-quiet"
              @click="
                selecting = !selecting;
                selected = [];
              "
            >
              <Icon :name="selecting ? 'check' : 'check-rectangle'" :size="16" />
              <span>{{ t(selecting ? 'done' : 'select') }}</span></button
            ><template v-if="selecting"
              ><button
                class="action-chip action-chip-quiet"
                @click="
                  selected = selected.length === records.length ? [] : records.map((x) => x.id)
                "
              >
                <Icon name="check-double" :size="16" />
                <span>{{ t('system.common.selectAll') }}</span></button
              ><small class="selected-count">{{
                t('selected', { count: selected.length })
              }}</small></template
            ><button
              v-if="selected.length && can(resource, 'delete')"
              class="action-chip action-chip-danger"
              @click="remove([...selected])"
            >
              <Icon name="delete" :size="16" /><span>{{ t('system.common.deleteSelected') }}</span>
            </button>
          </div>
          <span class="result-count">{{ t('system.table.total', { count: total }) }}</span>
        </div>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <div v-if="error" class="form-error" role="alert">
          {{ error }}<button @click="load">{{ t('retry') }}</button>
        </div>
        <PageSkeleton v-if="loading" variant="list" />
        <div v-else-if="!error" class="card record-list">
          <article
            v-for="item in records"
            :key="item.id"
            class="record-wrap"
            :data-record-id="item.id"
          >
            <div class="record">
              <t-checkbox
                v-if="selecting"
                :checked="selected.includes(item.id)"
                :aria-label="`${t('select')} ${labelFor(item)}`"
                @change="toggleSelected(item.id)"
              /><button
                class="record-open"
                :aria-label="`${t('view')} ${labelFor(item)}`"
                @click="openDetail(item)"
              >
                <span class="avatar"
                  ><Icon
                    v-if="resource !== 'user'"
                    :name="
                      resource === 'role'
                        ? 'secured'
                        : resource === 'action'
                          ? 'key'
                          : resource === 'dictionary'
                            ? 'book'
                            : resource === 'whitelist'
                              ? 'check-rectangle'
                              : 'app'
                    "
                  /><template v-else>{{
                    initials(String(item.metadata?.display_name || item.username || ''))
                  }}</template></span
                >
                <div class="record-main">
                  <strong>{{ recordTitle(item) }}</strong>
                  <small v-if="resource === 'user' && hasColumn('role')">{{
                    item.role?.name || '—'
                  }}</small>
                  <small v-if="resource !== 'user' && hasColumn('word')">{{
                    item.word || '—'
                  }}</small>
                  <small v-if="resource === 'dictionary' && hasColumn('key')">{{ item.key }}</small>
                  <div v-if="['role', 'user-group'].includes(resource)" class="record-summary">
                    <small v-if="resource === 'user-group' && hasColumn('users')">{{
                      t('memberCount', { count: item.users?.length || 0 })
                    }}</small>
                    <small v-if="hasColumn('action_codes')">{{
                      t('permissionSummary', { count: item.action_codes?.length || 0 })
                    }}</small>
                  </div>
                </div>
                <RecordValue
                  v-if="resource === 'user' && hasColumn('status')"
                  :record="item"
                  :column="{ dataIndex: 'status', key: 'status', title: '', display: 'status' }"
                />
                <RecordValue
                  v-if="resource === 'dictionary' && hasColumn('enabled')"
                  :record="item"
                  :column="{ dataIndex: 'enabled', key: 'enabled', title: '', display: 'boolean' }"
                />
                <Icon name="chevron-right" :size="16" />
              </button>
            </div>
            <div v-if="extraColumns.length" class="record-extra">
              <template v-for="column in extraColumns" :key="column.key"
                ><span>{{ column.title }}</span
                ><RecordValue :record="item" :column="column"
              /></template>
            </div>
          </article>
          <t-empty v-if="!records.length" :description="t('noResults')" />
        </div>
        <RecordPagination
          :page="page"
          :size="size"
          :total="total"
          :loading="loading"
          @previous="
            page--;
            load();
          "
          @next="
            page++;
            load();
          "
          @page-size="options = 'pageSize'"
        /></div></template
    ><t-empty v-else :description="t('noAccess')" /><Sheet
      v-model="detail"
      :title="`${config.entity} · ${t('detail')}`"
      ><template v-if="record"
        ><div class="detail-identity">
          <span class="avatar large">{{ initials(labelFor(record)) }}</span>
          <h2>{{ recordTitle(record) }}</h2>
        </div>
        <dl class="details">
          <template v-for="column in config.columns" :key="column.key"
            ><dt>{{ column.title }}</dt>
            <dd><RecordValue :record="record" :column="column" /></dd
          ></template>
        </dl>
        <div class="detail-actions">
          <t-button v-if="can(resource, 'update')" theme="primary" @click="openEditor(record)">{{
            t('system.common.edit')
          }}</t-button
          ><template v-if="resource === 'user' && can(resource, 'update')"
            ><t-button v-if="record.status === 0" variant="outline" @click="act('review')">{{
              t('system.user.review')
            }}</t-button
            ><t-button v-if="record.status === 1" variant="outline" @click="act('lock')">{{
              t('system.user.lock')
            }}</t-button
            ><t-button v-if="record.status === 2" variant="outline" @click="act('unlock')">{{
              t('system.user.unlock')
            }}</t-button
            ><t-button
              v-if="Number(record.metadata?.password_change_failures) > 0"
              variant="outline"
              @click="act('unlockPassword')"
              >{{ t('system.user.unlockPassword') }}</t-button
            ></template
          ><t-button
            v-if="can(resource, 'delete')"
            theme="danger"
            variant="outline"
            @click="remove([record.id], recordTitle(record))"
            >{{ t('system.common.delete') }}</t-button
          >
        </div></template
      ></Sheet
    ><RecordEditor v-model="editor" :resource="resource" :record="record" @saved="changed" /><Sheet
      v-model="operationOpen"
      :title="
        operation === 'delete'
          ? deletionLabel
            ? t('system.confirm.delete', { name: deletionLabel })
            : t('system.confirm.deleteSelected')
          : operation === 'lock'
            ? t('system.user.lockTitle', { name: record ? labelFor(record) : '' })
            : t(`system.user.${operation}`)
      "
      ><form novalidate @submit.prevent="operate">
        <template v-if="operation === 'review'"
          ><Field name="review-decision" :label="t('system.user.decision')"
            ><t-radio-group v-model="decision" class="radio-options"
              ><t-radio :block="false" value="approve" :label="t('system.user.approve')" /><t-radio
                :block="false"
                value="reject"
                :label="t('system.user.reject')" /></t-radio-group></Field
          ><Field
            v-if="decision === 'reject'"
            name="reject-reason"
            :label="t('system.user.reason')"
            :error="warning"
            warning
            ><t-textarea
              id="reject-reason"
              v-model="reason"
              name="reject_reason"
              :placeholder="t('system.user.rejectionPlaceholder')" /></Field></template
        ><template v-else-if="operation === 'lock'"
          ><Field name="lock-mode" :label="t('system.user.lockType')"
            ><t-radio-group v-model="lockMode" class="radio-options"
              ><t-radio :block="false" value="until" :label="t('system.user.lockUntil')" /><t-radio
                :block="false"
                value="permanent"
                :label="t('system.user.permanent')" /></t-radio-group></Field
          ><Field
            v-if="lockMode === 'until'"
            name="lock-until"
            :label="t('system.user.lockedUntil')"
            :error="warning"
            warning
            ><DateTimeField id="lock-until" v-model="lockUntil" name="lock_until" /></Field
        ></template>
        <p v-else>
          {{
            operation === 'delete'
              ? t('system.confirm.deleteDescription', { count: deletion.length })
              : t(`system.confirm.${operation}`, { name: record ? labelFor(record) : '' })
          }}
        </p>
        <p v-if="operationError" class="form-error" role="alert">{{ operationError }}</p>
        <div class="sheet-actions">
          <t-button :disabled="busy" @click="operation = ''">{{ t('cancel') }}</t-button
          ><t-button
            :theme="operation === 'delete' ? 'danger' : 'primary'"
            type="submit"
            :loading="busy"
            >{{ t(operation === 'delete' ? 'system.common.delete' : 'confirm') }}</t-button
          >
        </div>
      </form></Sheet
    ><ResultOptions
      v-model:option="options"
      v-model:density="density"
      v-model:size="size"
      v-model:visible="visibleColumns"
      v-model:bordered="bordered"
      v-model:striped="striped"
      v-model:sticky="sticky"
      :columns="config.columns"
      :fixed-column="fixedColumn"
      @size-change="
        page = 1;
        load();
      "
    />
  </section>
</template>
