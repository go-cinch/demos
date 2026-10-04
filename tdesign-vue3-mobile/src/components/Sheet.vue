<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { sheetStack } from '../lib/sheets';
import { t } from '../locales';
import Icon from './Icon.vue';
const props = defineProps<{ title: string; beforeClose?: () => boolean | Promise<boolean> }>();
const visible = defineModel<boolean>({ default: false });
async function requestClose() {
  if (!props.beforeClose || (await props.beforeClose())) visible.value = false;
}
defineExpose({ requestClose });
const panel = ref<HTMLElement>();
const container = shallowRef(document.fullscreenElement || document.body);
const popupContainer = computed(() => {
  const target = container.value;
  return () => target;
});
function updateContainer() {
  container.value = document.fullscreenElement || document.body;
}
onMounted(() => document.addEventListener('fullscreenchange', updateContainer));
const bounds = shallowRef<CSSProperties>({});
function updateBounds() {
  const device = document.querySelector<HTMLElement>('.device');
  if (device && innerWidth >= 901) {
    const rect = device.getBoundingClientRect();
    const border = device.clientLeft;
    bounds.value = {
      width: `${device.clientWidth}px`,
      maxWidth: `${device.clientWidth}px`,
      left: `${rect.left + border}px`,
      right: 'auto',
      bottom: `${Math.max(0, innerHeight - rect.bottom + border)}px`,
      margin: 0,
      maxHeight: `${device.clientHeight}px`,
    };
  } else bounds.value = {};
}
onMounted(() => {
  window.addEventListener('resize', updateBounds);
  window.visualViewport?.addEventListener('resize', updateBounds);
});
const identity = Symbol('sheet');
const active = computed(() => sheetStack.at(-1) === identity);
function removeLayer() {
  const index = sheetStack.indexOf(identity);
  if (index >= 0) sheetStack.splice(index, 1);
}
let previous: HTMLElement | null = null;
function keyboard(event: KeyboardEvent) {
  if (!visible.value || !active.value) return;
  if (event.key === 'Escape') {
    event.stopPropagation();
    void requestClose();
  }
  if (event.key === 'Tab' && panel.value) {
    const items = [
      ...panel.value.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"],a[href]',
      ),
    ].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0],
      last = items[items.length - 1];
    if (document.activeElement === panel.value || !panel.value.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
watch(
  visible,
  async (value) => {
    if (value) {
      updateContainer();
      updateBounds();
      sheetStack.push(identity);
      previous = document.activeElement as HTMLElement;
      window.addEventListener('keydown', keyboard);
      await nextTick();
      setTimeout(() => {
        if (active.value && !panel.value?.contains(document.activeElement)) panel.value?.focus();
      }, 100);
    } else {
      removeLayer();
      window.removeEventListener('keydown', keyboard);
      previous?.focus();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  window.removeEventListener('resize', updateBounds);
  window.visualViewport?.removeEventListener('resize', updateBounds);
  document.removeEventListener('fullscreenchange', updateContainer);
  removeLayer();
  window.removeEventListener('keydown', keyboard);
});
</script>
<template>
  <t-popup
    :visible="visible"
    @update:visible="
      (value: boolean) => {
        if (!value) void requestClose();
      }
    "
    placement="bottom"
    :attach="popupContainer"
    :destroy-on-close="true"
    :z-index="2000 + Math.max(0, sheetStack.indexOf(identity)) * 20"
    :overlay-props="{ zIndex: 1999 + Math.max(0, sheetStack.indexOf(identity)) * 20 }"
    :close-on-overlay-click="false"
    :style="bounds"
    class="cinch-popup"
    ><section
      ref="panel"
      class="sheet"
      :style="{ maxHeight: bounds.maxHeight }"
      role="dialog"
      aria-modal="true"
      :aria-hidden="!active"
      :inert="!active"
      :aria-label="title"
      tabindex="-1"
    >
      <div class="sheet-handle" />
      <header class="sheet-header">
        <h2>{{ title }}</h2>
        <button class="icon-button" :aria-label="t('close')" @click="requestClose">
          <Icon name="close" />
        </button>
      </header>
      <div class="sheet-content"><slot /></div></section
  ></t-popup>
</template>
