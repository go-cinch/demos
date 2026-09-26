<script setup lang="ts">
  import type { CaptchaPoint, PointCaptchaChallenge } from '@/api/auth-service'
  import { $t } from '@/locales'

  const props = defineProps<{
    captcha: PointCaptchaChallenge
    refresh: (captchaId: string) => Promise<PointCaptchaChallenge>
    verify: (
      captchaId: string,
      points: CaptchaPoint[]
    ) => Promise<{ captcha?: PointCaptchaChallenge; verified: boolean }>
  }>()
  const emit = defineEmits<{ update: [captcha: PointCaptchaChallenge] }>()
  const model = defineModel<CaptchaPoint[]>({ default: () => [] })
  const image = ref<HTMLImageElement>()
  const busy = ref(false)
  const verified = ref(false)
  const selectedPoints = ref<CaptchaPoint[]>([])

  const POINT_TOGGLE_RADIUS = 14

  function resetSelection() {
    selectedPoints.value = []
    model.value = []
    verified.value = false
  }

  async function clickImage(event: MouseEvent) {
    if (busy.value || verified.value || !image.value) return
    const rect = image.value.getBoundingClientRect()
    const x = Math.round(((event.clientX - rect.left) / rect.width) * props.captcha.width)
    const y = Math.round(((event.clientY - rect.top) / rect.height) * props.captcha.height)
    const selectedIndex = selectedPoints.value.findIndex((point) => {
      const deltaX = point.x - x
      const deltaY = point.y - y
      return deltaX * deltaX + deltaY * deltaY <= POINT_TOGGLE_RADIUS * POINT_TOGGLE_RADIUS
    })
    if (selectedIndex >= 0) {
      selectedPoints.value = selectedPoints.value.filter((_, index) => index !== selectedIndex)
      return
    }

    const points = [...selectedPoints.value, { x, y }]
    selectedPoints.value = points
    if (points.length < props.captcha.target_count) return
    busy.value = true
    try {
      const result = await props.verify(props.captcha.captcha_id, points)
      verified.value = result.verified
      if (result.verified) {
        model.value = points
        return
      }
      resetSelection()
      if (result.captcha) emit('update', result.captcha)
      ElMessage.error($t('auth.captchaWrong'))
    } catch {
      resetSelection()
      try {
        emit('update', await props.refresh(props.captcha.captcha_id))
      } catch {
        // The request layer reports refresh failures.
      }
    } finally {
      busy.value = false
    }
  }

  async function reload() {
    busy.value = true
    try {
      const refreshed = await props.refresh(props.captcha.captcha_id)
      resetSelection()
      emit('update', refreshed)
    } finally {
      busy.value = false
    }
  }

  watch(() => props.captcha.captcha_id, resetSelection)
</script>

<template>
  <div class="captcha-wrap" v-loading="busy">
    <div class="captcha-head">
      <span>{{ captcha.hint_text }}</span>
      <ElButton text type="primary" @click="reload">{{ $t('auth.refresh') }}</ElButton>
    </div>
    <div class="captcha-image-wrap" @click="clickImage">
      <img ref="image" :src="captcha.captcha_image" class="captcha-image" alt="captcha" />
      <span
        v-for="(point, index) in selectedPoints"
        :key="index"
        class="point"
        :style="{
          left: `${(point.x / captcha.width) * 100}%`,
          top: `${(point.y / captcha.height) * 100}%`
        }"
        >{{ index + 1 }}</span
      >
    </div>
    <ElText v-if="verified" type="success">{{ $t('auth.captchaPassed') }}</ElText>
  </div>
</template>

<style scoped>
  .captcha-wrap {
    width: 100%;
  }
  .captcha-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
    font-size: 13px;
  }
  .captcha-image-wrap {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    cursor: crosshair;
  }
  .captcha-image {
    display: block;
    width: 100%;
    max-height: 220px;
    object-fit: contain;
  }
  .point {
    position: absolute;
    width: 24px;
    height: 24px;
    margin: -12px 0 0 -12px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--el-color-primary);
    color: #fff;
    font-size: 12px;
    box-shadow: 0 0 0 2px #fff;
  }
</style>
