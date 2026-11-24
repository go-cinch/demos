<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { Recordable } from '@vben/types';

import type { LockMode } from './management-types';
import type { ManagementPermissions } from './use-management-permissions';

import type { UserRecord } from '#/api';

import { computed, onDeactivated, ref } from 'vue';

import { $placeholder } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Avatar,
  DatePicker,
  FormItem,
  InputPassword,
  message,
  Modal,
  Select,
  Tag,
  Textarea,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { lockUserAccount, resetUserPassword, reviewUser } from '#/api';
import { $t } from '#/locales';
import { useAuthStore } from '#/store';
import { isValidUserPassword } from '#/user-validation';
import { requiredEntry } from '#/utils/required-entry';

import ManagementForm from './management-form.vue';
import { useManagementFormatting } from './use-management-formatting';
const props = defineProps<{
  permissions: ManagementPermissions;
  refresh: () => Promise<void>;
}>();
const { hasButtonAccess, buttonLabel } = props.permissions;
const refreshAll = () => props.refresh();
function disablePastDate(value: Dayjs) {
  return value.endOf('day').isBefore(dayjs());
}
const approvalModalOpen = ref(false);
const approvalSubmitting = ref(false);
const approvalUser = ref<null | UserRecord>(null);
const approvalDecision = ref<'approve' | 'reject'>('approve');
const rejectReason = ref('');
const approvalWarningVisible = ref(false);
const lockModalOpen = ref(false);
const lockSubmitting = ref(false);
const lockUser = ref<null | UserRecord>(null);
const lockMode = ref<LockMode>('until');
const lockUntil = ref<Dayjs>();
const lockWarningVisible = ref(false);
function openApproval(record: Recordable<any>) {
  approvalUser.value = record as UserRecord;
  approvalDecision.value = 'approve';
  rejectReason.value = '';
  approvalWarningVisible.value = false;
  approvalModalOpen.value = true;
}

function clearApprovalWarning() {
  approvalWarningVisible.value = false;
}

async function submitApproval() {
  if (!hasButtonAccess('approve')) return;
  const user = approvalUser.value;
  if (!user) return;
  const reason = rejectReason.value.trim();
  if (approvalDecision.value === 'reject' && !reason) {
    approvalWarningVisible.value = true;
    return;
  }
  approvalWarningVisible.value = false;
  approvalSubmitting.value = true;
  try {
    await reviewUser(user.id, approvalDecision.value, reason);
    message.success(
      approvalDecision.value === 'approve'
        ? $t('system.messages.approved')
        : $t('system.messages.rejected'),
    );
    approvalModalOpen.value = false;
    await refreshAll();
  } finally {
    approvalSubmitting.value = false;
  }
}

function openLock(record: Recordable<any>) {
  lockUser.value = record as UserRecord;
  lockMode.value = 'until';
  lockUntil.value = dayjs().add(1, 'day').startOf('minute');
  lockWarningVisible.value = false;
  lockModalOpen.value = true;
}

function clearLockWarning() {
  lockWarningVisible.value = false;
}

async function submitLock() {
  if (!hasButtonAccess('lock')) return;
  const user = lockUser.value;
  if (!user || lockSubmitting.value) return;
  if (
    lockMode.value === 'until' &&
    (!lockUntil.value || !lockUntil.value.isAfter(dayjs()))
  ) {
    lockWarningVisible.value = true;
    return;
  }
  lockWarningVisible.value = false;
  lockSubmitting.value = true;
  try {
    await lockUserAccount(
      user.id,
      lockMode.value === 'permanent'
        ? 0
        : requiredEntry(lockUntil.value, 'lock expiration').valueOf(),
    );
    message.success($t('system.messages.locked'));
    lockModalOpen.value = false;
    await refreshAll();
  } finally {
    lockSubmitting.value = false;
  }
}

const resetTarget = ref<null | UserRecord>(null);
const newPassword = ref('');
const confirmation = ref('');
const resetAttempted = ref(false);
const resetSubmitting = ref(false);
const { statusColor, statusLabel } = useManagementFormatting(() => 'user');
const passwordHelp = computed(() =>
  resetAttempted.value && !isValidUserPassword(newPassword.value)
    ? $t('app.validation.passwordRequired')
    : undefined,
);
const confirmationHelp = computed(() => {
  if (!resetAttempted.value) return undefined;
  if (!isValidUserPassword(confirmation.value))
    return $t('system.validation.passwordConfirmation');
  if (confirmation.value.trim() !== newPassword.value.trim())
    return $t('system.validation.passwordMismatch');
  return undefined;
});

function closeResetPassword() {
  resetTarget.value = null;
  newPassword.value = '';
  confirmation.value = '';
  resetAttempted.value = false;
}

function openResetPassword(record: Recordable<any>) {
  if (resetSubmitting.value || !hasButtonAccess('reset-password')) return;
  closeResetPassword();
  resetTarget.value = record as UserRecord;
}

async function submitResetPassword() {
  const user = resetTarget.value;
  if (!user || resetSubmitting.value || !hasButtonAccess('reset-password'))
    return;
  resetAttempted.value = true;
  if (passwordHelp.value || confirmationHelp.value) return;
  resetSubmitting.value = true;
  try {
    await resetUserPassword(user.id, newPassword.value);
    closeResetPassword();
    message.success($t('system.messages.passwordReset'));
    await (Number(useUserStore().userInfo?.userId) === Number(user.id)
      ? useAuthStore().logout()
      : refreshAll());
  } finally {
    resetSubmitting.value = false;
  }
}

onDeactivated(() => {
  closeResetPassword();
  approvalModalOpen.value = false;
  lockModalOpen.value = false;
});
defineExpose({ openApproval, openLock, openResetPassword });
</script>
<template>
  <Modal
    :open="!!resetTarget"
    :title="buttonLabel('reset-password', 'system.user.resetPassword')"
    :ok-text="$t('system.user.confirmReset')"
    :confirm-loading="resetSubmitting"
    :closable="!resetSubmitting"
    :keyboard="!resetSubmitting"
    :mask-closable="!resetSubmitting"
    :cancel-button-props="{ disabled: resetSubmitting }"
    destroy-on-close
    @cancel="closeResetPassword"
    @ok="submitResetPassword"
  >
    <div
      v-if="resetTarget"
      class="mb-4 flex items-center gap-3 rounded border bg-muted/40 p-3"
    >
      <Avatar>{{ resetTarget.username.slice(0, 1).toUpperCase() }}</Avatar>
      <div class="min-w-0 flex-1">
        <strong>{{ resetTarget.username }}</strong>
        <div class="text-xs text-muted-foreground">{{ resetTarget.code }}</div>
      </div>
      <Tag :color="statusColor(resetTarget.status)">{{
        statusLabel(resetTarget.status)
      }}</Tag>
    </div>
    <ManagementForm :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
      <FormItem
        html-for="admin-reset-password"
        :label="$t('system.fields.newPassword')"
        required
        :help="passwordHelp"
        :validate-status="passwordHelp ? 'error' : undefined"
      >
        <InputPassword
          id="admin-reset-password"
          v-model:value="newPassword"
          autocomplete="new-password"
          :disabled="resetSubmitting"
          @press-enter.prevent="submitResetPassword"
        />
      </FormItem>
      <FormItem
        html-for="admin-confirm-password"
        :label="$t('system.user.confirmPassword')"
        required
        :help="confirmationHelp"
        :validate-status="confirmationHelp ? 'error' : undefined"
      >
        <InputPassword
          id="admin-confirm-password"
          v-model:value="confirmation"
          autocomplete="new-password"
          :disabled="resetSubmitting"
          @press-enter.prevent="submitResetPassword"
        />
      </FormItem>
    </ManagementForm>
    <Alert
      type="info"
      show-icon
      :message="$t('system.user.resetConsequence')"
    />
  </Modal>

  <Modal
    v-model:open="lockModalOpen"
    :confirm-loading="lockSubmitting"
    :title="$t('system.user.lockTitle', { name: lockUser?.username || '' })"
    @ok="submitLock"
  >
    <ManagementForm :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
      <FormItem :label="$t('system.user.lockType')" required>
        <Select
          v-model:value="lockMode"
          :options="[
            { label: $t('system.user.lockUntil'), value: 'until' },
            { label: $t('system.user.permanent'), value: 'permanent' },
          ]"
        />
      </FormItem>
      <FormItem
        v-if="lockMode === 'until'"
        :help="
          lockWarningVisible ? $t('system.validation.futureLock') : undefined
        "
        :label="$t('system.user.lockedUntil')"
        required
        :validate-status="lockWarningVisible ? 'warning' : undefined"
      >
        <DatePicker
          v-model:value="lockUntil"
          class="w-full"
          :disabled-date="disablePastDate"
          format="YYYY-MM-DD HH:mm:ss"
          show-time
          @change="clearLockWarning"
        />
      </FormItem>
    </ManagementForm>
  </Modal>

  <Modal
    v-model:open="approvalModalOpen"
    :confirm-loading="approvalSubmitting"
    :title="$t('system.user.review')"
    @ok="submitApproval"
  >
    <ManagementForm :label-col="{ span: 7 }" :wrapper-col="{ span: 16 }">
      <FormItem :label="$t('system.user.entity')">
        {{ approvalUser?.username }}
      </FormItem>
      <FormItem :label="$t('system.user.decision')">
        <Select
          v-model:value="approvalDecision"
          :options="[
            {
              label: buttonLabel('approve', 'system.user.approve'),
              value: 'approve',
            },
            { label: $t('system.user.reject'), value: 'reject' },
          ]"
          @change="clearApprovalWarning"
        />
      </FormItem>
      <FormItem
        v-if="approvalDecision === 'reject'"
        :help="
          approvalWarningVisible
            ? $t('system.validation.rejectionRequired')
            : undefined
        "
        :label="$t('system.user.reason')"
        required
        :validate-status="approvalWarningVisible ? 'warning' : undefined"
      >
        <Textarea
          v-model:value="rejectReason"
          :auto-size="{ minRows: 3, maxRows: 6 }"
          :placeholder="$placeholder('system.user.rejectionPlaceholder')"
          @input="clearApprovalWarning"
        />
      </FormItem>
    </ManagementForm>
  </Modal>
</template>
