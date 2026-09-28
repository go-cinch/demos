<script setup lang="ts">
import { onMounted, onUpdated, ref, useId } from 'vue';
import { Radio } from 'tdesign-mobile-vue';
defineOptions({ inheritAttrs: false });
const props = defineProps<{ label?: string }>();
const radio = ref<InstanceType<typeof Radio>>();
const identity = useId();
function labelInput() {
  const input = (radio.value?.$el as HTMLElement | undefined)?.querySelector('input');
  if (input && props.label) input.setAttribute('aria-label', props.label);
  const group = input?.closest<HTMLElement>('[role="radiogroup"]');
  if (input && group && !input.name) {
    group.dataset.radioName ||= `radio-${identity}`;
    input.name = group.dataset.radioName;
  }
}
function keyboard(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const input = event.target as HTMLInputElement;
  const group = input.closest('[role="radiogroup"]');
  const inputs = [
    ...(group?.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)') || []),
  ];
  if (!inputs.length) return;
  event.preventDefault();
  const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
  const next = inputs[(inputs.indexOf(input) + direction + inputs.length) % inputs.length];
  next?.focus();
  next?.click();
}
onMounted(labelInput);
onUpdated(labelInput);
</script>
<template><Radio ref="radio" v-bind="$attrs" :label="label" @keydown="keyboard" /></template>
