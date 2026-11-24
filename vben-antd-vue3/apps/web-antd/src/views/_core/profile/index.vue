<script setup lang="ts">
import type { UserInfoWithPermissions } from '#/api';

import { computed, nextTick, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { Alert, Avatar, Badge, Button, Card, Tag } from 'ant-design-vue';

import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';
import { emailEnabled, totpEnabled } from '#/store/system-properties';

import MessageHistory from '../../msg/history.vue';
import ProfileBase from './base-setting.vue';
import ProfileEmailSetting from './email-setting.vue';
import ProfilePasswordSetting from './password-setting.vue';
import ProfileActivity from './profile-activity.vue';
import ProfileMessages from './profile-messages.vue';
import SecuritySection from './security-section.vue';
import ProfileTOTPSetting from './totp-setting.vue';

const userStore = useUserStore();
const passwordOpen = ref(false);
const passwordBusy = ref(false);
const passwordFormKey = ref(0);
const { hasAllPermissions, hasButton, hasPage, hasProfileAction } =
  usePermissions();
const canChangePassword = computed(
  () =>
    hasButton('admin:btn:account:profile:change-password') &&
    hasProfileAction('change_password'),
);
const canOpenInbox = computed(() => hasPage('/msg/inbox'));
const user = computed(
  () => userStore.userInfo as null | UserInfoWithPermissions,
);
const route = useRoute();
const auth = useAuthStore();
const recoveryRequested = computed(
  () => route.path === '/profile' && auth.totpRecoveryRequested,
);
const tab = ref(
  route.query.tab === 'security' || recoveryRequested.value
    ? 'security'
    : 'overview',
);
watch([() => route.query.tab, recoveryRequested], ([target, recovery]) => {
  if (target === 'security' || recovery) tab.value = 'security';
});
function consumeRecoveryRequest() {
  auth.totpRecoveryRequested = false;
}
const unread = ref<number>();
const inboxOpen = ref(false);
const inboxMessageId = ref<number>();
const inboxMessageTitle = ref('');
let inboxTrigger: HTMLElement | null = null;
watch(canOpenInbox, (allowed) => {
  if (!allowed) {
    inboxOpen.value = false;
    inboxMessageId.value = undefined;
    unread.value = undefined;
  }
});
function restoreInboxFocus(open: boolean) {
  if (!open && inboxTrigger?.isConnected)
    inboxTrigger.focus({ preventScroll: true });
}
function openInbox(id?: number, title = '') {
  inboxTrigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  inboxMessageId.value = id;
  inboxMessageTitle.value = title;
  inboxOpen.value = true;
}
const scope = computed(() =>
  $t(
    hasAllPermissions.value
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
  const target = tabs.value[next];
  if (!target) return;
  tab.value = target.value;
  await nextTick();
  document.querySelector<HTMLElement>(`#profile-tab-${tab.value}`)?.focus();
}
</script>
<template>
  <Page>
    <div class="profile-center" data-testid="profile-center">
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
              v-if="canOpenInbox"
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
              v-if="canOpenInbox"
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
            class="profile-security-stack"
          >
            <header class="security-panel-heading">
              <h2>{{ $t('profile-center.security') }}</h2>
            </header>
            <p
              v-if="!emailEnabled && !totpEnabled && !canChangePassword"
              class="text-muted-foreground"
            >
              {{ $t('profile-center.noSecuritySettings') }}
            </p>
            <ProfileEmailSetting :user="user" />
            <SecuritySection
              v-if="canChangePassword"
              v-model:open="passwordOpen"
              icon="lucide:lock-keyhole"
              :title="$t('page.profile.tabs.changePassword')"
              :action="$t('page.profile.tabs.changePassword')"
              :busy="passwordBusy"
            >
              <template #notice
                ><Alert
                  class="password-notice"
                  type="warning"
                  show-icon
                  :message="$t('profile-center.passwordNotice')"
              /></template>
              <ProfilePasswordSetting
                :key="passwordFormKey"
                @busy="passwordBusy = $event"
                @cancel="
                  passwordOpen = false;
                  passwordFormKey++;
                "
              />
            </SecuritySection>
            <ProfileTOTPSetting
              v-if="totpEnabled"
              :recovery-requested="recoveryRequested"
              @recovery-opened="consumeRecoveryRequest"
            />
          </section>
        </div>
      </div>
      <MessageHistory
        v-if="canOpenInbox"
        v-model:open="inboxOpen"
        v-model:message-id="inboxMessageId"
        :message-title="inboxMessageTitle"
        @after-open-change="restoreInboxFocus"
      />
    </div>
  </Page>
</template>
<style scoped>
.profile-center {
  width: 100%;
  max-width: 1560px;
  margin: 0 auto;
}

.profile-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.profile-identity {
  overflow: hidden;
  background: hsl(var(--card));
  border-top: 4px solid hsl(var(--primary));
  border-radius: calc(var(--radius) * 1.125);
}

.identity-top {
  padding: 28px 24px 0;
  text-align: center;
}

.identity-avatar {
  font-size: 32px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
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
  gap: 7px;
  align-items: center;
  justify-content: center;
  margin: 14px 0 22px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.identity-code svg {
  flex: none;
}

.identity-inbox {
  display: flex;
  gap: 9px;
  align-items: center;
  justify-content: center;
  height: 38px;
}

.identity-facts {
  padding-top: 17px;
  margin: 24px 24px 0;
  border-top: 1px solid hsl(var(--border));
}

.identity-facts > div {
  display: flex;
  gap: 12px;
  justify-content: space-between;
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
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 12px 14px;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius) * 0.75);
}

.identity-tabs button:hover {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 4%);
}

.identity-tabs button[aria-selected='true'] {
  font-weight: 500;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 9%);
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
  grid-template-columns: minmax(0, 1fr);
  gap: 22px;
}

.profile-security-stack {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.security-panel-heading {
  padding: 22px 26px 18px;
  border-bottom: 1px solid hsl(var(--border));
}

.security-panel-heading h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.password-notice {
  width: max-content;
  max-width: 100%;
  margin-bottom: 20px;
}

.profile-center :deep(.profile-panel) {
  min-width: 0;
  background: hsl(var(--card));
  border-radius: calc(var(--radius) * 1.125);
}

.profile-center :deep(.profile-panel .ant-card-head) {
  min-height: 64px;
  padding-inline: 24px;
  border-bottom: 0;
}

.profile-center :deep(.profile-panel .ant-card-head-title) {
  padding-block: 18px;
}

.profile-center :deep(.profile-security-card .ant-card-head) {
  min-height: 72px;
  padding-inline: 28px;
  border-bottom: 1px solid hsl(var(--border));
}

.profile-center :deep(.profile-security-card .ant-card-head-title) {
  padding-block: 16px;
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
    gap: 6px;
    justify-content: center;
    padding: 10px 8px;
    font-size: 12px;
  }

  .profile-center :deep(.profile-panel .ant-card-head) {
    padding-inline: 18px;
  }
}
</style>
