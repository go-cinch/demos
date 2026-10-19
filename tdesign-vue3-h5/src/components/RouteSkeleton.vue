<script setup lang="ts">
import { computed } from 'vue';
import type { LocationQuery } from 'vue-router';
import { skeletonContext } from '../lib/skeleton-route';
import { configs } from '../lib/resource-config';
import { modules } from '../lib/navigation';
import { session, can } from '../lib/api';
import { locale, t } from '../locales';
import { dateTime, initials } from '../lib/format';
import Icon from './Icon.vue';
import Field from './Field.vue';
import Copyright from './Copyright.vue';
import ResultToolbar from './ResultToolbar.vue';
import RecordPagination from './RecordPagination.vue';
import RecordListSkeleton from './RecordListSkeleton.vue';
const props = defineProps<{ path: string; query?: LocationQuery }>();
const context = computed(() => skeletonContext(props.path, String(props.query?.tab || 'home')));
const config = computed(() =>
  context.value.resource ? configs.value[context.value.resource] : undefined,
);
const primary = computed(
  () =>
    config.value?.filters.find((x) => x.type === 'input') ||
    config.value?.filters.find((x) => x.key === 'resource') ||
    config.value?.filters[0],
);
const allowed = computed(() => !session.ready || can('user', 'read'));
const knownModules = computed(() =>
  modules.value.length || session.ready
    ? modules.value
    : Array.from({ length: 7 }, (_, index) => ({
        path: `skeleton-${index}`,
        resource: ['user', 'role', 'user-group', 'action', 'dictionary', 'whitelist', 'msg'][index],
        label: '\u00a0'.repeat(8),
      })),
);
const applications = computed(() =>
  context.value.kind === 'workspace'
    ? knownModules.value
        .filter((x) => ['user', 'role', 'user-group', 'dictionary'].includes(x.resource))
        .slice(0, 4)
    : knownModules.value,
);
const authMode = computed(() =>
  context.value.mode === 'reset-password' ? 'password_reset' : context.value.mode,
);
const date = computed(() =>
  new Date().toLocaleDateString(locale.value, { month: 'long', day: 'numeric', weekday: 'long' }),
);
const heading = computed(
  () =>
    config.value?.title ||
    t(
      context.value.messages
        ? 'app.msg.manage'
        : context.value.kind === 'applications'
          ? 'manage'
          : context.value.kind === 'workspace'
            ? 'page.dashboard.workspace'
            : context.value.kind === 'security'
              ? 'security'
              : context.value.kind === 'inbox'
                ? 'app.msg.inbox'
                : context.value.kind === 'profile'
                  ? 'mine'
                  : 'page.dashboard.overview',
    ),
);
</script>
<template>
  <div
    :class="[
      context.kind === 'auth' ? 'auth-page' : 'page',
      {
        management: context.kind === 'management',
        'overview-page': ['overview', 'applications', 'workspace', 'security'].includes(
          context.kind,
        ),
        'profile-page': context.kind === 'profile',
        'message-page': context.kind === 'inbox',
      },
      'route-skeleton',
    ]"
    :data-resource="context.resource"
    :data-skeleton-kind="context.kind"
    :data-skeleton-path="path"
    role="status"
    aria-busy="true"
    :aria-label="t('loading')"
  >
    <div class="route-skeleton-content" aria-hidden="true" inert>
      <section v-if="context.kind === 'auth'" class="auth-panel">
        <h1>
          {{
            t(
              authMode === 'login'
                ? 'loginTitle'
                : authMode === 'register'
                  ? 'registerTitle'
                  : 'app.resetPassword.title',
            )
          }}
        </h1>
        <p class="lead">
          {{
            t(
              authMode === 'login'
                ? 'loginHint'
                : authMode === 'register'
                  ? 'registerHint'
                  : 'app.resetPassword.description',
            )
          }}
        </p>
        <form>
          <Field
            v-if="authMode !== 'password_reset'"
            name="skeleton-username"
            :label="t('system.fields.username')"
            required
            ><t-input disabled clearable :placeholder="t('app.validation.username')"
          /></Field>
          <Field
            name="skeleton-password"
            :label="
              t(
                authMode === 'password_reset'
                  ? 'system.fields.newPassword'
                  : 'system.fields.password',
              )
            "
            required
            ><t-input disabled type="password" :placeholder="t('app.validation.password')"
          /></Field>
          <Field
            v-if="authMode !== 'login'"
            name="skeleton-confirmation"
            :label="t('page.profile.password.confirmPassword')"
            required
            ><t-input disabled type="password" :placeholder="t('app.validation.password')"
          /></Field>
          <Field
            v-if="authMode !== 'password_reset'"
            name="skeleton-verification"
            :label="t('app.captcha.additional')"
            ><div class="slider-track skeleton-fill"
          /></Field>
          <t-button block theme="primary" size="large" disabled>{{
            t(
              authMode === 'login'
                ? 'page.auth.login'
                : authMode === 'register'
                  ? 'page.auth.register'
                  : 'app.resetPassword.submit',
            )
          }}</t-button>
          <span class="auth-link">{{
            t(
              authMode === 'login'
                ? 'registerLink'
                : authMode === 'register'
                  ? 'loginLink'
                  : 'logout',
            )
          }}</span>
        </form>
      </section>
      <Copyright v-if="context.kind === 'auth'" />
      <template v-else>
        <header v-if="context.kind === 'inbox'" class="page-heading">
          <span class="back-link"><Icon name="chevron-left" :size="22" /></span>
          <h1>{{ heading }}</h1>
          <span class="icon-button message-read-all"><Icon name="broom" :size="23" /></span>
        </header>
        <header v-else class="page-heading">
          <span v-if="context.messages" class="back-link"
            ><Icon name="chevron-left" :size="22"
          /></span>
          <div>
            <p
              v-if="['applications', 'workspace', 'security'].includes(context.kind)"
              class="eyebrow"
            >
              {{ t('workspace') }}
            </p>
            <h1>{{ heading }}</h1>
            <p v-if="context.kind === 'overview'" class="eyebrow">{{ date }}</p>
            <p
              v-if="['applications', 'workspace', 'security', 'profile'].includes(context.kind)"
              :class="'lead'"
            >
              {{
                t(
                  context.kind === 'applications'
                    ? 'manageHint'
                    : context.kind === 'workspace'
                      ? 'workspaceHint'
                      : context.kind === 'security'
                        ? 'securityAccountHint'
                        : 'profileHint',
                )
              }}
            </p>
          </div>
          <span v-if="context.kind === 'overview'" class="avatar overview-avatar">{{
            initials(session.user?.username || '')
          }}</span>
        </header>
        <template v-if="context.kind === 'applications' || context.kind === 'workspace'">
          <t-search
            v-if="context.kind === 'applications'"
            disabled
            :placeholder="t('searchApps')"
          />
          <div v-else class="section-heading">
            <h2>{{ t('common') }}</h2>
            <a>{{ t('allApps') }}<Icon name="chevron-right" :size="15" /></a>
          </div>
          <div class="app-grid">
            <div v-for="item in applications" :key="item.path" class="app-card card">
              <span class="quick-icon skeleton-fill" /><strong class="skeleton-label">{{
                item.label
              }}</strong>
            </div>
          </div>
        </template>
        <template v-else-if="context.kind === 'management'">
          <section class="search-region">
            <div v-if="primary" class="management-primary-search">
              <div class="search-field">
                <t-input
                  disabled
                  clearable
                  :placeholder="t('system.common.enter', { field: primary.label })"
                />
              </div>
              <button class="filter-toggle" disabled><Icon name="filter" :size="19" /></button>
            </div>
            <Field v-else name="skeleton-msg-type" :label="t('app.msg.type')"
              ><div class="select-trigger">
                <span>{{ t('app.msg.allTypes') }}</span
                ><Icon name="chevron-down" :size="16" /></div
            ></Field>
            <div v-if="context.resource === 'user'" class="segmented status-segmented">
              <button
                v-for="key in [
                  'all',
                  'system.status.active',
                  'system.status.pending',
                  'system.status.locked',
                ]"
                :key="key"
                disabled
              >
                {{ t(key) }}
              </button>
            </div>
            <div v-if="context.messages" class="search-actions">
              <button class="action-chip action-chip-quiet" disabled>
                {{ t('system.common.reset') }}</button
              ><button class="action-chip action-chip-primary" disabled>
                {{ t('system.common.search') }}
              </button>
            </div>
          </section>
          <div class="results-region">
            <ResultToolbar
              ><div
                v-if="context.messages || (context.resource && can(context.resource, 'create'))"
                class="create-button create-labeled skeleton-action"
              >
                <Icon name="add" :size="16" /><span>{{
                  context.messages
                    ? t('app.msg.send')
                    : t('createRecord', { entity: config?.entity || '' })
                }}</span>
              </div></ResultToolbar
            >
            <div class="selection-tools">
              <div class="selection-actions">
                <div
                  v-if="context.messages || !context.resource || can(context.resource, 'delete')"
                  class="action-chip skeleton-action"
                >
                  <Icon name="check-rectangle" :size="16" /><span>{{ t('select') }}</span>
                </div>
              </div>
              <span class="result-count"><span class="skeleton-text" style="width: 60px" /></span>
            </div>
            <RecordListSkeleton
              :resource="context.resource"
              :kind="context.messages ? 'sent' : 'resource'"
            />
            <RecordPagination :page="1" :size="20" :total="0" loading />
          </div>
        </template>
        <template v-else-if="context.kind === 'overview'">
          <section v-if="allowed" class="summary-card overview-summary">
            <div class="summary-label">
              <span>{{ t('userOverview') }}</span
              ><Icon name="usergroup" :size="22" />
            </div>
            <div class="summary-stat summary-stat-total">
              <div class="summary-total-number">
                <strong><span class="skeleton-text" style="width: 116px" /></strong
                ><small>{{ t('members') }}</small>
              </div>
            </div>
            <div class="summary-metrics">
              <a v-for="key in ['active', 'pending', 'locked']" :key="key" class="summary-stat">
                <strong><span class="skeleton-text" style="width: 42px" /></strong
                ><span>{{ t(`system.status.${key}`) }}</span>
              </a>
            </div>
          </section>
          <div class="section-heading">
            <h2>{{ t('common') }}</h2>
            <a>{{ t('allApps') }}<Icon name="chevron-right" :size="15" /></a>
          </div>
          <div class="quick-grid overview-apps">
            <a
              v-for="item in knownModules
                .filter((x) => ['user', 'role', 'user-group', 'dictionary'].includes(x.resource))
                .slice(0, 4)"
              :key="item.path"
            >
              <span class="quick-icon skeleton-fill" /><span class="skeleton-label">{{
                item.label
              }}</span>
            </a>
          </div>
          <div v-if="allowed" class="review-clear skeleton-fill" style="height: 44px" />
          <template v-if="allowed"
            ><div class="section-heading">
              <h2>{{ t('recent') }}</h2>
              <a>{{ t('all') }}<Icon name="chevron-right" :size="15" /></a>
            </div>
            <section class="card record-list overview-recent">
              <RecordListSkeleton kind="recent" /></section
          ></template>
        </template>
        <template v-else-if="context.kind === 'security'">
          <section class="security-account card">
            <div class="security-identity">
              <span class="avatar skeleton-fill" />
              <div>
                <h2>{{ t('accountSecurity') }}</h2>
                <span class="resource-tag green">{{ t('signedIn') }}</span>
              </div>
            </div>
            <dl class="details">
              <template v-for="key in ['username', 'role', 'userCode']" :key="key"
                ><dt>{{ t(`system.fields.${key}`) }}</dt>
                <dd><span class="skeleton-text" style="width: 100px" /></dd
              ></template>
            </dl>
          </section>
          <div class="section-heading security-section-heading">
            <h2>{{ t('loginDevices') }}</h2>
            <span class="resource-tag blue">{{ t('mockData') }}</span>
          </div>
          <section class="card device-list">
            <div v-for="index in 3" :key="index" class="device-row">
              <span class="device-icon skeleton-fill" />
              <div class="device-main">
                <strong><span class="skeleton-text" style="width: 112px" /></strong
                ><small><span class="skeleton-text" style="width: 140px" /></small
                ><small><span class="skeleton-text" style="width: 90px" /></small>
              </div>
              <span class="skeleton-text" style="width: 44px" />
            </div>
            <p class="device-mock-hint">{{ t('deviceMockHint') }}</p>
          </section>
          <div class="section-heading">
            <h2>{{ t('deviceProtection') }}</h2>
          </div>
          <section class="card">
            <div class="menu-row">
              <Icon name="secured" /><span
                >{{ t('lock') }}<small>{{ t('lockActionHint') }}</small></span
              >
            </div>
          </section>
        </template>
        <template v-else-if="context.kind === 'profile'">
          <section class="profile-card card">
            <span class="avatar large profile-avatar skeleton-fill" />
            <div class="profile-identity">
              <h2><span class="skeleton-text" style="width: 136px" /></h2>
              <p><span class="skeleton-text" style="width: 80px" /></p>
              <small class="muted"><span class="skeleton-text" style="width: 112px" /></small>
            </div>
          </section>
          <h2 class="section-title">{{ t('page.auth.profile') }}</h2>
          <section class="card profile-menu">
            <div v-for="key in ['profile', 'password']" :key="key" class="menu-row">
              <span class="menu-icon skeleton-fill" /><span>{{ t(key) }}</span
              ><Icon name="chevron-right" />
            </div>
          </section>
          <div class="about">
            <span class="skeleton-fill" style="width: 30px; height: 30px" /><span
              >Cinch · TDesign Mobile Vue</span
            ><small>{{ t('subtitle') }}</small>
          </div>
          <t-button block variant="outline" theme="danger" disabled>{{ t('logout') }}</t-button>
        </template>
        <template v-else-if="context.kind === 'inbox'">
          <section class="message-filters">
            <div class="message-type-tabs">
              <button v-for="key in ['allTypes', 'system', 'notice']" :key="key" disabled>
                {{ t(`app.msg.${key}`) }}
              </button>
            </div>
          </section>
          <div class="results-region"><RecordListSkeleton kind="message" /></div>
        </template>
      </template>
    </div>
  </div>
</template>
<style scoped>
.route-skeleton.message-page .page-heading {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 44px;
  gap: 6px;
  margin: 0 0 12px;
}
.route-skeleton.message-page .back-link,
.route-skeleton.message-page .message-read-all {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  line-height: 0;
}
.route-skeleton.message-page .page-heading h1 {
  margin: 0;
  font-size: 21px;
  line-height: 28px;
  font-weight: 600;
}
.route-skeleton-content {
  display: contents;
}
.skeleton-text {
  display: inline-block;
  height: 0.75em;
  max-width: 100%;
  border-radius: 3px;
  vertical-align: middle;
  background: var(--accent-light);
}
.skeleton-fill {
  background: var(--accent-light);
}
.skeleton-fill,
.skeleton-text {
  animation: route-skeleton-pulse 1200ms ease-in-out infinite alternate;
}
.skeleton-label {
  color: transparent;
  position: relative;
}
.skeleton-label::after {
  content: '';
  position: absolute;
  inset: 4px 10%;
  background: var(--accent-light);
  border-radius: 3px;
}
.skeleton-action > * {
  visibility: hidden;
}
.skeleton-action::before {
  background: var(--accent-light) !important;
  animation: route-skeleton-pulse 1200ms ease-in-out infinite alternate;
}
.overview-summary .summary-stat {
  cursor: default;
}
@keyframes route-skeleton-pulse {
  from {
    opacity: 0.55;
  }
  to {
    opacity: 0.95;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-fill,
  .skeleton-text,
  .skeleton-action::before {
    animation: none;
  }
}
</style>
