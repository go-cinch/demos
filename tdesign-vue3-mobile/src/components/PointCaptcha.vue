<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { request } from '../lib/api';
import type { PointCaptcha, CaptchaPoint } from '../lib/types';
import { t } from '../locales';
import { message, resolveMessage, type Feedback } from '../lib/form-feedback';
const props = defineProps<{ captcha: PointCaptcha; username?: string; authenticated?: boolean }>();
const emit = defineEmits<{ update: [value: PointCaptcha] }>();
const points = defineModel<CaptchaPoint[]>({ default: () => [] });
const selected = ref<CaptchaPoint[]>([]);
const image = ref<HTMLImageElement>();
const busy = ref(false);
const error = ref<Feedback>('');
const path = () => (props.authenticated ? '/auth/captcha' : '/auth/pub/captcha');
watch(
  () => props.captcha.captcha_id,
  () => {
    selected.value = [];
    points.value = [];
    error.value = '';
  },
);
async function refresh() {
  busy.value = true;
  error.value = '';
  points.value = [];
  selected.value = [];
  try {
    emit(
      'update',
      await request<PointCaptcha>(path(), {
        method: 'POST',
        public: !props.authenticated,
        body: { captcha_id: props.captcha.captcha_id },
      }),
    );
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function select(event: MouseEvent) {
  if (busy.value || points.value.length || !image.value) return;
  const box = image.value.getBoundingClientRect();
  const p = {
    x: Math.round(((event.clientX - box.left) / box.width) * props.captcha.width),
    y: Math.round(((event.clientY - box.top) / box.height) * props.captcha.height),
  };
  const at = selected.value.findIndex((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= 196);
  if (at >= 0) {
    selected.value.splice(at, 1);
    return;
  }
  selected.value.push(p);
  if (selected.value.length < props.captcha.target_count) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await request<{ verified: boolean; captcha?: PointCaptcha }>(
      `${path()}/verify`,
      {
        method: 'POST',
        public: !props.authenticated,
        body: {
          captcha_id: props.captcha.captcha_id,
          captcha_points: selected.value,
          ...(!props.authenticated ? { username: props.username } : {}),
        },
      },
    );
    if (result.verified) points.value = [...selected.value];
    else {
      selected.value = [];
      if (result.captcha) emit('update', result.captcha);
      await nextTick();
      error.value = message('app.captcha.failed');
    }
  } catch (e) {
    selected.value = [];
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="point-captcha" :aria-busy="busy">
    <div class="section-heading">
      <span>{{ captcha.hint_text }}</span
      ><button type="button" :disabled="busy" @click="refresh">{{ t('refreshCaptcha') }}</button>
    </div>
    <div class="captcha-image" @click="select">
      <img ref="image" :src="captcha.captcha_image" :alt="t('captchaAlt')" /><span
        v-for="(p, index) in selected"
        :key="index"
        class="captcha-point"
        :style="{
          left: `${(p.x / captcha.width) * 100}%`,
          top: `${(p.y / captcha.height) * 100}%`,
        }"
        >{{ index + 1 }}</span
      >
    </div>
    <p v-if="error" role="alert" class="field-error">{{ resolveMessage(error) }}</p>
    <p v-if="points.length" class="success-text">{{ t('app.captcha.passed') }}</p>
  </div>
</template>
