<script setup lang="ts">
  import type { FormInstance, FormRules } from 'element-plus'
  import type { PointCaptchaChallenge } from '@/api/auth-service'

  import { AxiosError } from 'axios'
  import { loginVerification, refreshLoginCaptcha, verifyLoginCaptcha } from '@/api/auth-service'
  import { fetchLogin } from '@/api/auth'
  import { $t } from '@/locales'
  import { useUserStore } from '@/store/modules/user'
  import { isValidUsername, isValidUserPassword } from '@/utils/auth-validation'
  import {
    clearRememberedCredentials,
    readRememberedCredentials,
    saveRememberedCredentials
  } from '@/utils/remembered-credentials'

  defineOptions({ name: 'Login' })

  const router = useRouter()
  const route = useRoute()
  const store = useUserStore()
  const formRef = ref<FormInstance>()
  const slider = ref<{ reset: () => void }>()
  const loading = ref(false)
  const captcha = ref<PointCaptchaChallenge>()
  const checkTimer = ref<ReturnType<typeof setTimeout>>()
  const verificationError = ref('')
  const form = reactive({
    username: '',
    password: '',
    rememberMe: true,
    sliderProof: '',
    captchaPoints: [] as Array<{ x: number; y: number }>
  })
  const loginRules = computed<FormRules>(() => ({
    username: [
      { required: true, message: $t('auth.usernameRequired'), trigger: 'blur' },
      {
        validator: (_rule, value, callback) =>
          isValidUsername(value) ? callback() : callback(new Error($t('auth.usernameLength'))),
        trigger: 'blur'
      }
    ],
    password: [
      { required: true, message: $t('auth.passwordRequired'), trigger: 'blur' },
      {
        validator: (_rule, value, callback) =>
          isValidUserPassword(value) ? callback() : callback(new Error($t('auth.passwordLength'))),
        trigger: 'blur'
      }
    ]
  }))

  onMounted(() => {
    try {
      const remembered = readRememberedCredentials()
      form.username = remembered?.username || ''
      form.password = remembered?.password || ''
      form.rememberMe = Boolean(remembered)
    } catch {
      /* ignore corrupt local state */
    }
    if (form.username) checkVerification()
  })

  watch(
    () => form.username,
    () => {
      captcha.value = undefined
      form.captchaPoints = []
      form.sliderProof = ''
      verificationError.value = ''
      slider.value?.reset()
      clearTimeout(checkTimer.value)
      checkTimer.value = setTimeout(checkVerification, 300)
    }
  )

  watch(
    () => [form.sliderProof, form.captchaPoints.length],
    () => {
      if (
        form.sliderProof ||
        (captcha.value && form.captchaPoints.length === captcha.value.target_count)
      )
        verificationError.value = ''
    }
  )

  async function checkVerification() {
    const username = form.username.trim()
    if (!username) return
    try {
      const result = await loginVerification(username)
      captcha.value = result.captcha_required ? result.captcha : undefined
    } catch {
      /* background check stays silent */
    }
  }

  async function submit() {
    if (!(await formRef.value?.validate())) return
    if (!captcha.value && !form.sliderProof) {
      verificationError.value = $t('auth.sliderRequired')
      return
    }
    if (captcha.value && form.captchaPoints.length !== captcha.value.target_count) {
      verificationError.value = $t('auth.captchaRequired')
      return
    }
    verificationError.value = ''
    loading.value = true
    try {
      const session = await fetchLogin({
        userName: form.username.trim(),
        password: form.password,
        rememberMe: form.rememberMe,
        sliderProof: form.sliderProof || undefined,
        captchaId: captcha.value?.captcha_id,
        captchaPoints: captcha.value ? form.captchaPoints : undefined
      })
      store.acceptSession(session)
      if (form.rememberMe) {
        saveRememberedCredentials({ username: form.username.trim(), password: form.password })
      } else {
        clearRememberedCredentials()
      }
      ElMessage.success($t('auth.loginSuccess'))
      await router.replace(
        session.password_reset_required
          ? '/auth/reset-password'
          : String(route.query.redirect || '/')
      )
    } catch (error) {
      const data =
        error instanceof AxiosError
          ? (error.response?.data as { captcha?: PointCaptchaChallenge; msg?: string })
          : undefined
      if (data?.captcha) captcha.value = data.captcha
      ElMessage.error(
        data?.msg || (error instanceof Error ? error.message : $t('auth.loginFailed'))
      )
      form.sliderProof = ''
      slider.value?.reset()
    } finally {
      loading.value = false
    }
  }
</script>

<template>
  <div class="auth-page flex w-full h-screen">
    <LoginLeftView />
    <div class="relative flex-1">
      <AuthTopBar />
      <div class="auth-right-wrap">
        <div class="form">
          <h3 class="title">{{ $t('auth.loginTitle') }}</h3>
          <p class="sub-title">{{ $t('auth.loginSubtitle') }}</p>
          <ElForm ref="formRef" :model="form" label-position="top" @keyup.enter="submit">
            <ElFormItem :label="$t('auth.username')" prop="username" :rules="loginRules.username">
              <ElInput v-model.trim="form.username" size="large" autocomplete="username" />
            </ElFormItem>
            <ElFormItem :label="$t('auth.password')" prop="password" :rules="loginRules.password">
              <ElInput
                v-model="form.password"
                size="large"
                type="password"
                show-password
                autocomplete="current-password"
              />
            </ElFormItem>
            <ElFormItem v-if="captcha" :error="verificationError">
              <PointCaptcha
                v-model="form.captchaPoints"
                :captcha="captcha"
                :refresh="refreshLoginCaptcha"
                :verify="
                  (id: string, points: Array<{ x: number; y: number }>) =>
                    verifyLoginCaptcha(form.username, id, points)
                "
                @update="captcha = $event"
              />
            </ElFormItem>
            <ElFormItem v-else :error="verificationError">
              <ServerSliderCaptcha
                ref="slider"
                v-model="form.sliderProof"
                purpose="login"
                :username="form.username"
              />
            </ElFormItem>
            <div class="flex-cb mb-5 text-sm">
              <ElCheckbox v-model="form.rememberMe">{{ $t('auth.remember') }}</ElCheckbox>
            </div>
            <ElButton
              class="w-full"
              size="large"
              type="primary"
              :loading="loading"
              @click="submit"
              >{{ $t('auth.login') }}</ElButton
            >
            <p class="mt-5 text-sm text-center"
              >{{ $t('auth.noAccount') }}
              <RouterLink class="text-theme" to="/auth/register">{{
                $t('auth.register')
              }}</RouterLink></p
            >
          </ElForm>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./style.css" />
