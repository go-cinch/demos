<script setup lang="ts">
import { focusFirstInvalid, message, type Feedback } from '../lib/form-feedback';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ApiError, acceptSession, loadUser, logout, request, submitCredentials } from '../lib/api';
import type { PointCaptcha as Challenge, CaptchaPoint } from '../lib/types';
import { recordLoginAccount } from '../lib/storage';
import { consumeRegistrationLogin, setRegistrationLogin } from '../lib/registration-login';
import LoginAccountInput from '../components/LoginAccountInput.vue';
import { nonempty, trimCredential } from '../lib/validation';
import { t } from '../locales';
import Field from '../components/Field.vue';
import ServerSlider from '../components/ServerSlider.vue';
import PointCaptcha from '../components/PointCaptcha.vue';
import Copyright from '../components/Copyright.vue';
const route = useRoute();
const router = useRouter();
const mode = computed(() =>
  route.path.endsWith('register')
    ? 'register'
    : route.path.endsWith('reset-password')
      ? 'password_reset'
      : 'login',
);
const username = ref('');
const password = ref('');
const confirmation = ref('');
const proof = ref('');
const slider = ref<InstanceType<typeof ServerSlider>>();
const captcha = ref<Challenge>();
const points = ref<CaptchaPoint[]>([]);
const busy = ref(false);
const errors = ref<Record<string, Feedback>>({});
const formElement = ref<HTMLFormElement>();
const error = ref('');
const notice = ref('');
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
const unavailableUsername = ref('');
const verificationBusy = ref(false);
let verificationGeneration = 0;
let verificationTimer: ReturnType<typeof setTimeout> | undefined;
let verificationController: AbortController | undefined;
function cancelUsernameVerification() {
  verificationGeneration++;
  clearTimeout(verificationTimer);
  verificationTimer = undefined;
  verificationController?.abort();
  verificationController = undefined;
  verificationBusy.value = false;
}
watch(
  username,
  () => {
    cancelUsernameVerification();
    unavailableUsername.value = '';
    captcha.value = undefined;
    points.value = [];
  },
  { flush: 'sync' },
);
watch(
  mode,
  () => {
    cancelUsernameVerification();
    clearTimeout(noticeTimer);
    errors.value = {};
    error.value = '';
    notice.value = '';
    proof.value = '';
    captcha.value = undefined;
    points.value = [];
    confirmation.value = '';
    password.value = '';
    if (mode.value === 'login') {
      const registered = consumeRegistrationLogin();
      if (registered) {
        username.value = registered.username;
        password.value = registered.password;
        notice.value = 'app.register.success';
        noticeTimer = setTimeout(() => {
          notice.value = '';
        }, 5000);
      }
    }
  },
  { immediate: true, flush: 'sync' },
);
onBeforeUnmount(() => {
  clearTimeout(noticeTimer);
  cancelUsernameVerification();
});
async function verifyUsername(account = username.value) {
  cancelUsernameVerification();
  const current = verificationGeneration;
  const value = account.trim();
  if (!value || mode.value === 'password_reset') return;
  const controller = new AbortController();
  verificationController = controller;
  verificationBusy.value = true;
  verificationTimer = setTimeout(() => {
    if (current !== verificationGeneration) return;
    verificationBusy.value = false;
    verificationTimer = undefined;
  }, 5000);
  try {
    if (mode.value === 'register') {
      const result = await request<{ available: boolean }>(
        `/auth/pub/register/username?username=${encodeURIComponent(value)}`,
        { public: true, signal: controller.signal },
      );
      if (current === verificationGeneration) {
        unavailableUsername.value = result.available ? '' : value;
        errors.value.username = result.available ? '' : message('app.register.usernameExists');
      }
    } else {
      const result = await request<{ captcha?: Challenge; captcha_required: boolean }>(
        `/auth/pub/login/verification?username=${encodeURIComponent(value)}`,
        { public: true, signal: controller.signal },
      );
      if (current === verificationGeneration) captcha.value = result.captcha;
    }
  } catch (e) {
    if (current === verificationGeneration) error.value = (e as Error).message;
  } finally {
    if (current === verificationGeneration) {
      clearTimeout(verificationTimer);
      verificationTimer = undefined;
      verificationController = undefined;
      verificationBusy.value = false;
    }
  }
}
async function submit() {
  if (busy.value) return;
  errors.value = {};
  error.value = '';
  const normalizedUsername = trimCredential(username.value);
  const normalizedPassword = trimCredential(password.value);
  const normalizedConfirmation = trimCredential(confirmation.value);
  if (mode.value !== 'password_reset' && !nonempty(normalizedUsername))
    errors.value.username = message('app.validation.username');
  if (
    mode.value === 'register' &&
    unavailableUsername.value &&
    unavailableUsername.value === username.value.trim()
  )
    errors.value.username = message('app.register.usernameExists');
  if (!nonempty(normalizedPassword)) errors.value.password = message('app.validation.password');
  if (mode.value !== 'login' && normalizedConfirmation !== normalizedPassword)
    errors.value.confirmation = message('page.profile.password.passwordMismatch');
  if (mode.value !== 'password_reset' && !captcha.value && !proof.value)
    errors.value.proof = message('app.validation.verification');
  if (captcha.value && !points.value.length)
    errors.value.captcha = message('app.validation.verification');
  if (Object.keys(errors.value).length) {
    await focusFirstInvalid(formElement.value);
    return;
  }
  busy.value = true;
  try {
    if (mode.value === 'register') {
      const available = await request<{ available: boolean }>(
        `/auth/pub/register/username?username=${encodeURIComponent(normalizedUsername)}`,
        { public: true },
      );
      if (!available.available) {
        errors.value.username = message('app.register.usernameExists');
        return;
      }
    }
    const payload =
      mode.value === 'password_reset'
        ? { new_password: normalizedPassword }
        : mode.value === 'register'
          ? {
              username: normalizedUsername,
              password: normalizedPassword,
              slider_proof: proof.value,
            }
          : {
              username: normalizedUsername,
              password: normalizedPassword,
              remember_me: false,
              slider_proof: captcha.value ? undefined : proof.value,
              captcha_id: captcha.value?.captcha_id,
              captcha_points: points.value.length ? points.value : undefined,
            };
    const result = await submitCredentials(mode.value, payload);
    if (mode.value === 'register') {
      setRegistrationLogin(normalizedUsername, normalizedPassword);
      password.value = '';
      confirmation.value = '';
      await router.push('/auth/login');
    } else {
      if (mode.value === 'login' && result.access_token) recordLoginAccount(normalizedUsername);
      acceptSession(result);
      if (result.password_reset_required) {
        await router.replace('/auth/reset-password');
      } else {
        await loadUser();
        const redirect = String(route.query.redirect || '');
        await router.replace(
          redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/auth/')
            ? redirect
            : '/dashboard/overview',
        );
      }
    }
  } catch (e) {
    error.value = (e as Error).message;
    if (e instanceof ApiError && e.data.captcha) {
      captcha.value = e.data.captcha;
      points.value = [];
    }
  } finally {
    busy.value = false;
    slider.value?.reset();
  }
}
</script>
<template>
  <div class="auth-page">
    <section class="auth-panel">
      <h1>
        {{
          mode === 'login'
            ? t('loginTitle')
            : mode === 'register'
              ? t('registerTitle')
              : t('app.resetPassword.title')
        }}
      </h1>
      <p class="lead">
        {{
          mode === 'login'
            ? t('loginHint')
            : mode === 'register'
              ? t('registerHint')
              : t('app.resetPassword.description')
        }}
      </p>
      <form ref="formElement" novalidate @submit.prevent="submit">
        <Field
          v-if="mode !== 'password_reset'"
          name="username"
          :label="t('system.fields.username')"
          :error="errors.username"
          required
          ><LoginAccountInput
            v-if="mode === 'login'"
            v-model="username"
            :loading="verificationBusy"
            @blur="verifyUsername"
            @select="password = ''"
          /><t-input
            v-else
            id="username"
            v-model="username"
            :loading="verificationBusy"
            name="username"
            autocomplete="username"
            :placeholder="t('app.validation.username')"
            @blur="verifyUsername()"
          /> </Field
        ><Field
          name="password"
          :label="
            mode === 'password_reset' ? t('system.fields.newPassword') : t('system.fields.password')
          "
          :error="errors.password"
          required
          ><t-input
            id="password"
            v-model="password"
            name="password"
            type="password"
            autocomplete="new-password"
            :placeholder="t('app.validation.password')" /></Field
        ><Field
          v-if="mode !== 'login'"
          name="confirmation"
          :label="t('page.profile.password.confirmPassword')"
          :error="errors.confirmation"
          required
          ><t-input
            id="confirmation"
            v-model="confirmation"
            name="confirmation"
            type="password"
            autocomplete="new-password"
            :placeholder="t('page.profile.password.confirmPasswordPlaceholder')" /></Field
        ><Field
          v-if="mode !== 'password_reset' && !captcha"
          name="verification"
          :label="t('app.captcha.additional')"
          :error="errors.proof"
          ><ServerSlider
            ref="slider"
            v-model="proof"
            :username="username"
            :password="password"
            :purpose="mode" /></Field
        ><Field
          v-if="captcha"
          name="point-verification"
          :label="t('app.captcha.additional')"
          :error="errors.captcha"
          ><PointCaptcha
            v-model="points"
            :captcha="captcha"
            :username="username"
            @update="captcha = $event"
        /></Field>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <p v-if="notice" class="notice" role="status">{{ t(notice) }}</p>
        <t-button block theme="primary" type="submit" size="large" :loading="busy">{{
          mode === 'login'
            ? t('page.auth.login')
            : mode === 'register'
              ? t('page.auth.register')
              : t('app.resetPassword.submit')
        }}</t-button
        ><RouterLink
          v-if="mode !== 'password_reset'"
          class="auth-link"
          :to="mode === 'login' ? '/auth/register' : '/auth/login'"
          >{{ mode === 'login' ? t('registerLink') : t('loginLink') }}</RouterLink
        ><button v-else type="button" class="auth-link" @click="logout">{{ t('logout') }}</button>
      </form>
    </section>
    <Copyright />
  </div>
</template>
