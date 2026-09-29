<script setup lang="ts">
import { onMounted, onUpdated, ref, useAttrs, watch } from 'vue';
import { Input, type InputProps } from 'tdesign-mobile-vue';
import { t } from '../locales';
import Icon from './Icon.vue';
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  modelValue?: string | number;
  autocomplete?: string;
  type?: InputProps['type'];
  disabled?: boolean;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string | number]; enter: [] }>();
const control = ref<InstanceType<typeof Input>>();
const attrs = useAttrs();
const revealed = ref(false);
watch(
  () => props.type,
  () => {
    revealed.value = false;
  },
);
function sync() {
  const input = (control.value?.$el as HTMLElement | undefined)?.querySelector('input');
  if (input) input.setAttribute('autocomplete', props.autocomplete || 'off');
  if (input && attrs['aria-label']) input.setAttribute('aria-label', String(attrs['aria-label']));
}
onMounted(sync);
onUpdated(sync);
</script>
<template>
  <Input
    ref="control"
    v-bind="$attrs"
    :class="{ 'password-control': type === 'password' }"
    :type="type === 'password' && revealed ? 'text' : type"
    :disabled="disabled"
    :value="modelValue"
    :autocomplete="autocomplete || 'off'"
    @change="emit('update:modelValue', $event)"
    @keydown.enter="emit('enter')"
  >
    <template v-if="type === 'password'" #suffix>
      <button
        type="button"
        class="password-toggle"
        :disabled="disabled"
        :aria-label="t(revealed ? 'app.password.hide' : 'app.password.show')"
        :aria-pressed="revealed"
        @click="revealed = !revealed"
      >
        <Icon :name="revealed ? 'eye' : 'eye-off'" />
      </button>
    </template>
  </Input>
</template>
