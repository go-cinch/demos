<script setup lang="ts">
  import { createSliderChallenge, verifySlider } from '@/api/auth-service'
  import { $t } from '@/locales'

  const props = defineProps<{ purpose: 'login' | 'register'; username: string }>()
  const model = defineModel<string>({ default: '' })

  const rail = ref<HTMLElement>()
  const dragging = ref(false)
  const loading = ref(false)
  const passed = ref(false)
  const distance = ref(0)
  let startX = 0
  let startedAt = 0
  let challengeId = ''
  let tracks: Array<{ t: number; x: number }> = []

  const maxDistance = computed(() => Math.max(0, (rail.value?.clientWidth ?? 320) - 40))
  const progressStyle = computed(() => ({ width: `${distance.value + 40}px` }))
  const handleStyle = computed(() => ({ transform: `translateX(${distance.value}px)` }))

  async function begin(event: PointerEvent) {
    if (passed.value || loading.value || !props.username.trim()) {
      if (!props.username.trim()) ElMessage.warning($t('auth.usernameFirst'))
      return
    }
    const handle = event.currentTarget as HTMLElement
    try {
      const challenge = await createSliderChallenge(props.purpose, props.username.trim())
      challengeId = challenge.captcha_id
      dragging.value = true
      startX = event.clientX
      startedAt = performance.now()
      tracks = [{ t: 0, x: 0 }]
      handle.setPointerCapture(event.pointerId)
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : $t('auth.verificationFailed'))
    }
  }

  function move(event: PointerEvent) {
    if (!dragging.value) return
    distance.value = Math.min(maxDistance.value, Math.max(0, event.clientX - startX))
    tracks.push({ t: Math.round(performance.now() - startedAt), x: Math.round(distance.value) })
  }

  async function end() {
    if (!dragging.value) return
    dragging.value = false
    if (distance.value < maxDistance.value - 3) return reset()
    loading.value = true
    try {
      const duration = Math.max(1, Math.round(performance.now() - startedAt))
      const result = await verifySlider({
        captcha_id: challengeId,
        distance: Math.round(distance.value),
        duration_ms: duration,
        purpose: props.purpose,
        tracks,
        username: props.username.trim(),
        width: Math.round(maxDistance.value)
      })
      model.value = result.proof
      passed.value = true
    } catch (error) {
      reset()
      ElMessage.error(error instanceof Error ? error.message : 'Verification failed')
    } finally {
      loading.value = false
    }
  }

  function reset() {
    model.value = ''
    passed.value = false
    dragging.value = false
    distance.value = 0
    challengeId = ''
    tracks = []
  }

  watch(() => props.username, reset)
  defineExpose({ reset })
</script>

<template>
  <div ref="rail" class="server-slider" :class="{ passed }">
    <div class="progress" :style="progressStyle" />
    <span class="label">{{ passed ? $t('auth.sliderPassed') : $t('auth.sliderTip') }}</span>
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
    </button>
  </div>
</template>

<style scoped>
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
</style>
