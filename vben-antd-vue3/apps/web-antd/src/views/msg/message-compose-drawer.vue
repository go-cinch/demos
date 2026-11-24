<script setup lang="ts">
import type { MsgInput, MsgPreview } from '#/api/msg';

import { computed, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { formatDateTime, getCurrentTimezone } from '@vben/utils';

import {
  Alert,
  Button,
  DatePicker,
  FormItem,
  Input,
  message,
  Modal,
  Select,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { msgApi, msgChanged } from '#/api/msg';
import { isTransportFailure } from '#/api/request-error';
import { showRequestErrorToast } from '#/api/request-feedback';
import { quietRequest } from '#/api/request-types';
import { $t } from '#/locales';
import { VerificationCancelled } from '#/security/verification-prompt';

import AssociationEditor from '../system/components/association-editor.vue';
import ManagementDrawer from '../system/components/management-drawer.vue';
import ManagementForm from '../system/components/management-form.vue';
import MessageRecordBody from './message-record-body.vue';

const props = defineProps<{
  canSend: boolean;
  recordId?: number;
  published: (record: MsgPreview) => Promise<void>;
  refresh: () => Promise<void>;
}>();
const compose = defineModel<boolean>('open', { required: true });
const busy = defineModel<boolean>('busy', { required: true });
const detailOpen = defineModel<boolean>('detailOpen', { required: true });
const sending = ref(false);
const attempted = ref(false);
const rejectedRecipientIds = ref('');
const composeSnapshot = ref('');
function emptyDraft(): Omit<MsgInput, 'scope'> & { scope?: MsgInput['scope'] } {
  return {
    title: '',
    content: '',
    type: 'notice',
    recipient_ids: [],
    expired_at: null,
  };
}
const form = ref(emptyDraft());
const pendingSends = reactive(new Map<string, string>());
const sendPayload = computed(() => {
  const { scope, recipient_ids, ...draft } = form.value;
  if (!scope) return undefined;
  return {
    ...draft,
    scope,
    recipient_ids: scope === 'targeted' ? (recipient_ids ?? []) : [],
  };
});
const sendSignature = computed(() => JSON.stringify(sendPayload.value ?? null));
const confirmingSend = computed(() => pendingSends.has(sendSignature.value));
const sendLabel = computed(() => {
  if (confirmingSend.value) return 'msg.confirmSend';
  return pendingSends.size > 0 ? 'msg.sendAsNew' : 'msg.send';
});
function recipientIssue() {
  const { scope, recipient_ids: ids } = form.value;
  if (scope !== 'targeted') return '';
  if (!ids?.length || ids.length > 1000) return $t('msg.recipientError');
  return ids.join(',') === rejectedRecipientIds.value
    ? $t('msg.invalidRecipients')
    : '';
}
const issues = computed(() => ({
  title:
    !form.value.title.trim() || [...form.value.title.trim()].length > 200
      ? $t('msg.titleError')
      : '',
  content:
    !form.value.content.trim() || [...form.value.content.trim()].length > 20_000
      ? $t('msg.contentError')
      : '',
  scope: form.value.scope ? '' : $t('msg.chooseAudience'),
  recipients: recipientIssue(),
  expiry:
    !confirmingSend.value &&
    form.value.expired_at !== null &&
    (!Number.isFinite(form.value.expired_at) ||
      form.value.expired_at <= Date.now())
      ? $t('msg.expiryError')
      : '',
}));
watch(
  compose,
  (open) => {
    if (!open) return;
    form.value = emptyDraft();
    attempted.value = false;
    rejectedRecipientIds.value = '';
    pendingSends.clear();
    composeSnapshot.value = JSON.stringify(form.value);
  },
  { flush: 'sync' },
);
async function send() {
  if (busy.value || sending.value || !props.canSend) return;
  attempted.value = true;
  const payload = sendPayload.value;
  if (!payload || Object.values(issues.value).some(Boolean)) return;
  sending.value = true;
  busy.value = true;
  const signature = sendSignature.value;
  const sendKey = pendingSends.get(signature) ?? crypto.randomUUID();
  try {
    const published = await msgApi.send(payload, sendKey, quietRequest);
    pendingSends.clear();
    message.success($t('msg.sent'));
    msgChanged();
    await props.published(published);
    compose.value = false;
  } catch (error) {
    const response = (
      error as {
        response?: { status?: number; data?: { error_code?: string } };
      }
    )?.response;
    if (error instanceof VerificationCancelled) return;
    if (isTransportFailure(error)) {
      pendingSends.set(signature, sendKey);
    } else if (
      confirmingSend.value &&
      response?.status === 404 &&
      response.data?.error_code === 'MSG_NOT_FOUND'
    ) {
      pendingSends.clear();
      compose.value = false;
      message.info($t('msg.sendWithdrawn'));
      await props.refresh();
    } else if (
      payload.scope === 'targeted' &&
      response?.data?.error_code === 'MSG_INVALID_RECIPIENT'
    ) {
      rejectedRecipientIds.value = payload.recipient_ids.join(',');
    } else {
      showRequestErrorToast(error);
    }
  } finally {
    sending.value = false;
    busy.value = false;
  }
}
function closeCompose(): Promise<boolean> {
  if (busy.value || sending.value) return Promise.resolve(false);
  if (!compose.value || JSON.stringify(form.value) === composeSnapshot.value) {
    compose.value = false;
    return Promise.resolve(true);
  }
  return new Promise((resolve) =>
    Modal.confirm({
      title: $t('msg.unsaved'),
      okText: $t('msg.confirm'),
      cancelText: $t('msg.cancel'),
      onOk() {
        compose.value = false;
        resolve(true);
      },
      onCancel() {
        resolve(false);
      },
    }),
  );
}

function closeDrawer() {
  if (busy.value || sending.value) return;
  if (compose.value) void closeCompose();
  else detailOpen.value = false;
}
defineExpose({ closeCompose });
</script>

<template>
  <ManagementDrawer
    :open="compose || detailOpen"
    :title="$t(compose ? 'msg.send' : 'msg.detail')"
    :entity="$t('msg.manage')"
    :record-id="compose ? undefined : recordId"
    :mode="compose ? 'create' : 'detail'"
    :busy="busy"
    @close="closeDrawer"
  >
    <slot v-if="!compose" name="detail"></slot>
    <ManagementForm
      v-else
      :disabled="busy"
      vertical
      data-testid="message-editor"
    >
      <Alert
        v-if="pendingSends.size"
        :message="$t('msg.sendUnknown')"
        type="warning"
        show-icon
      />
      <MessageRecordBody editing :scope="form.scope">
        <template #title>
          <FormItem
            :label="$t('msg.title')"
            required
            :validate-status="attempted && issues.title ? 'error' : ''"
            :help="attempted ? issues.title : ''"
          >
            <Input v-model:value="form.title" :aria-label="$t('msg.title')" />
          </FormItem>
        </template>
        <template #content>
          <FormItem
            :label="$t('msg.content')"
            required
            :validate-status="attempted && issues.content ? 'error' : ''"
            :help="attempted ? issues.content : ''"
          >
            <Input.TextArea
              v-model:value="form.content"
              :aria-label="$t('msg.content')"
              :auto-size="{ minRows: 5, maxRows: 12 }"
            />
          </FormItem>
        </template>
        <template #type>
          <FormItem html-for="msg-type" :label="$t('msg.type')">
            <Select
              id="msg-type"
              v-model:value="form.type"
              :aria-label="$t('msg.type')"
              :options="
                ['system', 'notice'].map((value) => ({
                  value,
                  label: $t(`msg.${value}`),
                }))
              "
            />
          </FormItem>
        </template>
        <template #scope>
          <FormItem
            html-for="msg-scope"
            :label="$t('msg.scope')"
            required
            :validate-status="attempted && issues.scope ? 'error' : ''"
            :help="attempted ? issues.scope : ''"
          >
            <Select
              id="msg-scope"
              v-model:value="form.scope"
              :placeholder="$t('msg.chooseAudience')"
              :aria-label="$t('msg.scope')"
              :options="
                ['all', 'targeted'].map((value) => ({
                  value,
                  label: $t(`msg.${value}`),
                }))
              "
            />
          </FormItem>
        </template>
        <template #recipients>
          <FormItem
            v-show="form.scope === 'targeted'"
            html-for="msg-recipients"
            :label="$t('msg.recipients')"
            required
            :validate-status="attempted && issues.recipients ? 'error' : ''"
            :help="attempted ? issues.recipients : ''"
          >
            <AssociationEditor
              id="msg-recipients"
              :value="form.recipient_ids"
              kind="recipient"
              :disabled="busy"
              @update:value="form.recipient_ids = $event.map(Number)"
            />
          </FormItem>
        </template>
        <template #expiry>
          <FormItem
            :label="$t('msg.expiry')"
            :validate-status="attempted && issues.expiry ? 'error' : ''"
            :help="attempted ? issues.expiry : ''"
          >
            <DatePicker
              :value="
                form.expired_at
                  ? dayjs(formatDateTime(form.expired_at))
                  : undefined
              "
              format="YYYY-MM-DD HH:mm:ss"
              show-time
              :placeholder="$t('msg.noExpiry')"
              @change="
                (v) =>
                  (form.expired_at = v
                    ? dayjs
                        .tz(
                          dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
                          getCurrentTimezone(),
                        )
                        .valueOf()
                    : null)
              "
            />
          </FormItem>
        </template>
      </MessageRecordBody>
    </ManagementForm>
    <template #footer>
      <Button :disabled="busy" @click="closeDrawer">
        {{ $t(compose ? 'msg.cancel' : 'system-cards.backToList') }}
      </Button>
      <Button
        v-if="compose"
        type="primary"
        :loading="busy"
        :aria-busy="busy"
        @click="send"
      >
        <IconifyIcon icon="lucide:send" />{{ $t(sendLabel) }}
      </Button>
      <slot v-else name="detail-actions"></slot>
    </template>
  </ManagementDrawer>
</template>
