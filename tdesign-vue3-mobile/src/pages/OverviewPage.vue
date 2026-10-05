<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { can, listResource, session } from '../lib/api';
import { modules } from '../lib/navigation';
import type { PageResult, RecordData } from '../lib/types';
import { dateTime, initials } from '../lib/format';
import { preferences } from '../lib/preferences';
import { locale, t } from '../locales';
import Icon from '../components/Icon.vue';
const route = useRoute();
const tab = computed(() =>
  route.path === '/dashboard/workspace' ? 'workspace' : String(route.query.tab || 'home'),
);
const search = ref('');
type MockDevice = {
  id: number;
  name: string;
  platform: string;
  location: string;
  lastSeen: string;
  current?: boolean;
};
const mockDevices = ref<MockDevice[]>([
  {
    id: 1,
    name: 'iPhone 15 Pro',
    platform: 'Mobile Safari · iOS 18',
    location: 'Shanghai',
    lastSeen: 'deviceActiveNow',
    current: true,
  },
  {
    id: 2,
    name: 'MacBook Pro',
    platform: 'Chrome · macOS',
    location: 'Shanghai',
    lastSeen: 'deviceActiveTwoHours',
  },
  {
    id: 3,
    name: 'Windows Workstation',
    platform: 'Edge · Windows 11',
    location: 'Hangzhou',
    lastSeen: 'deviceActiveYesterday',
  },
]);
const filtered = computed(() =>
  modules.value.filter((m) => m.label.toLowerCase().includes(search.value.toLowerCase())),
);
const workspaceModules = computed(() =>
  modules.value.filter((entry) =>
    ['user', 'role', 'user-group', 'dictionary'].includes(entry.resource),
  ),
);
const total = ref<number>();
const active = ref(0);
const pending = ref(0);
const locked = ref(0);
const users = ref<RecordData[]>([]);
type Region = 'active' | 'locked' | 'pending' | 'recent';
const loading = reactive<Record<Region, boolean>>({
  active: false,
  locked: false,
  pending: false,
  recent: false,
});
const failures = reactive<Record<Region, string>>({
  active: '',
  locked: '',
  pending: '',
  recent: '',
});
const generations: Record<Region, number> = { active: 0, locked: 0, pending: 0, recent: 0 };
const error = computed(() => Object.values(failures).find(Boolean) || '');
const numberSkeleton = [{ type: 'text' as const, width: '116px', height: '46px' }];
const metricSkeleton = [{ type: 'text' as const, width: '42px', height: '24px' }];
const bannerSkeleton = [{ type: 'rect' as const, width: '100%', height: '44px' }];
const recentAvatarSkeleton = [{ type: 'rect' as const, width: '35px', height: '35px' }];
const recentIdentitySkeleton = [
  { type: 'text' as const, width: '100px', height: '18px' },
  { type: 'text' as const, width: '82px', height: '16px' },
];
const recentDateSkeleton = [{ type: 'text' as const, width: '116px', height: '14px' }];
const date = computed(() =>
  new Date().toLocaleDateString(locale.value, {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    timeZone: preferences.timezone,
  }),
);
async function loadRegion(
  region: Region,
  params: Record<string, unknown>,
  apply: (result: PageResult) => void,
) {
  const current = ++generations[region];
  loading[region] = true;
  failures[region] = '';
  try {
    const result = await listResource('user', params);
    if (current === generations[region]) apply(result);
  } catch (e) {
    if (current === generations[region]) failures[region] = (e as Error).message;
  } finally {
    if (current === generations[region]) loading[region] = false;
  }
}
function load(value = tab.value) {
  if (!can('user', 'read')) return;
  if (value === 'home') {
    void loadRegion('recent', { p: 1, s: 5 }, (result) => {
      total.value = result.t;
      users.value = result.items;
    });
    void loadRegion('active', { p: 1, s: 1, status: 1 }, (result) => {
      active.value = result.t;
    });
    void loadRegion('pending', { p: 1, s: 1, status: 0 }, (result) => {
      pending.value = result.t;
    });
  }
  if (value === 'home')
    void loadRegion('locked', { p: 1, s: 1, status: 2 }, (result) => {
      locked.value = result.t;
    });
}
watch(
  tab,
  (value) => {
    if (value === 'home') load(value);
  },
  { immediate: true },
);
function lockScreen() {
  window.dispatchEvent(new Event('cinch-lock-screen'));
}
function removeMockDevice(id: number) {
  mockDevices.value = mockDevices.value.filter((device) => device.id !== id || device.current);
}
</script>
<template>
  <div class="page overview-page">
    <header class="page-heading">
      <div>
        <p v-if="tab !== 'home'" class="eyebrow">{{ t('workspace') }}</p>
        <h1>
          {{
            tab === 'home'
              ? t('page.dashboard.overview')
              : tab === 'workspace'
                ? t('page.dashboard.workspace')
                : t(tab)
          }}
        </h1>
        <p v-if="tab === 'home'" class="eyebrow">{{ date }}</p>
        <p v-if="tab !== 'home'" class="lead">
          {{
            t(
              tab === 'manage'
                ? 'manageHint'
                : tab === 'workspace'
                  ? 'workspaceHint'
                  : 'securityAccountHint',
            )
          }}
        </p>
      </div>
      <RouterLink
        v-if="tab === 'home'"
        to="/profile"
        class="avatar overview-avatar"
        :aria-label="t('mine')"
        >{{ initials(session.user?.username || '') }}</RouterLink
      >
    </header>
    <div v-if="route.query.denied" role="alert" class="notice">{{ t('noAccessHint') }}</div>
    <div v-if="error" class="form-error" role="alert">
      {{ error }}<button @click="load()">{{ t('retry') }}</button>
    </div>
    <template v-if="tab === 'home'">
      <section v-if="can('user', 'read')" class="summary-card overview-summary">
        <div class="summary-label">
          <span>{{ t('userOverview') }}</span>
          <Icon name="usergroup" :size="22" />
        </div>
        <RouterLink
          to="/system/user"
          class="summary-stat summary-stat-total"
          :aria-busy="loading.recent"
          :aria-disabled="loading.recent"
          :tabindex="loading.recent ? -1 : undefined"
          @click="loading.recent && $event.preventDefault()"
        >
          <div class="summary-total-number">
            <t-skeleton
              v-if="loading.recent"
              class="summary-number-skeleton"
              animation="gradient"
              :row-col="numberSkeleton"
            />
            <strong v-else>{{ failures.recent ? '—' : (total ?? '—') }}</strong>
            <small>{{ t('members') }}</small>
          </div>
        </RouterLink>
        <div class="summary-metrics">
          <RouterLink
            to="/system/user?status=1"
            class="summary-stat"
            :aria-busy="loading.active"
            :aria-disabled="loading.active"
            :tabindex="loading.active ? -1 : undefined"
            @click="loading.active && $event.preventDefault()"
          >
            <t-skeleton
              v-if="loading.active"
              class="summary-metric-skeleton"
              animation="gradient"
              :row-col="metricSkeleton"
            />
            <strong v-else>{{ failures.active ? '—' : active }}</strong>
            <span>{{ t('system.status.active') }}</span>
          </RouterLink>
          <RouterLink
            to="/system/user?status=0"
            class="summary-stat"
            :aria-busy="loading.pending"
            :aria-disabled="loading.pending"
            :tabindex="loading.pending ? -1 : undefined"
            @click="loading.pending && $event.preventDefault()"
          >
            <t-skeleton
              v-if="loading.pending"
              class="summary-metric-skeleton"
              animation="gradient"
              :row-col="metricSkeleton"
            />
            <strong v-else>{{ failures.pending ? '—' : pending }}</strong>
            <span>{{ t('system.status.pending') }}</span>
          </RouterLink>
          <RouterLink
            to="/system/user?status=2"
            class="summary-stat"
            :aria-busy="loading.locked"
            :aria-disabled="loading.locked"
            :tabindex="loading.locked ? -1 : undefined"
            @click="loading.locked && $event.preventDefault()"
          >
            <t-skeleton
              v-if="loading.locked"
              class="summary-metric-skeleton"
              animation="gradient"
              :row-col="metricSkeleton"
            />
            <strong v-else>{{ failures.locked ? '—' : locked }}</strong>
            <span>{{ t('system.status.locked') }}</span>
          </RouterLink>
        </div>
      </section>
      <section v-else class="overview-welcome">
        <h2>{{ t('noUserAccess', { name: session.user?.username || '' }) }}</h2>
        <p class="muted">{{ t('overviewHint') }}</p>
      </section>
      <div class="section-heading">
        <h2>{{ t('common') }}</h2>
        <RouterLink to="/dashboard/overview?tab=manage"
          >{{ t('allApps') }} <Icon name="chevron-right" :size="15"
        /></RouterLink>
      </div>
      <div class="quick-grid overview-apps">
        <RouterLink
          v-for="item in modules
            .filter((x) => ['user', 'role', 'user-group', 'dictionary'].includes(x.resource))
            .slice(0, 4)"
          :key="item.path"
          :to="item.path"
          ><span class="quick-icon"><Icon :name="item.icon" :size="20" /></span
          ><span>{{ item.label }}</span></RouterLink
        >
      </div>
      <div v-if="can('user', 'read') && loading.pending" class="review-banner skeleton-region">
        <t-skeleton animation="gradient" :row-col="bannerSkeleton" />
      </div>
      <RouterLink
        v-else-if="can('user', 'read') && !failures.pending && pending > 0"
        to="/system/user?status=0"
        class="review-banner"
        ><Icon name="time" />
        <div>
          <strong>{{ t('pending', { count: pending }) }}</strong
          ><small>{{ t('pendingHint') }}</small>
        </div>
        <Icon name="chevron-right" :size="18"
      /></RouterLink>
      <p v-else-if="can('user', 'read') && !failures.pending" class="review-clear">
        <Icon name="check" :size="16" />{{ t('emptyReview') }}
      </p>
      <template v-if="can('user', 'read')"
        ><div class="section-heading">
          <h2>{{ t('recent') }}</h2>
          <RouterLink to="/system/user"
            >{{ t('all') }} <Icon name="chevron-right" :size="15"
          /></RouterLink>
        </div>
        <section class="card record-list overview-recent" :aria-busy="loading.recent">
          <div v-if="loading.recent" role="status" :aria-label="t('loading')">
            <div
              v-for="index in 5"
              :key="index"
              class="record recent-placeholder"
              aria-hidden="true"
            >
              <span class="avatar recent-avatar">
                <t-skeleton animation="gradient" :row-col="recentAvatarSkeleton" />
              </span>
              <div class="record-main">
                <t-skeleton animation="gradient" :row-col="recentIdentitySkeleton" />
              </div>
              <t-skeleton class="recent-date" animation="gradient" :row-col="recentDateSkeleton" />
            </div>
          </div>
          <RouterLink
            v-for="user in loading.recent ? [] : users"
            :key="user.id"
            :to="`/system/user?username=${encodeURIComponent(user.username || '')}`"
            class="record"
            ><span class="avatar recent-avatar">{{ initials(user.username || '') }}</span>
            <div class="record-main">
              <strong>{{ user.username }}</strong
              ><small>{{ t('system.fields.role') }}: {{ user.role?.name || '—' }}</small>
            </div>
            <small class="recent-date">{{ dateTime(user.created_at) }}</small> </RouterLink
          ><t-empty
            v-if="!users.length && !loading.recent && !failures.recent"
            :description="t('noData')"
          /></section></template></template
    ><template v-else-if="tab === 'manage' || tab === 'workspace'">
      <t-search v-if="tab === 'manage'" v-model="search" :placeholder="t('searchApps')" />
      <div v-if="tab === 'workspace'" class="section-heading">
        <h2>{{ t('common') }}</h2>
        <RouterLink to="/dashboard/overview?tab=manage"
          >{{ t('allApps') }}<Icon name="chevron-right" :size="15"
        /></RouterLink>
      </div>
      <div class="app-grid">
        <RouterLink
          v-for="item in tab === 'workspace' ? workspaceModules : filtered"
          :key="item.path"
          :to="item.path"
          class="app-card card"
          ><span class="quick-icon"><Icon :name="item.icon" :size="24" /></span
          ><strong>{{ item.label }}</strong></RouterLink
        >
      </div>
      <t-empty
        v-if="!(tab === 'workspace' ? workspaceModules : filtered).length"
        :description="t('noResults')" /></template
    ><template v-else
      ><section class="security-account card">
        <div class="security-identity">
          <span class="avatar"><Icon name="secured" /></span>
          <div>
            <h2>{{ t('accountSecurity') }}</h2>
            <span class="resource-tag green">{{ t('signedIn') }}</span>
          </div>
        </div>
        <dl class="details">
          <dt>{{ t('system.fields.username') }}</dt>
          <dd>{{ session.user?.username }}</dd>
          <dt>{{ t('system.fields.role') }}</dt>
          <dd>{{ session.user?.role?.name || '—' }}</dd>
          <dt>{{ t('system.fields.userCode') }}</dt>
          <dd>{{ session.user?.code }}</dd>
        </dl>
      </section>
      <div class="section-heading security-section-heading">
        <h2>{{ t('loginDevices') }}</h2>
        <span class="resource-tag blue">{{ t('mockData') }}</span>
      </div>
      <section class="card device-list">
        <div v-for="device in mockDevices" :key="device.id" class="device-row">
          <span class="device-icon"><Icon :name="device.current ? 'mobile' : 'layout'" /></span>
          <div class="device-main">
            <strong>{{ device.name }}</strong>
            <small>{{ device.platform }} · {{ device.location }}</small>
            <small>{{ t(device.lastSeen) }}</small>
          </div>
          <span v-if="device.current" class="resource-tag green">{{ t('currentDevice') }}</span>
          <button v-else class="device-remove" @click="removeMockDevice(device.id)">
            {{ t('removeDevice') }}
          </button>
        </div>
        <p class="device-mock-hint">{{ t('deviceMockHint') }}</p>
      </section>
      <div class="section-heading">
        <h2>{{ t('deviceProtection') }}</h2>
      </div>
      <section class="card">
        <button class="menu-row" @click="lockScreen">
          <Icon name="secured" /><span
            >{{ t('lock') }}<small>{{ t('lockActionHint') }}</small></span
          >
        </button>
      </section>
    </template>
  </div>
</template>
