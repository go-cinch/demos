<script setup lang="ts">
import type { UserInfoWithPermissions } from '#/api';

import { computed, nextTick, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useAccessStore, useUserStore } from '@vben/stores';

import { Alert, Avatar, Badge, Button, Card, Tag } from 'ant-design-vue';

import { $t } from '#/locales';

import MessageHistory from '../../msg/history.vue';
import ProfileBase from './base-setting.vue';
import ProfilePasswordSetting from './password-setting.vue';
import ProfileActivity from './profile-activity.vue';
import ProfileMessages from './profile-messages.vue';

const userStore = useUserStore();
const accessStore = useAccessStore();
const user = computed(
  () => userStore.userInfo as null | UserInfoWithPermissions,
);
const tab = ref('overview');
const unread = ref<number>();
const inboxOpen = ref(false);
const inboxMessageId = ref<number>();
const inboxMessageTitle = ref('');
function openInbox(id?: number, title = '') {
  inboxMessageId.value = id;
  inboxMessageTitle.value = title;
  inboxOpen.value = true;
}
const scope = computed(() =>
  $t(
    accessStore.accessCodes.includes('*')
      ? 'profile-center.allPermissions'
      : 'profile-center.assignedPermissions',
  ),
);
const tabs = computed(() => [
  {
    value: 'overview',
    label: $t('profile-center.overview'),
    icon: 'lucide:layout-grid',
  },
  {
    value: 'info',
    label: $t('profile-center.account'),
    icon: 'lucide:contact-round',
  },
  {
    value: 'security',
    label: $t('profile-center.security'),
    icon: 'lucide:shield-check',
  },
]);
async function moveTab(event: KeyboardEvent) {
  const index = tabs.value.findIndex((item) => item.value === tab.value);
  let next: number;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
    next = (index + 1) % tabs.value.length;
  else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
    next = (index + tabs.value.length - 1) % tabs.value.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = tabs.value.length - 1;
  else return;
  event.preventDefault();
  tab.value = tabs.value[next]!.value;
  await nextTick();
  document.getElementById(`profile-tab-${tab.value}`)?.focus();
}
</script>
<template>
  <Page>
    <div class="profile-center" data-testid="profile-center">
      <h1 class="profile-title">{{ $t('page.profile.title') }}</h1>
      <div class="profile-layout">
        <Card
          class="profile-identity"
          :body-style="{ padding: 0 }"
          data-testid="profile-identity"
        >
          <div class="identity-top">
            <Avatar
              :size="76"
              :style="{ fontSize: '32px' }"
              :src="user?.avatar || undefined"
              class="identity-avatar"
              >
{{ user?.username?.slice(0, 1).toLocaleUpperCase() }}
</Avatar>
            <h2>{{ user?.username || '—' }}</h2>
            <Tag v-if="user?.roleName" color="blue">{{ user.roleName }}</Tag>
            <div class="identity-code">
              <IconifyIcon icon="lucide:fingerprint" /><span>{{
                user?.code || '—'
              }}</span>
            </div>
            <Button
              type="primary"
              block
              class="identity-inbox"
              data-testid="profile-open-inbox"
              :aria-label="$t('profile-center.openInbox')"
              @click="openInbox()"
            >
              <IconifyIcon icon="lucide:mail" />{{ $t('msg.inbox') }}
              <Badge
                v-if="unread"
                :count="unread"
                :overflow-count="99"
                color="white"
                :number-style="{ color: 'hsl(var(--primary))' }"
              />
            </Button>
          </div>
          <dl class="identity-facts">
            <div>
              <dt>{{ $t('page.profile.fields.username') }}</dt>
              <dd>{{ user?.username || '—' }}</dd>
            </div>
            <div>
              <dt>{{ $t('profile-center.accountId') }}</dt>
              <dd>{{ user?.userId || '—' }}</dd>
            </div>
            <div>
              <dt>{{ $t('profile-center.permissionScope') }}</dt>
              <dd>{{ scope }}</dd>
            </div>
          </dl>
          <nav
            class="identity-tabs"
            role="tablist"
            aria-orientation="vertical"
            :aria-label="$t('page.profile.title')"
            @keydown="moveTab"
          >
            <button
              v-for="item in tabs"
              :id="`profile-tab-${item.value}`"
              :key="item.value"
              type="button"
              role="tab"
              :aria-selected="tab === item.value"
              :aria-controls="`profile-panel-${item.value}`"
              :tabindex="tab === item.value ? 0 : -1"
              @click="tab = item.value"
            >
              <IconifyIcon :icon="item.icon" />{{ item.label }}
            </button>
          </nav>
        </Card>
        <div class="profile-content">
          <section
            id="profile-panel-overview"
            v-show="tab === 'overview'"
            role="tabpanel"
            aria-labelledby="profile-tab-overview"
            class="profile-overview"
          >
            <ProfileMessages
              @count="unread = $event"
              @inbox="openInbox"
            />
            <ProfileActivity />
          </section>
          <section
            id="profile-panel-info"
            v-if="tab === 'info'"
            role="tabpanel"
            aria-labelledby="profile-tab-info"
          >
            <ProfileBase :user="user" />
          </section>
          <section
            id="profile-panel-security"
            v-if="tab === 'security'"
            role="tabpanel"
            aria-labelledby="profile-tab-security"
          >
            <Card
              class="profile-panel profile-security"
              :body-style="{ padding: '28px' }"
            >
              <h2>{{ $t('page.profile.tabs.changePassword') }}</h2>
              <Alert
                class="password-notice"
                type="warning"
                show-icon
                :message="$t('profile-center.passwordNotice')"
              />
              <ProfilePasswordSetting />
            </Card>
          </section>
        </div>
      </div>
      <MessageHistory v-model:open="inboxOpen" v-model:message-id="inboxMessageId" :message-title="inboxMessageTitle" />
    </div>
  </Page>
</template>
<style scoped>
.profile-center {
  width: 100%;
  max-width: 1560px;
  margin: 0 auto;
}
.profile-title {
  margin: 2px 0 20px;
  font-size: 22px;
  font-weight: 600;
}
.profile-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  align-items: start;
  gap: 22px;
}
.profile-identity {
  overflow: hidden;
  border-top: 4px solid hsl(var(--primary));
  border-radius: calc(var(--radius) * 1.125);
  background: hsl(var(--card));
}
.identity-top {
  padding: 28px 24px 0;
  text-align: center;
}
.identity-avatar {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
  font-size: 32px;
}
.identity-top h2 {
  margin: 18px 0 10px;
  font-size: 22px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.identity-top :deep(.ant-tag) {
  margin-inline-end: 0;
}
.identity-code {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 14px 0 22px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  overflow-wrap: anywhere;
}
.identity-code svg {
  flex: none;
}
.identity-inbox {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 9px;
  height: 38px;
}
.identity-facts {
  margin: 24px 24px 0;
  padding-top: 17px;
  border-top: 1px solid hsl(var(--border));
}
.identity-facts > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  font-size: 12px;
}
.identity-facts dt {
  flex: none;
  color: hsl(var(--muted-foreground));
}
.identity-facts dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}
.identity-tabs {
  display: grid;
  gap: 6px;
  padding: 20px 14px 24px;
}
.identity-tabs button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 0;
  border-radius: calc(var(--radius) * 0.75);
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.identity-tabs button:hover {
  background: hsl(var(--primary) / 0.04);
  color: hsl(var(--primary));
}
.identity-tabs button[aria-selected='true'] {
  background: hsl(var(--primary) / 0.09);
  color: hsl(var(--primary));
  font-weight: 500;
}
.identity-tabs button:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
.profile-content {
  min-width: 0;
}
.profile-overview {
  display: grid;
  gap: 22px;
}
.profile-security h2 {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 600;
}
.password-notice {
  margin-bottom: 28px;
}
.profile-center :deep(.profile-panel) {
  border-radius: calc(var(--radius) * 1.125);
  background: hsl(var(--card));
}
.profile-center :deep(.profile-panel .ant-card-head) {
  min-height: 64px;
  padding-inline: 24px;
  border-bottom: 0;
}
.profile-center :deep(.profile-panel .ant-card-head-title) {
  padding-block: 18px;
}
.profile-center :deep(.profile-panel h2) {
  font-size: 16px;
  font-weight: 600;
}
@media (max-width: 1100px) {
  .profile-layout {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 18px;
  }
  .identity-top {
    padding-inline: 18px;
  }
  .identity-facts {
    margin-inline: 18px;
  }
}
@media (max-width: 760px) {
  .profile-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .identity-top {
    padding-top: 20px;
  }
  .identity-facts {
    display: none;
  }
  .identity-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 18px 10px;
  }
  .identity-tabs button {
    padding: 10px 8px;
    justify-content: center;
    gap: 6px;
    font-size: 12px;
  }
  .profile-center :deep(.profile-panel .ant-card-head) {
    padding-inline: 18px;
  }
}
</style>
