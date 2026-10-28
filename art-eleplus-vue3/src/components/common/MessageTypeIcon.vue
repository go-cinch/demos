<script setup lang="ts">
  import { $t } from '@/locales'
  defineProps<{ type: 'notice' | 'system' }>()
</script>
<template>
  <span role="img" :aria-label="$t(`msg.${type}`)" class="message-type-icon"
    ><ArtSvgIcon
      :icon="type === 'notice' ? 'ri:notification-3-line' : 'ri:information-line'"
      aria-hidden="true"
  /></span>
</template>
<style scoped>
  .message-type-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--el-border-radius-base);
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    font-size: 21px;
  }
</style>
