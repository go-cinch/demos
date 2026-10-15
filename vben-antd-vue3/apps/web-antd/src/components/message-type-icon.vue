<script setup lang="ts">
import { IconifyIcon } from '@vben/icons';

import { $t } from '#/locales';

defineProps<{ type: string }>();
</script>

<template>
  <span
    class="message-type-icon"
    :class="{ notice: type === 'notice' }"
    role="img"
    :aria-label="$t(type === 'notice' ? 'msg.notice' : 'msg.system')"
  >
    <IconifyIcon
      :icon="type === 'notice' ? 'lucide:megaphone' : 'lucide:bell'"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.message-type-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 38px;
  border-radius: calc(var(--radius) * 0.875);
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 0.08);
}
.message-type-icon.notice {
  color: #aa741d;
  background: #dca53816;
}
.dark .message-type-icon.notice {
  color: #f1c477;
}
</style>
