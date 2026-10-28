<script setup lang="ts">
  import type { FormInstance, FormRules } from 'element-plus'
  import type { PointCaptchaChallenge } from '@/api/auth-service'

  import { AxiosError } from 'axios'
  import { changePassword, refreshPasswordCaptcha, verifyPasswordCaptcha } from '@/api/auth-service'
  import { fetchGetUserInfo } from '@/api/auth'
  import { useUserStore } from '@/store/modules/user'
  import { $t } from '@/locales'
  import ProfileCenter from './ProfileCenter.vue'
  import { isValidUserPassword } from '@/utils/auth-validation'

  defineOptions({ name: 'Profile' })

  const store = useUserStore()
  const profileLoading = ref(false)
  const formRef = ref<FormInstance>()
  const submitting = ref(false)
  const captcha = ref<PointCaptchaChallenge>()
  const form = reactive({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
    points: [] as Array<{ x: number; y: number }>
  })

  const rules = computed<FormRules>(() => ({
    oldPassword: [
      { required: true, message: $t('profile.password.oldPasswordRequired'), trigger: 'blur' }
    ],
    newPassword: [
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
          String(value ?? '').trim() === form.newPassword.trim()
            ? callback()
            : callback(new Error($t('profile.password.passwordMismatch'))),
        trigger: 'blur'
      }
    ]
  }))

  async function loadProfile() {
    profileLoading.value = true
    try {
      store.setUserInfo(await fetchGetUserInfo())
    } finally {
      profileLoading.value = false
    }
  }

  function resetPasswordForm() {
    form.oldPassword = ''
    form.newPassword = ''
    form.confirmPassword = ''
    form.points = []
    captcha.value = undefined
    formRef.value?.clearValidate()
  }

  async function submitPassword() {
    if (!(await formRef.value?.validate())) return
    if (captcha.value && form.points.length !== captcha.value.target_count) {
      ElMessage.warning($t('auth.captchaRequired'))
      return
    }
    submitting.value = true
    try {
      await changePassword(
        form.oldPassword.trim(),
        form.newPassword.trim(),
        captcha.value ? { captchaId: captcha.value.captcha_id, points: form.points } : undefined
      )
      resetPasswordForm()
      ElMessage.success($t('profile.password.success'))
      await store.logOut()
    } catch (error) {
      const data =
        error instanceof AxiosError
          ? (error.response?.data as { captcha?: PointCaptchaChallenge; msg?: string })
          : undefined
      if (data?.captcha) {
        captcha.value = data.captcha
        form.points = []
      }
    } finally {
      submitting.value = false
    }
  }

  onMounted(loadProfile)
</script>

<template>
  <div class="profile-page"
    ><ProfileCenter>
      <ElForm
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="password-form"
        @submit.prevent="submitPassword"
      >
        <ElFormItem :label="$t('profile.password.oldPassword')" prop="oldPassword">
          <ElInput
            v-model="form.oldPassword"
            type="password"
            show-password
            autocomplete="current-password"
            :placeholder="$t('profile.password.oldPasswordPlaceholder')"
          />
        </ElFormItem>
        <ElFormItem :label="$t('profile.password.newPassword')" prop="newPassword">
          <ElInput
            v-model="form.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="$t('profile.password.newPasswordPlaceholder')"
          />
        </ElFormItem>
        <ElFormItem :label="$t('profile.password.confirmPassword')" prop="confirmPassword">
          <ElInput
            v-model="form.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="$t('profile.password.confirmPasswordPlaceholder')"
          />
        </ElFormItem>
        <ElFormItem v-if="captcha">
          <PointCaptcha
            v-model="form.points"
            :captcha="captcha"
            :refresh="refreshPasswordCaptcha"
            :verify="verifyPasswordCaptcha"
            @update="captcha = $event"
          />
        </ElFormItem>
        <ElButton native-type="submit" type="primary" :loading="submitting">
          {{ $t('profile.password.update') }}
        </ElButton>
      </ElForm></ProfileCenter
    ></div
  >
</template>
<style scoped>
  .password-form {
    max-width: 520px;
  }
  .profile-page {
    min-width: 0;
  }
</style>
