<script setup lang="ts">
import type { AuthApi, EmailCodeStatus } from '#/api/core/auth';

import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useRouter } from 'vue-router';

import { $placeholder } from '@vben/locales';
import { userCache } from '@vben/utils/cache';

import { useDebounceFn } from '@vueuse/core';
import { Button, Form, InputPassword } from 'ant-design-vue';

import {
  getLoginEmailCodeStatusApi,
  getLoginFailure,
  sendLoginEmailCodeApi,
} from '#/api/core/auth';
import { showRequestErrorToast } from '#/api/request-feedback';
import { $t } from '#/locales';
import { isValidEmailAddress } from '#/security/email-address';
import { emailBrowserUUID, useEmailCode } from '#/security/email-code';
import EmailCodeLabel from '#/security/email-code-label.vue';
import MFALogin from '#/security/mfa-login.vue';
import VerificationCodeInput from '#/security/verification-code-input.vue';
import {
  cancelVerification,
  verificationPrompt,
} from '#/security/verification-prompt';
import { consumeRegistrationLogin, useAuthStore } from '#/store';
import { loadSystemProperties } from '#/store/system-properties';

import LoginAccountInput from './login-account-input.vue';
import LoginPointCaptcha from './login-point-captcha.vue';
import ServerSliderCaptcha from './server-slider-captcha.vue';

defineOptions({ name: 'Login' });
const auth = useAuthStore();
const router = useRouter();
const username = ref('');
const password = ref('');
const code = ref('');
const method = ref<'email_code' | 'password'>('password');
const emailEnabled = ref(false);
const registrationEnabled = ref(false);
const identifierLabel = computed(() => {
  let messageKey = 'system.fields.username';
  if (method.value === 'email_code') {
    messageKey = 'email-auth.email';
  } else if (emailEnabled.value) {
    messageKey = 'email-auth.identifier';
  }
  return $t(messageKey);
});
const identifierHint = computed(() => {
  let selectedMessageKey = 'authentication.usernameTip';
  if (method.value === 'email_code') {
    selectedMessageKey = 'email-auth.emailRequired';
  } else if (emailEnabled.value) {
    selectedMessageKey = 'email-auth.identifierRequired';
  }
  return $t(selectedMessageKey);
});
const identifierValid = computed(() =>
  method.value === 'email_code'
    ? isValidEmailAddress(username.value)
    : !!username.value.trim(),
);
const stage = ref<'code' | 'identifier'>('identifier');
const human = ref(false);
const sliderProof = ref('');
const captchaPoints = ref<AuthApi.CaptchaPoint[]>([]);
const sending = ref(false);
const restoring = ref(false);
const mfaCompleting = ref(false);
const identifierInvalid = ref(false);
const passwordInvalid = ref(false);
const codeInvalid = ref(false);
const codeAttempts = ref(0);
const formError = ref('');
const email = useEmailCode();
const canVerifyCode = computed(
  () => !!email.state.value?.verification_id && !email.expired.value,
);
const codeInput = ref<{ focus: () => void }>();
const busy = computed(
  () => sending.value || auth.loginLoading || restoring.value,
);
const showMFA = computed(
  () => verificationPrompt.value?.mode === 'login' || mfaCompleting.value,
);
let epoch = 0;
let active = false;
let activation = 0;
let hydrating = false;
let autoSubmit: ReturnType<typeof setTimeout> | undefined;
const contextKey = 'email-login';
const loginCache = userCache.anonymous('session');
loginCache.migrate(contextKey, 'cinch-email-login-context');

function saveContext() {
  // Only presentation context is persisted; codes, passwords and proofs stay in memory.
  try {
    if (method.value === 'email_code' && username.value.trim())
      loginCache.set(contextKey, {
        username: username.value.trim(),
        method: method.value,
      });
    else loginCache.removeItem(contextKey);
  } catch {
    /* Optional UI restoration. */
  }
}
function invalidate() {
  epoch += 1;
  clearTimeout(autoSubmit);
  human.value = false;
  sliderProof.value = '';
  captchaPoints.value = [];
  code.value = '';
  codeInvalid.value = false;
  codeAttempts.value = 0;
  formError.value = '';
  sending.value = false;
  restoring.value = false;
}
function leave() {
  active = false;
  activation++;
  invalidate();
  password.value = '';
  username.value = '';
  if (verificationPrompt.value?.mode === 'login') cancelVerification();
  mfaCompleting.value = false;
}
onBeforeUnmount(leave);
onDeactivated(leave);
onMounted(activate);
onActivated(activate);

async function activate() {
  if (active) return;
  active = true;
  const current = ++activation;
  emailEnabled.value = false;
  registrationEnabled.value = false;
  method.value = 'password';
  stage.value = 'identifier';
  email.reset();
  hydrating = true;
  mfaCompleting.value = false;
  const registration = consumeRegistrationLogin();
  if (registration) username.value = registration.username;
  await nextTick();
  if (current !== activation) return;
  if (registration) password.value = registration.password;
  hydrating = false;
  const initialEpoch = epoch;
  const properties = await loadSystemProperties();
  if (current !== activation) return;
  emailEnabled.value = properties?.email_enabled === true;
  registrationEnabled.value = properties?.registration_enabled === true;
  if (!emailEnabled.value || registration) {
    saveContext();
    return;
  }
  if (
    initialEpoch !== epoch ||
    username.value ||
    password.value ||
    human.value ||
    busy.value
  )
    return;
  let saved;
  try {
    saved = loginCache.get<{ method: string; username: string }>(contextKey);
  } catch {
    return;
  }
  if (
    saved?.method !== 'email_code' ||
    typeof saved.username !== 'string' ||
    !saved.username.trim()
  )
    return;
  hydrating = true;
  username.value = saved.username;
  method.value = 'email_code';
  await nextTick();
  if (current !== activation) return;
  hydrating = false;
  await restoreCode();
}

function restoreCodeStage(status: EmailCodeStatus) {
  email.accept(status);
  if (
    identifierValid.value &&
    (canVerifyCode.value || email.remaining.value > 0)
  )
    stage.value = 'code';
}

async function restoreCode(minimumRetryAt = 0) {
  if (
    !active ||
    human.value ||
    sending.value ||
    auth.loginLoading ||
    (username.value.trim() !== '' && !identifierValid.value) ||
    method.value !== 'email_code'
  )
    return;
  const request = ++epoch;
  restoring.value = true;
  try {
    const status = await getLoginEmailCodeStatusApi(
      emailBrowserUUID(),
      username.value.trim(),
    );
    if (!active || request !== epoch) return;
    restoreCodeStage({
      ...status,
      retry_at: Math.max(status.retry_at, minimumRetryAt),
    });
  } catch (error) {
    if (active && request === epoch) {
      showRequestErrorToast(error);
    }
  } finally {
    if (request === epoch) restoring.value = false;
  }
}
const lookup = useDebounceFn(async () => {
  if (
    !active ||
    human.value ||
    sending.value ||
    auth.loginLoading ||
    !identifierValid.value
  )
    return;
  const request = epoch;
  const status = await auth.checkLoginVerification(
    username.value,
    method.value === 'email_code' ? emailBrowserUUID() : undefined,
  );
  if (!active || request !== epoch || human.value || sending.value) return;
  if (method.value === 'email_code') {
    if (status) restoreCodeStage(status);
    else await restoreCode();
  }
}, 300);
watch(username, () => {
  invalidate();
  password.value = '';
  identifierInvalid.value = false;
  passwordInvalid.value = false;
  email.clearVerification();
  stage.value = 'identifier';
  auth.resetLoginVerification();
  if (!hydrating) {
    saveContext();
    void lookup();
  }
});
watch(password, () => {
  passwordInvalid.value = false;
});
watch(
  () => verificationPrompt.value?.mode,
  (mode, previous) => {
    if (mode === 'login') {
      code.value = '';
    } else if (previous === 'login') {
      password.value = '';
      if (!mfaCompleting.value) {
        invalidate();
        stage.value = 'identifier';
        email.reset();
      }
    }
  },
);
watch(
  () => auth.loginLoading,
  (loading) => {
    if (!loading) mfaCompleting.value = false;
  },
);

async function switchMethod() {
  if (!emailEnabled.value || auth.loginLoading) return;
  invalidate();
  password.value = '';
  method.value = method.value === 'password' ? 'email_code' : 'password';
  identifierInvalid.value = false;
  passwordInvalid.value = false;
  stage.value = 'identifier';
  saveContext();
  if (method.value === 'email_code') await restoreCode();
}
function editIdentifier() {
  invalidate();
  stage.value = 'identifier';
  email.reset();
}
async function beginAction() {
  if (busy.value) return;
  identifierInvalid.value = !identifierValid.value;
  passwordInvalid.value = method.value === 'password' && !password.value.trim();
  if (identifierInvalid.value || passwordInvalid.value) return;
  if (method.value === 'email_code' && stage.value === 'code')
    return submitCode();
  if (method.value === 'email_code' && email.remaining.value > 0)
    return restoreCode(email.state.value?.retry_at);
  formError.value = '';
  human.value = true;
  sliderProof.value = '';
  captchaPoints.value = [];
  await auth.checkLoginVerification(username.value.trim());
}
async function resend() {
  if (busy.value || email.remaining.value > 0) return;
  if (!identifierValid.value) {
    identifierInvalid.value = true;
    editIdentifier();
    return;
  }
  code.value = '';
  codeInvalid.value = false;
  codeAttempts.value = 0;
  human.value = true;
  sliderProof.value = '';
  captchaPoints.value = [];
  await auth.checkLoginVerification(username.value.trim());
}
watch(sliderProof, (proof) => {
  if (proof && human.value && !auth.loginCaptcha) void afterHuman();
});
watch(captchaPoints, (points) => {
  if (
    human.value &&
    points.length > 0 &&
    points.length === auth.loginCaptcha?.target_count
  )
    void afterHuman();
});
async function afterHuman() {
  if (busy.value || !active || !human.value) return;
  if (!identifierValid.value) {
    identifierInvalid.value = true;
    editIdentifier();
    return;
  }
  const request = ++epoch;
  if (method.value === 'password') {
    await auth.authLogin({
      username: username.value.trim(),
      password: password.value,
      sliderProof: sliderProof.value,
      captchaPoints: captchaPoints.value,
    });
    if (!active || request !== epoch) return;
    human.value = false;
    sliderProof.value = '';
    captchaPoints.value = [];
    if (auth.loginFailureMessage) {
      password.value = '';
      passwordInvalid.value = true;
      formError.value = auth.loginFailureMessage;
    }
    return;
  }
  sending.value = true;
  try {
    const status = await sendLoginEmailCodeApi({
      browser_uuid: emailBrowserUUID(),
      username: username.value.trim(),
      slider_proof: auth.loginCaptcha ? undefined : sliderProof.value,
      captcha_id: auth.loginCaptcha?.captcha_id,
      captcha_points: auth.loginCaptcha ? captchaPoints.value : undefined,
    });
    if (!active || request !== epoch) return;
    email.accept(status);
    stage.value = 'code';
    human.value = false;
    saveContext();
    await nextTick();
    codeInput.value?.focus();
  } catch (error) {
    if (!active || request !== epoch) return;
    if (email.acceptError(error)) {
      human.value = false;
      formError.value = '';
      stage.value = 'code';
      if (!canVerifyCode.value) {
        // A simultaneous send can start the cooldown before it returns a ticket.
        sending.value = false;
        await restoreCode(email.state.value?.retry_at);
      }
      return;
    }
    const failure = getLoginFailure(error);
    if (failure?.error_code === 'AUTH_EMAIL_ADDRESS_INVALID') {
      identifierInvalid.value = true;
      editIdentifier();
      return;
    }
    if (auth.acceptLoginCaptcha(failure, username.value.trim())) {
      human.value = true;
      sliderProof.value = '';
      captchaPoints.value = [];
      formError.value = '';
      return;
    }
    human.value = false;
    showRequestErrorToast(error);
  } finally {
    if (request === epoch) sending.value = false;
  }
}
function updateCode(value: string) {
  code.value = value;
  codeInvalid.value = false;
  codeAttempts.value = 0;
  formError.value = '';
  clearTimeout(autoSubmit);
  if (value.length === 6) {
    const request = epoch;
    autoSubmit = setTimeout(() => {
      if (active && request === epoch && !human.value) void submitCode();
    }, 100);
  }
}
async function submitCode() {
  clearTimeout(autoSubmit);
  const verificationID = email.state.value?.verification_id;
  if (busy.value || human.value || email.expired.value || !verificationID)
    return;
  if (!/^\d{6}$/.test(code.value)) {
    codeInvalid.value = true;
    codeAttempts.value++;
    return;
  }
  const request = epoch;
  await auth.authLogin({
    method: 'email_code',
    username: username.value.trim(),
    browser_uuid: emailBrowserUUID(),
    verification_id: verificationID,
    verification_code: code.value,
  });
  if (!active || request !== epoch) return;
  if (auth.loginFailureMessage) {
    codeInvalid.value = true;
    codeAttempts.value++;
    formError.value =
      auth.loginFailureCode === 'AUTH_EMAIL_CODE_INVALID'
        ? ''
        : auth.loginFailureMessage;
  }
}
</script>

<template>
  <div class="login-flow">
    <MFALogin
      v-if="showMFA"
      :completing="mfaCompleting"
      :identifier="username.trim()"
      :login-password="method === 'password' ? password : undefined"
      @expired="password = ''"
      :email-login="method === 'email_code'"
      @verified="mfaCompleting = true"
    />
    <section v-else class="email-auth-page" aria-labelledby="login-title">
      <h1 id="login-title">{{ $t('app.journey.title') }} 👋🏻</h1>
      <Form layout="vertical" novalidate @submit.prevent="beginAction">
        <template v-if="stage === 'identifier'">
          <Form.Item
            :label="identifierLabel"
            html-for="login-identifier"
            :validate-status="identifierInvalid ? 'error' : undefined"
          >
            <LoginAccountInput
              id="login-identifier"
              name="username"
              :aria-label="identifierLabel"
              v-model="username"
              :disabled="busy"
              :aria-invalid="identifierInvalid"
              :aria-describedby="
                identifierInvalid ? 'login-identifier-error' : undefined
              "
              :placeholder="
                method === 'email_code'
                  ? 'name@example.com'
                  : $placeholder(
                      emailEnabled
                        ? 'email-auth.identifierPlaceholder'
                        : 'authentication.usernameTip',
                    )
              "
              @blur="identifierInvalid = !!username.trim() && !identifierValid"
              @select="password = ''"
            />
            <span
              v-if="identifierInvalid && method === 'email_code'"
              id="login-identifier-error"
              class="sr-only"
              role="alert"
              >{{ identifierHint }}</span
            >
            <template v-if="identifierInvalid && method === 'password'" #help>
              <span id="login-identifier-error">{{ identifierHint }}</span>
            </template>
          </Form.Item>
          <Form.Item
            v-if="method === 'password'"
            :label="$t('authentication.password')"
            html-for="login-password"
            :validate-status="passwordInvalid ? 'error' : undefined"
          >
            <InputPassword
              id="login-password"
              name="password"
              v-model:value="password"
              autocomplete="current-password"
              :aria-invalid="passwordInvalid"
              :aria-describedby="
                passwordInvalid && !formError
                  ? 'login-password-error'
                  : undefined
              "
              :disabled="busy"
              :placeholder="$placeholder('authentication.password')"
            />
            <template v-if="passwordInvalid && !formError" #help>
              <span id="login-password-error">{{
                $t('authentication.passwordTip')
              }}</span>
            </template>
          </Form.Item>
        </template>
        <template v-else>
          <EmailCodeLabel
            input-id="login-email-code"
            :account="username"
            @change="editIdentifier"
          />
          <VerificationCodeInput
            id="login-email-code"
            :described-by="codeInvalid ? 'login-email-code-error' : undefined"
            ref="codeInput"
            :model-value="code"
            :label="$t('email-auth.code')"
            :feedback="codeInvalid ? 'failure' : 'idle'"
            :animation="codeInvalid ? 'failure' : 'idle'"
            :animation-attempt="codeAttempts"
            :disabled="busy || human || !canVerifyCode"
            autofocus
            @update:model-value="updateCode"
          />
        </template>
        <div v-if="human" class="email-auth-human">
          <LoginPointCaptcha
            v-if="auth.loginCaptcha"
            auto-open
            v-model="captchaPoints"
            :captcha="auth.loginCaptcha"
            :on-refresh="auth.refreshLoginCaptcha"
            :on-verify="auth.verifyLoginCaptcha"
          />
          <ServerSliderCaptcha
            v-else
            :key="`${method}:${username}`"
            v-model="sliderProof"
            :purpose="method === 'email_code' ? 'email_login' : 'login'"
            :username="username.trim()"
          />
        </div>
        <template v-else>
          <div v-if="stage === 'code'" class="email-auth-resend">
            <Button
              type="link"
              :disabled="busy || email.remaining.value > 0"
              @click="resend"
              >{{
                email.remaining.value
                  ? $t('email-auth.countdown', {
                      seconds: email.remaining.value,
                    })
                  : $t(
                      email.state.value?.verification_id
                        ? 'email-auth.resend'
                        : 'email-auth.send',
                    )
              }}</Button
            >
          </div>
          <Button
            type="primary"
            html-type="submit"
            block
            class="email-auth-primary"
            :loading="busy"
            :disabled="stage === 'code' && !canVerifyCode"
          >
            {{
              stage === 'code'
                ? $t('email-auth.continue')
                : method === 'password'
                  ? $t('common.login')
                  : $t('email-auth.send')
            }}
          </Button>
        </template>
        <Transition name="login-feedback">
          <div
            v-if="formError && !(stage === 'code' && codeInvalid)"
            class="login-request-feedback"
          >
            <div>
              <p role="alert">{{ formError }}</p>
            </div>
          </div>
        </Transition>
        <p
          v-if="stage === 'code' && codeInvalid"
          id="login-email-code-error"
          class="sr-only"
          role="alert"
        >
          {{
            formError ||
            $t(
              code.length === 6
                ? 'verification.errors.invalidCode'
                : 'verification.codeRequired',
            )
          }}
        </p>
        <Button
          v-if="emailEnabled"
          type="link"
          block
          class="email-auth-switch"
          :disabled="auth.loginLoading"
          @click="switchMethod"
          >{{
            $t(
              method === 'password'
                ? 'email-auth.useCode'
                : 'email-auth.usePassword',
            )
          }}</Button
        >
      </Form>
      <div
        v-if="registrationEnabled && stage === 'identifier'"
        class="mt-[22px] flex min-h-8 items-center justify-center gap-1 text-sm"
      >
        {{ $t('authentication.accountTip') }}
        <button
          type="button"
          class="vben-link text-sm font-normal"
          @click="
            router.push({
              path: '/auth/register',
              query: router.currentRoute.value.query,
            })
          "
        >
          {{ $t('authentication.createAccount') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.email-auth-page {
  width: 100%;
  max-width: 448px;
  margin: 0 auto;
}

h1 {
  margin: 0 0 34px;
  font-size: 30px;
  font-weight: 650;
  line-height: 1.4;
  letter-spacing: -0.5px;
}

.email-auth-page :deep(.ant-input-affix-wrapper),
.email-auth-page :deep(.ant-select-selector) {
  min-height: 44px;
}

.email-auth-page :deep(.ant-form-item) {
  margin-bottom: 24px;
}

/* Let Ant Form's collapse motion add real height instead of consuming the field gap. */
.email-auth-page :deep(.ant-form-item-explain-connected + div),
.email-auth-page :deep(.ant-form-margin-offset) {
  display: none;
}

.login-request-feedback {
  display: grid;
  grid-template-rows: 1fr;
  font-size: 12px;
  line-height: 20px;
  color: hsl(var(--destructive));
  overflow-wrap: anywhere;
  opacity: 1;
}

.login-request-feedback > div {
  min-height: 0;
  overflow: hidden;
}

.login-request-feedback p {
  margin: 10px 0 0;
}

.login-feedback-enter-active,
.login-feedback-leave-active {
  transition:
    grid-template-rows 200ms ease,
    opacity 200ms ease;
}

.login-feedback-enter-from,
.login-feedback-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .login-feedback-enter-active,
  .login-feedback-leave-active {
    transition: none;
  }
}

.email-auth-primary {
  height: 44px;
  margin-top: 0;
}

.email-auth-human {
  margin: 24px 0 0;
}

.email-auth-resend {
  display: flex;
  justify-content: flex-end;
  margin: 14px 0 24px;
}

.email-auth-resend :deep(.ant-btn) {
  padding: 0;
}

.email-auth-switch {
  margin-top: 16px;
  font-size: 13px;
}
</style>
