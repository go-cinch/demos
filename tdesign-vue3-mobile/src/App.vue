<script setup lang="ts">
import MsgBell from './components/MsgBell.vue';
import { message, type Feedback } from './lib/form-feedback';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import enUS from 'tdesign-mobile-vue/es/locale/en_US';
import zhCN from 'tdesign-mobile-vue/es/locale/zh_CN';
import { session, logout, canMenu } from './lib/api';
import { modules } from './lib/navigation';
import { preferences as p } from './lib/preferences';
import { locale, t, toggleLocale } from './locales';
import Icon from './components/Icon.vue';
import Sheet from './components/Sheet.vue';
import SettingsSheet from './components/SettingsSheet.vue';
import Copyright from './components/Copyright.vue';
import Field from './components/Field.vue';
import PageSkeleton from './components/PageSkeleton.vue';
import { routeLoading, routeSkeleton } from './router';
const route = useRoute();
const router = useRouter();
const auth = computed(() => route.path.startsWith('/auth/'));
const settings = ref(false);
const authToolsOpen = ref(false);
const authTools = ref<HTMLElement>();
const toolsOpen = ref(false);
const panel = ref('');
const search = ref('');
const routeSkeletonVariant = computed(() => {
  if (route.path.startsWith('/system/')) return 'management';
  if (route.path === '/dashboard/overview' && String(route.query.tab || 'home') === 'home')
    return 'overview';
  if (route.path === '/profile') return 'profile';
  return 'page';
});
function closeAuthTools(event?: Event) {
  if (event && authTools.value?.contains(event.target as Node)) return;
  authToolsOpen.value = false;
}
function authToolsKeyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') closeAuthTools();
}
onMounted(() => {
  document.addEventListener('pointerdown', closeAuthTools);
  document.addEventListener('keydown', authToolsKeyboard);
});
const query = computed(() =>
  [
    { path: '/dashboard/overview', label: t('home'), icon: 'home' },
    ...(canMenu('/dashboard/workspace')
      ? [{ path: '/dashboard/workspace', label: t('page.dashboard.workspace'), icon: 'app' }]
      : []),
    { path: '/msg/inbox', label: t('app.msg.inbox'), icon: 'mail' },
    ...modules.value,
    { path: '/profile', label: t('page.auth.profile'), icon: 'user' },
  ].filter((x) => x.label.toLowerCase().includes(search.value.toLowerCase())),
);
const popup = computed({
  get: () => !!panel.value,
  set: (v: boolean) => {
    if (!v) panel.value = '';
  },
});
watch(
  () => route.path,
  () => {
    toolsOpen.value = false;
    authToolsOpen.value = false;
  },
);
const active = computed(() =>
  route.path === '/profile'
    ? 'mine'
    : route.path.startsWith('/system/') || route.path === '/dashboard/workspace'
      ? 'manage'
      : String(route.query.tab || 'home'),
);
function navigate(value: string) {
  void router.push(
    value === 'mine'
      ? '/profile'
      : { path: '/dashboard/overview', query: value === 'home' ? {} : { tab: value } },
  );
}
let savedLock: { hash?: string; salt?: string; userId?: number } = {};
try {
  savedLock = JSON.parse(sessionStorage.getItem('cinch-mobile-lock') || '{}');
} catch {
  /* An unavailable browser store leaves locking in memory. */
}
const locked = ref(!!savedLock.hash);
const lockPassword = ref('');
const unlockPassword = ref('');
const lockError = ref<Feedback>('');
let lockHash = savedLock.hash || '';
let lockSalt = savedLock.salt || '';
function clearLock() {
  locked.value = false;
  lockHash = '';
  lockSalt = '';
  savedLock = {};
  try {
    sessionStorage.removeItem('cinch-mobile-lock');
  } catch {
    /* In-memory locking remains available. */
  }
}
watch(
  () => session.user,
  (user) => {
    if (user && savedLock.userId && user.id !== savedLock.userId) clearLock();
  },
);
window.addEventListener('cinch-session-ended', clearLock);
async function digest(value: string) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(lockSalt + value));
  return [...new Uint8Array(data)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function openLock() {
  panel.value = 'lock';
  lockError.value = '';
}
window.addEventListener('cinch-lock-screen', openLock);
onBeforeUnmount(() => {
  window.removeEventListener('cinch-lock-screen', openLock);
  window.removeEventListener('cinch-session-ended', clearLock);
  document.removeEventListener('pointerdown', closeAuthTools);
  document.removeEventListener('keydown', authToolsKeyboard);
});
async function lock() {
  if (!lockPassword.value.trim()) {
    lockError.value = message('app.validation.password');
    return;
  }
  lockSalt = crypto.randomUUID();
  lockHash = await digest(lockPassword.value);
  savedLock = { hash: lockHash, salt: lockSalt, userId: session.user?.id };
  try {
    sessionStorage.setItem('cinch-mobile-lock', JSON.stringify(savedLock));
  } catch {
    /* Keep the current view locked even without persistent storage. */
  }
  lockPassword.value = '';
  locked.value = true;
  panel.value = '';
}
async function unlock() {
  if ((await digest(unlockPassword.value)) !== lockHash) {
    lockError.value = message('lockWrong');
    return;
  }
  locked.value = false;
  unlockPassword.value = '';
  lockError.value = '';
}
async function signout() {
  panel.value = '';
  clearLock();
  await logout();
}
</script>
<template>
  <t-config-provider :global-config="locale === 'en-US' ? enUS : zhCN"
    ><a href="#main" class="skip-link">{{ t('home') }}</a>
    <div class="ambience" />
    <Transition name="page-loading-fade">
      <div v-if="routeLoading" class="page-loading" role="status" :aria-label="t('loading')">
        <span class="page-loading-orb" aria-hidden="true" />
      </div>
    </Transition>
    <div v-if="auth" class="studio auth-studio">
      <div class="device">
        <header class="auth-topbar">
          <RouterLink to="/" class="brand"
            ><img :src="p.dark ? '/go-cinch-white.svg' : '/go-cinch.svg'" alt="" /><span
              class="brand-wide"
              >Go Cinch Admin by TDesign Mobile Vue</span
            ><span class="brand-narrow">Go Cinch Admin</span
            ><span class="brand-tiny">Go Cinch</span></RouterLink
          >
          <div ref="authTools" class="auth-tools-wrap">
            <button
              class="icon-button"
              :aria-label="t('more')"
              :aria-expanded="authToolsOpen"
              aria-controls="auth-tools-menu"
              @click.stop="authToolsOpen = !authToolsOpen"
            >
              <Icon :name="authToolsOpen ? 'close' : 'ellipsis'" />
            </button>
            <Transition name="auth-tools">
              <div v-if="authToolsOpen" id="auth-tools-menu" class="auth-tools-menu">
                <button
                  :aria-label="t('color')"
                  :title="t('color')"
                  @click="
                    settings = true;
                    closeAuthTools();
                  "
                >
                  <Icon name="palette" />
                </button>
                <button
                  :aria-label="t('language')"
                  :title="t('language')"
                  @click="
                    toggleLocale();
                    closeAuthTools();
                  "
                >
                  <Icon name="translate" />
                </button>
                <button
                  :aria-label="t('theme')"
                  :title="t('theme')"
                  @click="
                    p.dark = !p.dark;
                    closeAuthTools();
                  "
                >
                  <Icon :name="p.dark ? 'sunny' : 'moon'" />
                </button>
              </div>
            </Transition>
          </div>
        </header>
        <main id="main" class="main auth-content">
          <PageSkeleton v-if="routeSkeleton" />
          <RouterView v-else />
        </main>
      </div>
    </div>
    <div v-else class="studio" :inert="locked" :aria-hidden="locked">
      <div class="device">
        <header class="topbar">
          <RouterLink to="/dashboard/overview" class="workspace"
            ><img :src="p.dark ? '/go-cinch-white.svg' : '/go-cinch.svg'" alt="" />
            <div>
              <strong>Go Cinch</strong
              ><small>{{ session.user?.role?.name || t('workspace') }}</small>
            </div></RouterLink
          >
          <div class="top-tools">
            <MsgBell v-if="session.user && !session.resetRequired" />
            <button
              class="icon-button"
              :aria-label="t('more')"
              :aria-expanded="toolsOpen"
              @click="toolsOpen = !toolsOpen"
            >
              <Icon name="ellipsis" />
            </button>
          </div>
        </header>
        <main id="main" class="main">
          <PageSkeleton v-if="routeSkeleton" :variant="routeSkeletonVariant" />
          <RouterView v-else :key="route.path" /><Copyright v-if="p.footer" />
        </main>
        <nav class="bottom-nav glass" :aria-label="t('workspace')">
          <button
            v-for="(icon, key) in {
              home: 'home',
              manage: 'app',
              security: 'secured',
              mine: 'user',
            }"
            :key="key"
            :class="{ active: active === key }"
            :aria-current="active === key ? 'page' : undefined"
            @click="navigate(key)"
          >
            <Icon :name="icon" /><span>{{ t(key) }}</span>
          </button>
        </nav>
      </div>
    </div>
    <Sheet v-model="toolsOpen" :title="t('more')">
      <nav class="shell-tools" :aria-label="t('more')" @click="toolsOpen = false">
        <button @click="panel = 'search'">
          <Icon name="search" /><span>{{ t('search') }}</span>
        </button>
        <button @click="settings = true">
          <Icon name="setting" /><span>{{ t('settings') }}</span>
        </button>
        <button @click="p.dark = !p.dark">
          <Icon :name="p.dark ? 'sunny' : 'moon'" /><span>{{ t('theme') }}</span>
        </button>
        <button @click="toggleLocale">
          <Icon name="translate" /><span>{{ t('language') }}</span>
        </button>
        <button @click="panel = 'timezone'">
          <Icon name="time" /><span>{{ t('timezone') }}</span>
        </button>
        <button @click="openLock">
          <Icon name="lock-on" /><span>{{ t('lock') }}</span>
        </button>
      </nav>
    </Sheet>
    <SettingsSheet v-model="settings" /><Sheet v-model="popup" :title="t(panel)"
      ><template v-if="panel === 'search'"
        ><t-search v-model="search" :placeholder="t('search')" />
        <div v-if="!query.length" class="search-empty" role="status">
          <t-empty :description="t('searchPagesEmpty')" />
          <p class="muted">{{ t('searchPagesHint') }}</p>
          <t-button variant="text" @click="search = ''">{{ t('clear') }}</t-button>
        </div>
        <RouterLink
          v-for="item in query"
          :key="item.path"
          :to="item.path"
          class="menu-row"
          @click="panel = ''"
          ><Icon :name="item.icon" />{{ item.label
          }}<Icon name="chevron-right" /></RouterLink></template
      ><template v-else-if="panel === 'logoutConfirm'"
        ><div class="sheet-actions">
          <t-button @click="panel = ''">{{ t('cancel') }}</t-button
          ><t-button theme="danger" @click="signout">{{ t('logout') }}</t-button>
        </div></template
      ><template v-else-if="panel === 'timezone'"
        ><t-radio-group v-model="p.timezone"
          ><t-radio
            v-for="value in ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York']"
            :key="value"
            :value="value"
            :label="value" /></t-radio-group
      ></template>
      <form v-else-if="panel === 'lock'" novalidate @submit.prevent="lock">
        <Field name="lock-password" :label="t('lockPassword')" :error="lockError"
          ><t-input
            id="lock-password"
            v-model="lockPassword"
            type="password"
            autocomplete="new-password" /></Field
        ><t-button block theme="primary" type="submit">{{ t('lock') }}</t-button>
      </form></Sheet
    >
    <div v-if="locked" class="lock-screen">
      <Icon name="lock-on" :size="44" />
      <h1>{{ t('lock') }}</h1>
      <p>{{ session.user?.username }}</p>
      <form novalidate @submit.prevent="unlock">
        <Field name="unlock-password" :label="t('lockHint')" :error="lockError"
          ><t-input id="unlock-password" v-model="unlockPassword" type="password" /></Field
        ><t-button block theme="primary" type="submit">{{ t('unlock') }}</t-button
        ><button type="button" class="auth-link" @click="signout">{{ t('logout') }}</button>
      </form>
    </div></t-config-provider
  >
</template>
