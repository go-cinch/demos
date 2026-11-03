import type { Recordable } from '@vben/types';

import type { ResourceKind } from './management-types';

import { computed, ref } from 'vue';

import { $te } from '@vben/locales';

import { usePermissions } from '#/composables/use-permissions';
import { $t } from '#/locales';

import {
  canDeleteAssignedRecord,
  canManageDefinition,
} from './assignment-policy';
export function useManagementPermissions(resource: () => ResourceKind) {
  const {
    canManagePermission,
    hasButton,
    hasPage,
    hasAllPermissions,
    canManageDeveloper,
  } = usePermissions();
  const editorOperation = ref<'create' | 'update'>('create');
  const hasButtonAccess = (control: string) => {
    const operation = (
      {
        create: 'create',
        edit: 'update',
        delete: 'delete',
        'delete-selected': 'delete',
      } as Record<string, string>
    )[control];
    return (
      (resource() !== 'action' ||
        !operation ||
        canManagePermission('action', operation)) &&
      hasButton(
        `admin:btn:system:${resource()}:${control}`,
        `/system/${resource()}`,
      )
    );
  };
  const canAssignPermissions = computed(() =>
    canManagePermission(resource(), editorOperation.value),
  );
  const buttonLabel = (control: string, fallback: string) => {
    const key = `buttons.admin:btn:system:${resource()}:${control}`;
    return $te(key) ? $t(key) : $t(fallback);
  };
  const canCreate = computed(() => hasButtonAccess('create'));
  const canDelete = computed(() => hasButtonAccess('delete'));
  const canRead = computed(() => hasPage(`/system/${resource()}`));
  const canUpdate = computed(() => hasButtonAccess('edit'));
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
    canManageDefinitionRecord(record) &&
    hasButtonAccess(control) &&
    canDeleteAssignedRecord(
      resource(),
      record,
      canManagePermission(resource(), 'delete'),
    );
  const canSelectRecord = (record: Recordable<any>) =>
    canRemoveRecord(record, 'delete-selected');

  return {
    canManagePermission,
    hasAllPermissions,
    canManageDeveloper,
    editorOperation,
    hasButtonAccess,
    canAssignPermissions,
    buttonLabel,
    canCreate,
    canDelete,
    canRead,
    canUpdate,
    canDetail,
    canManageDefinitionRecord,
    canRemoveRecord,
    canSelectRecord,
  };
}
export type ManagementPermissions = ReturnType<typeof useManagementPermissions>;
