<script setup lang="ts">
import type { AuditKind, AuditPreview } from '#/api/audit';
import type { LoadFailure } from '#/api/request-error';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { preferences } from '@vben/preferences';
import { useTimezoneStore, useUserStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Card, Empty, Segmented, Skeleton, Tag } from 'ant-design-vue';

import { auditApi, auditProfileFields } from '#/api/audit';
import { loadFailure } from '#/api/request-error';
import LoadWarning from '#/components/load-warning.vue';
import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';

import {
  auditOutcome,
  clientLabel,
  operationLabel,
  outcomeColor,
} from '../../audit/audit-utils';

const router = useRouter();
const user = useUserStore();
const timezone = useTimezoneStore();
const { hasPage } = usePermissions();
const kinds = computed(() =>
  (['login', 'operation'] as const).filter((kind) => hasPage(`/audit/${kind}`)),
);
const kind = ref<AuditKind>('login');
const options = computed(() =>
  kinds.value.map((value) => ({ value, label: $t(`profile-center.${value}`) })),
);
const rows = shallowRef<AuditPreview[]>([]);
const loading = ref(false);
const error = ref<LoadFailure>(false);
let active = true;
let generation = 0;
function time(value: number) {
  void timezone.timezone;
  return formatDateTime(value);
}
function title(event: AuditPreview) {
  if (event.operation === 'logout') return $t('audit.operationTypes.logout');
  if (kind.value === 'login' && auditOutcome(event) === 'mfa_challenge')
    return $t('audit.loginAttempt');
  if (kind.value === 'login')
    return $t(
      auditOutcome(event) === 'success'
        ? 'profile-center.loginSuccess'
        : 'profile-center.loginFailure',
    );
  return event.operation
    ? $t(`audit.operationTypes.${event.operation}`)
    : operationLabel(event);
}
async function load() {
  const run = ++generation;
  rows.value = [];
  error.value = false;
  loading.value = false;
  const firstKind = kinds.value[0];
  if (!active || !user.userInfo?.username || !firstKind) return;
  if (!kinds.value.includes(kind.value)) {
    kind.value = firstKind;
    return;
  }
  loading.value = true;
  const to = Date.now();
  try {
    const data = await auditApi.list(kind.value, {
      f: auditProfileFields[kind.value],
      username: user.userInfo.username,
      from: to - 30 * 86_400_000,
      to,
      p: 1,
      s: 6,
      sort: 'newest',
      time_zone: timezone.timezone,
    });
    if (run === generation && active) rows.value = data.items;
  } catch (requestError) {
    if (run === generation && active) error.value = loadFailure(requestError);
  } finally {
    if (run === generation) loading.value = false;
  }
}
function openAudit() {
  if (!kinds.value.includes(kind.value) || !user.userInfo?.username) return;
  void router.push({
    path: `/audit/${kind.value}`,
    query: { username: user.userInfo.username, days: '30' },
  });
}
function deactivate() {
  active = false;
  ++generation;
}
watch(
  [
    kind,
    kinds,
    () => user.userInfo?.userId,
    () => user.userInfo?.username,
    () => preferences.app.locale,
    () => timezone.timezone,
  ],
  () => {
    void load();
  },
);
onMounted(() => {
  void load();
});
onActivated(() => {
  if (!active) {
    active = true;
    void load();
  }
});
onDeactivated(deactivate);
onBeforeUnmount(deactivate);
</script>
<template>
  <Card
    class="profile-panel"
    :body-style="{ padding: 0 }"
    data-testid="profile-activity"
    :aria-busy="loading"
  >
    <template #title>
      <h2>{{ $t('profile-center.recentActivity') }}</h2>
    </template>
    <template #extra>
      <Segmented
        v-if="options.length > 1"
        v-model:value="kind"
        :options="options"
        :aria-label="$t('profile-center.activityType')"
      />
      <span v-else-if="options.length" class="activity-kind">{{
        options[0]?.label
      }}</span>
    </template>
    <div class="activity-body">
      <Empty
        v-if="!kinds.length"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        :description="$t('profile-center.noActivityAccess')"
      />
      <LoadWarning
        v-else-if="error"
        :failure="error"
        :retry-label="$t('audit.retry')"
        retry-size="small"
        @retry="load"
      />
      <Skeleton v-else-if="loading" active :paragraph="{ rows: 8 }" />
      <ol v-else-if="rows.length" class="activity-timeline">
        <li v-for="event in rows" :key="event.id" data-testid="profile-event">
          <span
            class="event-icon"
            :class="auditOutcome(event).replaceAll('_', '-')"
            aria-hidden="true"
          >
            <IconifyIcon
              :icon="
                auditOutcome(event) === 'mfa_challenge'
                  ? 'lucide:shield'
                  : auditOutcome(event) === 'success'
                    ? kind === 'login'
                      ? 'lucide:log-in'
                      : 'lucide:check'
                    : 'lucide:x'
              "
            />
          </span>
          <div class="event-copy">
            <div class="event-heading">
              <div class="event-title">
                <span v-if="kind === 'operation'" class="event-module">{{
                  $t(`audit.modules.${event.module}`)
                }}</span>
                <span>{{ title(event) }}</span>
                <Tag :color="outcomeColor[auditOutcome(event)]">
                  {{ $t(`audit.${auditOutcome(event)}`) }}
                </Tag>
              </div>
              <time>{{ time(event.occurred_at) }}</time>
            </div>
            <dl class="event-details">
              <div v-if="kind === 'operation' && event.resource_id">
                <dt>{{ $t('audit.resourceId') }}</dt>
                <dd>{{ event.resource_id }}</dd>
              </div>
              <div v-else>
                <dt>{{ $t('audit.username') }}</dt>
                <dd>{{ event.username || $t('audit.anonymous') }}</dd>
              </div>
              <div>
                <dt>{{ $t('audit.client') }}</dt>
                <dd>{{ clientLabel(event.user_agent) }}</dd>
              </div>
              <div>
                <dt>{{ $t('audit.ip') }}</dt>
                <dd>{{ event.ip || '—' }}</dd>
              </div>
              <div>
                <dt>{{ $t('audit.duration_ms') }}</dt>
                <dd>{{ event.duration_ms }} ms</dd>
              </div>
            </dl>
            <div
              v-if="kind === 'operation' && event.path"
              class="event-request"
            >
              <span class="request-method">{{ event.method }}</span>
              <span class="request-path">{{ event.path }}</span>
              <span class="request-status"
                >{{ $t('audit.httpStatus') }} {{ event.status }}</span
              >
            </div>
            <div v-if="auditOutcome(event) === 'failure'" class="event-error">
              {{ $t('audit.errorInfo') }} ·
              {{ event.error_code || $t('audit.requestFailed') }}
            </div>
          </div>
        </li>
      </ol>
      <Empty
        v-else
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        :description="$t('profile-center.noActivity')"
      />
    </div>
    <div v-if="kinds.length" class="activity-footer">
      <span v-if="!loading && !error && rows.length" class="activity-range">
        {{ $t('profile-center.activityRange', { count: rows.length }) }}
      </span>
      <Button type="link" size="small" @click="openAudit">
        {{ $t('profile-center.viewAudit') }}
      </Button>
    </div>
  </Card>
</template>
<style scoped>
h2 {
  margin: 0;
}

.activity-kind,
.activity-range {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.activity-body {
  min-height: 220px;
  padding: 6px 24px 4px;
}

.activity-timeline {
  padding: 0;
  margin: 0;
  list-style: none;
}

.activity-timeline li {
  position: relative;
  display: flex;
  gap: 14px;
  padding-bottom: 20px;
}

.activity-timeline li:not(:last-child)::before {
  position: absolute;
  top: 32px;
  bottom: 4px;
  left: 13px;
  width: 1px;
  content: '';
  background: hsl(var(--border));
}

.event-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  color: #24875f;
  background: #2a9e7414;
  border-radius: 50%;
}

.event-icon.failure {
  color: #d03e50;
  background: #d03e5012;
}

.dark .event-icon {
  color: #7ad7b3;
}

.dark .event-icon.failure {
  color: #ff8fa1;
}

.event-icon.mfa-challenge {
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
}

.event-copy {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.event-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  align-items: baseline;
  justify-content: space-between;
  font-size: 14px;
}

.event-title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-weight: 500;
}

.event-module {
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.event-heading time {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--muted-foreground));
}

.event-title :deep(.ant-tag) {
  margin: 0;
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
}

.event-details {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px 18px;
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.event-details > div {
  min-width: 0;
}

.event-details dt {
  color: hsl(var(--muted-foreground));
}

.event-details dd {
  margin: 2px 0 0;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.event-request {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  padding: 6px 10px;
  margin-top: 10px;
  font-size: 12px;
  background: hsl(var(--muted) / 50%);
  border-radius: var(--radius);
}

.request-method {
  font-weight: 600;
}

.request-path {
  min-width: 0;
  overflow-wrap: anywhere;
}

.request-status {
  margin-left: auto;
  color: hsl(var(--muted-foreground));
}

.event-error {
  margin-top: 8px;
  font-size: 12px;
  color: hsl(var(--destructive));
  overflow-wrap: anywhere;
}

.activity-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  border-top: 1px solid hsl(var(--border));
}

.activity-footer :deep(.ant-btn) {
  margin-left: auto;
}

@media (max-width: 1100px) {
  .event-details {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .activity-body {
    padding-inline: 18px;
  }
}
</style>
