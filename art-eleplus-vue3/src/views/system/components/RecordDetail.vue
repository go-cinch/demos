<script setup lang="ts">
  import { ref, computed, watch, onBeforeUnmount } from 'vue'
  import { $t } from '@/locales'
  import { getAdminRecord } from '@/utils/admin/service'
  import {
    type AdminRecord,
    type AdminResource,
    recordName,
    permissionRecords,
    adminDate
  } from '@/utils/admin/model'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  import PermissionDetail from './permission-detail.vue'
  import GroupMembers from './GroupMembers.vue'
  const props = defineProps<{ resource: AdminResource; record?: AdminRecord; canEdit: boolean }>(),
    emit = defineEmits<{ close: []; edit: [AdminRecord] }>()
  const data = ref<AdminRecord>(),
    loading = ref(false),
    error = ref(false),
    retry = ref(0),
    group = ref<string>(),
    timezone = useAdminTimezone()
  let generation = 0
  watch(
    () => [props.resource, props.record, retry.value],
    async () => {
      const run = ++generation
      data.value = props.record
      group.value = undefined
      if (!props.record) return
      loading.value = true
      error.value = false
      try {
        const result = await getAdminRecord(props.resource, props.record.id)
        if (run === generation) data.value = result
      } catch {
        if (run === generation) error.value = true
      } finally {
        if (run === generation) loading.value = false
      }
    },
    { immediate: true }
  )
  onBeforeUnmount(() => {
    generation++
  })
  const actions = computed(() => (data.value ? permissionRecords(data.value) : []))
  const fields: Record<string, string> = {
    username: 'username',
    code: 'code',
    name: 'name',
    word: 'word',
    group: 'group',
    key: 'dictionaryKey',
    value: 'dictionaryValue',
    enabled: 'enabled',
    description: 'description',
    resource: 'resourceRules',
    menu: 'menuPaths',
    button: 'buttonPermission',
    status: 'status',
    metadata: 'metadata',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
    role: 'role',
    role_id: 'role'
  }
  function fieldLabel(key: string) {
    return key === 'login_count'
      ? $t('pc.system-cards.loginCount')
      : key === 'last_logged_in_at'
        ? $t('pc.system-cards.lastLogin')
        : key === 'wrong'
          ? $t('pc.system-cards.failedLoginCount')
          : $t(`system.fields.${fields[key] ?? key}`)
  }
  function lines(value: unknown) {
    return String(value ?? '')
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
  }
  function tagType(rule: string) {
    return (
      ({ GET: 'success', POST: 'primary', PATCH: 'warning', DELETE: 'danger' } as const)[
        rule.split('|')[0] as 'GET' | 'POST' | 'PATCH' | 'DELETE'
      ] ?? 'info'
    )
  }
</script>
<template>
  <ElDrawer
    :model-value="!!record"
    :title="$t('pc.system-cards.recordDetails')"
    size="min(720px,100vw)"
    destroy-on-close
    @close="emit('close')"
    data-testid="management-drawer"
    ><ElSkeleton v-if="loading" animated :rows="10" /><ElAlert
      v-else-if="error"
      :title="$t('pc.system-cards.loadError')"
      type="error"
      :closable="false"
      ><ElButton @click="retry++">{{ $t('pc.system-cards.retry') }}</ElButton></ElAlert
    ><div v-else-if="data" class="record-detail" data-testid="record-detail"
      ><header
        ><h2>{{ recordName(data) }}</h2
        ><span>#{{ data.id }}</span></header
      ><ElDescriptions :column="1" border
        ><ElDescriptionsItem
          v-for="[key, value] in Object.entries(data).filter(
            ([key]) =>
              ![
                'id',
                'actions',
                'action_codes',
                'users',
                'member_preview',
                'member_count',
                'permission_sources',
                'config',
                'names',
                'role_summary'
              ].includes(key)
          )"
          :key="key"
          :label="fieldLabel(key)"
          ><span v-if="key.endsWith('_at')">{{ adminDate(value, timezone) }}</span
          ><ElTag
            v-else-if="key === 'status'"
            :type="value === 1 ? 'success' : value === 2 ? 'danger' : 'warning'"
            >{{
              $t(
                ['system.status.pending', 'system.status.active', 'system.status.locked'][
                  Number(value)
                ] ?? 'system.common.unknown'
              )
            }}</ElTag
          ><ElTag v-else-if="typeof value === 'boolean'" :type="value ? 'success' : 'info'">{{
            $t(value ? 'system.enabled.yes' : 'system.enabled.no')
          }}</ElTag
          ><div v-else-if="['resource', 'menu', 'button'].includes(key)" class="rule-tags"
            ><ElTag v-for="line in lines(value)" :key="line" :type="tagType(line)" effect="plain">{{
              line
            }}</ElTag></div
          ><pre v-else-if="typeof value === 'object'" class="json-value">{{
            JSON.stringify(value, null, 2)
          }}</pre
          ><span v-else>{{ value ?? '—' }}</span></ElDescriptionsItem
        ></ElDescriptions
      ><section v-if="['action', 'role', 'user', 'user-group'].includes(resource)">
        <h3>{{ $t('pc.system-cards.associatedPermissions') }}</h3>
        <PermissionDetail
          :actions="(resource === 'action' ? [data] : actions) as any"
          :codes="(data.action_codes ?? []) as string[]"
          :sources="data.permission_sources as any"
        /> </section
      ><GroupMembers v-if="resource === 'user-group'" :id="data.id" /><details
        ><summary>{{ $t('pc.system-cards.rawRecord') }}</summary
        ><pre class="json-value">{{ JSON.stringify(data, null, 2) }}</pre>
      </details></div
    ><template #footer
      ><ElButton @click="emit('close')">{{ $t('pc.system-cards.backToList') }}</ElButton
      ><ElButton v-if="canEdit && data" type="primary" @click="emit('edit', data)">{{
        $t('system.common.edit')
      }}</ElButton></template
    ></ElDrawer
  >
</template>
<style scoped>
  .record-detail {
    display: grid;
    gap: 24px;
    padding-bottom: 20px;
  }
  .record-detail h2 {
    font-size: 22px;
    font-weight: 600;
  }
  .record-detail h3 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  .record-detail header span,
  .permission-card small {
    color: var(--el-text-color-secondary);
  }
  .permission-tabs,
  .rule-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0;
  }
  .rule-tags :deep(.el-tag) {
    height: auto;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.5;
    padding: 4px 8px;
  }
  .permission-card {
    margin-top: 12px;
  }
  .permission-card code {
    float: right;
  }
  .permission-card small {
    display: block;
    margin-top: 5px;
  }
  .json-value {
    max-height: 280px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--el-fill-color-light);
    padding: 12px;
    font: 12px/1.6 monospace;
    border-radius: var(--el-border-radius-base);
  }
</style>
