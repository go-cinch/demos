<script setup lang="ts">
import type { SliderRotateVerifyPassingData } from '@vben/common-ui';

import { nextTick, ref, useTemplateRef } from 'vue';

import { SliderCaptcha } from '@vben/common-ui';

import { createSliderCaptchaChallengeApi, verifySliderCaptchaApi } from '#/api';
import { $t } from '#/locales';

const props = defineProps<{
  purpose: 'login' | 'register';
  username: string;
}>();

const modelValue = defineModel<string>({ default: '' });
const sliderRef = useTemplateRef<{
  resume: () => void;
  showPassedAtEnd: () => void;
  showPendingAtEnd: () => void;
}>('sliderRef');
const rootRef = useTemplateRef<HTMLDivElement>('rootRef');
const verified = ref(false);
const pending = ref(false);
const errorMessage = ref('');

let challengePromise:
  | ReturnType<typeof createSliderCaptchaChallengeApi>
  | undefined;
let startedAt = 0;
let tracks: Array<{ t: number; x: number }> = [];

function handleStart() {
  errorMessage.value = '';
  modelValue.value = '';
  verified.value = false;
  startedAt = performance.now();
  tracks = [{ t: 0, x: 0 }];
  challengePromise = createSliderCaptchaChallengeApi(
    props.purpose,
    props.username,
  );
  void challengePromise.catch(() => undefined);
}

function handleMove(data: SliderRotateVerifyPassingData) {
  if (!startedAt || tracks.length >= 128) return;
  tracks.push({
    t: Math.max(0, Math.round(performance.now() - startedAt)),
    x: Math.max(0, Math.round(data.moveX)),
  });
}

async function handleEnd() {
  const root = rootRef.value;
  const action = root?.querySelector<HTMLElement>('[name="captcha-action"]');
  const width = Math.max(
    0,
    (root?.clientWidth ?? 0) - (action?.offsetWidth ?? 0) - 6,
  );
  const distance = Math.max(0, ...tracks.map(({ x }) => x));
  if (!challengePromise || width === 0) {
    errorMessage.value = $t('app.captcha.sliderFailed');
    reset(false);
    return;
  }
  if (distance < width) {
    errorMessage.value = $t('app.captcha.sliderIncomplete');
    reset(false);
    return;
  }
  const duration = Math.max(0, Math.round(performance.now() - startedAt));
  const finalTrack = { t: duration, x: width };
  const normalizedTracks = tracks.map(({ t, x }) => ({
    t,
    x: Math.min(x, width),
  }));
  if (normalizedTracks.length >= 128) {
    normalizedTracks[normalizedTracks.length - 1] = finalTrack;
  } else {
    normalizedTracks.push(finalTrack);
  }
  pending.value = true;
  await nextTick();
  sliderRef.value?.showPendingAtEnd();

  try {
    const challenge = await challengePromise;
    const result = await verifySliderCaptchaApi({
      captcha_id: challenge.captcha_id,
      distance: width,
      duration_ms: duration,
      purpose: props.purpose,
      tracks: normalizedTracks,
      username: props.username,
      width,
    });
    modelValue.value = result.proof;
    pending.value = false;
    verified.value = true;
    sliderRef.value?.showPassedAtEnd();
  } catch {
    errorMessage.value = $t('app.captcha.sliderFailed');
    reset(false);
  } finally {
    pending.value = false;
    challengePromise = undefined;
  }
}

function reset(clearError: boolean) {
  if (clearError) errorMessage.value = '';
  modelValue.value = '';
  verified.value = false;
  pending.value = false;
  challengePromise = undefined;
  startedAt = 0;
  tracks = [];
  sliderRef.value?.resume();
}

function resume() {
  reset(true);
}

defineExpose({ resume });
</script>

<template>
  <div ref="rootRef" class="w-full">
    <SliderCaptcha
      ref="sliderRef"
      v-model="verified"
      is-slot
      :aria-busy="pending"
      :text="pending ? $t('app.captcha.checking') : ''"
      @end="handleEnd"
      @move="handleMove"
      @start="handleStart"
    />
    <p v-if="errorMessage" class="mt-1 text-sm text-destructive" role="alert">
      {{ errorMessage }}
    </p>
  </div>
</template>
