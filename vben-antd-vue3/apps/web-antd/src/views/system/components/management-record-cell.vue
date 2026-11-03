<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { ResourceKind } from './management-types';
import type { ManagementPermissions } from './use-management-permissions';

import { Avatar, Button, Space, Tag } from 'ant-design-vue';

import PermissionLink from '#/components/permission-link.vue';
import { $t } from '#/locales';

import { actionDisplayName } from './action-name';
import PermissionResultCell from './permission-result-cell.vue';
import { memberCount, memberPreview } from './system-record-format';
import { useManagementFormatting } from './use-management-formatting';
const props = defineProps<{
  resource: ResourceKind;
  record: Recordable<any>;
  column: Recordable<any>;
  viewMode: string;
  permissions: ManagementPermissions;
}>();
const emit = defineEmits<{ detail: [field?: string] }>();
const { canDetail, canRead, hasButtonAccess } = props.permissions;
const {
  columnValue,
  columnDisplay,
  formatDate,
  formatLockExpiration,
  userLockExpiration,
  resourceRules,
  resourceRuleColor,
  formatJSON,
  statusColor,
  statusLabel,
} = useManagementFormatting(() => props.resource);
</script>
<template>
  <template v-if="props.resource === 'user' && column.key === 'username'">
    <div class="system-user-identity">
      <Avatar :size="30">
        {{ record.username?.slice(0, 1).toUpperCase() }}
      </Avatar>
      <div>
        <Button
          type="link"
          size="small"
          :disabled="!canDetail"
          @click="emit('detail')"
        >
          {{ record.username }}
</Button><span>{{ record.code }}</span>
      </div>
    </div>
  </template>
  <template
    v-else-if="
      props.resource === 'action' &&
      viewMode === 'matrix' &&
      column.key === 'name'
    "
  >
    <strong>{{
      actionDisplayName(record.word || '', record.config, record.name)
    }}</strong>
  </template>
  <template
    v-else-if="
      props.resource === 'action' &&
      viewMode === 'matrix' &&
      ['menu', 'resource', 'button'].includes(String(column.key))
    "
  >
    <PermissionResultCell
      :config="'config' in record ? record.config : undefined"
      :field="String(column.key)"
      :can-detail="canRead"
      @detail="emit('detail', String(column.key))"
    />
  </template>
  <template
    v-else-if="
      props.resource === 'action' &&
      ['button', 'menu', 'resource'].includes(String(column.key)) &&
      columnValue(record, column) === '*'
    "
  >
    <Tag :color="column.key === 'resource' ? 'default' : 'blue'">*</Tag>
  </template>
  <template v-else-if="columnDisplay(column) === 'date'">
    {{
      column.key === 'last_logged_in_at' && !columnValue(record, column)
        ? $t('system-insights.neverLoggedIn')
        : formatDate(columnValue(record, column))
    }}
  </template>
  <template
    v-else-if="
      props.resource === 'action' &&
      ['menu', 'button'].includes(String(column.key))
    "
  >
    <div
      class="system-action-list-cell whitespace-pre-line"
      tabindex="0"
      :aria-label="String(column.title)"
    >
      {{ columnValue(record, column) || '-' }}
    </div>
  </template>
  <template v-else-if="columnDisplay(column) === 'resource-rules'">
    <div
      v-if="resourceRules(columnValue(record, column)).length"
      class="system-action-list-cell"
      tabindex="0"
      :aria-label="String(column.title)"
    >
      <div class="flex flex-col items-start gap-1">
        <Tag
          v-for="(rule, index) in resourceRules(columnValue(record, column))"
          :key="`${rule}-${index}`"
          class="system-resource-rule-tag m-0 max-w-full"
          :color="resourceRuleColor(rule, record.category)"
        >
          {{ rule }}
        </Tag>
      </div>
    </div>
    <span v-else>-</span>
  </template>
  <template v-else-if="columnDisplay(column) === 'actions'">
    <Space v-if="record.action_codes?.length" wrap>
      <PermissionLink
        v-for="code in record.action_codes"
        :key="code"
        path="/system/action"
        :query="{ code: record.action_codes.join(',') }"
      >
        <Tag color="blue">
          {{ code }}
        </Tag>
      </PermissionLink>
    </Space>
    <span v-else>-</span>
  </template>
  <template v-else-if="columnDisplay(column) === 'users'">
    <Space v-if="memberPreview(record).length" wrap>
      <PermissionLink
        v-for="item in memberPreview(record)"
        :key="item.id"
        path="/system/user"
        :query="{ username: item.username }"
      >
        <Tag>{{ item.username }}</Tag>
      </PermissionLink>
    </Space>
    <span v-else>-</span>
    <Button
      v-if="memberCount(record) && hasButtonAccess('view-members')"
      type="link"
      size="small"
      @click="emit('detail')"
      >
{{
        $t('system-members.viewAll', { count: memberCount(record) })
      }}
</Button>
  </template>
  <template v-else-if="columnDisplay(column) === 'role'">
    <PermissionLink
      v-if="record.role"
      class="text-primary hover:underline"
      path="/system/role"
      :query="{ word: record.role.word }"
    >
      {{ record.role.name }}
    </PermissionLink>
    <span v-else>-</span>
  </template>
  <template v-else-if="columnDisplay(column) === 'status'">
    <Tag :color="statusColor(record.status)">
      {{ statusLabel(record.status) }}
    </Tag>
  </template>
  <template v-else-if="columnDisplay(column) === 'json'">
    <div
      class="flex min-w-0 flex-col"
      :class="props.resource === 'user' ? 'w-full gap-1' : 'max-w-72 gap-2'"
    >
      <div
        v-if="props.resource === 'user' && record.status === 2"
        class="flex items-center gap-1"
      >
        <span class="text-muted-foreground">{{
          $t('system.user.lockLabel')
        }}</span>
        <Tag v-if="userLockExpiration(record) === 0" class="m-0" color="red">
          {{ $t('system.user.permanent') }}
        </Tag>
        <Tag
          v-else-if="userLockExpiration(record) !== undefined"
          class="m-0"
          color="orange"
        >
          {{ $t('system.user.untilPrefix') }}
          {{ formatLockExpiration(userLockExpiration(record)) }}
        </Tag>
        <Tag v-else class="m-0">
          {{ $t('system.common.unknown') }}
        </Tag>
      </div>
      <pre
        class="m-0 overflow-auto whitespace-pre-wrap"
        :class="
          props.resource === 'user' ? 'max-h-[60px] leading-5' : 'max-h-40'
        "
        tabindex="0"
        :aria-label="String(column.title)"
        >{{ formatJSON(columnValue(record, column)) }}</pre>
    </div>
  </template>
  <template v-else-if="columnDisplay(column) === 'boolean'">
    <Tag :color="columnValue(record, column) ? 'green' : 'default'">
      {{
        columnValue(record, column)
          ? $t('system.enabled.yes')
          : $t('system.enabled.no')
      }}
    </Tag>
  </template>
  <template v-else-if="columnDisplay(column) === 'category'">
    <Tag :color="record.category === 0 ? 'blue' : 'green'">
      {{
        record.category === 0
          ? $t('system.category.permission')
          : $t('system.category.jwt')
      }}
    </Tag>
  </template>
  <span v-else>{{ columnValue(record, column) ?? '-' }}</span>
</template>
<style scoped>
.system-user-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.system-user-identity :deep(.ant-avatar) {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  flex-shrink: 0;
}
.system-user-identity > div {
  min-width: 0;
}
.system-user-identity :deep(.ant-btn) {
  max-width: 100%;
  padding: 0;
  overflow-wrap: anywhere;
  white-space: normal;
  height: auto;
  text-align: left;
  color: hsl(var(--foreground));
  font-weight: 500;
}
.system-user-identity > div > span {
  font-size: 11px;
}
.system-user-identity > div > span {
  display: block;
  color: hsl(var(--muted-foreground));
  margin-top: 2px;
}
.system-matrix-word {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  line-height: 1.8;
}
.system-action-list-cell {
  max-height: 160px;
  overflow: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
}

.system-action-list-cell:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: -2px;
}

:deep(.system-resource-rule-tag) {
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>
