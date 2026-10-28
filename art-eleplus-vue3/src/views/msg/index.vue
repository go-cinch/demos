<script setup lang="ts">
  import { ref, watch, onActivated, onDeactivated } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import InboxFeed from './InboxFeed.vue'
  import { $t } from '@/locales'
  const router = useRouter(),
    route = useRoute(),
    open = ref(true)
  watch(
    () => route.path,
    (path) => {
      open.value = path === '/msg/inbox'
    },
    { immediate: true, flush: 'post' }
  )
  onActivated(() => {
    open.value = true
  })
  onDeactivated(() => {
    open.value = false
  })
  function closed() {
    if (route.path === '/msg/inbox') void router.replace('/dashboard/overview')
  }
</script>
<template>
  <div class="inbox-page">
    <ElDrawer
      v-model="open"
      :title="$t('msg.history')"
      size="min(640px,100vw)"
      :show-close="false"
      destroy-on-close
      @closed="closed"
      ><InboxFeed v-if="open" @close="open = false"
    /></ElDrawer>
  </div>
</template>
