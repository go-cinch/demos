<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue'
  import { createSliderChallenge, verifySlider } from '@/api/auth-service'
  import { isBadGatewayError } from '@/utils/admin/request-error'
  import { $t } from '@/locales'
  const props = defineProps<{ purpose: 'login' | 'register'; username: string }>(),
    model = defineModel<string>({ default: '' })
  const rail = ref<HTMLElement>(),
    dragging = ref(false),
    loading = ref(false),
    passed = ref(false),
    distance = ref(0),
    errorMessage = ref('')
  let generation = 0,
    startX = 0,
    startedAt = 0,
    subject = '',
    tracks: Array<{ t: number; x: number }> = [],
    challenge: ReturnType<typeof createSliderChallenge> | undefined
  const maxDistance = computed(() => Math.max(0, (rail.value?.clientWidth ?? 320) - 40)),
    progressStyle = computed(() => ({ width: `${distance.value + 40}px` })),
    handleStyle = computed(() => ({ transform: `translateX(${distance.value}px)` }))
  function reset(clear = true) {
    generation++
    model.value = ''
    passed.value = false
    dragging.value = false
    loading.value = false
    distance.value = 0
    tracks = []
    challenge = undefined
    if (clear) errorMessage.value = ''
  }
  function begin(event: PointerEvent) {
    if (passed.value || loading.value) return
    if (!props.username.trim()) {
      errorMessage.value = $t('auth.usernameFirst')
      return
    }
    event.preventDefault()
    reset()
    const run = ++generation
    subject = props.username.trim()
    startX = event.clientX
    startedAt = performance.now()
    tracks = [{ t: 0, x: 0 }]
    dragging.value = true
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    challenge = createSliderChallenge(props.purpose, subject)
    void challenge.catch((error) => {
      if (run === generation && isBadGatewayError(error)) errorMessage.value = $t('auth.serverLost')
    })
  }
  function move(event: PointerEvent) {
    if (!dragging.value) return
    distance.value = Math.min(maxDistance.value, Math.max(0, event.clientX - startX))
    if (tracks.length < 127)
      tracks.push({ t: Math.round(performance.now() - startedAt), x: Math.round(distance.value) })
  }
  async function end() {
    if (!dragging.value) return
    dragging.value = false
    if (distance.value < maxDistance.value - 3) {
      reset()
      return
    }
    const run = generation,
      pending = challenge,
      currentSubject = subject
    if (!pending) return
    loading.value = true
    try {
      const value = await pending
      if (run !== generation) return
      const duration = Math.max(1, Math.round(performance.now() - startedAt)),
        width = Math.round(maxDistance.value)
      const result = await verifySlider({
        captcha_id: value.captcha_id,
        distance: width,
        duration_ms: duration,
        purpose: props.purpose,
        tracks: [...tracks, { t: duration, x: width }],
        username: currentSubject,
        width
      })
      if (run !== generation) return
      model.value = result.proof
      passed.value = true
      errorMessage.value = ''
    } catch (error) {
      if (run === generation) {
        errorMessage.value = $t(
          isBadGatewayError(error) ? 'auth.serverLost' : 'auth.verificationFailed'
        )
        reset(false)
      }
    } finally {
      if (run === generation) loading.value = false
    }
  }
  watch(
    () => props.username,
    () => reset()
  )
  onBeforeUnmount(() => {
    generation++
  })
  defineExpose({ reset })
</script>

<template>
  <div class="slider-wrap"
    ><div ref="rail" class="server-slider" :class="{ passed }" :aria-busy="loading">
      <ElSkeleton v-if="loading" animated class="slider-skeleton"
        ><template #template
          ><ElSkeletonItem variant="rect" style="width: 100%; height: 100%" /></template
      ></ElSkeleton>
      <div class="progress" :style="progressStyle" />
      <span class="label">{{
        passed
          ? $t('auth.sliderPassed')
          : loading
            ? $t('auth.sliderChecking')
            : $t('auth.sliderTip')
      }}</span>
      <button
        type="button"
        class="handle"
        :aria-label="passed ? $t('auth.sliderPassed') : $t('auth.sliderTip')"
        :style="handleStyle"
        :disabled="loading || passed"
        @pointerdown="begin"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="end"
      >
        <ArtSvgIcon :icon="passed ? 'ri:check-line' : 'ri:arrow-right-double-line'" />
      </button> </div
    ><p v-if="errorMessage" class="slider-error" role="alert">{{ errorMessage }}</p></div
  >
</template>

<style scoped>
  .slider-wrap {
    position: relative;
    width: 100%;
  }

  .slider-skeleton {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    opacity: 0.75;
  }
  .slider-error {
    position: absolute;
    top: 100%;
    margin-top: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--el-color-danger);
  }

  .server-slider {
    position: relative;
    width: 100%;
    height: var(--el-component-size-large, 40px);
    overflow: hidden;
    touch-action: none;
    user-select: none;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease;
  }

  .server-slider:has(.handle:focus-visible) {
    border-color: var(--el-color-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--el-color-primary) 16%, transparent);
  }

  .progress {
    position: absolute;
    inset: 0 auto 0 0;
    background: color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  }

  .label {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 13px;
    color: var(--el-text-color-regular);
  }

  .handle {
    position: absolute;
    top: 0;
    left: 0;
    display: grid;
    place-items: center;
    width: 40px;
    height: calc(var(--el-component-size-large, 40px) - 2px);
    color: var(--el-color-primary);
    cursor: grab;
    background: var(--el-bg-color);
    border: 0;
    border-right: 1px solid var(--el-border-color);
  }

  .handle:focus-visible {
    background: var(--el-color-primary-light-9);
    outline: none;
  }

  .passed {
    border-color: var(--el-color-success);
  }

  .passed .progress {
    width: 100% !important;
    background: color-mix(in srgb, var(--el-color-success) 18%, transparent);
  }

  .passed .handle {
    color: var(--el-color-success);
  }

  @media (prefers-reduced-motion: reduce) {
    .server-slider {
      transition: none;
    }
  }
</style>
