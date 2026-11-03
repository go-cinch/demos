<script setup lang="ts">
import type { MFAEnrollment } from '#/api/core/auth';

import { onBeforeUnmount, ref, watch } from 'vue';

import { Check, ChevronDown, Copy } from '@vben/icons';

import { useClipboard } from '@vueuse/core';
import { Alert, Button, Form, Input, QRCode, theme } from 'ant-design-vue';

import { $t } from '#/locales';

import MFACodeInput from './mfa-code-input.vue';
import { useMFAError } from './mfa-error';
import { useMFAEnrollment } from './use-mfa-enrollment';

const props = defineProps<{
  mandatory?: boolean;
  completing?: boolean;
  completionError?: string;
}>();
const emit = defineEmits<{
  complete: [result: MFAEnrollment];
  cancel: [];
  busy: [value: boolean];
  stage: [value: 'password' | 'recovery' | 'scan'];
}>();
const { token } = theme.useToken();
const { copy, copied } = useClipboard({ legacy: true });
const { copy: copySecretValue, copied: secretCopied } = useClipboard({
  legacy: true,
});
const secretFailure = useMFAError('mfa.copySecretFailed');
const recoveryFailure = useMFAError('mfa.copyFailed');
const secretCopyError = secretFailure.message;
const copyError = recoveryFailure.message;
const manualOpen = ref(false);
const {
  busy,
  code,
  error,
  initializationFailed,
  initialize,
  loadingSetup,
  needsPassword,
  operationBusy,
  password,
  phase,
  refreshSetup,
  result,
  setup,
  setupError,
  setupExpired,
  setupLoading,
  showSetup,
  stage,
  submit,
} = useMFAEnrollment(props);
watch(operationBusy, (value) => emit('busy', value), { immediate: true });
watch(stage, (value) => emit('stage', value), { immediate: true });
watch([phase, setupExpired], secretFailure.clear);
let active = true;
onBeforeUnmount(() => {
  active = false;
  emit('busy', false);
});
async function copySetupSecret() {
  if (!setup.value || setupExpired.value || loadingSetup.value) return;
  secretFailure.clear();
  try {
    await copySecretValue(setup.value.secret);
  } catch {
    if (active) secretFailure.setKey();
  }
}
async function copyRecoveryCodes() {
  if (!result.value) return;
  recoveryFailure.clear();
  try {
    await copy(result.value.recovery_codes.join('\n'));
  } catch {
    if (active) recoveryFailure.setKey();
  }
}
</script>

<template>
  <div
    class="mfa-enrollment"
    :class="{
      'mfa-onboarding': mandatory,
      'mfa-personal': !mandatory,
      'is-loading': loadingSetup,
    }"
    :aria-busy="loadingSetup"
    data-testid="mfa-enrollment"
  >
    <ol
      v-if="mandatory"
      class="mfa-steps"
      :aria-label="$t('mfa.setupProgress')"
    >
      <li class="mfa-step is-complete">
        <span class="mfa-step-icon mfa-skeleton"><Check aria-hidden="true" /></span>
        <span class="mfa-step-label mfa-skeleton">{{
          $t('mfa.loginPasswordStep')
        }}</span>
      </li>
      <li
        class="mfa-step"
        :class="result ? 'is-complete' : 'is-current'"
        :aria-current="!result ? 'step' : undefined"
      >
        <span class="mfa-step-icon mfa-skeleton"><Check v-if="result" aria-hidden="true" /><span v-else>2</span></span>
        <span class="mfa-step-label mfa-skeleton">{{
          $t('mfa.enrollmentStep')
        }}</span>
      </li>
      <li
        class="mfa-step"
        :class="{ 'is-current': result }"
        :aria-current="result ? 'step' : undefined"
      >
        <span class="mfa-step-icon mfa-skeleton"><span>3</span></span>
        <span class="mfa-step-label mfa-skeleton">{{
          $t('mfa.recoveryStep')
        }}</span>
      </li>
    </ol>
    <header v-if="mandatory" class="mfa-heading">
      <h1 class="mfa-skeleton">
        {{ $t(result ? 'mfa.recoveryTitle' : 'mfa.enrollTitle') }}
      </h1>
    </header>
    <section v-if="result" class="mfa-recovery">
      <div class="mfa-recovery-body">
        <Alert :description="$t('mfa.recoveryHelp')" type="warning" show-icon />
        <ul class="mfa-recovery-codes" data-testid="mfa-recovery-codes">
          <li v-for="recovery in result.recovery_codes" :key="recovery">
            {{ recovery }}
          </li>
        </ul>
        <Button block class="mfa-copy" @click="copyRecoveryCodes">
          <span class="mfa-button-content"><Check v-if="copied" aria-hidden="true" /><Copy
              v-else
              aria-hidden="true"
            />{{ $t(copied ? 'mfa.copied' : 'mfa.copyRecovery') }}</span>
        </Button>
        <p v-if="copyError" class="mfa-error" role="alert">{{ copyError }}</p>
        <p v-if="completionError" class="mfa-error" role="alert">
          {{ completionError }}
        </p>
      </div>
      <footer class="mfa-recovery-footer">
        <Button
          type="primary"
          :block="mandatory"
          class="mfa-primary"
          data-testid="mfa-save-recovery"
          :loading="completing"
          @click="emit('complete', result)"
          >
{{ $t('mfa.saved') }}
</Button>
      </footer>
    </section>
    <Form v-else layout="vertical" @submit.prevent="submit">
      <span v-if="loadingSetup" class="sr-only" role="status">{{
        $t('mfa.loadingSetup')
      }}</span>
      <div class="mfa-form-body" :class="{ 'has-setup': showSetup }">
        <div v-if="showSetup" class="mfa-scan">
          <p v-if="!mandatory" class="mfa-scan-label mfa-skeleton">
            {{ $t('mfa.scanCode') }}
          </p>
          <div
            class="mfa-qr-frame mfa-skeleton"
            :aria-hidden="loadingSetup || undefined"
          >
            <QRCode
              v-if="setup && !setupError"
              :value="setup.uri"
              :size="184"
              :color="token.colorText"
              :bg-color="token.colorBgContainer"
              :bordered="false"
              :status="setupExpired ? 'expired' : 'active'"
              @refresh="refreshSetup"
            />
            <div v-else class="mfa-qr-placeholder" aria-hidden="true"></div>
            <div
              v-if="setupError && !loadingSetup"
              class="mfa-qr-failure"
              role="alert"
            >
              <p>{{ setupError }}</p>
              <Button
                size="small"
                @click="initializationFailed ? initialize() : refreshSetup()"
                >
{{ $t('mfa.retry') }}
</Button>
            </div>
          </div>
          <button
            type="button"
            class="mfa-manual-toggle mfa-skeleton"
            :aria-expanded="manualOpen"
            :disabled="loadingSetup"
            @click="manualOpen = !manualOpen"
          >
            <span>{{ $t('mfa.manualSetup') }}</span>
            <span class="mfa-inline-icon" :class="{ 'is-open': manualOpen }"><ChevronDown aria-hidden="true" /></span>
          </button>
          <div v-if="manualOpen" class="mfa-manual-content">
            <div
              class="mfa-secret-row mfa-skeleton"
              :aria-hidden="loadingSetup || undefined"
            >
              <code data-testid="mfa-secret">{{
                setup?.secret || '\u00a0'
              }}</code>
              <Button
                type="text"
                size="small"
                class="mfa-secret-copy"
                data-testid="mfa-copy-secret"
                :aria-label="$t(secretCopied ? 'mfa.copied' : 'mfa.copySecret')"
                :title="$t(secretCopied ? 'mfa.copied' : 'mfa.copySecret')"
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
              secretCopied && !loadingSetup ? $t('mfa.copied') : ''
            }}</span>
            <p v-if="secretCopyError" class="mfa-error" role="alert">
              {{ secretCopyError }}
            </p>
          </div>
        </div>
        <div class="mfa-verification">
          <Form.Item
            class="mfa-code-field"
            :validate-status="error ? 'error' : undefined"
          >
            <template #label>
<span class="mfa-field-label mfa-skeleton">{{
                $t(needsPassword ? 'mfa.password' : 'mfa.code')
              }}</span>
</template>
            <div class="mfa-field-control mfa-skeleton">
              <Input.Password
                v-if="needsPassword"
                v-model:value="password"
                class="mfa-password-input"
                name="mfa_password"
                :aria-label="$t('mfa.password')"
                :aria-invalid="!!error"
                autocomplete="current-password"
                :disabled="busy"
              />
              <MFACodeInput
                v-else
                v-model="code"
                name="mfa_code"
                :label="$t('mfa.code')"
                :feedback="error ? 'failure' : 'idle'"
                :disabled="busy || loadingSetup || setupExpired || !setup"
              />
            </div>
          </Form.Item>
          <p v-if="error" class="mfa-input-error" role="alert">{{ error }}</p>
          <Alert
            v-if="setupError && !showSetup"
            class="mfa-setup-error"
            :message="setupError"
            type="error"
            show-icon
          />
        </div>
      </div>
      <footer class="mfa-form-footer">
        <Button
          v-if="!mandatory"
          class="mfa-cancel"
          :disabled="operationBusy"
          @click="emit('cancel')"
          >
{{ $t('common.cancel') }}
</Button>
        <div class="mfa-primary-shell mfa-skeleton">
          <Button
            type="primary"
            html-type="submit"
            :block="mandatory"
            class="mfa-primary"
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
                  ? 'mfa.confirmBinding'
                  : mandatory
                    ? 'mfa.beginBinding'
                    : 'mfa.getBindingQR',
              )
            }}
</Button>
        </div>
      </footer>
    </Form>
  </div>
</template>

<style scoped>
.mfa-enrollment {
  color: hsl(var(--foreground));
}
.mfa-steps {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  margin: 0 0 30px;
  list-style: none;
}
.mfa-step {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.4;
}
.mfa-step:not(:last-child)::after {
  flex: 1;
  height: 1px;
  min-width: 8px;
  margin-left: 3px;
  content: '';
  background: hsl(var(--border));
}
.mfa-step:last-child {
  flex: 0 0 auto;
}
.mfa-step > span:last-child {
  white-space: nowrap;
}
.mfa-step-icon {
  display: inline-flex;
  flex: 0 0 22px;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: hsl(var(--muted));
  line-height: 1;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.mfa-step-icon > span {
  display: block;
  line-height: 1;
}
.mfa-step-icon :deep(svg) {
  display: block;
  width: 13px;
  height: 13px;
  flex: none;
}
.mfa-step.is-current {
  color: hsl(var(--primary));
}
.is-current .mfa-step-icon {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.mfa-step.is-complete {
  color: hsl(var(--foreground));
}
.is-complete .mfa-step-icon {
  background: hsl(var(--success) / 15%);
  color: hsl(var(--success));
}
.mfa-heading {
  margin-bottom: 24px;
}
.mfa-heading h1 {
  margin: 0 0 10px;
  font-size: 26px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.4px;
}
.mfa-scan {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin: 0 0 27px;
}
.mfa-qr-frame {
  position: relative;
  width: 194px;
  height: 194px;
  flex: none;
  padding: 4px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: v-bind('token.colorBgContainer');
}
.mfa-manual-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 5px 0;
  border: 0;
  background: transparent;
  color: hsl(var(--primary));
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  cursor: pointer;
}
.mfa-inline-icon {
  display: inline-flex;
  flex: 0 0 14px;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  line-height: 1;
}
.mfa-inline-icon :deep(svg) {
  display: block;
  width: 14px;
  height: 14px;
}
.mfa-inline-icon.is-open {
  transform: rotate(180deg);
}
.mfa-manual-content {
  width: 100%;
  text-align: left;
}
.mfa-manual-content p {
  margin: 0 0 8px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.7;
}
.mfa-secret-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--muted) / 45%);
}
.mfa-secret-row code {
  display: block;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  color: hsl(var(--foreground));
  font-size: 12px;
  line-height: 1.8;
  user-select: text;
}
.mfa-secret-copy {
  display: inline-flex;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  color: hsl(var(--muted-foreground));
}
.mfa-secret-copy :deep(svg) {
  display: block;
  width: 16px;
  height: 16px;
  flex: none;
}
.mfa-manual-content .mfa-error {
  margin-top: 8px;
  color: hsl(var(--destructive));
}
.mfa-code-field {
  margin-bottom: 20px;
}
.mfa-input-error {
  margin: -12px 0 20px;
  color: hsl(var(--destructive));
  font-size: 12px;
  line-height: 1.6;
}
.mfa-primary {
  height: 44px;
}
.mfa-setup-error {
  margin-bottom: 16px;
}
.mfa-recovery-body {
  display: grid;
  gap: 16px;
}
.mfa-recovery-footer {
  margin-top: 16px;
}
.mfa-recovery-codes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  padding: 1px;
  margin: 0;
  overflow: hidden;
  list-style: none;
  border-radius: 9px;
  background: hsl(var(--border));
}
.mfa-recovery-codes li {
  min-width: 0;
  padding: 12px 10px;
  overflow-wrap: anywhere;
  background: v-bind('token.colorFillQuaternary');
  color: v-bind('token.colorText');
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
  line-height: 1.8;
  text-align: center;
  user-select: text;
}
.mfa-recovery-codes li:nth-child(4n + 3),
.mfa-recovery-codes li:nth-child(4n + 4) {
  background: v-bind('token.colorBgContainer');
}
.mfa-copy {
  height: 38px;
}
.mfa-button-content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  line-height: 1.5;
}
.mfa-button-content :deep(svg) {
  display: block;
  width: 14px;
  height: 14px;
  flex: none;
}
.mfa-error {
  margin: 0;
  color: hsl(var(--destructive));
  font-size: 12px;
  line-height: 1.6;
}
/* The skeleton masks the final DOM slots rather than replacing the form.
   Keeping the same boxes also preserves the centered page's vertical position. */
.mfa-step-label,
.mfa-field-label {
  display: inline-block;
}
.mfa-password-input {
  height: 49px;
}
.mfa-field-control,
.mfa-primary-shell {
  border-radius: 6px;
}
.mfa-qr-placeholder {
  width: 184px;
  height: 184px;
}
.mfa-qr-failure {
  position: absolute;
  z-index: 1;
  inset: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 14px;
  border-radius: 9px;
  background: v-bind('token.colorBgContainer');
  text-align: center;
}
.mfa-qr-failure p {
  margin: 0;
  color: hsl(var(--destructive));
  font-size: 12px;
  line-height: 1.7;
}
.is-loading .mfa-skeleton {
  position: relative;
  visibility: hidden;
  pointer-events: none;
}
.is-loading .mfa-skeleton::after {
  position: absolute;
  inset: 0;
  visibility: visible;
  content: '';
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--muted-foreground) / 16%) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
  animation: mfa-skeleton-wave 1.4s ease-in-out infinite;
}
.is-loading .mfa-heading .mfa-skeleton::after {
  border-radius: 5px;
}
@keyframes mfa-skeleton-wave {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .is-loading .mfa-skeleton::after {
    animation: none;
  }
}
.mfa-personal .mfa-form-body,
.mfa-personal .mfa-recovery-body {
  padding: 28px;
}
.mfa-personal .mfa-form-body.has-setup {
  display: grid;
  grid-template-columns: 234px minmax(0, 1fr);
  gap: 32px;
}
.mfa-personal .mfa-scan {
  min-width: 0;
  margin: 0;
  padding-right: 28px;
  border-right: 1px solid v-bind('token.colorBorderSecondary');
}
.mfa-scan-label {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}
.mfa-personal .mfa-verification {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.mfa-personal .mfa-code-field {
  margin-bottom: 0;
}
.mfa-personal .mfa-input-error {
  margin: 8px 0 0;
}
.mfa-personal .mfa-setup-error {
  margin: 16px 0 0;
}
.mfa-personal .mfa-form-footer,
.mfa-personal .mfa-recovery-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 18px 28px;
  border-top: 1px solid v-bind('token.colorBorderSecondary');
}
.mfa-personal .mfa-primary,
.mfa-personal .mfa-cancel {
  height: 36px;
  padding-inline: 18px;
}
.mfa-personal .mfa-primary {
  min-width: 98px;
}
.mfa-personal .mfa-password-input {
  height: 42px;
}
.mfa-personal .mfa-recovery-codes {
  background: v-bind('token.colorBorderSecondary');
}
@media (max-width: 640px) {
  .mfa-personal .mfa-form-body.has-setup {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .mfa-personal .mfa-scan {
    padding-right: 0;
    border-right: 0;
  }
  .mfa-personal .mfa-form-body,
  .mfa-personal .mfa-recovery-body {
    padding: 24px;
  }
  .mfa-personal .mfa-form-footer,
  .mfa-personal .mfa-recovery-footer {
    padding-inline: 24px;
  }
}
</style>
