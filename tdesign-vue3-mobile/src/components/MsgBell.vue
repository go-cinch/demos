<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { msgApi } from '../lib/msg';
import { t } from '../locales';
import Icon from './Icon.vue';
const router = useRouter();
const count = ref<number | null>(null);
let generation = 0;
let busy = false;
let queued = false;
let disposed = false;
async function refresh() {
  if (disposed || document.hidden) return;
  if (busy) {
    queued = true;
    return;
  }
  busy = true;
  const current = generation;
  try {
    const result = await msgApi.count();
    if (current === generation) count.value = result.count;
  } catch {
    if (current === generation) count.value = null;
  } finally {
    busy = false;
    if (queued && !disposed) {
      queued = false;
      void refresh();
    }
  }
}
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  void refresh();
  timer = setInterval(refresh, 30000);
  window.addEventListener('cinch-msg-changed', refresh);
  document.addEventListener('visibilitychange', refresh);
});
onBeforeUnmount(() => {
  disposed = true;
  queued = false;
  generation++;
  clearInterval(timer);
  window.removeEventListener('cinch-msg-changed', refresh);
  document.removeEventListener('visibilitychange', refresh);
});
</script>
<template>
  <button
    class="icon-button msg-bell"
    :aria-label="t('app.msg.inbox')"
    :aria-description="(count ?? 0) > 0 ? t('app.msg.count', { count: count ?? 0 }) : undefined"
    @click="router.push('/msg/inbox')"
  >
    <Icon name="notification" />
    <span
      v-if="(count ?? 0) > 0"
      class="msg-unread-dot"
      data-testid="message-unread-dot"
      aria-hidden="true"
    />
  </button>
</template>
<style scoped>
.msg-bell {
  position: relative;
}
.msg-unread-dot {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--surface);
  pointer-events: none;
}
</style>
