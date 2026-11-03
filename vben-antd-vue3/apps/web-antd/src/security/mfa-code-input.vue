<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { Input, theme } from 'ant-design-vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  id?: string;
  name?: string;
  label: string;
  disabled?: boolean;
  autofocus?: boolean;
  feedback?: 'failure' | 'idle' | 'success';
  animation?: 'failure' | 'idle' | 'success';
}>(), { name: 'mfa_verification_code', feedback: 'idle', animation: 'idle' });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const inputRef = ref<{ focus: () => void }>();
const { token } = theme.useToken();
const styles = computed(() => ({
  '--mfa-code-text': token.value.colorText,
  '--mfa-code-placeholder': token.value.colorTextPlaceholder,
  '--mfa-code-border': token.value.colorBorder,
  '--mfa-code-surface': token.value.colorBgContainer,
  '--mfa-code-primary': token.value.colorPrimary,
  '--mfa-code-primary-bg': token.value.colorPrimaryBg,
  '--mfa-code-success': token.value.colorSuccess,
  '--mfa-code-success-text': token.value.colorSuccessText,
  '--mfa-code-success-bg': token.value.colorSuccessBg,
  '--mfa-code-error': token.value.colorError,
  '--mfa-code-error-text': token.value.colorErrorText,
  '--mfa-code-error-bg': token.value.colorErrorBg,
}));
let active = true;
let inputVersion = 0;
onBeforeUnmount(() => { active = false; inputVersion += 1; });
onMounted(() => { if (props.autofocus) void nextTick(() => inputRef.value?.focus()); });
defineExpose({ focus: () => inputRef.value?.focus() });

function digitOffset(value: string, position: number) {
  return Math.min(value.slice(0, position).replace(/\D/g, '').length, 6);
}

function syncInput(input: HTMLInputElement, value = input.value, start = input.selectionStart ?? value.length, end = input.selectionEnd ?? start) {
  if (props.disabled) { input.value = props.modelValue; return; }
  const normalized = value.replace(/\D/g, '').slice(0, 6);
  const nextStart = Math.min(digitOffset(value, start), normalized.length);
  const nextEnd = Math.min(digitOffset(value, end), normalized.length);
  const direction = input.selectionDirection ?? 'none';
  if (normalized !== props.modelValue) emit('update:modelValue', normalized);
  const restore = () => { input.value = normalized; input.setSelectionRange(nextStart, nextEnd, direction); };
  restore();
  const version = ++inputVersion;
  void nextTick(() => { if (active && version === inputVersion && props.modelValue === normalized) restore(); });
}

function insertDigits(input: HTMLInputElement, value: string) {
  if (props.disabled) return;
  const digits = value.replace(/\D/g, '');
  if (!digits) return;
  const current = input.value.replace(/\D/g, '').slice(0, 6);
  const start = Math.min(digitOffset(input.value, input.selectionStart ?? input.value.length), current.length);
  const end = Math.min(digitOffset(input.value, input.selectionEnd ?? input.value.length), current.length);
  const inserted = digits.slice(0, 6 - current.length + end - start);
  if (!inserted) return;
  syncInput(input, current.slice(0, start) + inserted + current.slice(end), start + inserted.length, start + inserted.length);
}

function beforeInput(event: InputEvent) {
  if (props.disabled) { event.preventDefault(); return; }
  if (event.cancelable && !event.isComposing && event.inputType?.startsWith('insert') && typeof event.data === 'string' && /\D/.test(event.data)) {
    event.preventDefault(); insertDigits(event.target as HTMLInputElement, event.data);
  }
}

function paste(event: ClipboardEvent) {
  if (!event.clipboardData) return;
  event.preventDefault();
  insertDigits(event.target as HTMLInputElement, event.clipboardData.getData('text/plain'));
}

function update(event: Event) { syncInput(event.target as HTMLInputElement); }
function moveCaret() { inputVersion += 1; }
</script>

<template>
  <div class="mfa-code-control" :data-feedback="feedback" :class="{ 'is-shaking': animation === 'failure', 'is-pulsing': animation === 'success' }" :style="styles">
    <Input :id="id" ref="inputRef" :value="modelValue" class="mfa-code-input" :name="name" :aria-label="label" :aria-invalid="feedback === 'failure'" autocomplete="one-time-code" inputmode="numeric" :maxlength="6" placeholder="000000" :disabled="disabled" :autofocus="autofocus" @beforeinput="beforeInput" @input="update" @compositionend="update" @paste="paste" @click="moveCaret" @keyup="moveCaret" />
  </div>
</template>

<style scoped>
.mfa-code-control { border: 1px solid var(--mfa-code-border); border-radius: 6px; background: var(--mfa-code-surface); transition: border-color 150ms, box-shadow 150ms; }
.mfa-code-control :deep(input.mfa-code-input) { width: 100%; height: 47px; padding: 9px 8px 9px 20px; border: 0; border-radius: 5px; background: transparent; color: var(--mfa-code-text); box-shadow: none; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 23px; line-height: 29px; font-variant-numeric: tabular-nums; letter-spacing: 12px; text-align: center; }
.mfa-code-control :deep(input.mfa-code-input::placeholder) { color: var(--mfa-code-placeholder); }
.mfa-code-control[data-feedback='idle']:focus-within { border-color: var(--mfa-code-primary); box-shadow: 0 0 0 3px var(--mfa-code-primary-bg); }
.mfa-code-control[data-feedback='success'] { border-color: var(--mfa-code-success); background: var(--mfa-code-success-bg); }
.mfa-code-control[data-feedback='success'] :deep(input.mfa-code-input) { color: var(--mfa-code-success-text); }
.mfa-code-control[data-feedback='failure'] { border-color: var(--mfa-code-error); background: var(--mfa-code-error-bg); box-shadow: 0 0 0 1px var(--mfa-code-error); }
.mfa-code-control[data-feedback='failure'] :deep(input.mfa-code-input) { color: var(--mfa-code-error-text); }
.mfa-code-control.is-pulsing { animation: mfa-code-success 720ms ease-out both; }
.mfa-code-control.is-shaking { animation: mfa-code-failure 400ms ease-in-out both; }
@keyframes mfa-code-success { 0%, 100% { transform: scale(1); } 35% { transform: scale(1.008); } }
@keyframes mfa-code-failure { 0%, 100% { transform: translateX(0); } 25%, 75% { transform: translateX(-3px); } 50% { transform: translateX(3px); } }
@media (prefers-reduced-motion: reduce) { .mfa-code-control { transition: none; } .mfa-code-control.is-shaking, .mfa-code-control.is-pulsing { animation: none; } }
</style>
