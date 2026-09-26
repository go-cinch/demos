<script setup lang="ts">
  import type { FormInstance, FormRules } from 'element-plus'
  import { resetPassword } from '@/api/auth-service'
  import { $t } from '@/locales'
  import { useUserStore } from '@/store/modules/user'
  import { isValidUserPassword } from '@/utils/auth-validation'
  import { updateRememberedPassword } from '@/utils/remembered-credentials'

  defineOptions({ name: 'ResetPassword' })
  const formRef = ref<FormInstance>()
  const store = useUserStore()
  const router = useRouter()
  const loading = ref(false)
  const form = reactive({ password: '', confirmPassword: '' })
  const rules = computed<FormRules>(() => ({
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
    loading.value = true
    try {
      store.acceptSession(await resetPassword(form.password))
      updateRememberedPassword(form.password)
      ElMessage.success($t('auth.resetSuccess'))
      await router.replace('/')
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : $t('auth.resetFailed'))
    } finally {
      loading.value = false
    }
  }
</script>

<template>
  <div class="auth-page flex w-full h-screen">
    <LoginLeftView />
    <div class="relative flex-1"
      ><AuthTopBar /><div class="auth-right-wrap"
        ><div class="form">
          <h3 class="title">{{ $t('auth.resetTitle') }}</h3>
          <p class="sub-title">{{ $t('auth.resetSubtitle') }}</p>
          <ElForm ref="formRef" :model="form" :rules="rules" label-position="top">
            <ElFormItem :label="$t('auth.newPassword')" prop="password"
              ><ElInput v-model="form.password" type="password" show-password size="large"
            /></ElFormItem>
            <ElFormItem :label="$t('auth.confirmPassword')" prop="confirmPassword"
              ><ElInput v-model="form.confirmPassword" type="password" show-password size="large"
            /></ElFormItem>
            <ElButton
              class="w-full"
              type="primary"
              size="large"
              :loading="loading"
              @click="submit"
              >{{ $t('auth.resetPassword') }}</ElButton
            >
          </ElForm>
        </div></div
      ></div
    >
  </div>
</template>

<style scoped src="../login/style.css" />
