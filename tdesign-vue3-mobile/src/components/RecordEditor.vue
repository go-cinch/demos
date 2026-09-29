<script setup lang="ts">
import { focusFirstInvalid, message, resolveMessage, type Feedback } from '../lib/form-feedback';
import { computed, reactive, ref, watch } from 'vue';
import { useUnsavedForm } from '../lib/unsaved-form';
import DiscardSheet from './DiscardSheet.vue';
import { ApiError, saveResource } from '../lib/api';
import type { RecordData, ResourceKind } from '../lib/types';
import { configs } from '../lib/resource-config';
import { buildChangedPayload } from '../lib/update-payload';
import { dictionaryKeyValid, nonempty, trimCredential } from '../lib/validation';
import { t } from '../locales';
import Sheet from './Sheet.vue';
import Field from './Field.vue';
import RemoteSelect from './RemoteSelect.vue';
const props = defineProps<{ resource: ResourceKind; record: RecordData | null }>();
const open = defineModel<boolean>({ default: false });
const emit = defineEmits<{ saved: [] }>();
const config = computed(() => configs.value[props.resource]);
const form = reactive<Record<string, any>>({});
const errors = ref<Record<string, Feedback>>({});
const formElement = ref<HTMLFormElement>();
const error = ref<Feedback>('');
const sheet = ref<InstanceType<typeof Sheet>>();
const busy = ref(false);
let initial: Record<string, unknown> = {};
let idempotency = '';
const { discardOpen, decide, beforeClose } = useUnsavedForm(
  () => open.value && JSON.stringify(form) !== JSON.stringify(initial),
  () => busy.value,
);
watch(open, (value) => {
  if (!value) return;
  for (const key of Object.keys(form)) delete form[key];
  errors.value = {};
  error.value = '';
  idempotency = crypto.randomUUID();
  for (const field of config.value.fields) {
    let value =
      props.record && Object.hasOwn(props.record, field.key)
        ? props.record[field.key]
        : (field.defaultValue ??
          (field.type.endsWith('-select') ? (field.type === 'role-select' ? undefined : []) : ''));
    if (field.type === 'json') value = props.record ? JSON.stringify(value, null, 2) : value;
    if (field.key === 'user_ids') value = props.record?.users?.map((x) => x.id) || [];
    if (field.key === 'password') value = '';
    form[field.key] = value;
  }
  if (props.resource === 'user') {
    form.display_name = props.record?.metadata?.display_name || '';
    if (props.record) form.department = props.record.metadata?.department || '';
  }
  initial = JSON.parse(JSON.stringify(form));
});
function initialOptions(type: string) {
  const r = props.record;
  if (!r) return [];
  if (type === 'role-select')
    return r.role ? [{ value: r.role.id, label: `${r.role.name} · ${r.role.word}` }] : [];
  if (type === 'user-select')
    return r.users?.map((x) => ({ value: x.id, label: `${x.username} · ${x.code}` })) || [];
  return r.actions?.map((x) => ({ value: x.code, label: `${x.name} · ${x.word}` })) || [];
}
function normalized(source: Record<string, unknown>) {
  const value = { ...source };
  if (props.resource === 'dictionary') value.value = JSON.parse(String(value.value));
  if (props.resource === 'user') {
    value.username = trimCredential(value.username);
    if (typeof value.password === 'string') value.password = trimCredential(value.password);
    value.role_id = Number(value.role_id || 0);
    if (!value.password) delete value.password;
    const metadata = { ...props.record?.metadata };
    for (const field of ['display_name', 'department']) {
      if (value[field]) metadata[field] = value[field];
      else delete metadata[field];
      delete value[field];
    }
    if (Object.keys(metadata).length || props.record?.metadata) value.metadata = metadata;
  }
  return value;
}
async function submit() {
  if (busy.value) return;
  errors.value = {};
  error.value = '';
  for (const field of config.value.fields) {
    if (
      (field.required || (!props.record && field.createRequired)) &&
      (form[field.key] === undefined || !String(form[field.key]).trim())
    )
      errors.value[field.key] = message('system.validation.required', () => ({
        field: config.value.fields.find((item) => item.key === field.key)?.label || field.label,
      }));
  }
  if (props.resource === 'user') {
    if (!nonempty(form.username)) errors.value.username = message('app.validation.username');
    if ((!props.record || form.password) && !nonempty(form.password))
      errors.value.password = message('app.validation.password');
  }
  if (props.resource === 'dictionary') {
    if (!dictionaryKeyValid(form.key))
      errors.value.key = message('system.validation.dictionaryKey');
    try {
      JSON.parse(form.value);
    } catch {
      errors.value.value = message('system.validation.json');
    }
  }
  if (Object.keys(errors.value).length) {
    await focusFirstInvalid(formElement.value);
    return;
  }
  let payload = normalized(form);
  if (props.record) payload = buildChangedPayload(normalized(initial), payload);
  if (!Object.keys(payload).length) {
    error.value = message('system.messages.noChanges');
    return;
  }
  busy.value = true;
  try {
    await saveResource(props.resource, payload, props.record?.id, idempotency);
    open.value = false;
    emit('saved');
  } catch (e) {
    error.value = (e as Error).message;
    if (e instanceof ApiError && e.status !== 409) idempotency = crypto.randomUUID();
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Sheet
    ref="sheet"
    v-model="open"
    :before-close="beforeClose"
    :title="
      t(record ? 'system.common.editTitle' : 'system.common.createTitle', { entity: config.entity })
    "
    ><form ref="formElement" novalidate @submit.prevent="submit">
      <Field
        v-for="field in config.fields"
        :key="field.key"
        :name="`edit-${field.key}`"
        :label="record && field.editLabel ? field.editLabel : field.label"
        :error="errors[field.key]"
        :required="field.required || (!record && field.createRequired)"
        :hint="record ? field.editPlaceholder : undefined"
        ><t-switch
          v-if="field.type === 'enabled'"
          v-model="form[field.key]"
          :aria-label="field.label" /><RemoteSelect
          v-else-if="field.type.endsWith('-select') || field.type === 'action-group'"
          v-model="form[field.key]"
          :name="`edit-${field.key}`"
          :label="field.label"
          :resource="
            field.type === 'role-select'
              ? 'role'
              : field.type === 'user-select'
                ? 'user'
                : field.type === 'action-select'
                  ? 'action'
                  : undefined
          "
          :multiple="['action-select', 'user-select'].includes(field.type)"
          :group="field.type === 'action-group'"
          :initial="initialOptions(field.type)" /><RemoteSelect
          v-else-if="field.type === 'category'"
          v-model="form[field.key]"
          :name="`edit-${field.key}`"
          :label="field.label"
          :options="[
            { value: 0, label: t('system.category.permission') },
            { value: 1, label: t('system.category.jwt') },
          ]" /><t-textarea
          v-else-if="['textarea', 'json'].includes(field.type)"
          :id="`edit-${field.key}`"
          v-model="form[field.key]"
          :name="field.key"
          :class="{ 'json-editor': field.type === 'json' }"
          :autosize="{ minRows: 3, maxRows: 9 }" /><t-input
          v-else
          :id="`edit-${field.key}`"
          v-model="form[field.key]"
          :name="field.key"
          :type="field.type === 'password' ? 'password' : 'text'"
          :autocomplete="field.type === 'password' ? 'new-password' : 'off'"
          :placeholder="
            record && field.editPlaceholder
              ? field.editPlaceholder
              : t('system.common.enter', { field: field.label })
          " /></Field
      ><template v-if="resource === 'user'"
        ><Field name="edit-display_name" :label="t('displayName')"
          ><t-input id="edit-display_name" v-model="form.display_name" name="display_name" /></Field
        ><Field v-if="record" name="edit-department" :label="t('department')"
          ><t-input id="edit-department" v-model="form.department" name="department" /></Field
      ></template>
      <p v-if="error" class="form-error" role="alert">{{ resolveMessage(error) }}</p>
      <div class="sheet-actions">
        <t-button :disabled="busy" @click="sheet?.requestClose()">{{ t('cancel') }}</t-button
        ><t-button theme="primary" type="submit" :loading="busy">{{
          record ? t('save') : t('system.common.create')
        }}</t-button>
      </div>
    </form></Sheet
  >
  <DiscardSheet v-model="discardOpen" @decide="decide" />
</template>
