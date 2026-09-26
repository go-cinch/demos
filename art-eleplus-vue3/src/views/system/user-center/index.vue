<script setup lang="ts">
  import type { FormInstance, FormRules } from 'element-plus'
  import type { PointCaptchaChallenge } from '@/api/auth-service'

  import { AxiosError } from 'axios'
  import { changePassword, refreshPasswordCaptcha, verifyPasswordCaptcha } from '@/api/auth-service'
  import { fetchGetUserInfo } from '@/api/auth'
  import { useUserStore } from '@/store/modules/user'
  import { $t } from '@/locales'
  import { isValidUserPassword } from '@/utils/auth-validation'

  defineOptions({ name: 'Profile' })

  const store = useUserStore()
  const activeTab = ref('basic')
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
          value === form.newPassword
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
        form.oldPassword,
        form.newPassword,
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
  <div class="page-content profile-page">
    <ElCard v-loading="profileLoading" shadow="never">
      <div class="profile-header">
        <ElAvatar :size="72">
          <ArtSvgIcon icon="ri:user-3-line" class="profile-avatar-icon" />
        </ElAvatar>
        <div class="profile-identity">
          <h1>{{ store.info.userName || '-' }}</h1>
          <p>{{ store.info.role?.name || $t('profile.noRole') }}</p>
        </div>
      </div>

      <ElTabs v-model="activeTab" class="profile-tabs">
        <ElTabPane :label="$t('profile.tabs.basicInformation')" name="basic">
          <div class="profile-section">
            <h2>{{ $t('profile.tabs.basicInformation') }}</h2>
            <ElForm label-position="left" label-width="110px" class="basic-form">
              <ElFormItem :label="$t('profile.fields.username')">
                <span>{{ store.info.userName || '-' }}</span>
              </ElFormItem>
              <ElFormItem :label="$t('profile.fields.role')">
                <span>{{ store.info.role?.name || $t('profile.noRole') }}</span>
              </ElFormItem>
            </ElForm>
          </div>
        </ElTabPane>

        <ElTabPane :label="$t('profile.tabs.changePassword')" name="password">
          <div class="profile-section password-section">
            <h2>{{ $t('profile.tabs.changePassword') }}</h2>
            <ElAlert
              :title="$t('profile.password.changeTip')"
              type="warning"
              :closable="false"
              show-icon
            />
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
            </ElForm>
          </div>
        </ElTabPane>
      </ElTabs>
    </ElCard>
  </div>
</template>

<style scoped>
  .profile-header {
    display: flex;
    gap: 18px;
    align-items: center;
    padding: 12px 8px 26px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .profile-avatar-icon {
    font-size: 34px;
  }

  .profile-identity h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .profile-identity p {
    margin: 7px 0 0;
    color: var(--el-text-color-secondary);
  }

  .profile-tabs {
    margin-top: 18px;
  }

  .profile-section {
    max-width: 680px;
    padding: 12px 8px 28px;
  }

  .profile-section h2 {
    margin: 0 0 26px;
    font-size: 18px;
    font-weight: 600;
  }

  .basic-form {
    max-width: 520px;
  }

  .basic-form :deep(.el-form-item) {
    padding-bottom: 14px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .password-section :deep(.el-alert) {
    margin-bottom: 24px;
  }

  .password-form {
    max-width: 460px;
  }

  @media only screen and (width <= 640px) {
    .profile-header {
      padding-top: 4px;
    }

    .profile-section {
      padding-right: 0;
      padding-left: 0;
    }
  }
</style>
