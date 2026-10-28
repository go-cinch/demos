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
  import { useAuthStore } from './components/catalog/runtime'
  import { usePermissions } from './composables/use-permissions'
  import { router } from './router'
  import { useUserStore } from './store/modules/user'
  import zh from 'element-plus/es/locale/lang/zh-cn'
  import en from 'element-plus/es/locale/lang/en'
  import { systemUpgrade } from './utils/sys'
  import { toggleTransition } from './utils/ui/animation'
  import { checkStorageCompatibility } from './utils/storage'
  import { initializeTheme } from './hooks/core/useTheme'
  import { useSettingStore } from './store/modules/setting'

  const userStore = useUserStore()
  const { hasPage } = usePermissions()
  let refreshingPermissions = false
  async function refreshPermissions() {
    if (
      refreshingPermissions ||
      !userStore.accessToken ||
      userStore.passwordResetRequired ||
      document.hidden
    )
      return
    refreshingPermissions = true
    try {
      await useAuthStore().fetchUserInfo({ fresh: true })
      const path = router.currentRoute.value.path
      if (!hasPage(path) && path !== '/dashboard/overview' && !path.startsWith('/auth/'))
        await router.replace('/exception/403')
    } catch {
      /* The Auth client owns session failures. */
    } finally {
      refreshingPermissions = false
    }
  }
  onMounted(() => {
    window.addEventListener('focus', refreshPermissions)
    window.addEventListener('auth-permissions-changed', refreshPermissions)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('focus', refreshPermissions)
    window.removeEventListener('auth-permissions-changed', refreshPermissions)
  })
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
