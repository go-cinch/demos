<!-- 系统logo -->
<template>
  <div class="flex-cc">
    <img :style="logoStyle" :src="logoSource" alt="Go Cinch" class="w-full h-full" />
  </div>
</template>

<script setup lang="ts">
  import { useSettingStore } from '@/store/modules/setting'

  defineOptions({ name: 'ArtLogo' })

  interface Props {
    /** logo 大小 */
    size?: number | string
    /** logo 所在区域的主题，默认跟随全局主题 */
    theme?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    size: 36
  })

  const settingStore = useSettingStore()
  const { isDark } = storeToRefs(settingStore)
  const logoSource = computed(() => {
    const dark = props.theme ? props.theme === 'dark' : isDark.value
    return `${import.meta.env.BASE_URL}${dark ? 'go-cinch-white.svg' : 'go-cinch.svg'}`
  })
  const logoStyle = computed(() => ({ width: `${props.size}px` }))
</script>
