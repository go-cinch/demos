<script setup lang="ts">
  import { ref, computed, nextTick } from 'vue'
  import { $t } from '@/locales'
  import { useUserStore } from '@/store/modules/user'
  import ProfileOverview from './ProfileOverview.vue'
  import InboxFeed from '@/views/msg/InboxFeed.vue'
  const user = useUserStore(),
    tab = ref('overview'),
    inbox = ref(false)
  const text = (key: string) => $t(`pc.profile-center.${key}`)
  const tabs = ['overview', 'account', 'security']
  const features = computed(() =>
    [
      ['/dashboard/overview', 'menus.dashboard.overview'],
      ['/system/user', 'menus.system.user'],
      ['/system/role', 'menus.system.role'],
      ['/system/user-group', 'menus.system.userGroup'],
      ['/system/action', 'menus.system.action'],
      ['/system/dictionary', 'menus.system.dictionary'],
      ['/system/whitelist', 'menus.system.whitelist'],
      ['/system/msg', 'menus.system.msg'],
      ['/audit/login', 'menus.audit.login'],
      ['/audit/operation', 'menus.audit.operation']
    ].filter(
      ([path]) =>
        path === '/dashboard/overview' ||
        user.info.menus?.includes('*') ||
        user.info.menus?.includes(path)
    )
  )
  async function move(event: KeyboardEvent) {
    const offset = (
      { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>
    )[event.key]
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 2
          : offset === undefined
            ? -1
            : (tabs.indexOf(tab.value) + offset + 3) % 3
    if (next < 0) return
    event.preventDefault()
    tab.value = tabs[next]
    await nextTick()
    document.getElementById(`profile-tab-${tab.value}`)?.focus()
  }
</script>
<template>
  <div class="profile-center" data-testid="profile-center"
    ><ElCard shadow="never" class="profile-identity" data-testid="profile-identity"
      ><div class="identity-top"
        ><ElAvatar :size="76">{{ user.info.userName?.slice(0, 1).toLocaleUpperCase() }}</ElAvatar
        ><h2>{{ user.info.userName }}</h2
        ><ElTag v-if="user.info.role">{{ user.info.role.name }}</ElTag
        ><code>{{ user.info.code }}</code
        ><ElButton type="primary" class="w-full" @click="inbox = true">{{
          text('openInbox')
        }}</ElButton></div
      ><dl
        ><dt>{{ text('accountId') }}</dt
        ><dd>{{ user.info.userId }}</dd
        ><dt>{{ text('permissionScope') }}</dt
        ><dd>{{
          text(user.info.buttons?.includes('*') ? 'allPermissions' : 'assignedPermissions')
        }}</dd></dl
      ><nav role="tablist" aria-orientation="vertical" @keydown="move"
        ><button
          v-for="value in tabs"
          :id="`profile-tab-${value}`"
          :key="value"
          type="button"
          role="tab"
          :aria-selected="tab === value"
          :aria-controls="`profile-panel-${value}`"
          :tabindex="tab === value ? 0 : -1"
          @click="tab = value"
          >{{ text(value) }}</button
        ></nav
      ></ElCard
    ><div class="profile-content"
      ><section :id="`profile-panel-${tab}`" role="tabpanel" :aria-labelledby="`profile-tab-${tab}`"
        ><ProfileOverview v-if="tab === 'overview'" @inbox="inbox = true" /><ElCard
          v-else-if="tab === 'account'"
          shadow="never"
          data-testid="profile-account"
          ><h2>{{ text('account') }}</h2
          ><ElDescriptions :column="1" border class="account-facts"
            ><ElDescriptionsItem :label="$t('profile.fields.username')">{{
              user.info.userName
            }}</ElDescriptionsItem
            ><ElDescriptionsItem :label="$t('profile.fields.role')">{{
              user.info.role?.name ?? '—'
            }}</ElDescriptionsItem
            ><ElDescriptionsItem :label="text('accountId')">{{
              user.info.userId
            }}</ElDescriptionsItem
            ><ElDescriptionsItem :label="text('accountCode')">{{
              user.info.code
            }}</ElDescriptionsItem></ElDescriptions
          ><h3>{{ text('accessibleFeatures') }}</h3
          ><div class="feature-tags"
            ><ElTag v-for="[path, key] in features" :key="path" effect="plain">{{
              $t(key)
            }}</ElTag></div
          ></ElCard
        ><ElCard v-else shadow="never"
          ><h2>{{ text('security') }}</h2
          ><ElAlert
            :title="text('passwordNotice')"
            type="warning"
            :closable="false"
            class="security-notice" /><slot /></ElCard></section></div
    ><ElDrawer
      v-model="inbox"
      :show-close="false"
      :title="$t('pc.msg.feedCenter')"
      size="min(640px,100vw)"
      destroy-on-close
      ><InboxFeed v-if="inbox" @close="inbox = false" /></ElDrawer
  ></div>
</template>
<style scoped>
  .profile-center {
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    align-items: start;
    gap: 22px;
  }
  .profile-identity {
    border-top: 4px solid var(--el-color-primary);
  }
  .identity-top {
    text-align: center;
    display: grid;
    justify-items: center;
    gap: 14px;
  }
  .identity-top h2,
  .profile-content h2 {
    font-size: 21px;
    font-weight: 600;
  }
  .identity-top code {
    font-size: 12px;
    overflow-wrap: anywhere;
    color: var(--el-text-color-secondary);
  }
  .profile-identity dl {
    display: grid;
    gap: 8px;
    margin: 22px 0;
    padding: 18px 0;
    border-top: 1px solid var(--el-border-color-lighter);
    border-bottom: 1px solid var(--el-border-color-lighter);
    font-size: 13px;
  }
  .profile-identity dt {
    color: var(--el-text-color-secondary);
    font-size: 12px;
  }
  .profile-identity dd {
    margin-bottom: 8px;
  }
  .profile-identity nav {
    display: grid;
    gap: 8px;
  }
  .profile-identity nav button {
    text-align: start;
    padding: 13px;
    border: 0;
    border-radius: var(--el-border-radius-base);
    background: transparent;
    color: var(--el-text-color-primary);
    cursor: pointer;
    font-size: 13px;
  }
  .profile-identity nav button[aria-selected='true'] {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }
  .profile-content {
    min-width: 0;
  }
  .account-facts {
    margin: 24px 0;
  }
  .feature-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .security-notice {
    margin: 18px 0;
  }
  @media (max-width: 900px) {
    .profile-center {
      grid-template-columns: 1fr;
    }
    .profile-identity nav {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
