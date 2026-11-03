<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { ManagementRecordActions, ResourceKind } from './management-types';
import type { ManagementPermissions } from './use-management-permissions';

import type { useOperationConfirmation } from '#/composables/use-operation-confirmation';

import { Button, Popconfirm, Space } from 'ant-design-vue';

import { $t } from '#/locales';

import { useManagementFormatting } from './use-management-formatting';
const props = defineProps<{
  resource: ResourceKind;
  record: Recordable<any>;
  actions: ManagementRecordActions;
  permissions: ManagementPermissions;
  confirmation: ReturnType<typeof useOperationConfirmation>;
}>();
const {
  canDetail,
  canRead,
  canUpdate,
  canManageDefinitionRecord,
  canRemoveRecord,
  hasButtonAccess,
  buttonLabel,
} = props.permissions;
const {
  openDetail,
  openEditor,
  openApproval,
  openLock,
  unlockUser,
  unlockPasswordChange,
  confirmResetMFA,
  removeRecords,
} = props.actions;
const { operationPopover, setOperationPopover, runConfirmedOperation } =
  props.confirmation;
const { getRecordID, getRecordLabel, userPasswordChangeFailures } =
  useManagementFormatting(() => props.resource);
</script>
<template>
  <Space class="system-operation-actions">
    <Button
      v-if="canDetail"
      size="small"
      type="link"
      @click="openDetail(record)"
    >
      {{ buttonLabel('view-detail', 'system-insights.details') }}
    </Button>
    <Button
      v-if="
        hasButtonAccess('approve') &&
        props.resource === 'user' &&
        record.status === 0
      "
      size="small"
      type="link"
      @click="openApproval(record)"
    >
      {{ buttonLabel('approve', 'system.user.approve') }}
    </Button>
    <Button
      v-if="canUpdate && canManageDefinitionRecord(record)"
      size="small"
      type="link"
      @click="openEditor(record)"
    >
      {{ buttonLabel('edit', 'system.common.edit') }}
    </Button>
    <Button
      v-if="
        hasButtonAccess('lock') &&
        props.resource === 'user' &&
        record.status === 1
      "
      size="small"
      type="link"
      @click="openLock(record)"
    >
      {{ buttonLabel('lock', 'system.user.lock') }}
    </Button>
    <Popconfirm
      v-if="
        hasButtonAccess('unlock') &&
        props.resource === 'user' &&
        record.status === 2
      "
      :title="$t('system.confirm.unlock', { name: record.username })"
      :open="operationPopover === `unlock:${getRecordID(record)}`"
      @open-change="
        (open) => setOperationPopover(`unlock:${getRecordID(record)}`, open)
      "
      @confirm="runConfirmedOperation(() => unlockUser(record))"
    >
      <Button size="small" type="link">
        {{ buttonLabel('unlock', 'system.user.unlock') }}
      </Button>
    </Popconfirm>
    <Popconfirm
      v-if="
        hasButtonAccess('unlock-password') &&
        props.resource === 'user' &&
        userPasswordChangeFailures(record) > 0
      "
      :title="
        $t('system.confirm.unlockPassword', {
          name: record.username,
        })
      "
      :open="operationPopover === `unlock-password:${getRecordID(record)}`"
      @open-change="
        (open) =>
          setOperationPopover(`unlock-password:${getRecordID(record)}`, open)
      "
      @confirm="runConfirmedOperation(() => unlockPasswordChange(record))"
    >
      <Button size="small" type="link">
        {{ buttonLabel('unlock-password', 'system.user.unlockPassword') }}
      </Button>
    </Popconfirm>
    <Button
      v-if="props.resource === 'user' && canRead"
      type="link"
      size="small"
      @click="confirmResetMFA(record)"
      >
{{ $t('mfa.reset') }}
</Button>
    <Popconfirm
      v-if="canRemoveRecord(record)"
      :title="
        $t('system.confirm.delete', {
          name: getRecordLabel(record),
        })
      "
      :open="operationPopover === `delete:${getRecordID(record)}`"
      @open-change="
        (open) => setOperationPopover(`delete:${getRecordID(record)}`, open)
      "
      @confirm="
        runConfirmedOperation(() => removeRecords([getRecordID(record)]))
      "
    >
      <Button danger size="small" type="link">
        {{ buttonLabel('delete', 'system.common.delete') }}
      </Button>
    </Popconfirm>
  </Space>
</template>
<style scoped>
.system-operation-actions {
  width: max-content;
  white-space: nowrap;
}
</style>
