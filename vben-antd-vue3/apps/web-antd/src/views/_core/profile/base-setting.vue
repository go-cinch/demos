<script setup lang="ts">
import type { UserInfoWithPermissions } from '#/api';

import { computed } from 'vue';

import { useAccessStore } from '@vben/stores';

import { Card, Tag } from 'ant-design-vue';

import { $t } from '#/locales';
defineProps<{ user: null | UserInfoWithPermissions }>();
const access = useAccessStore();
const menus = computed(() =>
  access.accessMenus
    .flatMap((menu) => (menu.children?.length ? menu.children : [menu]))
    .filter((menu) => menu.show !== false && !menu.disabled),
);
</script>
<template>
  <Card
    class="profile-panel"
    :body-style="{ padding: '28px' }"
    data-testid="profile-account"
  >
    <h2>{{ $t('profile-center.account') }}</h2>
    <dl class="account-facts">
      <div>
        <dt>{{ $t('page.profile.fields.username') }}</dt>
        <dd>{{ user?.username || '—' }}</dd>
      </div>
      <div>
        <dt>{{ $t('page.profile.fields.role') }}</dt>
        <dd>
          <Tag v-if="user?.roleName" color="blue">{{ user.roleName }}</Tag><span v-else>—</span>
        </dd>
      </div>
      <div>
        <dt>{{ $t('profile-center.accountId') }}</dt>
        <dd>{{ user?.userId || '—' }}</dd>
      </div>
      <div>
        <dt>{{ $t('profile-center.accountCode') }}</dt>
        <dd>{{ user?.code || '—' }}</dd>
      </div>
    </dl>
    <div class="account-access">
      <h3>{{ $t('profile-center.accessibleFeatures') }}</h3>
      <div class="account-tags">
        <Tag v-for="menu in menus" :key="menu.path">{{ $t(menu.name) }}</Tag><Tag>{{ $t('msg.inbox') }}</Tag>
      </div>
    </div>
  </Card>
</template>
<style scoped>
h2 {
  margin: 0;
}
.account-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px;
  margin: 28px 0;
}
.account-facts dt {
  margin-bottom: 8px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.account-facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.account-access {
  padding-top: 24px;
  border-top: 1px solid hsl(var(--border));
}
.account-access h3 {
  margin-bottom: 16px;
  font-size: 14px;
  font-weight: 500;
}
.account-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.account-tags :deep(.ant-tag) {
  margin: 0;
  padding: 4px 10px;
}
@media (max-width: 500px) {
  .account-facts {
    grid-template-columns: 1fr;
  }
}
</style>
