<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { request } from '../lib/api';
import { t } from '../locales';
import Icon from './Icon.vue';
const props = defineProps<{ username: string; password: string; purpose: 'login' | 'register' }>();
const proof = defineModel<string>({ default: '' });
const track = ref<HTMLElement>();
const position = ref(0);
const busy = ref(false);
const dragging = ref(false);
const error = ref('');
const keyboardHint = useId();
const inputMode = ref<'pointer' | 'keyboard'>('pointer');
const blocked = computed(() => !props.username.trim() || !props.password.trim());
let startX = 0;
let started = 0;
let width = 0;
let generation = 0;
let tracks: { x: number; t: number }[] = [];
let challenge: Promise<{ captcha_id: string; expired_at: number }> | null = null;
function reset() {
  generation++;
  proof.value = '';
  position.value = 0;
  busy.value = false;
  dragging.value = false;
  error.value = '';
  challenge = null;
}
watch(() => [props.username, props.password, props.purpose], reset);
defineExpose({ reset });
function begin() {
  if (busy.value || proof.value) return false;
  if (!props.username.trim()) {
    error.value = 'app.captcha.usernameFirst';
    return false;
  }
  if (!props.password.trim()) {
    error.value = 'app.captcha.passwordFirst';
    return false;
  }
  reset();
  started = performance.now();
  width = Math.max(0, (track.value?.clientWidth || 0) - 52);
  tracks = [{ x: 0, t: 0 }];
  dragging.value = true;
  challenge = request('/auth/pub/slider/challenge', {
    method: 'POST',
    body: { purpose: props.purpose, username: props.username.trim() },
    public: true,
  });
  void challenge.catch(() => {});
  return true;
}
function start(event: PointerEvent) {
  if (!begin()) return;
  inputMode.value = 'pointer';
  startX = event.clientX;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!dragging.value || inputMode.value !== 'pointer') return;
  position.value = Math.min(width, Math.max(0, event.clientX - startX));
  if (tracks.length < 127)
    tracks.push({ x: Math.round(position.value), t: Math.round(performance.now() - started) });
}
function keyboard(event: KeyboardEvent) {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  if (busy.value || proof.value) return;
  if (event.key === 'Home') {
    reset();
    return;
  }
  if (event.key === 'Enter' || event.key === ' ') {
    if (inputMode.value === 'keyboard') void end();
    return;
  }
  if (!dragging.value) {
    if (event.key !== 'ArrowRight' || !begin()) return;
    inputMode.value = 'keyboard';
  }
  if (inputMode.value !== 'keyboard') return;
  position.value = Math.min(
    width,
    Math.max(0, position.value + (event.key === 'ArrowRight' ? 1 : -1) * Math.ceil(width / 20)),
  );
  if (tracks.length < 127)
    tracks.push({ x: Math.round(position.value), t: Math.round(performance.now() - started) });
}
async function end() {
  if (!dragging.value) return;
  dragging.value = false;
  if (position.value < width - 2 || !challenge || width <= 0) {
    reset();
    error.value = 'app.captcha.sliderIncomplete';
    return;
  }
  const current = generation;
  busy.value = true;
  const duration = Math.round(performance.now() - started);
  tracks.push({ x: Math.round(width), t: duration });
  try {
    const value = await challenge;
    const result = await request<{ proof: string }>('/auth/pub/slider/verify', {
      method: 'POST',
      public: true,
      body: {
        captcha_id: value.captcha_id,
        distance: Math.round(width),
        width: Math.round(width),
        duration_ms: duration,
        tracks,
        purpose: props.purpose,
        username: props.username.trim(),
      },
    });
    if (current === generation) proof.value = result.proof;
  } catch {
    if (current === generation) {
      position.value = 0;
      error.value = 'app.captcha.sliderFailed';
    }
  } finally {
    if (current === generation) busy.value = false;
  }
}
onBeforeUnmount(reset);
</script>
<template>
  <div>
    <div ref="track" class="slider-track" :class="{ verified: proof }" :aria-busy="busy">
      <span>{{
        busy ? t('app.captcha.checking') : proof ? t('app.captcha.passed') : t('slider')
      }}</span
      ><button
        type="button"
        class="slider-handle"
        :class="{ blocked }"
        name="captcha-action"
        role="slider"
        :aria-label="t('sliderHandle')"
        :aria-describedby="keyboardHint"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="width ? Math.round((position / width) * 100) : 0"
        :aria-valuetext="
          t('sliderProgress', { count: width ? Math.round((position / width) * 100) : 0 })
        "
        :style="{ transform: `translateX(${position}px)` }"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="reset"
        @keydown="keyboard"
        @blur="if (dragging && inputMode === 'keyboard') reset();"
      >
        <Icon :name="proof ? 'check' : 'chevron-right-double'" />
      </button>
    </div>
    <p :id="keyboardHint" class="slider-keyboard-hint">{{ t('sliderKeyboard') }}</p>
    <p v-if="error" class="field-error" role="alert">{{ t(error) }}</p>
  </div>
</template>
