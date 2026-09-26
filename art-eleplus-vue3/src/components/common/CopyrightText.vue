<template>
  <div v-if="copyrightEnabled" class="copyright-text">
    Copyright © {{ copyrightDate }}
    <a :href="copyrightCompanyLink" target="_blank" rel="noreferrer">{{ copyrightCompany }}</a>
    <template v-if="copyrightIcp">
      ·
      <a
        :href="copyrightIcpLink || undefined"
        :target="copyrightIcpLink ? '_blank' : undefined"
        rel="noreferrer"
        >{{ copyrightIcp }}</a
      >
    </template>
  </div>
</template>

<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import { useSettingStore } from '@/store/modules/setting'

  const {
    copyrightEnabled,
    copyrightDate,
    copyrightCompany,
    copyrightCompanyLink,
    copyrightIcp,
    copyrightIcpLink
  } = storeToRefs(useSettingStore())
</script>

<style scoped>
  a {
    color: var(--el-color-primary);
  }
  a:hover {
    text-decoration: underline;
  }
</style>
