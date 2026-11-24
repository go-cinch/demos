<script setup lang="ts">
import type { AuditPreview } from '#/api/audit';
import type { LoadFailure } from '#/api/request-error';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { copyText, formatDateTime } from '@vben/utils';

import { Avatar, Button, Empty, message, Tag, Tooltip } from 'ant-design-vue';

import LoadWarning from '#/components/load-warning.vue';
import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import AuditParams from './audit-params.vue';
import {
  auditOutcome,
  clientLabel,
  operationLabel,
  outcomeColor,
} from './audit-utils';
const props = defineProps<{
  event?: AuditPreview;
  loading: boolean;
  error: LoadFailure;
  expanded?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  expand: [];
  retry: [];
  related: [field: 'path' | 'user_id', value: string];
}>();
const title = computed(() => {
  if (props.event) {
    if (props.event.kind === 'login' && props.event.operation !== 'logout') {
      return $t('audit.loginAttempt');
    }
    return operationLabel(props.event);
  }
  return $t('audit.details');
});
async function copy(value: string) {
  try {
    await copyText(value);
    message.success($t('audit.copied'));
  } catch {
    message.error($t('verification.copyFailed'));
  }
}
</script>
<template>
  <section
    class="audit-detail"
    :aria-label="$t('audit.eventDetail')"
    :aria-busy="loading"
  >
    <div class="audit-detail-heading">
      <h3>{{ $t('audit.eventDetail') }}</h3>
      <div class="flex gap-1">
        <Tooltip v-if="event && !expanded" :title="$t('audit.expandDetail')">
          <Button
            type="text"
            size="small"
            :aria-label="$t('audit.expandDetail')"
            @click="emit('expand')"
          >
            <IconifyIcon icon="lucide:expand" />
          </Button> </Tooltip
        ><Button
          v-if="event || loading || error"
          type="text"
          size="small"
          :aria-label="$t('audit.closeDetail')"
          @click="emit('close')"
        >
          <IconifyIcon icon="lucide:x" />
        </Button>
      </div>
    </div>
    <LoadWarning
      v-if="error"
      :failure="error"
      :retry-label="$t('audit.retry')"
      retry-size="small"
      @retry="emit('retry')"
    />
    <div v-else-if="event" v-skeleton="loading">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <h4 class="text-base font-semibold">{{ title }}</h4>
        <Tag :color="outcomeColor[auditOutcome(event)]">
          {{ $t(`audit.${auditOutcome(event)}`) }}
        </Tag>
      </div>
      <p class="text-muted-foreground mb-5 text-xs">
        {{ formatDateTime(event.occurred_at) }}
      </p>
      <dl class="audit-facts">
        <template v-if="event.step_up_fingerprint">
          <dt>{{ $t('verification.fingerprint') }}</dt>
          <dd
            class="break-all font-mono"
            data-testid="audit-step-up-fingerprint"
          >
            {{ event.step_up_fingerprint }}
          </dd>
          <dt>{{ $t('verification.verifiedAt') }}</dt>
          <dd>{{ formatDateTime(event.step_up_verified_at!) }}</dd>
        </template>
        <dt>{{ $t('audit.actor') }}</dt>
        <dd>
          <Avatar :size="20" class="audit-avatar">
            {{ (event.username || '?').slice(0, 1).toUpperCase() }} </Avatar
          ><span>{{ event.username || $t('audit.anonymous') }}</span>
        </dd>
        <dt>{{ $t('audit.module') }}</dt>
        <dd>
          {{
            event.module === 'auth'
              ? event.module
              : $t(`audit.modules.${event.module}`)
          }}
        </dd>
        <dt>{{ $t('audit.httpStatus') }}</dt>
        <dd>{{ event.status }}</dd>
        <dt>{{ $t('audit.duration_ms') }}</dt>
        <dd>{{ event.duration_ms }} ms</dd>
        <dt>{{ $t('audit.ip') }}</dt>
        <dd>{{ event.ip || '—' }}</dd>
        <dt>{{ $t('audit.client') }}</dt>
        <dd>{{ clientLabel(event.user_agent) }}</dd>
        <template v-if="event.kind === 'operation'">
          <dt>{{ $t('audit.operationType') }}</dt>
          <dd>
            {{
              event.operation
                ? $t(`audit.operationTypes.${event.operation}`)
                : '—'
            }}
          </dd>
          <dt>{{ $t('audit.resourceType') }}</dt>
          <dd>
            {{
              event.resource_type
                ? $t(`audit.modules.${event.resource_type}`)
                : '—'
            }}
          </dd>
          <dt>{{ $t('audit.resourceId') }}</dt>
          <dd data-testid="audit-resource-id">
            {{ event.resource_id || '—' }}
          </dd>
        </template>
      </dl>
      <p class="audit-fact-title">{{ $t('audit.request') }}</p>
      <div class="audit-code">
        <span>{{ event.method }} {{ event.path }}</span
        ><Button
          type="text"
          size="small"
          :aria-label="$t('audit.copyPath')"
          @click="copy(event.path ?? '')"
        >
          <IconifyIcon icon="lucide:copy" />
        </Button>
      </div>
      <template v-if="auditOutcome(event) === 'failure'">
        <p class="audit-fact-title">{{ $t('audit.errorInfo') }}</p>
        <div class="audit-code">
          {{ event.error_code || $t('audit.requestFailed') }}
        </div>
      </template>
      <p class="audit-fact-title">{{ $t('audit.trace_id') }}</p>
      <div class="audit-code" data-testid="audit-trace-id">
        <span>{{ event.trace_id || $t('audit.noTrace') }}</span
        ><Button
          v-if="event.trace_id"
          type="text"
          size="small"
          :aria-label="$t('audit.copyTrace')"
          @click="copy(event.trace_id)"
        >
          <IconifyIcon icon="lucide:copy" />
        </Button>
      </div>
      <template v-if="expanded">
        <p class="audit-fact-title">{{ $t('audit.user_agent') }}</p>
        <div class="audit-code" data-testid="audit-user-agent">
          {{ event.user_agent || '—' }}
        </div>
      </template>
      <template v-if="event.kind === 'operation'">
        <p class="audit-payload-hint">{{ $t('audit.paramsHint') }}</p>
        <AuditParams
          :label="$t('audit.requestParams')"
          :value="event.request_params"
          test-id="audit-request-params"
        />
        <AuditParams
          :label="$t('audit.responseParams')"
          :value="event.response_params"
          test-id="audit-response-params"
        />
      </template>
      <div class="audit-follow">
        <h4>{{ $t('audit.continue') }}</h4>
        <div class="mt-3 flex flex-wrap gap-2">
          <Button
            :disabled="!event.user_id"
            size="small"
            @click="
              event.user_id && emit('related', 'user_id', String(event.user_id))
            "
          >
            <IconifyIcon icon="lucide:user-round" class="mr-1" />{{
              $t('audit.sameActor')
            }} </Button
          ><Button
            size="small"
            @click="emit('related', 'path', event.path ?? '')"
          >
            <IconifyIcon icon="lucide:link" class="mr-1" />{{
              $t('audit.samePath')
            }}
          </Button>
        </div>
      </div>
    </div>
    <div v-else class="audit-detail-empty">
      <Empty
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        :description="$t('audit.selectRecord')"
      />
    </div>
  </section>
</template>
<style scoped>
.audit-detail {
  min-width: 0;
  min-height: 100%;
  padding: 18px;
  background: hsl(var(--card));
}

.audit-detail-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.audit-detail-heading h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.audit-facts {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 10px 8px;
  font-size: 12px;
}

.audit-facts dt {
  color: hsl(var(--muted-foreground));
}

.audit-facts dd {
  display: flex;
  gap: 7px;
  align-items: center;
  margin: 0;
  overflow-wrap: anywhere;
}

.audit-avatar {
  color: hsl(var(--primary));
  background: color-mix(in srgb, hsl(var(--primary)) 14%, hsl(var(--card)));
}

.audit-fact-title {
  margin: 18px 0 6px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.audit-code {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  overflow-wrap: anywhere;
  background: hsl(var(--muted));
  border-radius: calc(var(--radius) * 0.625);
}

.audit-code span {
  min-width: 0;
}

.audit-payload-hint {
  margin: 18px 0 10px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.audit-follow {
  padding-top: 16px;
  margin-top: 20px;
  font-size: 13px;
  border-top: 1px solid hsl(var(--border));
}

.audit-detail-empty {
  padding: 38px 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}
</style>
