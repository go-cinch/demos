<script setup lang="ts">
import { Switch } from 'tdesign-mobile-vue';
defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{ modelValue?: boolean; value?: boolean; disabled?: boolean }>(),
  { modelValue: undefined, value: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; change: [value: boolean] }>();
function update(value: unknown) {
  if (props.disabled) return;
  emit('update:modelValue', !!value);
  emit('change', !!value);
}
</script>
<template>
  <Switch
    v-bind="$attrs"
    :value="modelValue ?? value ?? false"
    :disabled="disabled"
    :aria-disabled="disabled"
    role="switch"
    :aria-checked="modelValue ?? value ?? false"
    :tabindex="disabled ? -1 : 0"
    @change="update"
    @keydown.space.prevent="update(!(modelValue ?? value))"
    @keydown.enter.prevent="update(!(modelValue ?? value))"
  />
</template>
