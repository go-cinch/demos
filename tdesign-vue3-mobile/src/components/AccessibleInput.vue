<script setup lang="ts">
import { onMounted, onUpdated, ref, useAttrs, watch } from 'vue';
import { Input, type InputProps } from 'tdesign-mobile-vue';
import { t } from '../locales';
import Icon from './Icon.vue';
defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    autocomplete?: string;
    type?: InputProps['type'];
    disabled?: boolean;
    clearable?: boolean;
    loading?: boolean;
  }>(),
  { clearable: undefined, loading: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [value: string | number]; enter: [] }>();
const control = ref<InstanceType<typeof Input>>();
const attrs = useAttrs();
const revealed = ref(false);
function clearInput() {
  emit('update:modelValue', '');
  (control.value?.$el as HTMLElement | undefined)?.querySelector('input')?.focus();
}
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
  if (input && props.loading !== undefined) input.setAttribute('aria-busy', String(props.loading));
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
    :clearable="loading === undefined && clearable"
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
    <template v-else-if="loading !== undefined" #suffix>
      <span class="input-loading-slot">
        <span v-if="loading" class="username-check-loading" role="status" :aria-label="t('loading')"
          ><t-loading theme="circular" size="20px" inherit-color aria-hidden="true"
        /></span>
        <button
          v-else-if="clearable && String(modelValue ?? '').length && !disabled"
          type="button"
          class="input-clear"
          tabindex="-1"
          :aria-label="t('clear')"
          @mousedown.prevent
          @click="clearInput"
        >
          <span aria-hidden="true">×</span>
        </button>
      </span>
    </template>
  </Input>
</template>
