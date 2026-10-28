<script setup lang="ts">
  import { ref } from 'vue'
  import { $t } from '@/locales'
  import { adminDate, type AuditEvent } from '@/utils/admin/model'
  import { useAdminTimezone } from '@/utils/admin/preferences'
  defineProps<{
    event?: AuditEvent
    loading: boolean
    error: boolean
    expanded?: boolean
  }>()
  const emit = defineEmits<{
    close: []
    expand: []
    retry: []
    related: [field: 'path' | 'username' | 'ip', value: string]
  }>()
  const timezone = useAdminTimezone(),
    copyStatus = ref('')
  const keys = [
    'id',
    'username',
    'module',
    'status',
    'duration_ms',
    'ip',
    'method',
    'path',
    'operation',
    'resource_type',
    'resource_id',
    'error_code',
    'trace_id',
    'user_agent'
  ]
  const label = (key: string) =>
    $t(
      `pc.audit.${({ status: 'httpStatus', operation: 'operationType', resource_type: 'resourceType', resource_id: 'resourceId' } as Record<string, string>)[key] ?? key}`
    )
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      copyStatus.value = $t('pc.audit.copied')
    } catch {
      copyStatus.value = $t('pc.audit.copyError')
    }
  }
</script>
<template>
  <section class="audit-detail" :aria-label="$t('pc.audit.eventDetail')" :aria-busy="loading"
    ><header
      ><h3>{{ $t('pc.audit.eventDetail') }}</h3
      ><div
        ><ElButton
          v-if="event && !expanded"
          text
          :aria-label="$t('pc.audit.expandDetail')"
          @click="emit('expand')"
          ><ArtSvgIcon icon="ri:fullscreen-line" /></ElButton
        ><ElButton
          v-if="event || loading || error"
          text
          :aria-label="$t('pc.audit.closeDetail')"
          @click="emit('close')"
          ><ArtSvgIcon icon="ri:close-line" /></ElButton></div></header
    ><ElSkeleton v-if="loading" animated :rows="8" /><ElAlert
      v-else-if="error"
      type="error"
      :closable="false"
      :title="$t('pc.audit.loadError')"
      ><ElButton @click="emit('retry')">{{ $t('pc.audit.retry') }}</ElButton></ElAlert
    ><template v-else-if="event"
      ><p class="muted">{{ adminDate(event.occurred_at, timezone) }}</p
      ><ElTag :type="event.status < 400 ? 'primary' : 'danger'">{{
        $t(event.status < 400 ? 'pc.audit.success' : 'pc.audit.failure')
      }}</ElTag
      ><dl class="facts"
        ><template
          v-for="key in keys.filter(
            (key) =>
              event!.kind === 'operation' ||
              !['operation', 'resource_type', 'resource_id'].includes(key)
          )"
          :key="key"
          ><dt>{{ label(key) }}</dt
          ><dd>{{
            key === 'operation' && event.operation
              ? $t(`pc.audit.operationTypes.${event.operation}`)
              : (event[key] ?? '—')
          }}</dd></template
        ></dl
      ><div class="investigation"
        ><ElButton size="small" @click="copy(event.path)">{{ $t('pc.audit.copyPath') }}</ElButton
        ><ElButton size="small" :disabled="!event.trace_id" @click="copy(event.trace_id)">{{
          $t('pc.audit.copyTrace')
        }}</ElButton></div
      ><p v-if="copyStatus" role="status">{{ copyStatus }}</p
      ><section v-if="event.kind === 'operation'"
        ><p class="muted">{{ $t('pc.audit.paramsHint') }}</p
        ><section
          v-for="key in ['request_params', 'response_params']"
          :key="key"
          :aria-label="
            $t(key === 'request_params' ? 'pc.audit.requestParams' : 'pc.audit.responseParams')
          "
          ><h4>{{
            $t(key === 'request_params' ? 'pc.audit.requestParams' : 'pc.audit.responseParams')
          }}</h4
          ><pre tabindex="0" class="audit-params">{{
            event[key] == null ? $t('pc.audit.noParams') : JSON.stringify(event[key], null, 2)
          }}</pre>
        </section></section
      ><h4>{{ $t('pc.audit.continue') }}</h4
      ><div class="investigation"
        ><ElButton
          v-if="event.username"
          size="small"
          @click="emit('related', 'username', event.username)"
          >{{ $t('pc.audit.sameActor') }}</ElButton
        ><ElButton size="small" @click="emit('related', 'path', event.path)">{{
          $t('pc.audit.samePath')
        }}</ElButton
        ><ElButton size="small" @click="emit('related', 'ip', event.ip)">{{
          $t('pc.audit.ip')
        }}</ElButton></div
      ></template
    ><ElEmpty v-else :image-size="50" :description="$t('pc.audit.selectRecord')"
  /></section>
</template>
<style scoped>
  .audit-detail {
    font-size: 13px;
    padding-bottom: 24px;
  }
  .audit-detail header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 16px;
  }
  .audit-detail h3,
  .audit-detail h4 {
    font-weight: 600;
  }
  .audit-detail h4 {
    margin: 18px 0 10px;
  }
  .muted,
  .facts dt {
    color: var(--el-text-color-secondary);
  }
  .muted {
    margin: 10px 0;
    font-size: 12px;
  }
  .facts {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 14px;
    margin: 20px 0;
  }
  .facts dd {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .audit-params {
    max-height: 260px;
    overflow: auto;
    padding: 14px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border: 1px solid var(--el-border-color);
    border-radius: var(--el-border-radius-base);
    background: var(--el-fill-color-light);
    font: 12px/1.6 monospace;
  }
  .investigation {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .investigation .el-button + .el-button {
    margin-left: 0;
  }
</style>
