<script setup lang="ts">
import { computed } from 'vue';
import type { RecordData } from '../lib/types';
import type { DisplayColumn } from '../lib/resource-config';
import { t } from '../locales';
import { dateTime } from '../lib/format';
const props = defineProps<{ record: RecordData; column: DisplayColumn }>();
const value = computed(() => props.record[props.column.dataIndex]);
const lines = computed(() =>
  String(value.value || '')
    .split(/\r?\n/)
    .filter(Boolean),
);
function color(rule: string) {
  if (typeof props.record.category === 'number')
    return props.record.category === 0 ? 'blue' : 'green';
  return (
    ({ GET: 'green', POST: 'blue', PATCH: 'orange', DELETE: 'red' } as Record<string, string>)[
      rule.split('|')[0]?.trim().toUpperCase() || ''
    ] || 'default'
  );
}
</script>
<template>
  <time v-if="column.display === 'date'">{{ dateTime(value) }}</time>
  <pre v-else-if="column.display === 'json'" class="json-value">{{
    JSON.stringify(value ?? null, null, 2)
  }}</pre>
  <template v-else-if="column.display === 'status'"
    ><t-tag
      role="presentation"
      :theme="value === 0 ? 'warning' : value === 1 ? 'success' : 'danger'"
      variant="light"
      >{{
        t(
          value === 0
            ? 'system.status.pending'
            : value === 1
              ? 'system.status.active'
              : 'system.status.locked',
        )
      }}</t-tag
    ><small
      v-if="value === 2 && record.metadata?.lock_expired_at !== undefined"
      class="lock-expiration resource-tag"
      :class="record.metadata.lock_expired_at === 0 ? 'red' : 'orange'"
      >{{
        record.metadata.lock_expired_at === 0
          ? t('system.user.permanent')
          : dateTime(record.metadata.lock_expired_at)
      }}</small
    ><small v-if="value === 0 && record.metadata?.reject_register_reason" class="field-error">{{
      record.metadata.reject_register_reason
    }}</small></template
  ><t-tag
    role="presentation"
    v-else-if="column.display === 'boolean'"
    :theme="value ? 'success' : 'default'"
    variant="light"
    >{{ t(value ? 'system.enabled.yes' : 'system.enabled.no') }}</t-tag
  ><span
    v-else-if="column.display === 'category'"
    class="resource-tag"
    :class="value === 0 ? 'blue' : 'green'"
    >{{ t(value === 0 ? 'system.category.permission' : 'system.category.jwt') }}</span
  ><RouterLink
    v-else-if="column.display === 'role' && record.role"
    :to="{ path: '/system/role', query: { word: record.role.word } }"
    >{{ record.role.name }}</RouterLink
  >
  <span v-else-if="column.display === 'role'">—</span>
  <div v-else-if="column.display === 'actions'" class="tags">
    <RouterLink
      v-for="code in record.action_codes"
      :key="code"
      :to="{ path: '/system/action', query: { code: record.action_codes?.join(',') } }"
      ><span class="resource-tag blue">{{ code }}</span></RouterLink
    ><span v-if="!record.action_codes?.length">—</span>
  </div>
  <div v-else-if="column.display === 'users'" class="tags">
    <RouterLink
      v-for="user in record.users"
      :key="user.id"
      :to="{ path: '/system/user', query: { username: user.username } }"
      ><t-tag role="presentation" variant="light">{{ user.username }}</t-tag></RouterLink
    ><span v-if="!record.users?.length">—</span>
  </div>
  <div v-else-if="column.display === 'resource-rules'" class="tags">
    <span v-for="line in lines" :key="line" class="resource-tag" :class="color(line)">{{
      line
    }}</span>
  </div>
  <span v-else>{{ value ?? '—' }}</span>
</template>
