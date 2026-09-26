<script lang="ts" setup>
import type { NotificationItem } from '@vben/layouts';

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { useWatermark } from '@vben/hooks';
import {
  BasicLayout,
  LockScreen,
  Notification,
  UserDropdown,
} from '@vben/layouts';
import {
  preferences,
  updatePreferences,
  usePreferences,
} from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';

import { $t } from '#/locales';
import { applicationWidgetPreferences } from '#/preferences';
import { useAuthStore } from '#/store';
import LoginForm from '#/views/_core/authentication/login.vue';

updatePreferences({ widget: applicationWidgetPreferences });

interface NotificationSource {
  avatar: string;
  dateKey: string;
  id: number | string;
  isRead?: boolean;
  link?: string;
  messageKey: string;
  query?: Record<string, any>;
  state?: Record<string, any>;
  titleKey: string;
}

const notificationSources = ref<NotificationSource[]>([
  {
    id: 1,
    avatar: 'https://avatar.vercel.sh/vercel.svg?text=VB',
    dateKey: 'page.notifications.dates.threeHoursAgo',
    isRead: true,
    messageKey: 'page.notifications.description',
    titleKey: 'page.notifications.titles.weeklyReports',
  },
  {
    id: 2,
    avatar: 'https://avatar.vercel.sh/1',
    dateKey: 'page.notifications.dates.justNow',
    isRead: false,
    messageKey: 'page.notifications.description',
    titleKey: 'page.notifications.titles.replied',
  },
  {
    id: 3,
    avatar: 'https://avatar.vercel.sh/1',
    dateKey: 'page.notifications.dates.fixedDate',
    isRead: false,
    messageKey: 'page.notifications.description',
    titleKey: 'page.notifications.titles.commented',
  },
  {
    id: 4,
    avatar: 'https://avatar.vercel.sh/satori',
    dateKey: 'page.notifications.dates.oneDayAgo',
    isRead: false,
    messageKey: 'page.notifications.description',
    titleKey: 'page.notifications.titles.todoReminder',
  },
  {
    id: 5,
    avatar: 'https://avatar.vercel.sh/satori',
    dateKey: 'page.notifications.dates.oneDayAgo',
    isRead: false,
    messageKey: 'page.notifications.description',
    titleKey: 'page.notifications.titles.workspaceLink',
    link: '/workspace',
  },
  {
    id: 6,
    avatar: 'https://avatar.vercel.sh/satori',
    dateKey: 'page.notifications.dates.oneDayAgo',
    isRead: false,
    messageKey: 'page.notifications.description',
    titleKey: 'page.notifications.titles.externalLink',
    link: 'https://doc.vben.pro',
  },
]);

const notifications = computed<NotificationItem[]>(() =>
  notificationSources.value.map(
    ({ dateKey, messageKey, titleKey, ...notification }) => ({
      ...notification,
      date: $t(dateKey),
      message: $t(messageKey),
      title: $t(titleKey),
    }),
  ),
);

const router = useRouter();
const userStore = useUserStore();
const authStore = useAuthStore();
const accessStore = useAccessStore();
const { destroyWatermark, updateWatermark } = useWatermark();
const { isDark } = usePreferences();
const showDot = computed(() =>
  notificationSources.value.some((item) => !item.isRead),
);

const menus = computed(() => [
  {
    handler: () => {
      router.push({ name: 'Profile' });
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

function handleNoticeClear() {
  notificationSources.value = [];
}

function markRead(id: number | string) {
  const item = notificationSources.value.find((item) => item.id === id);
  if (item) {
    item.isRead = true;
  }
}

function remove(id: number | string) {
  notificationSources.value = notificationSources.value.filter(
    (item) => item.id !== id,
  );
}

function handleMakeAll() {
  notificationSources.value.forEach((item) => (item.isRead = true));
}

const viewAll = () => {};

const handleClick = (item: NotificationItem) => {
  // 如果通知项有链接，点击时跳转
  if (item.link) {
    navigateTo(item.link, item.query, item.state);
  }
};

function navigateTo(
  link: string,
  query?: Record<string, any>,
  state?: Record<string, any>,
) {
  if (link.startsWith('http://') || link.startsWith('https://')) {
    // 外部链接，在新标签页打开
    window.open(link, '_blank');
  } else {
    // 内部路由链接，支持 query 参数和 state
    router.push({
      path: link,
      query: query || {},
      state,
    });
  }
}

watch(
  () => ({
    enable: preferences.app.watermark,
    content: preferences.app.watermarkContent,
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
        content:
          content ||
          `${userStore.userInfo?.username} - ${userStore.userInfo?.realName}`,
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
        description="go-cinch"
        @clear-preferences-and-logout="handleLogout"
        @logout="handleLogout"
      />
    </template>
    <template #notification>
      <Notification
        :dot="showDot"
        :notifications="notifications"
        @clear="handleNoticeClear"
        @read="(item) => item.id && markRead(item.id)"
        @remove="(item) => item.id && remove(item.id)"
        @make-all="handleMakeAll"
        @on-click="handleClick"
        @view-all="viewAll"
      />
    </template>
    <template #extra>
      <AuthenticationLoginExpiredModal
        v-model:open="accessStore.loginExpired"
        :avatar
      >
        <LoginForm />
      </AuthenticationLoginExpiredModal>
    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
</template>
