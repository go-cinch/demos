<script setup lang="ts">
  import type { FormInstance, FormRules } from 'element-plus'
  import { register, usernameAvailable } from '@/api/auth-service'
  import { $t } from '@/locales'
  import { isValidUsername, isValidUserPassword } from '@/utils/auth-validation'
  import { saveRememberedCredentials } from '@/utils/remembered-credentials'

  defineOptions({ name: 'Register' })
  const router = useRouter()
  const formRef = ref<FormInstance>()
  const slider = ref<{ reset: () => void }>()
  const loading = ref(false)
  const verificationError = ref('')
  const form = reactive({ username: '', password: '', confirmPassword: '', sliderProof: '' })
  watch(
    () => form.sliderProof,
    (proof) => {
      if (proof) verificationError.value = ''
    }
  )
  const rules = computed<FormRules>(() => ({
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
    ],
    confirmPassword: [
      {
        validator: (_rule, value, callback) =>
          value === form.password ? callback() : callback(new Error($t('auth.passwordMismatch'))),
        trigger: 'blur'
      }
    ]
  }))

  async function submit() {
    if (!(await formRef.value?.validate())) return
    if (!form.sliderProof) {
      verificationError.value = $t('auth.sliderRequired')
      return
    }
    verificationError.value = ''
    loading.value = true
    try {
      const availability = await usernameAvailable(form.username.trim())
      if (!availability.available) throw new Error($t('auth.usernameUnavailable'))
      await register(form.username.trim(), form.password, form.sliderProof)
      saveRememberedCredentials({ username: form.username.trim(), password: form.password })
      ElMessage.success($t('auth.registerSuccess'))
      await router.replace('/auth/login')
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : $t('auth.registerFailed'))
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
      <div class="auth-right-wrap"
        ><div class="form">
          <h3 class="title">{{ $t('auth.registerTitle') }}</h3>
          <p class="sub-title">{{ $t('auth.registerSubtitle') }}</p>
          <ElForm ref="formRef" :model="form" :rules="rules" label-position="top">
            <ElFormItem :label="$t('auth.username')" prop="username"
              ><ElInput v-model.trim="form.username" size="large"
            /></ElFormItem>
            <ElFormItem :label="$t('auth.password')" prop="password"
              ><ElInput v-model="form.password" type="password" show-password size="large"
            /></ElFormItem>
            <ElFormItem :label="$t('auth.confirmPassword')" prop="confirmPassword"
              ><ElInput v-model="form.confirmPassword" type="password" show-password size="large"
            /></ElFormItem>
            <ElFormItem :error="verificationError"
              ><ServerSliderCaptcha
                ref="slider"
                v-model="form.sliderProof"
                purpose="register"
                :username="form.username"
            /></ElFormItem>
            <ElButton
              class="w-full"
              size="large"
              type="primary"
              :loading="loading"
              @click="submit"
              >{{ $t('auth.register') }}</ElButton
            >
            <p class="mt-5 text-sm text-center"
              ><RouterLink class="text-theme" to="/auth/login">{{
                $t('auth.backToLogin')
              }}</RouterLink></p
            >
          </ElForm>
        </div></div
      >
    </div>
  </div>
</template>

<style scoped src="../login/style.css" />
