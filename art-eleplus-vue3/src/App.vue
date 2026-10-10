<template>
  <ElConfigProvider
    size="default"
    :locale="locales[language]"
    :z-index="3000"
    :card="{
      shadow: 'never'
    }"
  >
    <RouterView></RouterView>
  </ElConfigProvider>
</template>

<script setup lang="ts">
  import { useUserStore } from './store/modules/user'
  import zh from 'element-plus/es/locale/lang/zh-cn'
  import en from 'element-plus/es/locale/lang/en'
  import { systemUpgrade } from './utils/sys'
  import { toggleTransition } from './utils/ui/animation'
  import { checkStorageCompatibility } from './utils/storage'
  import { initializeTheme } from './hooks/core/useTheme'
  import { useSettingStore } from './store/modules/setting'

  const userStore = useUserStore()
  const { language } = storeToRefs(userStore)
  const settingStore = useSettingStore()

  watch(
    () => settingStore.isDark,
    (dark) => {
      document
        .querySelector('link[rel="icon"][type="image/svg+xml"]')
        ?.setAttribute(
          'href',
          `${import.meta.env.BASE_URL}${dark ? 'go-cinch-white.svg' : 'go-cinch.svg'}`
        )
    },
    { immediate: true }
  )

  const locales = {
    zh: zh,
    en: en
  }

  onBeforeMount(() => {
    toggleTransition(true)
    initializeTheme()
  })

  onMounted(() => {
    checkStorageCompatibility()
    toggleTransition(false)
    systemUpgrade()
  })
</script>
