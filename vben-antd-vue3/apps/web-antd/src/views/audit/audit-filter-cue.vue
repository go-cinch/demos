<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  ref,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { $t } from '#/locales';

const props = defineProps<{ kind: string; ready: boolean; value: string }>();
const route = useRoute();
const target = ref<HTMLElement>();
const highlighting = ref(false);
const pending = ref(false);
let observer: IntersectionObserver | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let revision = 0;
const matches = computed(
  () =>
    !!props.value &&
    route.path === `/audit/${props.kind}` &&
    typeof route.query.username === 'string' &&
    route.query.username.trim() === props.value,
);
function clear() {
  ++revision;
  observer?.disconnect();
  observer = undefined;
  clearTimeout(timer);
  highlighting.value = false;
}
watch(
  () => [route.path, route.query.username, props.value],
  () => {
    clear();
    pending.value = matches.value;
  },
  { immediate: true },
);
watch(
  [pending, () => props.ready, target],
  async () => {
    if (!pending.value || !props.ready || !target.value || !matches.value)
      return;
    pending.value = false;
    const run = revision;
    await nextTick();
    if (run !== revision || !target.value) return;
    const element = target.value;
    // Start the cue only once the destination is visible, including after scrolling.
    observer = new IntersectionObserver(
      (entries) => {
        if (run !== revision || !entries.some((entry) => entry.isIntersecting))
          return;
        observer?.disconnect();
        observer = undefined;
        highlighting.value = true;
        timer = setTimeout(() => {
          highlighting.value = false;
        }, 2400);
      },
      { threshold: 1 },
    );
    observer.observe(element);
    element.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  },
  { flush: 'post' },
);
onDeactivated(() => {
  clear();
  pending.value = false;
});
onBeforeUnmount(clear);
</script>

<template>
  <span
    ref="target"
    class="audit-filter-cue"
    :class="{ 'is-highlighting': highlighting }"
    data-testid="audit-filter-cue"
  >
    <slot />
    <span v-if="highlighting" class="filter-lock" aria-hidden="true"
      ><IconifyIcon icon="lucide:scan-line"
    /></span>
    <span class="filter-announcement" role="status" aria-live="polite">{{
      highlighting ? $t('audit.filterApplied', { value }) : ''
    }}</span>
  </span>
</template>

<style scoped>
.audit-filter-cue {
  position: relative;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border-radius: var(--radius);
  scroll-margin-block: 160px;
}
.audit-filter-cue::after {
  position: absolute;
  inset: -5px;
  border: 2px solid hsl(var(--primary));
  border-radius: calc(var(--radius) + 4px);
  opacity: 0;
  pointer-events: none;
  content: '';
}
.is-highlighting::after {
  animation: filter-lock-ring 2.4s ease-out both;
}
.is-highlighting {
  animation: filter-lock-settle 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.filter-lock {
  position: absolute;
  top: -12px;
  right: -12px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
  pointer-events: none;
  animation: filter-lock-icon 2.4s ease-out both;
}
.filter-announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@keyframes filter-lock-settle {
  from {
    transform: scale(1.07);
  }
  to {
    transform: scale(1);
  }
}
@keyframes filter-lock-ring {
  0% {
    opacity: 0;
    transform: scale(1.14);
    box-shadow: 0 0 0 8px hsl(var(--primary) / 0%);
  }
  18%,
  65% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 0 5px hsl(var(--primary) / 12%);
  }
  100% {
    opacity: 0;
    transform: scale(1);
    box-shadow: 0 0 0 0 hsl(var(--primary) / 0%);
  }
}
@keyframes filter-lock-icon {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  18%,
  70% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .is-highlighting,
  .is-highlighting::after,
  .filter-lock {
    animation: none;
  }
  .is-highlighting::after {
    opacity: 1;
  }
}
</style>
