<template>
  <div>
    <SectionTitle :title="$t('setting.copyright.title')" class="mt-10" />
    <div class="flex-cb mb-4"
      ><span class="text-sm">{{ $t('setting.copyright.enabled') }}</span
      ><ElSwitch v-model="copyrightEnabled"
    /></div>
    <label v-for="field in fields" :key="field.key" class="block mb-4 text-sm">
      <span>{{ field.label }}</span>
      <ElInput v-model="field.model.value" class="mt-1" />
    </label>
  </div>
</template>

<script setup lang="ts">
  import { storeToRefs } from 'pinia'
  import { useI18n } from 'vue-i18n'
  import { useSettingStore } from '@/store/modules/setting'
  import SectionTitle from './SectionTitle.vue'

  const { t } = useI18n()
  const {
    copyrightEnabled,
    copyrightDate,
    copyrightCompany,
    copyrightCompanyLink,
    copyrightIcp,
    copyrightIcpLink
  } = storeToRefs(useSettingStore())
  const fields = computed(() => [
    { key: 'date', label: t('setting.copyright.date'), model: copyrightDate },
    { key: 'company', label: t('setting.copyright.company'), model: copyrightCompany },
    { key: 'companyLink', label: t('setting.copyright.companyLink'), model: copyrightCompanyLink },
    { key: 'icp', label: t('setting.copyright.icp'), model: copyrightIcp },
    { key: 'icpLink', label: t('setting.copyright.icpLink'), model: copyrightIcpLink }
  ])
</script>
