<script setup lang="ts">
  import { computed } from 'vue'
  import { $t, catalogLabel } from '@/locales'
  import {
    type AdminRecord,
    type AdminResource,
    recordName,
    countMembers,
    previewMembers,
    permissionSummaries,
    adminDate
  } from '@/utils/admin/model'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  const props = defineProps<{
    resource: AdminResource
    records: AdminRecord[]
    loading: boolean
    selected: number[]
    canEdit: boolean
    canDelete: boolean
    canDetail: boolean
    canSelect: boolean
    canEditRecord: (record: AdminRecord) => boolean
    canDeleteRecord: (record: AdminRecord) => boolean
    canSelectRecord: (record: AdminRecord) => boolean
  }>()
  const emit = defineEmits<{
    select: [number]
    detail: [AdminRecord]
    edit: [AdminRecord]
    delete: [number]
  }>()
  const timezone = useAdminTimezone()
  const selectable = computed(() =>
    props.canSelect ? props.records.filter(props.canSelectRecord) : []
  )
</script>
<template>
  <div v-if="loading" class="resource-cards" aria-busy="true"
    ><ElCard v-for="id in 6" :key="id" shadow="never"
      ><ElSkeleton animated :rows="5" /></ElCard></div
  ><ElEmpty v-else-if="!records.length" :description="$t('pc.system-cards.empty')" /><div
    v-else
    class="resource-cards"
    data-testid="resource-cards"
    ><div v-if="canSelect" class="card-selection"
      ><ElCheckbox
        :model-value="
          selectable.length > 0 && selectable.every((record) => selected.includes(record.id))
        "
        :disabled="!selectable.length"
        :aria-label="$t('pc.system-insights.selectAllPage')"
        @change="
          (checked) => {
            for (const record of selectable)
              if (selected.includes(record.id) !== Boolean(checked)) emit('select', record.id)
          }
        "
        >{{ $t('pc.system-insights.selectAllPage') }}</ElCheckbox
      ><span v-if="selected.length">{{
        $t('pc.system-insights.selected', { count: selected.length })
      }}</span></div
    ><ElCard v-for="record in records" :key="record.id" shadow="never"
      ><div class="card-head"
        ><ElButton v-if="canDetail" link class="record-name" @click="emit('detail', record)">{{
          recordName(record)
        }}</ElButton
        ><span v-else class="record-name">{{ recordName(record) }}</span
        ><ElCheckbox
          v-if="canSelect"
          :disabled="!canSelectRecord(record)"
          :model-value="selected.includes(record.id)"
          :aria-label="$t('pc.system-cards.select', { name: recordName(record) })"
          @change="emit('select', record.id)" /></div
      ><small>{{ record.word ?? record.code ?? record.key ?? `#${record.id}` }}</small
      ><div class="card-content"
        ><template v-if="resource === 'dictionary'"
          ><ElTag :type="record.enabled ? 'success' : 'info'">{{
            $t(record.enabled ? 'system.enabled.yes' : 'system.enabled.no')
          }}</ElTag
          ><pre class="json-preview">{{ JSON.stringify(record.value, null, 2) }}</pre
          ><p>{{ record.description || $t('pc.system-cards.noDescription') }}</p></template
        ><template v-if="resource === 'whitelist'"
          ><ElTag :type="record.category === 0 ? 'primary' : 'success'">{{
            $t(record.category === 0 ? 'system.category.permission' : 'system.category.jwt')
          }}</ElTag
          ><div
            v-for="rule in String(record.resource ?? '')
              .split(/\r?\n/)
              .filter(Boolean)"
            :key="rule"
            ><ElTag effect="plain" :type="record.category === 0 ? 'primary' : 'success'">{{
              rule
            }}</ElTag></div
          ></template
        ><template v-if="['role', 'user', 'user-group'].includes(resource)"
          ><p
            >{{ $t('pc.system-cards.associatedPermissions') }}:
            {{ permissionSummaries(record).length }}</p
          ><div class="card-tags" data-testid="permission-summaries">
            <ElTag
              v-for="action in permissionSummaries(record).slice(0, 3)"
              :key="action.code"
              size="small"
              effect="plain"
            >
              {{ action.name || catalogLabel('actions', action.code) }}
            </ElTag>
            <span v-if="permissionSummaries(record).length > 3"
              >+{{ permissionSummaries(record).length - 3 }}</span
            > </div
          ><div class="card-tags"
            ><ElTag
              v-for="name in [
                ...new Set(permissionSummaries(record).map((action) => String(action.group ?? '')))
              ]"
              :key="name"
              size="small"
              effect="plain"
              >{{ name ? catalogLabel('groups', name) : $t('pc.system-insights.ungrouped') }}</ElTag
            ></div
          ></template
        ><template v-if="resource === 'user-group'"
          ><p>{{ $t('pc.system-members.count', { count: countMembers(record) }) }}</p
          ><div class="card-tags"
            ><ElTag
              v-for="member in previewMembers(record).slice(0, 5)"
              :key="member.id"
              size="small"
              >{{ member.username }}</ElTag
            ></div
          ></template
        ></div
      ><div class="card-actions"
        ><ElButton v-if="canDetail" size="small" @click="emit('detail', record)">{{
          $t('pc.system-cards.details')
        }}</ElButton
        ><ElButton
          v-if="canEdit && canEditRecord(record)"
          size="small"
          @click="emit('edit', record)"
          >{{ $t('system.common.edit') }}</ElButton
        ><ElButton
          v-if="canDelete && canDeleteRecord(record)"
          size="small"
          type="danger"
          plain
          @click="emit('delete', record.id)"
          >{{ $t('system.common.delete') }}</ElButton
        ></div
      ><small>{{ adminDate(record.updated_at, timezone) }}</small></ElCard
    ></div
  >
</template>
<style scoped>
  .card-selection {
    grid-column: 1/-1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }

  .resource-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
    gap: 16px;
  }
  .card-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 10px;
  }
  .record-name {
    font-size: 16px;
    font-weight: 600;
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: start;
  }
  .resource-cards small {
    display: block;
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .card-content {
    min-height: 110px;
    display: grid;
    align-content: start;
    gap: 10px;
    margin: 18px 0;
    font-size: 13px;
  }
  .card-tags,
  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .card-actions {
    border-top: 1px solid var(--el-border-color-lighter);
    padding-top: 14px;
    margin-bottom: 12px;
  }
  .card-actions .el-button + .el-button {
    margin-left: 0;
  }
  .json-preview {
    max-height: 90px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    background: var(--el-fill-color-light);
    padding: 10px;
    border-radius: var(--el-border-radius-base);
  }
  .card-tags :deep(.el-tag) {
    white-space: normal;
    height: auto;
    line-height: 1.5;
    padding: 3px 7px;
  }
</style>
