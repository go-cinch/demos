<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { ActionRecordMode } from './action-detail';
import type { ResourceKind, SystemRecord } from './management-types';
import type { ManagementPermissions } from './use-management-permissions';

import type { SystemSummaryGroup } from '#/api/system/insights';

import { onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button } from 'ant-design-vue';

import { getSystemRecord } from '#/api';
import { $t } from '#/locales';

import { loadActionRecord } from './action-detail';
import ManagementDrawer from './management-drawer.vue';
import ManagementRecordForm from './management-record-form.vue';
import { useManagementResource } from './management-resources';
import SystemRecordDetail from './system-record-detail.vue';
import { useManagementEditor } from './use-management-editor';
const props = defineProps<{
  resource: ResourceKind;
  permissions: ManagementPermissions;
  records: SystemRecord[];
  loading: boolean;
  groups: string[];
  refresh: () => Promise<void>;
  resetMfa: (record: Recordable<any>) => void;
}>();
const {
  canRead,
  canUpdate,
  canCreate,
  canDetail,
  canAssignPermissions,
  canManageDefinitionRecord,
  buttonLabel,
} = props.permissions;
const config = useManagementResource(() => props.resource);
const formRef = ref<InstanceType<typeof ManagementRecordForm>>();
const selectedRecord = ref<null | SystemRecord>(null);
const active = ref(true);
const confirmResetMFA = (record: Recordable<any>) => props.resetMfa(record);
const detailsOpen = ref(false);
const detailDrawerReady = ref(false);
const detailFocusField = ref<'button' | 'menu'>();
const detailLoading = ref(false);
const detailError = ref(false);
let detailRequest = 0;
const detailRecordID = ref<number>();
watch(detailsOpen, (open) => {
  if (!open) {
    detailDrawerReady.value = false;
    detailFocusField.value = undefined;
    ++detailRequest;
    selectedRecord.value = null;
    detailLoading.value = false;
    detailError.value = false;
  }
});
async function selectUserGroup(group: SystemSummaryGroup) {
  detailRecordID.value = group.id;
  await loadRecordDetail();
}
async function loadRecordDetail(mode: ActionRecordMode = 'detail') {
  if (!detailRecordID.value || !canRead.value || !active.value) return;
  const request = ++detailRequest;
  selectedRecord.value =
    props.records.find((record) => record.id === detailRecordID.value) ??
    (selectedRecord.value?.id === detailRecordID.value
      ? selectedRecord.value
      : { id: detailRecordID.value });
  detailLoading.value = true;
  detailError.value = false;
  detailsOpen.value = true;
  try {
    const record =
      props.resource === 'action'
        ? await loadActionRecord(detailRecordID.value, mode)
        : await getSystemRecord<SystemRecord>(
            props.resource,
            detailRecordID.value,
          );
    if (request === detailRequest && active.value && canRead.value) {
      selectedRecord.value = record;
      return record;
    }
  } catch {
    if (request === detailRequest && active.value) detailError.value = true;
  } finally {
    if (request === detailRequest) detailLoading.value = false;
  }
}
async function openDetail(record: Recordable<any>, field?: string) {
  if (props.loading || !canDetail.value) return;
  detailFocusField.value =
    field === 'menu' || field === 'button' ? field : undefined;
  detailRecordID.value = record.id;
  return loadRecordDetail();
}

function editDetail(record: SystemRecord) {
  void openEditor(record);
}

const {
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
} = useManagementEditor(props, config, props.permissions, formRef, {
  active,
  selectedRecord,
  detailsOpen,
  detailLoading,
  detailRecordID,
  loadRecordDetail,
  refreshAll: () => props.refresh(),
});
function clearDetails() {
  detailsOpen.value = false;
  selectedRecord.value = null;
}
function dispose() {
  active.value = false;
  detailRequest += 1;
  deactivate();
  clearDetails();
}
onDeactivated(dispose);
onBeforeUnmount(dispose);
onActivated(() => {
  active.value = true;
});
watch(canRead, (value) => {
  if (!value) clearDetails();
});
defineExpose({
  openDetail,
  openEditor,
  selectUserGroup,
  selectedRecord,
  clearDetails,
});
</script>
<template>
  <ManagementDrawer
    :open="detailsOpen || modalOpen"
    :title="drawerTitle"
    :entity="config.entity"
    :record-id="modalOpen ? editingRecord?.id : selectedRecord?.id"
    :mode="modalOpen ? (editingRecord ? 'edit' : 'create') : 'detail'"
    :busy="submitting"
    :wide="props.resource === 'dictionary' || props.resource === 'action'"
    :width="
      ['action', 'role', 'user', 'user-group'].includes(props.resource)
        ? 'min(1000px, 100vw)'
        : undefined
    "
    @close="closeEditorPanel()"
    @after-open-change="detailDrawerReady = $event"
  >
    <template v-if="editingPermission" #description>
      <span>{{ $t('system.fields.word') }}</span>
      <code data-testid="action-editing-word">{{
        editingPermission.word
      }}</code>
    </template>
    <SystemRecordDetail
      v-if="!modalOpen"
      :record="selectedRecord"
      :resource="props.resource"
      :loading="detailLoading"
      :error="detailError"
      :focus-field="detailDrawerReady ? detailFocusField : undefined"
      @retry="loadRecordDetail"
    />
    <ManagementRecordForm
      v-else
      ref="formRef"
      :resource="resource"
      :form-model="formModel"
      :form-rules="formRules"
      :editor-fields="editorFields"
      :editing-record="editingRecord"
      :submitting="submitting"
      :can-update="canUpdate"
      :can-create="canCreate"
      :can-assign-permissions="canAssignPermissions"
      :groups="groups"
      :editor-error="editorError"
      @edit-existing="openEditor({ id: $event })"
      @action-validity="actionValidation = $event"
      @assignment-validity="assignmentValidation = $event"
    />
    <template #footer>
      <template v-if="modalOpen">
        <Button
          :disabled="submitting"
          @click="closeEditorPanel(Boolean(editingRecord))"
        >
          {{
            $t(
              editingRecord
                ? 'system-editor.cancelEdit'
                : 'system-editor.cancel',
            )
          }}
        </Button>
        <span v-if="editorDirty" class="editor-dirty">{{
          $t('system-editor.unsaved')
        }}</span>
        <Button
          v-if="editorFields.length && (editingRecord ? canUpdate : canCreate)"
          type="primary"
          :loading="submitting"
          :aria-busy="submitting"
          data-testid="management-save"
          @click="submitEditor"
        >
          <IconifyIcon :icon="editingRecord ? 'lucide:check' : 'lucide:plus'" />
          {{
            editingRecord
              ? $t('system-editor.save')
              : $t('system.common.createTitle', { entity: config.entity })
          }}
        </Button>
      </template>
      <template v-else>
        <Button @click="closeEditorPanel()">
{{
          $t('system-cards.backToList')
        }}
</Button>
        <Button
          v-if="props.resource === 'user' && canRead && selectedRecord"
          :disabled="detailLoading || detailError"
          @click="confirmResetMFA(selectedRecord)"
          >
{{ $t('mfa.reset') }}
</Button>
        <Button
          v-if="
            canUpdate &&
            selectedRecord &&
            canManageDefinitionRecord(selectedRecord)
          "
          type="primary"
          :disabled="detailLoading || detailError"
          @click="editDetail(selectedRecord)"
        >
          <IconifyIcon icon="lucide:pencil" />{{
            buttonLabel('edit', 'system.common.edit')
          }}
        </Button>
      </template>
    </template>
  </ManagementDrawer>
</template>
