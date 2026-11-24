<script setup lang="ts">
import type { TOTPEnrollment } from '#/api/core/auth';

import { onBeforeUnmount, ref, useId, watch } from 'vue';

import { Check, ChevronDown, Copy } from '@vben/icons';

import { useClipboard } from '@vueuse/core';
import {
  Alert,
  Button,
  ConfigProvider,
  Form,
  Input,
  QRCode,
  theme,
} from 'ant-design-vue';

import { $t } from '#/locales';

import { useTOTPEnrollment } from './use-totp-enrollment';
import VerificationCodeInput from './verification-code-input.vue';
import {
  useVerificationTip,
  verificationModalTipTheme,
} from './verification-tip';

const props = defineProps<{
  mandatory?: boolean;
  inline?: boolean;
  completing?: boolean;
}>();
const emit = defineEmits<{
  complete: [result: TOTPEnrollment];
  cancel: [];
  busy: [value: boolean];
  stage: [value: 'password' | 'recovery' | 'scan'];
}>();
const { token } = theme.useToken();
const inputErrorId = useId();
const { copy, copied } = useClipboard({ legacy: true });
const { copy: copySecretValue, copied: secretCopied } = useClipboard({
  legacy: true,
});
const { showCopyFailure, showFailure, TipHolder } = useVerificationTip();
const manualOpen = ref(false);
const {
  busy,
  code,
  codeFailures,
  error,
  initializationFailed,
  initialize,
  loadingSetup,
  needsPassword,
  operationBusy,
  password,
  showPasswordStep,
  refreshSetup,
  result,
  setup,
  setupFailed,
  setupExpired,
  setupLoading,
  showSetup,
  stage,
  submit,
} = useTOTPEnrollment(props, showFailure);
watch(operationBusy, (value) => emit('busy', value), { immediate: true });
watch(stage, (value) => emit('stage', value), { immediate: true });
let active = true;
onBeforeUnmount(() => {
  active = false;
  emit('busy', false);
});
async function copySetupSecret() {
  if (!setup.value || setupExpired.value || loadingSetup.value) return;
  try {
    await copySecretValue(setup.value.secret);
  } catch {
    if (active) showCopyFailure();
  }
}
async function copyRecoveryCodes() {
  if (!result.value) return;
  try {
    await copy(result.value.recovery_codes.join('\n'));
  } catch {
    if (active) showCopyFailure();
  }
}
</script>

<template>
  <div
    class="totp-enrollment"
    :style="{
      '--totp-bg-container': token.colorBgContainer,
      '--totp-border-secondary': token.colorBorderSecondary,
      '--totp-fill-quaternary': token.colorFillQuaternary,
      '--totp-text': token.colorText,
    }"
    :class="{
      'totp-onboarding': mandatory,
      'totp-personal': !mandatory,
      'totp-inline': inline,
      'is-loading': loadingSetup,
    }"
    :aria-busy="loadingSetup"
    data-testid="totp-enrollment"
  >
    <ConfigProvider :theme="verificationModalTipTheme">
      <TipHolder />
    </ConfigProvider>
    <ol
      v-if="mandatory"
      class="totp-steps"
      :aria-label="$t('verification.setupProgress')"
    >
      <li
        v-if="showPasswordStep"
        class="totp-step"
        :class="needsPassword ? 'is-current' : 'is-complete'"
        :aria-current="needsPassword ? 'step' : undefined"
      >
        <span class="totp-step-icon totp-skeleton"
          ><span v-if="needsPassword">1</span><Check v-else aria-hidden="true"
        /></span>
        <span class="totp-step-label totp-skeleton">{{
          $t('verification.loginPasswordStep')
        }}</span>
      </li>
      <li
        class="totp-step"
        :class="{
          'is-complete': result,
          'is-current': !result && !needsPassword,
        }"
        :aria-current="!result && !needsPassword ? 'step' : undefined"
      >
        <span class="totp-step-icon totp-skeleton"
          ><Check v-if="result" aria-hidden="true" /><span v-else>{{
            showPasswordStep ? 2 : 1
          }}</span></span
        >
        <span class="totp-step-label totp-skeleton">{{
          $t('verification.enrollmentStep')
        }}</span>
      </li>
      <li
        class="totp-step"
        :class="{ 'is-current': result }"
        :aria-current="result ? 'step' : undefined"
      >
        <span class="totp-step-icon totp-skeleton"
          ><span>{{ showPasswordStep ? 3 : 2 }}</span></span
        >
        <span class="totp-step-label totp-skeleton">{{
          $t('verification.recoveryStep')
        }}</span>
      </li>
    </ol>
    <header v-if="mandatory" class="totp-heading">
      <h1 class="totp-skeleton">
        {{
          $t(result ? 'verification.recoveryTitle' : 'verification.enrollTitle')
        }}
      </h1>
    </header>
    <section v-if="result" class="totp-recovery">
      <div class="totp-recovery-body">
        <Alert
          :description="$t('verification.recoveryHelp')"
          type="warning"
          show-icon
        />
        <ul class="totp-recovery-codes" data-testid="totp-recovery-codes">
          <li v-for="recovery in result.recovery_codes" :key="recovery">
            {{ recovery }}
          </li>
        </ul>
        <Button
          v-if="!inline"
          block
          class="totp-copy"
          @click="copyRecoveryCodes"
        >
          <span class="totp-button-content"
            ><Check v-if="copied" aria-hidden="true" /><Copy
              v-else
              aria-hidden="true"
            />{{
              $t(copied ? 'verification.copied' : 'verification.copyRecovery')
            }}</span
          >
        </Button>
      </div>
      <footer class="totp-recovery-footer">
        <Button
          type="primary"
          :block="mandatory"
          class="totp-primary"
          data-testid="totp-save-recovery"
          :loading="completing"
          @click="emit('complete', result)"
        >
          {{
            $t(inline ? 'profile-center.recoverySaved' : 'verification.saved')
          }}
        </Button>
        <Button
          v-if="inline"
          class="totp-copy-inline"
          :disabled="completing"
          @click="copyRecoveryCodes"
        >
          <span class="totp-button-content"
            ><Check v-if="copied" aria-hidden="true" /><Copy
              v-else
              aria-hidden="true"
            />{{
              $t(copied ? 'verification.copied' : 'verification.copyRecovery')
            }}</span
          >
        </Button>
      </footer>
    </section>
    <Form v-else layout="vertical" @submit.prevent="submit">
      <span v-if="loadingSetup" class="sr-only" role="status">{{
        $t('verification.loadingSetup')
      }}</span>
      <div class="totp-form-body" :class="{ 'has-setup': showSetup }">
        <div v-if="showSetup" class="totp-scan">
          <p v-if="!mandatory" class="totp-scan-label totp-skeleton">
            {{ $t('verification.scanCode') }}
          </p>
          <div
            class="totp-qr-frame totp-skeleton"
            :aria-hidden="loadingSetup || undefined"
          >
            <QRCode
              v-if="setup && !setupFailed"
              :value="setup.uri"
              :size="184"
              :color="token.colorText"
              :bg-color="token.colorBgContainer"
              :bordered="false"
              :status="setupExpired ? 'expired' : 'active'"
              @refresh="refreshSetup"
            />
            <div v-else class="totp-qr-placeholder" aria-hidden="true"></div>
            <div v-if="setupFailed && !loadingSetup" class="totp-qr-failure">
              <Button
                size="small"
                @click="initializationFailed ? initialize() : refreshSetup()"
              >
                {{ $t('verification.retry') }}
              </Button>
            </div>
          </div>
          <button
            type="button"
            class="totp-manual-toggle totp-skeleton"
            :aria-expanded="manualOpen"
            :disabled="loadingSetup"
            @click="manualOpen = !manualOpen"
          >
            <span>{{ $t('verification.manualSetup') }}</span>
            <span class="totp-inline-icon" :class="{ 'is-open': manualOpen }"
              ><ChevronDown aria-hidden="true"
            /></span>
          </button>
          <div v-if="manualOpen" class="totp-manual-content">
            <div
              class="totp-secret-row totp-skeleton"
              :aria-hidden="loadingSetup || undefined"
            >
              <code data-testid="totp-secret">{{
                setup?.secret || '\u00a0'
              }}</code>
              <Button
                type="text"
                size="small"
                class="totp-secret-copy"
                data-testid="totp-copy-secret"
                :aria-label="
                  $t(
                    secretCopied
                      ? 'verification.copied'
                      : 'verification.copySecret',
                  )
                "
                :title="
                  $t(
                    secretCopied
                      ? 'verification.copied'
                      : 'verification.copySecret',
                  )
                "
                :disabled="loadingSetup || setupExpired || !setup"
                @click="copySetupSecret"
              >
                <Check v-if="secretCopied" aria-hidden="true" /><Copy
                  v-else
                  aria-hidden="true"
                />
              </Button>
            </div>
            <span class="sr-only" aria-live="polite">{{
              secretCopied && !loadingSetup ? $t('verification.copied') : ''
            }}</span>
          </div>
        </div>
        <div class="totp-verification">
          <Form.Item
            class="verification-code-field"
            :validate-status="error ? 'error' : undefined"
          >
            <template #label>
              <span class="totp-field-label totp-skeleton">{{
                $t(
                  needsPassword ? 'verification.password' : 'verification.code',
                )
              }}</span>
            </template>
            <div class="totp-field-control totp-skeleton">
              <Input.Password
                v-if="needsPassword"
                v-model:value="password"
                class="totp-password-input"
                name="totp_password"
                :aria-label="$t('verification.password')"
                :aria-invalid="!!error"
                :aria-describedby="error ? inputErrorId : undefined"
                autocomplete="current-password"
                :disabled="busy"
              />
              <VerificationCodeInput
                v-else
                v-model="code"
                name="totp_code"
                :described-by="codeFailures || error ? inputErrorId : undefined"
                :label="$t('verification.code')"
                :feedback="codeFailures || error ? 'failure' : 'idle'"
                :animation="codeFailures ? 'failure' : 'idle'"
                :animation-attempt="codeFailures"
                :disabled="busy || loadingSetup || setupExpired || !setup"
              />
            </div>
          </Form.Item>
          <p
            v-if="error || (!needsPassword && codeFailures)"
            :id="inputErrorId"
            class="sr-only"
            role="alert"
          >
            {{
              error ||
              $t(
                code.length === 6
                  ? 'verification.errors.invalidCode'
                  : 'verification.codeRequired',
              )
            }}
          </p>
        </div>
      </div>
      <footer class="totp-form-footer">
        <Button
          v-if="!mandatory"
          class="totp-cancel"
          :disabled="operationBusy"
          @click="emit('cancel')"
        >
          {{ $t('common.cancel') }}
        </Button>
        <div class="totp-primary-shell totp-skeleton">
          <Button
            type="primary"
            html-type="submit"
            :block="mandatory"
            class="totp-primary"
            :loading="busy && !setupLoading"
            :disabled="
              loadingSetup ||
              initializationFailed ||
              (setupExpired && !needsPassword)
            "
          >
            {{
              $t(
                setup && !needsPassword
                  ? 'verification.confirmBinding'
                  : inline
                    ? 'profile-center.next'
                    : mandatory
                      ? 'verification.beginBinding'
                      : 'verification.getBindingQR',
              )
            }}
          </Button>
        </div>
      </footer>
    </Form>
  </div>
</template>

<style scoped>
.totp-enrollment {
  color: hsl(var(--foreground));
}

.totp-steps {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 0;
  margin: 0 0 30px;
  list-style: none;
}

.totp-step {
  display: flex;
  flex: 1;
  gap: 7px;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  color: hsl(var(--muted-foreground));
}

.totp-step:not(:last-child)::after {
  flex: 1;
  min-width: 8px;
  height: 1px;
  margin-left: 3px;
  content: '';
  background: hsl(var(--border));
}

.totp-step:last-child {
  flex: 0 0 auto;
}

.totp-step > span:last-child {
  white-space: nowrap;
}

.totp-step-icon {
  display: inline-flex;
  flex: 0 0 22px;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  background: hsl(var(--muted));
  border-radius: 50%;
}

.totp-step-icon > span {
  display: block;
  line-height: 1;
}

.totp-step-icon :deep(svg) {
  display: block;
  flex: none;
  width: 13px;
  height: 13px;
}

.totp-step.is-current {
  color: hsl(var(--primary));
}

.is-current .totp-step-icon {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary));
}

.totp-step.is-complete {
  color: hsl(var(--foreground));
}

.is-complete .totp-step-icon {
  color: hsl(var(--success));
  background: hsl(var(--success) / 15%);
}

.totp-heading {
  margin-bottom: 24px;
}

.totp-heading h1 {
  margin: 0 0 10px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.4px;
}

.totp-scan {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  margin: 0 0 27px;
}

.totp-qr-frame {
  position: relative;
  flex: none;
  width: 194px;
  height: 194px;
  padding: 4px;
  background: var(--totp-bg-container);
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.totp-manual-toggle {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  padding: 5px 0;
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  color: hsl(var(--primary));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.totp-inline-icon {
  display: inline-flex;
  flex: 0 0 14px;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  line-height: 1;
}

.totp-inline-icon :deep(svg) {
  display: block;
  width: 14px;
  height: 14px;
}

.totp-inline-icon.is-open {
  transform: rotate(180deg);
}

.totp-manual-content {
  width: 100%;
  text-align: left;
}

.totp-manual-content p {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.7;
  color: hsl(var(--muted-foreground));
}

.totp-secret-row {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 8px 8px 12px;
  background: hsl(var(--muted) / 45%);
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
}

.totp-secret-row code {
  display: block;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.8;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
  user-select: text;
}

.totp-secret-copy {
  display: inline-flex;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  color: hsl(var(--muted-foreground));
}

.totp-secret-copy :deep(svg) {
  display: block;
  flex: none;
  width: 16px;
  height: 16px;
}

.verification-code-field {
  margin-bottom: 20px;
}

.totp-primary {
  height: 44px;
}

.totp-recovery-body {
  display: grid;
  gap: 16px;
}

.totp-recovery-footer {
  margin-top: 16px;
}

.totp-recovery-codes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  padding: 1px;
  margin: 0;
  overflow: hidden;
  list-style: none;
  background: hsl(var(--border));
  border-radius: var(--radius);
}

.totp-recovery-codes li {
  min-width: 0;
  padding: 12px 10px;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  line-height: 1.8;
  color: var(--totp-text);
  text-align: center;
  overflow-wrap: anywhere;
  user-select: text;
  background: var(--totp-fill-quaternary);
}

.totp-recovery-codes li:nth-child(4n + 3),
.totp-recovery-codes li:nth-child(4n + 4) {
  background: var(--totp-bg-container);
}

.totp-copy {
  height: 38px;
}

.totp-onboarding .totp-copy {
  height: 44px;
}

.totp-button-content {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  line-height: 1.5;
}

.totp-button-content :deep(svg) {
  display: block;
  flex: none;
  width: 14px;
  height: 14px;
}

/* The skeleton masks the final DOM slots rather than replacing the form.
   Keeping the same boxes also preserves the centered page's vertical position. */
.totp-step-label,
.totp-field-label {
  display: inline-block;
}

.totp-password-input {
  height: 49px;
}

.totp-field-control,
.totp-primary-shell {
  border-radius: calc(var(--radius) * 0.75);
}

.totp-qr-placeholder {
  width: 184px;
  height: 184px;
}

.totp-qr-failure {
  position: absolute;
  inset: 4px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  text-align: center;
  background: var(--totp-bg-container);
  border-radius: max(0px, calc(var(--radius) - 4px));
}

.is-loading .totp-skeleton {
  position: relative;
  visibility: hidden;
  pointer-events: none;
}

.is-loading .totp-skeleton::after {
  position: absolute;
  inset: 0;
  visibility: visible;
  content: '';
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--muted-foreground) / 16%) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
  border-radius: inherit;
  animation: totp-skeleton-wave 1.4s ease-in-out infinite;
}

.is-loading .totp-heading .totp-skeleton::after {
  border-radius: calc(var(--radius) * 0.625);
}

@keyframes totp-skeleton-wave {
  from {
    background-position: 200% 0;
  }

  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-loading .totp-skeleton::after {
    animation: none;
  }
}

.totp-personal .totp-form-body,
.totp-personal .totp-recovery-body {
  padding: 28px;
}

.totp-personal .totp-form-body.has-setup {
  display: grid;
  grid-template-columns: 234px minmax(0, 1fr);
  gap: 32px;
}

.totp-personal .totp-scan {
  min-width: 0;
  padding-right: 28px;
  margin: 0;
  border-right: 1px solid var(--totp-border-secondary);
}

.totp-scan-label {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}

.totp-personal .totp-verification {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.totp-personal .verification-code-field {
  margin-bottom: 0;
}

.totp-personal .totp-form-footer,
.totp-personal .totp-recovery-footer {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  padding: 18px 28px;
  margin: 0;
  border-top: 1px solid var(--totp-border-secondary);
}

.totp-personal .totp-primary,
.totp-personal .totp-cancel {
  height: 36px;
  padding-inline: 18px;
}

.totp-personal .totp-primary {
  min-width: 98px;
}

.totp-personal .totp-password-input {
  height: 42px;
}

.totp-personal .totp-recovery-codes {
  background: var(--totp-border-secondary);
}

@media (max-width: 640px) {
  .totp-personal .totp-form-body.has-setup {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }

  .totp-personal .totp-scan {
    padding-right: 0;
    border-right: 0;
  }

  .totp-personal .totp-form-body,
  .totp-personal .totp-recovery-body {
    padding: 24px;
  }

  .totp-personal .totp-form-footer,
  .totp-personal .totp-recovery-footer {
    padding-inline: 24px;
  }
}

.totp-inline.totp-personal .totp-form-body,
.totp-inline.totp-personal .totp-recovery-body {
  padding: 0;
}

.totp-inline.totp-personal .totp-form-body.has-setup {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.totp-inline.totp-personal .totp-scan {
  padding: 0;
  border: 0;
}

.totp-inline.totp-personal .totp-form-footer,
.totp-inline.totp-personal .totp-recovery-footer {
  justify-content: flex-start;
  padding: 20px 0 0;
  border: 0;
}

.totp-inline .totp-primary-shell {
  order: -1;
}

.totp-inline .totp-cancel {
  color: hsl(var(--primary));
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.totp-inline.totp-personal .totp-password-input {
  height: 40px;
}

.totp-inline.totp-personal .totp-recovery-footer {
  flex-wrap: wrap;
  gap: 12px;
}

.totp-inline .totp-copy-inline {
  height: 36px;
  padding-inline: 16px;
}
</style>
