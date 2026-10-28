<script setup lang="ts">
  import { $t } from '@/locales'
  import { computed } from 'vue'
  import type { Msg } from '@/api/msg'
  import { adminDate } from '@/utils/admin/model'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  const props = defineProps<{
    rows: Msg[]
    loading: boolean
    checked: number[]
    selected?: Msg
    selectedId?: number
    detailLoading: boolean
    detailError: boolean
    canDelete: boolean
    visible: string[]
    density: string
  }>()
  const emit = defineEmits<{
      check: [number[]]
      select: [Msg]
      view: [Msg]
      remove: [Msg]
      retry: []
    }>(),
    timezone = useAdminTimezone()
  const text = (key: string, params: Record<string, string | number> = {}) =>
    $t(`pc.msg.${key}`, params)
  const all = computed(
    () => props.rows.length > 0 && props.rows.every((row) => props.checked.includes(row.id))
  )
  function toggle(id: number, value: boolean) {
    emit(
      'check',
      value ? [...new Set([...props.checked, id])] : props.checked.filter((value) => value !== id)
    )
  }
</script>
<template>
  <ElSkeleton v-if="loading && !rows.length" animated :rows="12" /><ElEmpty
    v-else-if="!rows.length"
    :description="text('empty')"
  /><div v-else class="sent-workspace" data-testid="message-sent-workspace"
    ><section
      class="sent-list"
      data-testid="message-sent-list"
      :aria-label="text('publishedRecords')"
      ><header
        ><ElCheckbox
          :model-value="all"
          :aria-label="text('selectAll')"
          :disabled="loading"
          @change="emit('check', $event ? rows.map((row) => row.id) : [])"
          >{{ text('publishedRecords') }}</ElCheckbox
        ></header
      ><article v-for="row in rows" :key="row.id" :data-testid="`message-sent-item-${row.id}`"
        ><ElCheckbox
          :model-value="checked.includes(row.id)"
          :aria-label="`${text('select')} ${row.title}`"
          :disabled="loading"
          @change="toggle(row.id, Boolean($event))"
        /><button type="button" :aria-pressed="row.id === selectedId" @click="emit('select', row)"
          ><div class="sent-tags"
            ><ElTag v-if="visible.includes('type')" size="small">{{ text(row.type) }}</ElTag
            ><ElTag v-if="visible.includes('scope')" size="small" type="warning">{{
              text(row.scope)
            }}</ElTag
            ><ElTag
              v-if="row.expired_at && row.expired_at <= Date.now()"
              size="small"
              type="info"
              >{{ text('expired') }}</ElTag
            ></div
          ><strong>{{ row.title }}</strong
          ><p v-if="density !== 'small'">{{ row.summary }}</p
          ><time v-if="visible.includes('published_at')">{{
            adminDate(row.published_at, timezone)
          }}</time></button
        ></article
      ></section
    ><section
      class="sent-preview"
      data-testid="message-sent-preview"
      :aria-label="text('preview')"
      :aria-busy="detailLoading"
      ><header
        ><h2>{{ text('preview') }}</h2
        ><ElButton v-if="selected" text @click="emit('view', selected)">{{
          text('detail')
        }}</ElButton></header
      ><ElSkeleton v-if="detailLoading" animated :rows="10" /><ElAlert
        v-else-if="detailError"
        type="error"
        :closable="false"
        :title="text('detailError')"
        ><ElButton @click="emit('retry')">{{ text('retry') }}</ElButton></ElAlert
      ><template v-else-if="selected"
        ><div class="sent-tags"
          ><ElTag>{{ text(selected.type) }}</ElTag
          ><ElTag type="warning">{{ text(selected.scope) }}</ElTag></div
        ><h3>{{ selected.title }}</h3
        ><p class="preview-meta"
          >{{ text('published') }}: {{ adminDate(selected.published_at, timezone) }} ·
          {{ text('sender') }}: {{ selected.sender_id ?? '—' }}</p
        ><div class="message-content">{{ selected.content }}</div
        ><div class="audience-box"
          ><h4>{{ text('scope') }}: {{ text(selected.scope) }}</h4
          ><p v-if="selected.scope === 'all'">{{ text('broadcastHint') }}</p
          ><template v-else
            ><p>{{
              text('recipientCount', {
                count: selected.recipients?.length ?? selected.recipient_ids?.length ?? 0
              })
            }}</p
            ><div v-if="selected.recipients?.length" class="sent-tags"
              ><ElTag v-for="recipient in selected.recipients" :key="recipient.id" effect="plain"
                >{{ recipient.username }} · {{ recipient.code }}</ElTag
              ></div
            ><p v-else>{{ text('recipientsUnavailable') }}</p></template
          ></div
        ><footer
          ><span
            >{{ text('expiry') }}:
            {{
              selected.expired_at ? adminDate(selected.expired_at, timezone) : text('noExpiry')
            }}</span
          ><ElButton v-if="canDelete" text type="danger" @click="emit('remove', selected)">{{
            text('deleteGlobal')
          }}</ElButton></footer
        ></template
      ><ElEmpty v-else :description="text('selectPreview')" :image-size="60" /></section
  ></div>
</template>
<style scoped>
  .sent-workspace {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(0, 1.5fr);
    gap: 16px;
  }
  .sent-list,
  .sent-preview {
    max-height: 660px;
    overflow: auto;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
  }
  .sent-list > header {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--el-bg-color);
    padding: 14px;
    border-bottom: 1px solid var(--el-border-color);
  }
  .sent-list article {
    display: flex;
    gap: 12px;
    align-items: start;
    border-bottom: 1px solid var(--el-border-color-lighter);
    padding: 16px;
  }
  .sent-list article button {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    text-align: start;
    color: var(--el-text-color-primary);
    cursor: pointer;
  }
  .sent-list article button[aria-pressed='true'] {
    color: var(--el-color-primary);
  }
  .sent-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .sent-list strong {
    display: block;
    font-size: 14px;
    font-weight: 600;
    overflow-wrap: anywhere;
    margin: 12px 0 8px;
  }
  .sent-list p {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 12px;
    line-height: 1.7;
    color: var(--el-text-color-secondary);
  }
  .sent-list time {
    display: block;
    font-size: 11px;
    color: var(--el-text-color-secondary);
    margin-top: 12px;
  }
  .sent-preview {
    padding: 22px;
  }
  .sent-preview header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .sent-preview h2 {
    font-weight: 600;
    font-size: 14px;
  }
  .sent-preview h3 {
    font-size: 22px;
    font-weight: 600;
    margin: 20px 0;
    overflow-wrap: anywhere;
  }
  .preview-meta,
  .audience-box p,
  .sent-preview footer {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    line-height: 1.8;
  }
  .message-content {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.8;
    margin: 24px 0;
  }
  .audience-box {
    padding: 16px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
  }
  .audience-box h4 {
    font-size: 14px;
    margin-bottom: 10px;
  }
  .sent-preview footer {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    border-top: 1px solid var(--el-border-color-lighter);
    padding-top: 14px;
    margin-top: 20px;
  }
  @media (max-width: 1100px) {
    .sent-workspace {
      grid-template-columns: 1fr;
    }
    .sent-list {
      max-height: 450px;
    }
  }
</style>
