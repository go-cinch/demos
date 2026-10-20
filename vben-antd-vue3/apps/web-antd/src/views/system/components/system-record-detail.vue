<script setup lang="ts">
import type { ResourceKind, SystemRecord } from './system-record-format';

import type { ActionRecord } from '#/api/system';

import { computed } from 'vue';

import {
  Button,
  Collapse,
  CollapsePanel,
  Empty,
  Tag,
} from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import GroupMembers from './group-members.vue';
import PermissionDetail from './permission-detail.vue';
import { memberCount } from './system-record-format';
import {
  jsonStructure,
  jsonText,
  jsonType,
  recordActions,
  recordDate,
  skeletonRecord,
  userStatus,
} from './system-record-format';
const props = withDefaults(
  defineProps<{
    record: null | SystemRecord;
    resource: ResourceKind;
    loading?: boolean;
    error?: boolean;
    editing?: boolean;
  }>(),
  { loading: false, error: false, editing: false },
);
const emit = defineEmits<{ retry: [] }>();
const record = computed<null | SystemRecord>(() => props.record ?? (props.loading ? skeletonRecord(props.resource) : null));
const dictionary = computed(() =>
  record.value && 'value' in record.value ? record.value : null,
);
const user = computed(() =>
  record.value && 'username' in record.value ? record.value : null,
);
const userRole = computed(() => user.value?.role_summary ?? user.value?.role);
const actions = computed(() =>
  record.value ? recordActions(record.value) : [],
);
const hasPermissions = computed(() =>
  ['role', 'user', 'user-group'].includes(props.resource),
);
const actionCodes = computed(() =>
  record.value && 'action_codes' in record.value
    ? record.value.action_codes ?? []
    : [],
);
const detailActions = computed(() => props.resource === 'action' && record.value ? [record.value as ActionRecord] : actions.value);
const facts = computed(() => {
  const keys: Record<ResourceKind, string[]> = {
    action: ['name', 'word', 'code', 'group'],
    dictionary: ['name', 'key', 'description'],
    role: ['name', 'word'],
    user: ['username', 'code'],
    'user-group': ['name', 'word'],

  };
  return keys[props.resource]
    .filter((key) => key !== 'code' || record.value)
    .map((key) => ({
      key,
      label: $t(
        `system.fields.${key === 'key' ? 'dictionaryKey' : key === 'code' && props.resource === 'user' ? 'userCode' : key}`,
      ),
      text:
        record.value && key in record.value
          ? String(
              (record.value as unknown as Record<string, unknown>)[key] ?? '',
            )
          : '',
    }));
});
</script>
<template>
  <section
    class="record-detail"
    :aria-busy="loading"
    :data-testid="
      editing ? 'management-record-editor-layout' : 'management-record-detail'
    "
  >
    <LoadWarning
      v-if="error"
      >
<template #action>
<Button size="small" @click="emit('retry')">
{{
          $t('system-cards.retry')
        }}
</Button>
</template>
</LoadWarning>
    <div v-else-if="record || editing" v-skeleton="loading">
      <div class="detail-section-heading">
        <h3>{{ $t('system-editor.basic') }}</h3>
        <Tag
          v-if="dictionary && !editing"
          :color="dictionary.enabled ? 'green' : 'default'"
          >
{{
            $t(dictionary.enabled ? 'system.enabled.yes' : 'system.enabled.no')
          }}
</Tag>
        <Tag v-if="user" :color="userStatus(user.status).color">
{{
          userStatus(user.status).label
        }}
</Tag>
      </div>
      <div class="detail-basic-fields">
        <template v-for="fact in facts" :key="fact.key">
          <slot
            v-if="editing && $slots[`field-${fact.key}`]"
            :name="`field-${fact.key}`"
          ></slot>
          <dl v-else class="detail-facts">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.text || '—' }}</dd>
          </dl>
        </template>
        <slot v-if="editing" name="field-enabled"></slot>
        <template v-if="resource === 'user'">
          <slot v-if="editing && !record" name="field-password"></slot>
          <slot v-if="editing && $slots['field-role_id']" name="field-role_id"></slot>
          <dl v-else class="detail-facts">
            <dt>{{ $t('system.fields.role') }}</dt>
            <dd>
              <Tag v-if="userRole" color="blue">{{ userRole.name }}</Tag><span v-else>—</span>
            </dd>
          </dl>
          <dl v-if="user" class="detail-facts">
            <dt>{{ $t('system-cards.loginCount') }}</dt>
            <dd>{{ user.login_count }}</dd>
            <dt>{{ $t('system-cards.lastLogin') }}</dt>
            <dd>{{ recordDate(user.last_logged_in_at) }}</dd>
            <dt>{{ $t('system-cards.failedLoginCount') }}</dt>
            <dd>{{ user.wrong }}</dd>
          </dl>
          <Collapse v-if="editing && record && $slots['field-password']" ghost class="detail-password">
<CollapsePanel
              key="password"
              :header="$t('system.fields.newPassword')"
              force-render
              >
<slot name="field-password"></slot>
</CollapsePanel>
</Collapse>
        </template>
      </div>
      <section v-if="resource === 'dictionary'" class="detail-section">
        <slot v-if="editing" name="field-value"></slot>
        <template v-else-if="dictionary">
<h4>{{ $t('system.fields.dictionaryValue') }}</h4>
          <p class="detail-json-type">
            <Tag>{{ jsonType(dictionary.value) }}</Tag>{{ jsonStructure(dictionary.value) }}
          </p>
          <pre
            class="detail-json"
            tabindex="0"
            :aria-label="$t('system.fields.dictionaryValue')"
            >{{ jsonText(dictionary.value) }}</pre>
        </template>
      </section>
      <section v-if="user" class="detail-section">
        <h4>{{ $t('system.fields.metadata') }}</h4>
        <pre
          class="detail-json detail-user-json"
          tabindex="0"
          :aria-label="$t('system.fields.metadata')"
          >{{ jsonText(user.metadata) }}</pre>
      </section>
      <section v-if="resource === 'action'" class="detail-section">
        <template v-if="editing"><slot name="field-resource"></slot><slot name="field-menu"></slot><slot name="field-button"></slot></template>
        <PermissionDetail v-else-if="record && !loading" :key="`${record.id}:${record.updated_at}`" :actions="detailActions" />
      </section>
      <section v-if="resource === 'user-group'" class="detail-section">
        <slot v-if="editing && $slots['field-user_ids']" name="field-user_ids"></slot>
        <GroupMembers v-else-if="record && !loading" :key="`${record.id}:${record.updated_at}`" :group-id="record.id" :count="memberCount(record)" />
      </section>
      <section v-if="hasPermissions" class="detail-section">
        <slot v-if="editing && $slots['field-action_codes']" name="field-action_codes"></slot>
        <template v-else>
          <h4>
            {{ $t('system.fields.permissions') }}
            <span>{{ actions.length }}</span>
          </h4>
          <PermissionDetail v-if="record && !loading" :key="`${record.id}:${record.updated_at}`" :actions="detailActions" :codes="actionCodes" />
        </template>
      </section>
      <section v-if="record" class="detail-section">
        <h4>{{ $t('system-editor.recordInfo') }}</h4>
        <dl class="detail-facts detail-metadata">
          <dt>{{ $t('system.fields.id') }}</dt>
          <dd>{{ record.id }}</dd>
          <dt>{{ $t('system.fields.createdAt') }}</dt>
          <dd>{{ recordDate(record.created_at) }}</dd>
          <dt>{{ $t('system.fields.updatedAt') }}</dt>
          <dd>{{ recordDate(record.updated_at) }}</dd>
        </dl>
      </section>
      <Collapse v-if="record && !editing" class="detail-raw" ghost>
<CollapsePanel key="raw" :header="$t('system-cards.rawRecord')">
          <pre
            class="detail-json"
            tabindex="0"
            :aria-label="$t('system-cards.rawRecord')"
            >{{ jsonText(record) }}</pre>
        </CollapsePanel>
</Collapse>
    </div>
    <Empty
      v-else
      :image="Empty.PRESENTED_IMAGE_SIMPLE"
      :description="$t('system-cards.empty')"
    />
  </section>
</template>
<style scoped>
.detail-unresolved {
  margin-top: 18px;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.75);
  background: hsl(var(--muted) / 0.3);
}
.detail-unresolved p {
  font-size: 12px;
  line-height: 1.7;
  color: hsl(var(--muted-foreground));
  margin: 10px 0 0;
}

.record-detail {
  min-width: 0;
  color: hsl(var(--foreground));
}
.detail-section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 22px;
}
.detail-section-heading h3 {
  margin: 0 auto 0 0;
  font-size: 15px;
  font-weight: 600;
}
.detail-facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 7px;
  margin: 0;
  font-size: 13px;
}
.detail-facts dt {
  color: hsl(var(--muted-foreground));
}
.detail-facts dd {
  min-width: 0;
  margin: 0 0 15px;
  overflow-wrap: anywhere;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
.detail-section {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid hsl(var(--border));
}
.detail-section h4 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
}
.detail-section h4 span {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}
.detail-json-type {
  margin: 0 0 10px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.detail-json {
  max-height: 360px;
  margin: 0;
  padding: 14px;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.75);
  background: hsl(var(--muted) / 45%);
  overflow: auto;
  font:
    12px/1.7 ui-monospace,
    monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.detail-json:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
.detail-rules {
  max-height: 360px;
  overflow: auto;
}
.detail-rule {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-bottom: 7px;
}
.detail-rule code {
  min-width: 0;
  overflow-wrap: anywhere;
  font:
    12px/1.8 ui-monospace,
    monospace;
}
.detail-rule :deep(.ant-tag) {
  flex: none;
  margin: 0;
}
.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.detail-tags :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.detail-section h4.detail-subheading {
  margin-top: 18px;
}
.detail-member-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.detail-member {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.detail-member :deep(.ant-avatar) {
  flex: none;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}
.detail-member > div {
  min-width: 0;
}
.detail-member strong,
.detail-member span {
  display: block;
  overflow-wrap: anywhere;
}
.detail-member strong {
  font-size: 13px;
  font-weight: 500;
}
.detail-member span {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
.detail-empty {
  padding: 24px 16px;
  text-align: center;
  border: 1px dashed hsl(var(--border));
  border-radius: calc(var(--radius) * 0.875);
  background: hsl(var(--muted) / 0.25);
  margin: 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}
.detail-action-list {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
.detail-action {
  min-width: 0;
  padding: 14px;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.875);
}
.detail-action-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.detail-action-title strong {
  overflow-wrap: anywhere;
  font-weight: 500;
}
.detail-action-code {
  margin: 3px 0 12px;
  font-size: 12px;
  overflow-wrap: anywhere;
  color: hsl(var(--muted-foreground));
}
.detail-action-facts {
  gap: 8px 12px;
  font-size: 12px;
}
.detail-raw :deep(.ant-collapse-header) {
  padding-right: 0;
  padding-left: 0;
}
.detail-raw :deep(.ant-collapse-content-box) {
  padding-right: 0;
  padding-left: 0;
}
@media (max-width: 520px) {
  .detail-member-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.detail-metadata {
  grid-template-columns: minmax(100px, 1fr) minmax(0, 2fr);
  gap: 12px;
}
.detail-metadata dd {
  margin: 0;
  text-align: right;
  font-size: 13px;
}
.detail-raw {
  margin-top: 24px;
  border-top: 1px solid hsl(var(--border));
  padding-top: 12px;
}
.detail-basic-fields :deep(.ant-form-item) {
  margin-bottom: 18px;
}
.detail-section :deep(.ant-form-item-label > label) {
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
}
.detail-section :deep(.ant-form-item:last-child) {
  margin-bottom: 0;
}
.detail-user-json {
  max-height: 160px;
}
.detail-password :deep(.ant-collapse-header),
.detail-password :deep(.ant-collapse-content-box) {
  padding-inline: 0;
}
</style>
