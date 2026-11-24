import type { ComputedRef, Ref } from 'vue';

import type { Recordable } from '@vben/types';

import type { ActionRecordMode } from './action-detail';
import type {
  FormModel,
  FormValidationRule,
  ResourceConfig,
  ResourceKind,
  SystemRecord,
} from './management-types';
import type { ManagementPermissions } from './use-management-permissions';

import { computed, nextTick, reactive, ref, watch } from 'vue';

import { message, Modal } from 'ant-design-vue';

import { responseMessage } from '#/api/request-error';
import { showRequestErrorToast } from '#/api/request-feedback';
import { $t } from '#/locales';

import { actionWordPattern, isValidActionGroup } from './action-config';
import {
  authorizedEditorPayload,
  isAssignmentField,
  isExistingCredentialField,
} from './assignment-policy';
import { newIdempotencyKey, resetObject } from './management-model';
import ManagementRecordForm from './management-record-form.vue';
import {
  buildChangedPayload,
  buildUserGroupChanges,
  snapshotPayload,
} from './update-payload';
import { useManagementFormatting } from './use-management-formatting';
import {
  editableUserMetadata,
  isValidUsername,
  isValidUserPassword,
  USER_PASSWORD_MESSAGE_KEY,
  USER_USERNAME_MESSAGE_KEY,
  validateUserMetadata,
} from './user-validation';
const conflictFields: Record<string, string> = {
  DICTIONARY_CONFLICT: 'key',
  ROLE_CONFLICT: 'word',
  USERGROUP_CONFLICT: 'word',
  USER_CONFLICT: 'username',
};

export function useManagementEditor(
  props: { resource: ResourceKind; loading: boolean },
  config: ComputedRef<ResourceConfig>,
  permissions: ManagementPermissions,
  formRef: Ref<InstanceType<typeof ManagementRecordForm> | undefined>,
  details: {
    active: Ref<boolean>;
    selectedRecord: Ref<null | SystemRecord>;
    detailsOpen: Ref<boolean>;
    detailLoading: Ref<boolean>;
    detailRecordID: Ref<number | undefined>;
    loadRecordDetail: (
      mode?: ActionRecordMode,
    ) => Promise<SystemRecord | undefined>;
    refreshAll: () => Promise<void>;
  },
) {
  const {
    active,
    selectedRecord,
    detailsOpen,
    detailLoading,
    detailRecordID,
    loadRecordDetail,
    refreshAll,
  } = details;
  const {
    canCreate,
    canUpdate,
    canDetail,
    canAssignPermissions,
    canManageDefinitionRecord,
    editorOperation,
  } = permissions;
  const { formatJSON } = useManagementFormatting(() => props.resource);
  const submitting = ref(false);
  const modalOpen = ref(false);
  const editingRecord = ref<null | SystemRecord>(null);
  const originalMetadata = computed(() => {
    const record = editingRecord.value;
    return editableUserMetadata(
      record && 'metadata' in record ? record.metadata : undefined,
    );
  });
  const canSave = computed(() =>
    editingRecord.value ? canUpdate.value : canCreate.value,
  );
  const idempotencyKey = ref('');
  const formModel = reactive<FormModel>({});
  const initialEditorValues = ref<FormModel>({});
  const editorFields = computed(() =>
    config.value.fields.filter(
      (field) =>
        (editingRecord.value
          ? field.editVisible !== false
          : field.createVisible !== false) &&
        (canAssignPermissions.value ||
          !isAssignmentField(props.resource, field.key)) &&
        (!editingRecord.value ||
          canAssignPermissions.value ||
          !isExistingCredentialField(props.resource, field.key)),
    ),
  );

  const editorSnapshot = ref('');

  let editorRequest = 0;
  const editorDirty = computed(
    () =>
      modalOpen.value &&
      editorSnapshot.value !==
        JSON.stringify(
          snapshotPayload(formModel, [
            ...editorFields.value.map((field) => field.key),
            'action_bindings',
          ]),
        ),
  );
  const editingPermissionWord = computed(() => {
    const record = editingRecord.value;
    if (
      props.resource !== 'action' ||
      !modalOpen.value ||
      !record ||
      !('word' in record)
    )
      return undefined;
    return String(formModel.word || '');
  });
  const drawerTitle = computed(() => {
    if (editingPermissionWord.value !== undefined) {
      return $t('action-editor.editTitle');
    }
    let messageKey = 'system-editor.detailTitle';
    if (modalOpen.value)
      messageKey = editingRecord.value
        ? 'system.common.editTitle'
        : 'system.common.createTitle';
    return $t(messageKey, { entity: config.value.entity });
  });
  function closeEditorPanel(returnToDetail = false, confirmDiscard = true) {
    if (submitting.value) return;
    const close = () => {
      ++editorRequest;
      if (returnToDetail && editingRecord.value) {
        selectedRecord.value = editingRecord.value;
        detailsOpen.value = true;
      } else detailsOpen.value = false;
      modalOpen.value = false;

      formModel.password = '';
      if (
        returnToDetail &&
        editingRecord.value &&
        props.resource === 'action'
      ) {
        detailRecordID.value = editingRecord.value.id;
        void loadRecordDetail();
      }
    };
    if (confirmDiscard && editorDirty.value) {
      Modal.confirm({
        title: $t('system-editor.discardTitle'),
        okText: $t('system-editor.discard'),
        cancelText: $t('system-editor.continue'),
        onOk: close,
      });
    } else close();
  }
  const conflict = ref<{ field: string; message: string }>();
  watch(
    () => conflict.value && formModel[conflict.value.field],
    (value, previous) => {
      if (previous !== undefined && value !== previous)
        conflict.value = undefined;
    },
    { flush: 'sync' },
  );
  const actionValidation = ref('');
  const assignmentValidation = ref('');
  const formRules = computed(() => {
    const result: Record<string, FormValidationRule[]> = {};
    for (const field of editorFields.value) {
      const required =
        field.required || (!editingRecord.value && field.createRequired);
      if (required) {
        result[field.key] = [
          {
            message: $t('system.validation.required', { field: field.label }),
            required: true,
            ...(props.resource === 'role' && field.type === 'input'
              ? { whitespace: true }
              : {}),
          },
        ];
      }
    }
    if (
      ['role', 'user', 'user-group'].includes(props.resource) &&
      canAssignPermissions.value
    ) {
      result.action_codes = [
        {
          async validator() {
            if (assignmentValidation.value)
              throw new Error($t(assignmentValidation.value));
          },
        },
      ];
    }
    if (props.resource === 'action') {
      result.group ||= [];
      result.group.push({
        async validator(_rule, value) {
          if (
            !isValidActionGroup(
              String(value || ''),
              String(formModel.word || '').split(':')[0] ||
                formModel.scope ||
                'admin',
            )
          )
            throw new Error($t('action-editor.invalidGroupWord'));
        },
      });
      result.word ||= [];
      result.word.push({
        async validator(_rule, value) {
          if (!actionWordPattern.test(String(value)) || actionValidation.value)
            throw new Error(
              $t(actionValidation.value || 'action-editor.invalidWord'),
            );
        },
      });
    }
    if (props.resource === 'user') {
      if (editingRecord.value) {
        result.metadata = [
          {
            trigger: 'blur',
            async validator(_rule, value) {
              validateUserMetadata(value);
            },
          },
        ];
      }
      result.username ||= [];
      result.username.push({
        trigger: 'blur',
        async validator(_rule, value) {
          if (!isValidUsername(value))
            throw new Error($t(USER_USERNAME_MESSAGE_KEY));
        },
      });
      if (!editingRecord.value) {
        result.password ||= [];
        result.password.push({
          trigger: 'blur',
          async validator(_rule, value) {
            if (!isValidUserPassword(value))
              throw new Error($t(USER_PASSWORD_MESSAGE_KEY));
          },
        });
      }
    }
    if (props.resource === 'dictionary') {
      result.key ||= [];
      result.key.push({
        trigger: 'blur',
        async validator(_rule, value) {
          if (
            typeof value !== 'string' ||
            !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(value)
          ) {
            throw new Error($t('system.validation.dictionaryKey'));
          }
        },
      });
      result.value ||= [];
      result.value.push({
        trigger: 'blur',
        async validator(_rule, value) {
          try {
            JSON.parse(String(value));
          } catch {
            throw new Error($t('system.validation.json'));
          }
        },
      });
    }
    if (conflict.value) {
      const { field, message } = conflict.value;
      (result[field] ??= []).push({
        async validator() {
          throw new Error(message);
        },
      });
    }
    return result;
  });

  async function openEditor(record?: Recordable<any>) {
    if (record ? !canUpdate.value : !canCreate.value) return;
    editorOperation.value = record ? 'update' : 'create';
    if (props.loading || detailLoading.value) return;
    const request = ++editorRequest;
    conflict.value = undefined;
    actionValidation.value = '';
    assignmentValidation.value = '';
    if (record) {
      detailRecordID.value = record.id;
      const full = await loadRecordDetail('edit');
      if (request !== editorRequest || !full || !detailsOpen.value) return;
      if (!canUpdate.value || !canManageDefinitionRecord(full)) return;
      record = full;
    }
    selectedRecord.value = (record as SystemRecord | undefined) ?? null;
    detailsOpen.value = Boolean(record);
    editingRecord.value = (record as SystemRecord | undefined) ?? null;
    idempotencyKey.value = record ? '' : newIdempotencyKey();
    resetObject(formModel);
    for (const field of editorFields.value) {
      if (field.defaultValue !== undefined) {
        formModel[field.key] = field.defaultValue;
      }
    }
    if (record) {
      Object.assign(formModel, record);
      if (props.resource === 'user-group') {
        formModel.user_ids = { added: [], removed: [] };
      }
      if (props.resource === 'user') {
        formModel.metadata = formatJSON(originalMetadata.value);
        formModel.password = '';
        formModel.role_id = record.role_id ?? undefined;
      }
      if (props.resource === 'dictionary' && 'value' in record) {
        formModel.value = formatJSON(record.value);
      }
    }
    initialEditorValues.value = record
      ? snapshotPayload(
          formModel,
          editorFields.value.map((field) => field.key),
        )
      : {};
    editorSnapshot.value = JSON.stringify(
      snapshotPayload(formModel, [
        ...editorFields.value.map((field) => field.key),
        'action_bindings',
      ]),
    );
    modalOpen.value = true;
    await nextTick();
    formRef.value?.clearValidate();
  }

  function buildPayload() {
    const payload = buildEditablePayload();
    if (
      ['role', 'user', 'user-group'].includes(props.resource) &&
      formModel.action_bindings !== undefined
    ) {
      payload.action_bindings = formModel.action_bindings;
      delete payload.action_codes;
    }
    return authorizedEditorPayload(
      props.resource,
      payload,
      canAssignPermissions.value,
      canAssignPermissions.value,
      Boolean(editingRecord.value),
    );
  }

  function buildEditablePayload() {
    const payload: FormModel = {};
    for (const field of editorFields.value) {
      const value = formModel[field.key];
      if (value !== undefined) payload[field.key] = value;
    }
    if (props.resource === 'user') {
      if (editingRecord.value) {
        payload.metadata = JSON.parse(payload.metadata);
        if (canAssignPermissions.value)
          payload.role_id = Number(payload.role_id || 0);
        const initial = {
          ...initialEditorValues.value,
          metadata: originalMetadata.value,
          role_id: Number(initialEditorValues.value.role_id || 0),
        };
        return buildChangedPayload(initial, payload);
      }
      if (payload.role_id !== undefined) {
        payload.role_id = Number(payload.role_id);
      }
    } else if (props.resource === 'dictionary') {
      if (typeof payload.value === 'string') {
        payload.value = JSON.parse(payload.value);
      }
      if (editingRecord.value) {
        const initial = { ...initialEditorValues.value };
        if (typeof initial.value === 'string') {
          initial.value = JSON.parse(initial.value);
        }
        return buildChangedPayload(initial, payload);
      }
    } else if (props.resource === 'user-group' && editingRecord.value) {
      return buildUserGroupChanges(initialEditorValues.value, payload);
    } else if (props.resource === 'action' && editingRecord.value) {
      const changes = buildChangedPayload(initialEditorValues.value, payload);
      if (changes.names) {
        const initial = (initialEditorValues.value.names ?? {}) as Record<
          string,
          string
        >;
        const current = (payload.names ?? {}) as Record<string, string>;
        const names = Object.fromEntries(
          Object.entries(current).filter(
            ([tag, name]) => name !== (initial[tag] ?? ''),
          ),
        );
        if (Object.keys(names).length > 0) changes.names = names;
        else delete changes.names;
      }
      return changes;
    } else if (editingRecord.value) {
      return buildChangedPayload(initialEditorValues.value, payload);
    }
    return payload;
  }

  async function submitEditor() {
    if (!canSave.value || submitting.value || !modalOpen.value) return;
    const currentEditor = editorRequest;
    try {
      await formRef.value?.validate();
    } catch {
      // Field errors are rendered by the form; keep the editor open.
      return;
    }
    if (
      !canSave.value ||
      submitting.value ||
      !modalOpen.value ||
      !active.value ||
      currentEditor !== editorRequest
    )
      return;
    const payload = buildPayload();
    if (editingRecord.value && Object.keys(payload).length === 0) {
      message.info($t('system.messages.noChanges'));
      closeEditorPanel(true, false);
      return;
    }
    submitting.value = true;

    try {
      let saved: SystemRecord;
      if (editingRecord.value) {
        saved = await config.value.api.update(editingRecord.value.id, payload);
        message.success($t('system.messages.updated'));
      } else {
        idempotencyKey.value ||= newIdempotencyKey();
        saved = await config.value.api.create(idempotencyKey.value, payload);
        message.success($t('system.messages.created'));
      }
      if (!active.value || currentEditor !== editorRequest) return;
      // A saved record may no longer match the list filters. Keep its details open.
      selectedRecord.value = null;
      await refreshAll();
      if (!active.value || currentEditor !== editorRequest) return;
      detailRecordID.value = undefined;
      selectedRecord.value = saved;
      modalOpen.value = false;
      detailsOpen.value = canDetail.value;
      formModel.password = '';
      if (['action', 'role', 'user', 'user-group'].includes(props.resource))
        window.dispatchEvent(new Event('auth-permissions-changed'));
      if (props.resource === 'user' && detailsOpen.value) {
        detailRecordID.value = saved.id;
        await loadRecordDetail();
      }
    } catch (error) {
      if (!active.value || currentEditor !== editorRequest) return;
      const status =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response !== null &&
        'status' in error.response &&
        typeof error.response.status === 'number'
          ? error.response.status
          : undefined;
      // A timeout or server failure can leave the creation outcome unknown.
      if (
        !editingRecord.value &&
        status !== undefined &&
        status >= 400 &&
        status < 500 &&
        status !== 408 &&
        status !== 409
      ) {
        idempotencyKey.value = newIdempotencyKey();
      }
      const data = (error as { response?: { data?: { error_code?: string } } })
        ?.response?.data;
      const field = conflictFields[data?.error_code ?? ''];
      if (
        field &&
        typeof payload[field] === 'string' &&
        payload[field].trim() === String(formModel[field]).trim()
      ) {
        if (!editingRecord.value) idempotencyKey.value = newIdempotencyKey();
        const fallback =
          field === 'username'
            ? 'app.register.usernameExists'
            : 'developer.duplicate';
        conflict.value = {
          field,
          message: responseMessage(error) ?? $t(fallback),
        };
        await nextTick();
        await formRef.value?.validate()?.catch(() => {});
      } else {
        showRequestErrorToast(error);
      }
    } finally {
      submitting.value = false;
    }
  }

  function deactivate() {
    editorRequest += 1;
    modalOpen.value = false;
    formModel.password = '';
  }
  return {
    submitting,
    modalOpen,
    editingRecord,
    formModel,
    editorFields,
    editorDirty,
    editingPermissionWord,
    drawerTitle,

    actionValidation,
    assignmentValidation,
    formRules,
    closeEditorPanel,
    openEditor,
    submitEditor,
    deactivate,
  };
}
