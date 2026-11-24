import type { Recordable } from '@vben/types';

import type { ResourceKind } from './management-types';

import { computed, ref } from 'vue';

import { $te } from '@vben/locales';

import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';
import { totpEnabled } from '#/store/system-properties';

import { canManageDefinition } from './assignment-policy';

export function useManagementPermissions(resource: () => ResourceKind) {
  const { hasButton, hasPage, hasAllPermissions, canManageDeveloper } =
    usePermissions();
  const editorOperation = ref<'create' | 'update'>('create');
  const hasButtonAccess = (control: string) =>
    hasButton(
      `admin:btn:system:${resource()}:${control}`,
      `/system/${resource()}`,
    );
  const buttonLabel = (control: string, fallback: string) => {
    const key = `buttons.admin:btn:system:${resource()}:${control}`;
    return $te(key) ? $t(key) : $t(fallback);
  };
  const canCreate = computed(() => hasButtonAccess('create'));
  const canDelete = computed(() => hasButtonAccess('delete'));
  const canRead = computed(() => hasPage(`/system/${resource()}`));
  const canResetTOTP = computed(
    () =>
      resource() === 'user' &&
      totpEnabled.value &&
      hasButtonAccess('reset-totp'),
  );
  const canUpdate = computed(() => hasButtonAccess('edit'));
  const canAssignPermissions = computed(
    () =>
      ['role', 'user', 'user-group'].includes(resource()) &&
      (editorOperation.value === 'create' ? canCreate.value : canUpdate.value),
  );
  const canDetail = computed(() => hasButtonAccess('view-detail'));
  const canManageDefinitionRecord = (record: Recordable<any>) => {
    if (resource() !== 'action') return true;
    if (!record.config) return false;
    return canManageDefinition(
      record.word,
      record.config?.builtin,
      hasAllPermissions.value,
      canManageDeveloper.value,
      record.config?.permission_scope,
    );
  };
  const canRemoveRecord = (record: Recordable<any>, control = 'delete') =>
    hasButtonAccess(control) && canManageDefinitionRecord(record);
  const canSelectRecord = (record: Recordable<any>) =>
    canRemoveRecord(record, 'delete-selected');

  return {
    hasAllPermissions,
    canManageDeveloper,
    editorOperation,
    hasButtonAccess,
    canAssignPermissions,
    buttonLabel,
    canCreate,
    canDelete,
    canRead,
    canResetTOTP,
    canUpdate,
    canDetail,
    canManageDefinitionRecord,
    canRemoveRecord,
    canSelectRecord,
  };
}
export type ManagementPermissions = ReturnType<typeof useManagementPermissions>;
