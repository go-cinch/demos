<script setup lang="ts">
import type { MenuRecordRaw } from '@vben/types';

import type { UserInfoWithPermissions } from '#/api';

import { computed } from 'vue';

import { useAccessStore } from '@vben/stores';

import { Card, Tag } from 'ant-design-vue';

import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
defineProps<{ user: null | UserInfoWithPermissions }>();
const access = useAccessStore();
const { hasPage } = usePermissions();
function visibleFeatures(items: MenuRecordRaw[]): MenuRecordRaw[] {
  return items.flatMap((menu) => {
    if (menu.show === false || menu.disabled) return [];
    if (menu.children?.length) return visibleFeatures(menu.children);
    return menu.path !== '/msg/inbox' && hasPage(menu.path) ? [menu] : [];
  });
}
const menus = computed(() => visibleFeatures(access.accessMenus));
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
          <Tag v-if="user?.roleName" color="blue">{{ user.roleName }}</Tag
          ><span v-else>—</span>
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
    <div v-if="menus.length || hasPage('/msg/inbox')" class="account-access">
      <h3>{{ $t('profile-center.accessibleFeatures') }}</h3>
      <div class="account-tags">
        <Tag v-for="menu in menus" :key="menu.path">{{ $t(menu.name) }}</Tag
        ><Tag v-if="hasPage('/msg/inbox')">{{ $t('msg.inbox') }}</Tag>
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
  font-size: 13px;
  color: hsl(var(--muted-foreground));
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
  padding: 4px 10px;
  margin: 0;
}

@media (max-width: 500px) {
  .account-facts {
    grid-template-columns: 1fr;
  }
}
</style>
