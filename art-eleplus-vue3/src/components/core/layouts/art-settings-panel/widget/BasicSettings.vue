<template>
  <div>
    <SectionTitle :title="$t('setting.basics.title')" class="mt-10" />
    <div class="mt-5 flex items-center justify-between gap-4"
      ><span class="text-sm">{{ $t('setting.basics.defaultTableSize') }}</span
      ><ElInputNumber
        :model-value="defaultPageSize"
        :min="10"
        :max="200"
        :step="10"
        :aria-label="$t('setting.basics.defaultTableSize')"
        @update:model-value="setDefaultPageSize"
    /></div>
    <SettingItem
      v-for="config in basicSettingsConfig"
      :key="config.key"
      :config="config"
      :model-value="getSettingValue(config.key)"
      @change="handleSettingChange(config.handler, $event)"
    />
  </div>
</template>

<script setup lang="ts">
  import { useDefaultPageSize, setDefaultPageSize } from '@/utils/admin/preferences'
  const defaultPageSize = useDefaultPageSize()
  import SectionTitle from './SectionTitle.vue'
  import SettingItem from './SettingItem.vue'
  import { useSettingStore } from '@/store/modules/setting'
  import { useSettingsConfig } from '../composables/useSettingsConfig'
  import { useSettingsHandlers } from '../composables/useSettingsHandlers'
  import { storeToRefs } from 'pinia'

  const settingStore = useSettingStore()
  const { basicSettingsConfig } = useSettingsConfig()
  const { basicHandlers } = useSettingsHandlers()

  // 获取store的响应式状态
  const {
    uniqueOpened,
    showMenuButton,
    showFastEnter,
    showRefreshButton,
    showCrumbs,
    showWorkTab,
    showLanguage,
    showNprogress,
    colorWeak,
    watermarkVisible,
    menuOpenWidth,
    tabStyle,
    pageTransition,
    customRadius
  } = storeToRefs(settingStore)

  // 创建设置值映射
  const settingValueMap = {
    uniqueOpened,
    showMenuButton,
    showFastEnter,
    showRefreshButton,
    showCrumbs,
    showWorkTab,
    showLanguage,
    showNprogress,
    colorWeak,
    watermarkVisible,
    menuOpenWidth,
    tabStyle,
    pageTransition,
    customRadius
  }

  // 获取设置值的方法
  const getSettingValue = (key: string) => {
    const settingRef = settingValueMap[key as keyof typeof settingValueMap]
    return settingRef?.value ?? null
  }

  // 统一的设置变更处理
  const handleSettingChange = (handlerName: string, value: any) => {
    const handler = (basicHandlers as any)[handlerName]
    if (typeof handler === 'function') {
      handler(value)
    } else {
      console.warn(`Handler "${handlerName}" not found in basicHandlers`)
    }
  }
</script>
