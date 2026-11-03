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

import { i18n } from '@vben/locales';

import { message, Modal } from 'ant-design-vue';

import { getAction } from '#/api';
import { $t } from '#/locales';
import { catalogDefaultLocale } from '#/locales/catalog';

import { actionWordPattern, isValidActionGroup } from './action-config';
import { actionEditorName } from './action-detail';
import { actionDisplayName } from './action-name';
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
  isValidUsername,
  isValidUserPassword,
  USER_PASSWORD_MESSAGE_KEY,
  USER_USERNAME_MESSAGE_KEY,
} from './user-validation';
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
    canRead,
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
  const idempotencyKey = ref('');
  const formModel = reactive<FormModel>({});
  const initialEditorValues = ref<FormModel>({});
  const editorFields = computed(() =>
    config.value.fields.filter(
      (field) =>
        (editingRecord.value || field.createVisible !== false) &&
        (canAssignPermissions.value ||
          !isAssignmentField(props.resource, field.key)) &&
        (!editingRecord.value ||
          canAssignPermissions.value ||
          !isExistingCredentialField(props.resource, field.key)),
    ),
  );

  const editorSnapshot = ref('');
  const editorError = ref('');
  let editorRequest = 0;
  let editorNameRequest = 0;
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
  const editingPermission = computed(() => {
    const record = editingRecord.value;
    if (
      props.resource !== 'action' ||
      !modalOpen.value ||
      !record ||
      !('word' in record)
    )
      return null;
    const word = String(formModel.word || '');
    const names = formModel.names as Record<string, string> | undefined;
    const name = actionEditorName(
      word,
      names,
      String(i18n.global.locale.value),
      catalogDefaultLocale(),
      actionDisplayName(
        word,
        formModel.config,
        'name' in record ? record.name : undefined,
      ),
    );
    return { word, name };
  });
  async function refreshEditorName() {
    const locale = i18n.global.locale.value;
    const record = editingRecord.value;
    if (
      props.resource !== 'action' ||
      !modalOpen.value ||
      !record ||
      !active.value ||
      !canRead.value
    )
      return;
    const request = ++editorNameRequest;
    const editor = editorRequest;
    const current = () =>
      request === editorNameRequest &&
      editor === editorRequest &&
      active.value &&
      canRead.value &&
      modalOpen.value &&
      editingRecord.value === record &&
      locale === i18n.global.locale.value;
    // Refresh only the translated title; keep unsaved definition edits intact.
    if ('name' in record) record.name = undefined;
    try {
      const translated = await getAction(record.id, { f: 'name' });
      if (current()) Object.assign(record, translated);
    } catch {
      // Editable names and the stable word remain available when translation fails.
    }
  }
  watch(() => i18n.global.locale.value, refreshEditorName);
  const drawerTitle = computed(() => {
    if (editingPermission.value) {
      const record = editingPermission.value;
      return $t('action-editor.editTitle', {
        name: record.name || record.word,
      });
    }
    return $t(
      modalOpen.value
        ? editingRecord.value
          ? 'system.common.editTitle'
          : 'system.common.createTitle'
        : 'system-editor.detailTitle',
      { entity: config.value.entity },
    );
  });
  function closeEditorPanel(returnToDetail = false) {
    if (submitting.value) return;
    const close = () => {
      ++editorRequest;
      if (returnToDetail && editingRecord.value) {
        selectedRecord.value = editingRecord.value;
        detailsOpen.value = true;
      } else detailsOpen.value = false;
      modalOpen.value = false;
      editorError.value = '';
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
    if (editorDirty.value) {
      Modal.confirm({
        title: $t('system-editor.discardTitle'),
        okText: $t('system-editor.discard'),
        cancelText: $t('system-editor.continue'),
        onOk: close,
      });
    } else close();
  }
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
      result.username ||= [];
      result.username.push({
        trigger: 'blur',
        async validator(_rule, value) {
          if (!isValidUsername(value))
            throw new Error($t(USER_USERNAME_MESSAGE_KEY));
        },
      });
      result.password ||= [];
      result.password.push({
        trigger: 'blur',
        async validator(_rule, value) {
          if (editingRecord.value && !value) return;
          if (!isValidUserPassword(value))
            throw new Error($t(USER_PASSWORD_MESSAGE_KEY));
        },
      });
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
    return result;
  });

  async function openEditor(record?: Recordable<any>) {
    if (record ? !canUpdate.value : !canCreate.value) return;
    editorOperation.value = record ? 'update' : 'create';
    if (props.loading || detailLoading.value) return;
    const request = ++editorRequest;
    const requestedLocale = i18n.global.locale.value;
    editorError.value = '';
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
    if (
      record &&
      props.resource === 'action' &&
      requestedLocale !== i18n.global.locale.value
    ) {
      void refreshEditorName();
    }
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
      if (editingRecord.value && !payload.password) delete payload.password;
      if (editingRecord.value) {
        if (canAssignPermissions.value)
          payload.role_id = Number(payload.role_id || 0);
        const initial = {
          ...initialEditorValues.value,
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
        if (Object.keys(names).length) changes.names = names;
        else delete changes.names;
      }
      return changes;
    } else if (editingRecord.value) {
      return buildChangedPayload(initialEditorValues.value, payload);
    }
    return payload;
  }

  async function submitEditor() {
    if (editingRecord.value ? !canUpdate.value : !canCreate.value) return;
    if (submitting.value || !modalOpen.value) return;
    const currentEditor = editorRequest;
    try {
      await formRef.value?.validate();
    } catch {
      // Field errors are rendered by the form; keep the editor open.
      return;
    }
    if (
      submitting.value ||
      !modalOpen.value ||
      !active.value ||
      currentEditor !== editorRequest
    )
      return;
    const payload = buildPayload();
    if (editingRecord.value && Object.keys(payload).length === 0) {
      message.info($t('system.messages.noChanges'));
      closeEditorPanel(true);
      return;
    }
    submitting.value = true;
    editorError.value = '';
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
      if (!editingRecord.value && status !== undefined && status !== 409) {
        idempotencyKey.value = newIdempotencyKey();
      }
      editorError.value =
        error instanceof Error ? error.message : $t('system-editor.saveError');
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
    editingPermission,
    drawerTitle,
    editorError,
    actionValidation,
    assignmentValidation,
    formRules,
    closeEditorPanel,
    openEditor,
    submitEditor,
    deactivate,
  };
}
