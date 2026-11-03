<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { Recordable } from '@vben/types';

import type { LockMode } from './management-types';
import type { ManagementPermissions } from './use-management-permissions';

import type { UserRecord } from '#/api';

import { onDeactivated, ref } from 'vue';

import {
  DatePicker,
  FormItem,
  message,
  Modal,
  Select,
  Textarea,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { updateUser } from '#/api';
import { $t } from '#/locales';

import ManagementForm from './management-form.vue';
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
  const metadata = { ...(user.metadata || {}) };
  if (approvalDecision.value === 'approve') {
    delete metadata.reject_register_reason;
  } else {
    metadata.reject_register_reason = reason;
  }
  approvalSubmitting.value = true;
  try {
    await updateUser(user.id, {
      metadata,
      status: approvalDecision.value === 'approve' ? 1 : 0,
    });
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
    const metadata = {
      ...(user.metadata || {}),
      lock_expired_at:
        lockMode.value === 'permanent' ? 0 : lockUntil.value!.valueOf(),
    };
    await updateUser(user.id, {
      metadata,
      status: 2,
    });
    message.success($t('system.messages.locked'));
    lockModalOpen.value = false;
    await refreshAll();
  } finally {
    lockSubmitting.value = false;
  }
}

onDeactivated(() => {
  approvalModalOpen.value = false;
  lockModalOpen.value = false;
});
defineExpose({ openApproval, openLock });
</script>
<template>
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
          :placeholder="$t('system.user.rejectionPlaceholder')"
          @input="clearApprovalWarning"
        />
      </FormItem>
    </ManagementForm>
  </Modal>
</template>
