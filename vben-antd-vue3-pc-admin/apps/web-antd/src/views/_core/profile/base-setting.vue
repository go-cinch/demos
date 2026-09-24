<script setup lang="ts">
import type { UserInfoWithPermissions } from '#/api';

import { onMounted, ref } from 'vue';

import { Form, FormItem } from 'ant-design-vue';

import { getUserInfoApi } from '#/api';
import { $t } from '#/locales';

const profileInfo = ref<UserInfoWithPermissions>();

onMounted(async () => {
  profileInfo.value = await getUserInfoApi();
});
</script>
<template>
  <Form
    :colon="false"
    :label-col="{ style: { width: '88px' } }"
    :wrapper-col="{ flex: 1 }"
    layout="horizontal"
  >
    <FormItem :label="$t('page.profile.fields.username')">
      <span class="text-foreground">{{ profileInfo?.username || '-' }}</span>
    </FormItem>
    <FormItem :label="$t('page.profile.fields.role')">
      <span class="text-foreground">{{ profileInfo?.roleName || '-' }}</span>
    </FormItem>
  </Form>
</template>
