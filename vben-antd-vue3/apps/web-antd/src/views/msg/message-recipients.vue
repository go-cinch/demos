<script setup lang="ts">
import type { MsgRecipient } from '#/api/msg';

import PermissionLink from '#/components/permission-link.vue';

import { Tag } from 'ant-design-vue';

import { $t } from '#/locales';

defineProps<{ recipients?: MsgRecipient[] }>();
</script>
<template>
  <div class="message-recipients" data-testid="message-recipients">
    <template v-if="recipients?.length">
      <Tag v-for="recipient in recipients" :key="recipient.id" :color="recipient.username ? 'blue' : undefined">
        <PermissionLink
          v-if="recipient.username && recipient.code"
          path="/system/user"
          :query="{ code: recipient.code }"
          :aria-label="$t('msg.viewRecipient', { username: recipient.username })"
        >
{{ recipient.username }}
</PermissionLink>
        <span v-else>{{ recipient.username || $t('msg.deletedRecipient') }}</span>
      </Tag>
    </template>
    <span v-else class="recipient-empty">{{ $t(recipients ? 'msg.noRecipients' : 'msg.recipientsUnavailable') }}</span>
  </div>
</template>
<style scoped>
.message-recipients { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
.message-recipients :deep(.ant-tag) { margin: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
a { color: inherit; }
a:hover { text-decoration: underline; }
a:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 3px; border-radius: calc(var(--radius) * 0.25); }
.recipient-empty { color: hsl(var(--muted-foreground)); font-size: 12px; }
</style>
