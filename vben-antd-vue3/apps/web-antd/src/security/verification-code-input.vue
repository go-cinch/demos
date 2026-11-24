<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { Input, theme } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    id?: string;
    name?: string;
    label: string;
    disabled?: boolean;
    autofocus?: boolean;
    compact?: boolean;
    describedBy?: string;
    feedback?: 'failure' | 'idle' | 'success';
    animationAttempt?: number;
    animation?: 'failure' | 'idle' | 'success';
  }>(),
  {
    id: undefined,
    describedBy: undefined,
    animationAttempt: undefined,
    name: 'verification_code',
    feedback: 'idle',
    animation: 'idle',
  },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const control = ref<HTMLDivElement>();
// A second invalid submit can leave the same CSS animation class in place.
watch(
  () => props.animationAttempt,
  (attempt) => {
    if (!attempt || attempt < 2) return;
    for (const animation of control.value?.getAnimations?.() ?? []) {
      if ('animationName' in animation) animation.currentTime = 0;
    }
  },
  { flush: 'post' },
);
const inputRef = ref<{ focus: () => void }>();
const { token } = theme.useToken();
const styles = computed(() => ({
  '--verification-code-text': token.value.colorText,
  '--verification-code-placeholder': token.value.colorTextPlaceholder,
  '--verification-code-border': token.value.colorBorder,
  '--verification-code-surface': token.value.colorBgContainer,
  '--verification-code-primary': token.value.colorPrimary,
  '--verification-code-primary-bg': token.value.colorPrimaryBg,
  '--verification-code-success': token.value.colorSuccess,
  '--verification-code-success-text': token.value.colorSuccessText,
  '--verification-code-success-bg': token.value.colorSuccessBg,
  '--verification-code-error': token.value.colorError,
  '--verification-code-error-text': token.value.colorErrorText,
  '--verification-code-error-bg': token.value.colorErrorBg,
}));
let active = true;
let inputVersion = 0;
onBeforeUnmount(() => {
  active = false;
  inputVersion += 1;
});
onMounted(() => {
  if (props.autofocus) void nextTick(() => inputRef.value?.focus());
});
defineExpose({ focus: () => inputRef.value?.focus() });

function digitOffset(value: string, position: number) {
  return Math.min(value.slice(0, position).replaceAll(/\D/g, '').length, 6);
}

function syncInput(
  input: HTMLInputElement,
  value = input.value,
  start = input.selectionStart ?? value.length,
  end = input.selectionEnd ?? start,
) {
  if (props.disabled) {
    input.value = props.modelValue;
    return;
  }
  const normalized = value.replaceAll(/\D/g, '').slice(0, 6);
  const nextStart = Math.min(digitOffset(value, start), normalized.length);
  const nextEnd = Math.min(digitOffset(value, end), normalized.length);
  const direction = input.selectionDirection ?? 'none';
  if (normalized !== props.modelValue) emit('update:modelValue', normalized);
  const restore = () => {
    input.value = normalized;
    input.setSelectionRange(nextStart, nextEnd, direction);
  };
  restore();
  const version = ++inputVersion;
  void nextTick(() => {
    if (active && version === inputVersion && props.modelValue === normalized)
      restore();
  });
}

function insertDigits(input: HTMLInputElement, value: string) {
  if (props.disabled) return;
  const digits = value.replaceAll(/\D/g, '');
  if (!digits) return;
  const current = input.value.replaceAll(/\D/g, '').slice(0, 6);
  const start = Math.min(
    digitOffset(input.value, input.selectionStart ?? input.value.length),
    current.length,
  );
  const end = Math.min(
    digitOffset(input.value, input.selectionEnd ?? input.value.length),
    current.length,
  );
  const inserted = digits.slice(0, 6 - current.length + end - start);
  if (!inserted) return;
  syncInput(
    input,
    current.slice(0, start) + inserted + current.slice(end),
    start + inserted.length,
    start + inserted.length,
  );
}

function beforeInput(event: InputEvent) {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  if (
    event.cancelable &&
    !event.isComposing &&
    event.inputType?.startsWith('insert') &&
    typeof event.data === 'string' &&
    /\D/.test(event.data)
  ) {
    event.preventDefault();
    insertDigits(event.target as HTMLInputElement, event.data);
  }
}

function paste(event: ClipboardEvent) {
  if (!event.clipboardData) return;
  event.preventDefault();
  insertDigits(
    event.target as HTMLInputElement,
    event.clipboardData.getData('text/plain'),
  );
}

function update(event: Event) {
  syncInput(event.target as HTMLInputElement);
}
function moveCaret() {
  inputVersion += 1;
}
</script>

<template>
  <div
    ref="control"
    class="verification-code-control"
    :data-feedback="feedback"
    :class="{
      'is-compact': compact,
      'is-shaking': animation === 'failure',
      'is-pulsing': animation === 'success',
    }"
    :style="styles"
  >
    <Input
      :id="id"
      ref="inputRef"
      :value="modelValue"
      class="verification-code-input"
      :name="name"
      :aria-label="label"
      :aria-describedby="describedBy"
      :aria-invalid="feedback === 'failure'"
      autocomplete="one-time-code"
      inputmode="numeric"
      :maxlength="6"
      placeholder="000000"
      :disabled="disabled"
      :autofocus="autofocus"
      @beforeinput="beforeInput"
      @input="update"
      @compositionend="update"
      @paste="paste"
      @click="moveCaret"
      @keyup="moveCaret"
    />
  </div>
</template>

<style scoped>
.verification-code-control {
  background: var(--verification-code-surface);
  border: 1px solid var(--verification-code-border);
  border-radius: var(--radius);
  transition:
    border-color 150ms,
    box-shadow 150ms;
}

.verification-code-control :deep(input.verification-code-input) {
  width: 100%;
  height: 47px;
  padding: 9px 8px 9px 20px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 23px;
  font-variant-numeric: tabular-nums;
  line-height: 29px;
  color: var(--verification-code-text);
  text-align: center;
  letter-spacing: 12px;
  background: transparent;
  border: 0;
  border-radius: max(0px, calc(var(--radius) - 1px));
  box-shadow: none;
}

.verification-code-control :deep(input.verification-code-input::placeholder) {
  color: var(--verification-code-placeholder);
}

.verification-code-control.is-compact {
  width: min(100%, 12.5rem);
  container-type: inline-size;
}

.verification-code-control.is-compact :deep(input.verification-code-input) {
  /* Center the six digits, including the trailing letter spacing, on narrow forms. */
  --digit-gap: clamp(0px, calc((100cqi - 6ch - 12px) / 7), 12px);

  height: calc(2.5rem - 2px);
  padding: 0 6px 0 calc(6px + var(--digit-gap));
  letter-spacing: var(--digit-gap);
}

.verification-code-control.is-compact:has(input:disabled) {
  opacity: 0.5;
}

.verification-code-control[data-feedback='idle']:focus-within {
  border-color: var(--verification-code-primary);
  box-shadow: 0 0 0 3px var(--verification-code-primary-bg);
}

.verification-code-control[data-feedback='success'] {
  background: var(--verification-code-success-bg);
  border-color: var(--verification-code-success);
}

.verification-code-control[data-feedback='success']
  :deep(input.verification-code-input) {
  color: var(--verification-code-success-text);
}

.verification-code-control[data-feedback='failure'] {
  background: var(--verification-code-error-bg);
  border-color: var(--verification-code-error);
  box-shadow: 0 0 0 1px var(--verification-code-error);
}

.verification-code-control[data-feedback='failure']
  :deep(input.verification-code-input) {
  color: var(--verification-code-error-text);
}

.verification-code-control.is-pulsing {
  animation: verification-code-success 720ms ease-out both;
}

.verification-code-control.is-shaking {
  animation: verification-code-failure 400ms ease-in-out both;
}

@keyframes verification-code-success {
  0%,
  100% {
    transform: scale(1);
  }

  35% {
    transform: scale(1.008);
  }
}

@keyframes verification-code-failure {
  0%,
  100% {
    transform: translateX(0);
  }

  25%,
  75% {
    transform: translateX(-3px);
  }

  50% {
    transform: translateX(3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .verification-code-control {
    transition: none;
  }

  .verification-code-control.is-shaking,
  .verification-code-control.is-pulsing {
    animation: none;
  }
}
</style>
