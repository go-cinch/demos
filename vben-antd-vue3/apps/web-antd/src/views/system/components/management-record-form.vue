<script setup lang="ts">
import type {
  ActionGroupOption,
  FieldDefinition,
  FormModel,
  FormValidationRule,
  ResourceKind,
  SearchableSelectOption,
  SystemRecord,
} from './management-types';

import { onBeforeUnmount, ref, watch } from 'vue';

import { useDebounceFn } from '@vueuse/core';
import {
  Alert,
  AutoComplete,
  FormItem,
  Input,
  InputPassword,
  Select,
  Switch,
  Textarea,
} from 'ant-design-vue';

import { listActionGroups, listRoles } from '#/api';
import { renderSkeletonOptions } from '#/components/skeleton-options';
import { $t } from '#/locales';

import ActionEditor from './action-editor.vue';
import AssociationEditor from './association-editor.vue';
import GroupMembers from './group-members.vue';
import ManagementForm from './management-form.vue';
import { matchingSegments } from './management-search-utils';
import PermissionAssignment from './permission-assignment.vue';
import RuleListEditor from './rule-list-editor.vue';
import SystemRecordDetail from './system-record-detail.vue';
import { memberCount } from './system-record-format';
const props = defineProps<{
  resource: ResourceKind;
  formModel: FormModel;
  formRules: Record<string, FormValidationRule[]>;
  editorFields: FieldDefinition[];
  editingRecord: null | SystemRecord;
  submitting: boolean;
  canUpdate: boolean;
  canCreate: boolean;
  canAssignPermissions: boolean;
  groups: string[];
  editorError: string;
}>();
const emit = defineEmits<{
  'editExisting': [id: number];
  'actionValidity': [key: string];
  'assignmentValidity': [key: string];
}>();
const formModel = props.formModel;
const formRef = ref<InstanceType<typeof ManagementForm>>();
const actionGroupOptions = ref<ActionGroupOption[]>([]);
const actionGroupOptionsLoading = ref(false);
const actionGroupOptionsQuery = ref('');
const initialActionGroup = ref('');
const roleOptions = ref<SearchableSelectOption<number>[]>([]);
const roleOptionsLoading = ref(false);
const roleOptionsQuery = ref('');
let actionGroupOptionsRequestId = 0;

function fallbackActionGroupOptions(query: string): ActionGroupOption[] {
  const initialGroup = initialActionGroup.value;
  const options: ActionGroupOption[] =
    initialGroup &&
    (!query || initialGroup.toLowerCase().includes(query.toLowerCase()))
      ? [{ label: initialGroup, value: initialGroup }]
      : [];
  if (
    query &&
    !options.some(
      (option) => option.value.toLowerCase() === query.toLowerCase(),
    )
  ) {
    options.unshift({ isNew: true, label: query, value: query });
  }
  return options;
}

const loadActionGroupOptions = useDebounceFn(
  async (query: string, requestId: number) => {
    try {
      const result = await listActionGroups(query);
      if (requestId !== actionGroupOptionsRequestId) return;

      const groups = new Map<string, string>();
      for (const item of result.items) {
        const group = item.trim();
        if (group) groups.set(group.toLowerCase(), group);
      }
      const initialGroup = initialActionGroup.value;
      if (
        initialGroup &&
        (!query || initialGroup.toLowerCase().includes(query.toLowerCase()))
      ) {
        groups.set(initialGroup.toLowerCase(), initialGroup);
      }
      const options: ActionGroupOption[] = [...groups.values()]
        .sort((left, right) => left.localeCompare(right))
        .map((group) => ({ label: group, value: group }));
      if (query && !groups.has(query.toLowerCase())) {
        options.unshift({ isNew: true, label: query, value: query });
      }
      actionGroupOptions.value = options;
    } catch {
      if (requestId === actionGroupOptionsRequestId) {
        actionGroupOptions.value = fallbackActionGroupOptions(query);
      }
    } finally {
      if (requestId === actionGroupOptionsRequestId) {
        actionGroupOptionsLoading.value = false;
      }
    }
  },
  250,
);

function searchActionGroupOptions(value: string) {
  const requestId = ++actionGroupOptionsRequestId;
  const query = value.trim();
  actionGroupOptionsQuery.value = query;
  actionGroupOptions.value = fallbackActionGroupOptions(query);
  actionGroupOptionsLoading.value = true;
  void loadActionGroupOptions(query, requestId);
}

function handleActionGroupDropdownVisibleChange(open: boolean) {
  if (open) searchActionGroupOptions('');
}

let roleOptionsRequestId = 0;

function retainSelectedRoleOption() {
  const selectedRoleId = Number(formModel.role_id);
  roleOptions.value = roleOptions.value.filter(
    (option) => option.value === selectedRoleId,
  );
}

const loadRoleOptions = useDebounceFn(
  async (query: string, requestId: number) => {
    try {
      const result = await listRoles({
        f: 'id,name,word',
        p: 1,
        q: query || undefined,
        s: 20,
      });
      if (requestId !== roleOptionsRequestId) return;

      const selectedRoleId = Number(formModel.role_id);
      const options = new Map(
        roleOptions.value
          .filter((option) => option.value === selectedRoleId)
          .map((option) => [option.value, option]),
      );
      for (const item of result.items) {
        options.set(item.id, {
          label: `${item.name} · ${item.word}`,
          value: item.id,
        });
      }
      roleOptions.value = [...options.values()];
    } catch {
      if (requestId === roleOptionsRequestId) retainSelectedRoleOption();
    } finally {
      if (requestId === roleOptionsRequestId) {
        roleOptionsLoading.value = false;
      }
    }
  },
  250,
);

function searchRoleOptions(value: string) {
  const requestId = ++roleOptionsRequestId;
  const query = value.trim();
  roleOptionsQuery.value = query;
  roleOptionsLoading.value = true;
  void loadRoleOptions(query, requestId);
}

function handleRoleDropdownVisibleChange(open: boolean) {
  if (open) searchRoleOptions('');
}

watch(
  () => props.editingRecord,
  (value) => {
    const record = value as import('@vben/types').Recordable<any> | null;
    actionGroupOptionsRequestId += 1;
    actionGroupOptionsLoading.value = false;
    actionGroupOptionsQuery.value = '';
    initialActionGroup.value =
      record && props.resource === 'action' && typeof record.group === 'string'
        ? record.group
        : '';
    actionGroupOptions.value = fallbackActionGroupOptions('');
    roleOptionsRequestId += 1;
    roleOptionsLoading.value = false;
    roleOptionsQuery.value = '';
    const currentRole =
      record && props.resource === 'user'
        ? (record.role_summary ?? record.role)
        : undefined;
    roleOptions.value = currentRole
      ? [
          {
            label: `${currentRole.name} · ${currentRole.word}`,
            value: currentRole.id,
          },
        ]
      : [];
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  actionGroupOptionsRequestId += 1;
  roleOptionsRequestId += 1;
});
defineExpose({
  validate: () => formRef.value?.validate(),
  clearValidate: () => formRef.value?.clearValidate(),
});
</script>
<template>
  <ManagementForm
    ref="formRef"
    :model="formModel"
    :rules="formRules"
    :disabled="submitting || !(editingRecord ? canUpdate : canCreate)"
    vertical
    data-testid="management-editor"
  >
    <ActionEditor
      v-if="resource === 'action'"
      :record-id="editingRecord?.id"
      :record-scope="formModel.scope"
      :groups="groups"
      @edit-existing="emit('editExisting', $event)"
      v-model:word="formModel.word"
      v-model:names="formModel.names"
      v-model:group="formModel.group"
      v-model:config="formModel.config"
      :disabled="submitting"
      @validity="emit('actionValidity', $event)"
    />
    <SystemRecordDetail
      v-else
      :record="editingRecord"
      :resource="resource"
      editing
    >
      <template
        v-for="field in editorFields"
        :key="field.key"
        #[`field-${field.key}`]
      >
        <FormItem
          :class="{
            'editor-code':
              field.type === 'json' ||
              ['resource', 'menu', 'button'].includes(field.key),
          }"
          :label="
            editingRecord && field.editLabel ? field.editLabel : field.label
          "
          :name="field.key"
          :html-for="`editor-${resource}-${field.key}`"
        >
          <AutoComplete
            v-if="field.type === 'action-group'"
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            allow-clear
            autocomplete="off"
            :filter-option="false"
            :not-found-content="actionGroupOptionsLoading ? ' ' : null"
            :options="actionGroupOptions"
            :placeholder="$t('system.suggestions.actionGroup')"
            :show-action="['focus']"
            @dropdown-visible-change="handleActionGroupDropdownVisibleChange"
            @search="searchActionGroupOptions"
            :dropdown-render="
              ({ menuNode } = {}) =>
                renderSkeletonOptions(menuNode, actionGroupOptionsLoading)
            "
          >
            <template #option="{ isNew, label }">
              <span v-if="isNew" class="text-muted-foreground">{{
                $t('system.hints.createGroup', { name: label })
              }}</span>
              <template v-else>
                <span
                  v-for="(segment, index) in matchingSegments(
                    String(label),
                    actionGroupOptionsQuery,
                  )"
                  :key="index"
                  :class="{ 'font-bold text-red-500': segment.matched }"
                >
                  {{ segment.text }}
                </span>
              </template>
            </template>
          </AutoComplete>
          <RuleListEditor
            v-else-if="['resource', 'menu', 'button'].includes(field.key)"
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            :label="field.label"
            :disabled="submitting"
            :placeholder="
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
          <Textarea
            v-else-if="field.type === 'textarea' || field.type === 'json'"
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            :auto-size="
              field.type === 'json'
                ? { minRows: 8, maxRows: 12 }
                : { minRows: 2, maxRows: 6 }
            "
            :placeholder="
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
          <InputPassword
            v-else-if="field.type === 'password'"
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            :placeholder="
              (editingRecord && field.editPlaceholder) ||
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
          <Select
            v-else-if="field.type === 'category'"
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            :options="[
              { label: $t('system.category.permission'), value: 0 },
              { label: $t('system.category.jwt'), value: 1 },
            ]"
          />
          <div v-else-if="field.type === 'enabled'" class="editor-switch">
            <Switch
              v-model:checked="formModel[field.key]"
              :aria-label="field.label"
            />
            <span>{{
              $t(
                formModel[field.key]
                  ? 'system.enabled.yes'
                  : 'system.enabled.no',
              )
            }}</span>
          </div>
          <Select
            v-else-if="field.type === 'status'"
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            :options="[
              { label: $t('system.status.pending'), value: 0 },
              { label: $t('system.status.active'), value: 1 },
              { label: $t('system.status.locked'), value: 2 },
            ]"
          />
          <PermissionAssignment
            v-else-if="field.type === 'action-select'"
            :value="formModel[field.key]"
            v-model:bindings="formModel.action_bindings"
            :key="`${resource}:${editingRecord?.id ?? 'new'}`"
            :id="`editor-${resource}-${field.key}`"
            :disabled="submitting || !canAssignPermissions"
            @validity="emit('assignmentValidity', $event)"
          />
          <Select
            v-else-if="field.type === 'role-select'"
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            allow-clear
            :filter-option="false"
            :loading="false"
            :options="roleOptions"
            :placeholder="$t('system.suggestions.role')"
            show-search
            @dropdown-visible-change="handleRoleDropdownVisibleChange"
            @search="searchRoleOptions"
            :dropdown-render="
              ({ menuNode } = {}) =>
                renderSkeletonOptions(menuNode, roleOptionsLoading)
            "
          >
            <template #option="{ label }">
              <span
                v-for="(segment, index) in matchingSegments(
                  String(label),
                  roleOptionsQuery,
                )"
                :key="index"
                :class="{ 'font-bold text-red-500': segment.matched }"
              >
                {{ segment.text }}
              </span>
            </template>
          </Select>
          <GroupMembers
            v-else-if="field.type === 'user-select' && editingRecord"
            :key="editingRecord.id"
            v-model:value="formModel[field.key]"
            :group-id="editingRecord.id"
            :count="memberCount(editingRecord)"
            editable
            :disabled="submitting"
          />
          <AssociationEditor
            v-else-if="field.type === 'user-select'"
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            kind="user"
            :disabled="submitting"
            :records="
              editingRecord && 'users' in editingRecord
                ? editingRecord.users
                : []
            "
          />
          <Input
            v-else
            v-model:value="formModel[field.key]"
            :id="`editor-${resource}-${field.key}`"
            :placeholder="
              field.placeholder ||
              $t('system.common.enter', { field: field.label })
            "
          />
        </FormItem>
      </template>
    </SystemRecordDetail>
    <Alert
      v-if="editorError"
      class="mt-5"
      type="error"
      show-icon
      :message="editorError"
    />
  </ManagementForm>
</template>
