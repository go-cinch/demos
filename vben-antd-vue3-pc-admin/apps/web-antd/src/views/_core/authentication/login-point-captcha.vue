<script lang="ts" setup>
import type { CaptchaPoint } from '@vben/common-ui';

import type { AuthApi } from '#/api';

import { $t } from '#/locales';

import { onBeforeUnmount, ref, watch } from 'vue';

import { PointSelectionCaptcha } from '@vben/common-ui';
import { CircleCheckBig, LockKeyhole } from '@vben/icons';

import { Popover } from 'ant-design-vue';

defineOptions({ name: 'LoginPointCaptcha' });

const props = defineProps<{
  captcha: AuthApi.PointCaptchaChallenge;
  modelValue?: AuthApi.CaptchaPoint[];
  onRefresh: () => Promise<void>;
  onVerify: (
    points: AuthApi.CaptchaPoint[],
  ) => Promise<AuthApi.PointCaptchaVerificationResult>;
}>();

const emit = defineEmits<{
  'update:modelValue': [AuthApi.CaptchaPoint[]];
}>();

const selectedPoints = ref<AuthApi.CaptchaPoint[]>([]);
const selectionComplete = ref(false);
const refreshing = ref(false);
const verificationFailed = ref(false);
const verifying = ref(false);
const panelOpen = ref(false);
let failureTimer: ReturnType<typeof setTimeout> | undefined;

function clearVerificationFailure() {
  verificationFailed.value = false;
  if (failureTimer) {
    clearTimeout(failureTimer);
    failureTimer = undefined;
  }
}

function showVerificationFailure() {
  clearVerificationFailure();
  verificationFailed.value = true;
  failureTimer = setTimeout(() => {
    verificationFailed.value = false;
    failureTimer = undefined;
  }, 3000);
}

function resetSelection() {
  selectedPoints.value = [];
  selectionComplete.value = false;
  emit('update:modelValue', []);
}

watch(
  () => props.captcha.captcha_id,
  () => {
    resetSelection();
    if (!refreshing.value && !verifying.value) {
      panelOpen.value = false;
    }
  },
  { immediate: true },
);

async function handlePointsChange(points: CaptchaPoint[]) {
  if (selectionComplete.value || refreshing.value || verifying.value) return;

  selectedPoints.value = points.map((point) => ({ x: point.x, y: point.y }));
  if (selectedPoints.value.length < props.captcha.target_count) return;

  verifying.value = true;
  try {
    const selected = [...selectedPoints.value];
    const result = await props.onVerify(selected);
    if (result.verified) {
      clearVerificationFailure();
      selectionComplete.value = true;
      emit('update:modelValue', selected);
      panelOpen.value = false;
      return;
    }
    resetSelection();
    showVerificationFailure();
    panelOpen.value = true;
  } catch {
    resetSelection();
    showVerificationFailure();
    panelOpen.value = true;
    try {
      await props.onRefresh();
    } catch {
      // The request layer reports network and server errors.
    }
  } finally {
    verifying.value = false;
  }
}

async function handleRefresh() {
  if (refreshing.value) return;
  clearVerificationFailure();
  resetSelection();
  refreshing.value = true;
  try {
    await props.onRefresh();
  } finally {
    refreshing.value = false;
  }
}

onBeforeUnmount(clearVerificationFailure);

function handleOpenChange(open: boolean) {
  panelOpen.value = selectionComplete.value ? false : open;
  if (panelOpen.value) {
    emit('update:modelValue', []);
  }
}
</script>

<template>
  <Popover
    :arrow="false"
    :open="panelOpen && !selectionComplete"
    overlay-class-name="login-point-captcha-popover"
    placement="top"
    trigger="click"
    @open-change="handleOpenChange"
  >
    <template #content>
      <div
        class="captcha-panel relative rounded-sm"
        :class="{
          'captcha-panel-error': verificationFailed,
          'pointer-events-none opacity-70': refreshing || verifying,
        }"
      >
        <PointSelectionCaptcha
          :key="captcha.captcha_id"
          :captcha-image="captcha.captcha_image"
          :height="captcha.height"
          :hint-text="captcha.hint_text"
          :width="captcha.width"
          @change="handlePointsChange"
          @refresh="handleRefresh"
        >
          <template #title>{{ $t('app.captcha.additional') }}</template>
        </PointSelectionCaptcha>
      </div>
    </template>

    <button
      :aria-expanded="panelOpen"
      class="captcha-trigger group relative flex h-10 w-full items-center overflow-hidden rounded-md border bg-background-deep px-3 text-sm transition-all duration-300"
      :class="
        verificationFailed
          ? 'border-red-500 bg-red-500/10 text-red-500'
          : selectionComplete
            ? 'captcha-trigger-success border-emerald-500 bg-emerald-500/10 text-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.16)]'
            : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
      "
      type="button"
    >
      <span
        v-if="!selectionComplete"
        class="captcha-radar mr-3 flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/70"
        :class="{ 'is-active': panelOpen }"
      >
        <span class="size-2.5 rounded-full bg-primary/80"></span>
      </span>
      <CircleCheckBig v-else class="mr-3 size-5 shrink-0" />

      <span class="flex-1 text-left font-medium">
        {{
          selectionComplete
            ? $t('app.captcha.passed')
            : verifying
              ? $t('app.captcha.checking')
              : verificationFailed
                ? $t('app.captcha.failed')
                : panelOpen
                  ? $t('app.captcha.progress')
                  : $t('app.captcha.start')
        }}
      </span>

      <CircleCheckBig
        v-if="selectionComplete"
        class="size-5 shrink-0 opacity-80"
      />
      <LockKeyhole
        v-else
        class="size-5 shrink-0 text-primary/80 transition-transform duration-300 group-hover:scale-110"
      />
    </button>
  </Popover>
</template>

<style scoped>
.captcha-radar {
  box-shadow: 0 0 0 3px hsl(var(--primary) / 8%);
}

.captcha-panel-error {
  animation: captcha-panel-shake 420ms ease-in-out;
  box-shadow: 0 0 0 2px rgb(239 68 68 / 90%);
}

@keyframes captcha-panel-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-8px);
  }
  40% {
    transform: translateX(7px);
  }
  60% {
    transform: translateX(-5px);
  }
  80% {
    transform: translateX(3px);
  }
}

.captcha-radar.is-active {
  animation: captcha-radar-pulse 1.1s ease-out infinite;
}

@keyframes captcha-radar-pulse {
  0% {
    box-shadow: 0 0 0 0 hsl(var(--primary) / 35%);
  }
  100% {
    box-shadow: 0 0 0 9px hsl(var(--primary) / 0%);
  }
}

.captcha-trigger-success {
  animation: captcha-trigger-success 620ms cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes captcha-trigger-success {
  0% {
    box-shadow: 0 0 0 0 rgb(16 185 129 / 45%);
    transform: scale(0.985);
  }
  55% {
    box-shadow: 0 0 0 5px rgb(16 185 129 / 16%);
    transform: scale(1.01);
  }
  100% {
    box-shadow: 0 0 0 0 rgb(16 185 129 / 0%);
    transform: scale(1);
  }
}
</style>

<style>
.login-point-captcha-popover .ant-popover-inner {
  overflow: hidden;
  padding: 0;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  box-shadow: 0 14px 38px rgb(0 0 0 / 28%);
}

.login-point-captcha-popover .ant-popover-inner-content {
  padding: 0;
}
</style>
