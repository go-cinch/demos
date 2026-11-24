<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useWatermark } from '@vben/hooks';
import { BasicLayout, LockScreen, UserDropdown } from '@vben/layouts';
import { preferences, usePreferences } from '@vben/preferences';
import { useAccessStore, useTabbarStore, useUserStore } from '@vben/stores';

import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import {
  mailTemplatePath,
  normalizeMailTemplateTabs,
} from '#/router/mail-template-tabs';
import { normalizeProfileTabs } from '#/router/profile-tabs';
import { useAuthStore } from '#/store';
import { canVisitAuthenticatedPage } from '#/store/login-destination';

import MsgBell from './msg-bell.vue';

const router = useRouter();
const tabbarStore = useTabbarStore();
// Migrate cached profile tabs before mounting their page components.
const profileTabs = normalizeProfileTabs(
  tabbarStore.tabs,
  router.currentRoute.value.fullPath,
);
if (profileTabs !== tabbarStore.tabs) {
  const oldKeys = tabbarStore.tabs
    .filter((tab) => tab.path === '/profile' && tab.key !== '/profile')
    .map((tab) => tab.key ?? tab.fullPath);
  tabbarStore.tabs = profileTabs;
  for (const key of oldKeys) tabbarStore.removeCachedRoute(key);
  tabbarStore.visitHistory.remove(...oldKeys);
  void tabbarStore.updateCacheTabs();
}
// Consolidate only saved email-template tabs; other pages retain their keys.
const mailTemplateTabs = normalizeMailTemplateTabs(
  tabbarStore.tabs,
  router.currentRoute.value.fullPath,
);
if (mailTemplateTabs !== tabbarStore.tabs) {
  const oldKeys = tabbarStore.tabs
    .filter(
      (tab) => tab.path === mailTemplatePath && tab.key !== mailTemplatePath,
    )
    .map((tab) => tab.key ?? tab.fullPath);
  tabbarStore.tabs = mailTemplateTabs;
  for (const key of oldKeys) tabbarStore.removeCachedRoute(key);
  tabbarStore.visitHistory.remove(...oldKeys);
  void tabbarStore.updateCacheTabs();
}
const userStore = useUserStore();
const authStore = useAuthStore();
const accessStore = useAccessStore();
const { destroyWatermark, updateWatermark } = useWatermark();
const { isDark } = usePreferences();
const { hasPage } = usePermissions();
async function refreshPermissions(event?: Event) {
  const fresh = event?.type === 'auth-permissions-changed';
  if (
    !accessStore.accessToken ||
    authStore.passwordResetRequired ||
    (document.hidden && !fresh)
  )
    return;
  try {
    const { permission } = await authStore.fetchUserInfo({ fresh });
    const path = router.currentRoute.value.path;
    if (
      path !== '/forbidden' &&
      !path.startsWith('/auth/') &&
      !canVisitAuthenticatedPage(permission, path)
    )
      await router.replace('/forbidden');
  } catch {
    /* Authentication failures use the common request handler. */
  }
}
onMounted(() => {
  window.addEventListener('focus', refreshPermissions);
  window.addEventListener('auth-permissions-changed', refreshPermissions);
});
onBeforeUnmount(() => {
  window.removeEventListener('focus', refreshPermissions);
  window.removeEventListener('auth-permissions-changed', refreshPermissions);
});
const menus = computed(() => [
  {
    handler: () => {
      router.push('/profile');
    },
    icon: 'lucide:user',
    text: $t('page.auth.profile'),
  },
]);

const avatar = computed(() => {
  return userStore.userInfo?.avatar ?? preferences.app.defaultAvatar;
});

async function handleLogout() {
  await authStore.logout(false);
}

watch(
  () => ({
    enable: preferences.app.watermark,
    content:
      preferences.app.watermarkContent ||
      `${userStore.userInfo?.username ?? ''} - ${userStore.userInfo?.realName ?? ''}`,
    isDark: isDark.value,
  }),
  async ({ enable, content, isDark: isDarkValue }) => {
    if (enable) {
      const watermarkColor = isDarkValue
        ? 'rgba(255, 255, 255, 0.12)'
        : 'rgba(0, 0, 0, 0.12)';

      await updateWatermark({
        advancedStyle: {
          colorStops: [
            {
              color: watermarkColor,
              offset: 0,
            },
            {
              color: watermarkColor,
              offset: 1,
            },
          ],
          type: 'linear',
        },
        content,
      });
    } else {
      destroyWatermark();
    }
  },
  {
    immediate: true,
  },
);
</script>

<template>
  <BasicLayout
    :avatar
    :text="userStore.userInfo?.realName"
    @clear-preferences-and-logout="handleLogout"
    @logout="handleLogout"
  >
    <template #user-dropdown>
      <UserDropdown
        :avatar
        :avatar-alt="userStore.userInfo?.username"
        :menus
        :text="userStore.userInfo?.realName"
        description="Go Cinch Admin"
        @clear-preferences-and-logout="handleLogout"
        @logout="handleLogout"
      />
    </template>
    <template #notification>
      <MsgBell v-if="hasPage('/msg/inbox')" />
    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
</template>
