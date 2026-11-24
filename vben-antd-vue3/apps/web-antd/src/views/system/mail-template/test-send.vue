<script setup lang="ts">
import type { MailContent, MailLocale } from '#/api/mail-template';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  Alert,
  Button,
  Form,
  FormItem,
  Input,
  message,
  Modal,
  Segmented,
  Skeleton,
} from 'ant-design-vue';

import { sendMailTemplateTest } from '#/api/mail-template';
import { showRequestErrorToast } from '#/api/request-feedback';
import LoadWarning from '#/components/load-warning.vue';
import { $t } from '#/locales';
import { VerificationCancelled } from '#/security/verification-prompt';
import { useAuthStore } from '#/store';
import { emailEnabled } from '#/store/system-properties';

import { parameterNames } from './content';

const props = defineProps<{
  id: number;
  locale: MailLocale;
  content: MailContent;
}>();
const emit = defineEmits<{ close: []; sending: [value: boolean] }>();
const t = (key: string) => $t(`mail-template.${key}`);
const router = useRouter();
const auth = useAuthStore();
const selectedLocale = ref<MailLocale>(props.locale);
// Keep both unsaved translations and each language's test edits isolated.
const snapshot: MailContent = JSON.parse(JSON.stringify(props.content));
const translation = computed(() => snapshot[selectedLocale.value]);
const selectedContent = computed(() => ({
  subject: translation.value.subject,
  html: translation.value.html,
  text: translation.value.text,
}));
const names = computed(() =>
  parameterNames(
    `${selectedContent.value.subject}\n${selectedContent.value.html}\n${selectedContent.value.text}`,
  ),
);
const samples = reactive({
  'zh-CN': { ...snapshot['zh-CN'].preview_values },
  'en-US': { ...snapshot['en-US'].preview_values },
});
const values = computed(() => samples[selectedLocale.value]);
const recipient = ref('');
const accountLoading = ref(true);
const accountFailure = ref(false);
const submitted = ref(false);
const sending = ref(false);
const failure = ref('');
let alive = true;
onBeforeUnmount(() => {
  alive = false;
});
async function loadRecipient() {
  accountLoading.value = true;
  accountFailure.value = false;
  recipient.value = '';
  const isCurrent = auth.captureSession();
  try {
    const user = await auth.fetchUserInfo({ fresh: true });
    if (alive && isCurrent())
      recipient.value = user.emailVerifiedAt ? user.email : '';
  } catch {
    if (alive) accountFailure.value = true;
  } finally {
    if (alive) accountLoading.value = false;
  }
}
onMounted(loadRecipient);
async function bindEmail() {
  await router.push({
    path: '/profile',
    query: { tab: 'security', focus: 'email' },
  });
  emit('close');
}
function changeLanguage(value: unknown) {
  selectedLocale.value = value as MailLocale;
  submitted.value = false;
  failure.value = '';
}
const missingValue = (name: string) =>
  submitted.value && !values.value[name]?.trim();
const invalidContent = computed(
  () =>
    !selectedContent.value.subject.trim() ||
    !selectedContent.value.html.trim() ||
    Object.values(selectedContent.value).some((source) =>
      source
        .replaceAll(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, '')
        .includes('{{'),
    ),
);
async function send() {
  if (sending.value || accountLoading.value || !recipient.value) return;
  submitted.value = true;
  failure.value = '';
  if (names.value.some(missingValue) || invalidContent.value) return;
  sending.value = true;
  emit('sending', true);
  try {
    await sendMailTemplateTest(
      props.id,
      {
        locale: selectedLocale.value,
        content: { ...selectedContent.value },
        values: Object.fromEntries(
          names.value.map((name) => [name, values.value[name] ?? '']),
        ),
      },
      crypto.randomUUID(),
    );
    message.success(t('testSent'));
    emit('close');
  } catch (error: any) {
    if (error instanceof VerificationCancelled) return;
    const code = error?.response?.data?.error_code;
    if (code === 'MAIL_TEMPLATE_EMAIL_REQUIRED') {
      recipient.value = '';
      failure.value = 'bindEmailRequired';
    } else if (code === 'MAIL_TEMPLATE_DELIVERY_UNAVAILABLE') {
      failure.value = 'testUnavailable';
    } else {
      showRequestErrorToast(error);
    }
  } finally {
    sending.value = false;
    emit('sending', false);
  }
}
</script>

<template>
  <Modal
    :open="true"
    :title="t('testSend')"
    :ok-text="t('sendTest')"
    :cancel-text="t('cancel')"
    :confirm-loading="sending"
    :ok-button-props="{
      disabled: accountLoading || !recipient || accountFailure,
    }"
    :cancel-button-props="{ disabled: sending }"
    :closable="!sending"
    :mask-closable="!sending"
    :keyboard="!sending"
    :width="560"
    @ok="send"
    @cancel="!sending && emit('close')"
  >
    <p class="mb-4 text-muted-foreground">{{ t('testSendHint') }}</p>
    <Alert
      v-if="invalidContent"
      type="error"
      :message="t('testContentInvalid')"
      class="mb-4"
    />
    <Alert v-if="failure" type="error" :message="t(failure)" class="mb-4" />
    <Form
      layout="vertical"
      :disabled="sending"
      class="max-h-[55vh] overflow-y-auto pr-1"
      @submit.prevent
    >
      <FormItem :label="t('testLanguage')">
        <Segmented
          :value="selectedLocale"
          :options="[
            { label: '中文', value: 'zh-CN' },
            { label: 'English', value: 'en-US' },
          ]"
          :disabled="sending"
          @change="changeLanguage"
        />
      </FormItem>
      <FormItem :label="t('recipient')">
        <Skeleton.Input v-if="accountLoading" active size="small" />
        <LoadWarning
          v-else-if="accountFailure"
          :retry-label="t('retry')"
          retry-size="small"
          @retry="loadRecipient"
        />
        <p
          v-else-if="recipient"
          class="break-all"
          data-testid="mail-test-recipient"
        >
          {{ recipient }}
        </p>
        <div v-else class="flex items-center justify-between gap-3">
          <span class="text-muted-foreground">{{
            t(emailEnabled ? 'bindEmailRequired' : 'testUnavailable')
          }}</span>
          <Button v-if="emailEnabled" @click="bindEmail">
            {{ t('bindEmail') }}
          </Button>
        </div>
      </FormItem>
      <h3 v-if="names.length" class="mb-3 font-medium">
        {{ t('testParameters') }}
      </h3>
      <FormItem
        v-for="name in names"
        :key="name"
        :label="name"
        required
        :validate-status="missingValue(name) ? 'error' : undefined"
        :help="missingValue(name) ? t('testValueRequired') : undefined"
      >
        <Input.TextArea
          v-model:value="values[name]"
          :aria-label="name"
          :auto-size="{ minRows: 1, maxRows: 4 }"
          :maxlength="10000"
        />
      </FormItem>
    </Form>
  </Modal>
</template>
