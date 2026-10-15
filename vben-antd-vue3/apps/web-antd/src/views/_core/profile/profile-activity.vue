<script setup lang="ts">
import type { AuditEvent, AuditKind } from '#/api/audit';

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

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';
import { preferences } from '@vben/preferences';
import { useTimezoneStore, useUserStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Button, Card, Empty, Segmented, Skeleton, Tag } from 'ant-design-vue';

import { auditApi } from '#/api/audit';
import LoadWarning from '#/components/load-warning.vue';
import { $t } from '#/locales';

import {
  clientLabel,
  operationLabel,
  successful,
} from '../../audit/audit-utils';

const router = useRouter();
const user = useUserStore();
const timezone = useTimezoneStore();
const { hasAccessByCodes } = useAccess();
const kinds = computed(() =>
  (['login', 'operation'] as const).filter((kind) =>
    hasAccessByCodes([`audit.${kind}.read`]),
  ),
);
const kind = ref<AuditKind>('login');
const options = computed(() =>
  kinds.value.map((value) => ({ value, label: $t(`profile-center.${value}`) })),
);
const rows = shallowRef<AuditEvent[]>([]);
const loading = ref(false);
const error = ref(false);
let active = true;
let generation = 0;
function time(value: number) {
  void timezone.timezone;
  return formatDateTime(value);
}
function title(event: AuditEvent) {
  if (event.kind === 'login')
    return $t(
      successful(event)
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
  if (!active || !user.userInfo?.username || !kinds.value.length) return;
  if (!kinds.value.includes(kind.value)) {
    kind.value = kinds.value[0]!;
    return;
  }
  loading.value = true;
  const to = Date.now();
  try {
    const data = await auditApi.list(kind.value, {
      username: user.userInfo.username,
      from: to - 30 * 86_400_000,
      to,
      p: 1,
      s: 6,
      sort: 'newest',
      time_zone: timezone.timezone,
    });
    if (run === generation && active) rows.value = data.items;
  } catch {
    if (run === generation && active) error.value = true;
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
      <LoadWarning v-else-if="error">
        <template #action>
          <Button size="small" @click="load">{{ $t('audit.retry') }}</Button>
        </template>
      </LoadWarning>
      <Skeleton v-else-if="loading" active :paragraph="{ rows: 8 }" />
      <ol v-else-if="rows.length" class="activity-timeline">
        <li v-for="event in rows" :key="event.id" data-testid="profile-event">
          <span
            class="event-icon"
            :class="{ failed: !successful(event) }"
            aria-hidden="true"
          >
            <IconifyIcon
              :icon="
                successful(event)
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
                <Tag :color="successful(event) ? 'success' : 'error'">
                  {{
                    $t(successful(event) ? 'audit.success' : 'audit.failure')
                  }}
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
            <div v-if="!successful(event)" class="event-error">
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
      <Button type="link" size="small" @click="openAudit">{{
        $t('profile-center.viewAudit')
      }}</Button>
    </div>
  </Card>
</template>
<style scoped>
h2 {
  margin: 0;
}
.activity-kind,
.activity-range {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
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
  background: hsl(var(--border));
  content: '';
}
.event-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #24875f;
  background: #2a9e7414;
}
.event-icon.failed {
  color: #d03e50;
  background: #d03e5012;
}
.dark .event-icon {
  color: #7ad7b3;
}
.dark .event-icon.failed {
  color: #ff8fa1;
}
.event-copy {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}
.event-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px 18px;
  flex-wrap: wrap;
  font-size: 14px;
}
.event-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-weight: 500;
}
.event-module {
  color: hsl(var(--muted-foreground));
  font-weight: 400;
}
.event-heading time {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.event-title :deep(.ant-tag) {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  font-weight: 400;
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
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.event-request {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: var(--radius);
  background: hsl(var(--muted) / 50%);
  font-size: 12px;
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
  color: hsl(var(--destructive));
  font-size: 12px;
  overflow-wrap: anywhere;
}
.activity-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
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
