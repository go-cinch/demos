import type {
  MailLocale,
  MailTemplate,
  MailVersion,
} from '#/api/mail-template';
import type { LoadFailure } from '#/api/request-error';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { userCache } from '@vben/utils/cache';

import { message, Modal } from 'ant-design-vue';

import {
  discardMailTemplateDraft,
  getMailTemplate,
  getMailVersion,
  publishMailTemplate,
  updateMailTemplate,
} from '#/api/mail-template';
import { isTransportFailure, loadFailure } from '#/api/request-error';
import { showRequestErrorToast } from '#/api/request-feedback';
import { useOperationConfirmation } from '#/composables/use-operation-confirmation';
import { $t } from '#/locales';
import { VerificationCancelled } from '#/security/verification-prompt';

import { hasTemplateDifferences } from './comparison';
import { cleanContent, mailLocales, templateIDPattern } from './content';

const t = (key: string, values?: Record<string, unknown>) =>
  $t(`mail-template.${key}`, values ?? {});

export function useMailTemplateDraft(
  props: Readonly<{ id: number; canEdit: boolean; canPublish: boolean }>,
) {
  const record = ref<MailTemplate>();
  const savedSnapshot = ref('');
  const saving = ref(false);
  const discarding = ref(false);
  const autoSaved = ref(false);
  const autoSaveBlocked = ref(false);
  let savePromise: Promise<boolean> | undefined;
  let autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEditAt = 0;
  const busy = ref(false);
  const publishing = ref(false);
  const publicationCheck = ref<'' | 'checking' | 'unknown'>('');
  let unconfirmedPublication: MailTemplate | undefined;
  const failure = ref('');
  const loadError = ref<LoadFailure>(false);
  const loading = ref(true);
  const locale = ref<MailLocale>('zh-CN');
  const mode = ref<'html' | 'text'>('html');
  const tab = ref<'content' | 'versions'>('content');
  const snapshot = (value = record.value) =>
    JSON.stringify(
      value && {
        name: value.name,
        template_id: value.template_id,
        category: value.category,
        content: value.content,
      },
    );
  const dirty = computed(
    () => !!record.value && snapshot() !== savedSnapshot.value,
  );
  // Compare publishable fields with the immutable publication, not the server's
  // sticky has_draft flag or the last autosave. Template IDs are saved separately.
  const published = ref<MailVersion>();
  const publicationError = ref<LoadFailure>(false);
  let publicationRequest = 0;
  const hasPublicationChanges = computed(() => {
    const value = record.value;
    if (!value) return false;
    if (!value.published_version) return true;
    return (
      !!published.value &&
      published.value.version === value.published_version &&
      hasTemplateDifferences(value, published.value)
    );
  });
  async function loadPublication() {
    const sequence = ++publicationRequest;
    const value = record.value;
    published.value = undefined;
    publicationError.value = false;
    if (!value?.published_version) return;
    try {
      const version = await getMailVersion(value.id, value.published_version);
      if (alive && sequence === publicationRequest) published.value = version;
    } catch (error) {
      if (alive && sequence === publicationRequest)
        publicationError.value = loadFailure(error);
    }
  }
  watch(
    () => [record.value?.id, record.value?.published_version],
    (value, previous) => {
      if (value[0] === previous?.[0] && published.value?.version === value[1])
        return;
      if (value[0] !== previous?.[0] || value[1] !== previous?.[1])
        void loadPublication();
    },
  );
  const templateIDError = ref('');
  const sourceError = ref('');
  const titleError = ref('');
  const selectedParameter = ref('');
  let alive = true;
  const ownsEditor = userCache.capture();
  function accept(value: MailTemplate) {
    autoSaved.value = false;
    record.value = value;
    savedSnapshot.value = snapshot();
    templateIDError.value = '';
    titleError.value = '';
    sourceError.value = '';
  }
  async function load() {
    loading.value = true;
    loadError.value = false;
    try {
      const value = await getMailTemplate(props.id);
      if (alive) accept(value);
    } catch (requestError) {
      loadError.value = loadFailure(requestError);
    } finally {
      loading.value = false;
    }
  }
  function valid(publishing = false, quiet = false) {
    if (!record.value?.name.trim()) {
      if (!quiet) failure.value = t('nameRequired');
      return false;
    }
    if (!templateIDPattern.test(record.value.template_id.trim())) {
      if (quiet) return false;
      templateIDError.value = 'idInvalid';
      tab.value = 'content';
      return false;
    }
    for (const language of mailLocales) {
      const value = record.value.content[language];
      for (const key of ['subject', 'html', 'text'] as const) {
        let error = '';
        if (publishing && !value[key].trim() && key !== 'text')
          error = key === 'subject' ? 'subjectRequired' : 'htmlRequired';
        if (
          value[key]
            .replaceAll(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/g, '')
            .includes('{{')
        )
          error = 'parameterInvalid';
        if (error) {
          if (quiet) return false;
          locale.value = language;
          tab.value = 'content';
          if (key === 'subject') titleError.value = error;
          else {
            mode.value = key;
            sourceError.value = error;
          }
          return false;
        }
      }
    }
    return true;
  }
  function showFailure(cause: any) {
    if (cause instanceof VerificationCancelled) return;
    if (cause?.response?.data?.error_code === 'MAIL_TEMPLATE_DUPLICATE') {
      templateIDError.value = 'duplicate';
      tab.value = 'content';
      return;
    }
    if (cause?.response?.data?.error_code === 'MAIL_TEMPLATE_CONFLICT') {
      failure.value = t('conflict');
    } else {
      showRequestErrorToast(cause);
    }
  }
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    if (
      !alive ||
      loading.value ||
      busy.value ||
      saving.value ||
      !props.canEdit ||
      !dirty.value ||
      autoSaveBlocked.value ||
      publicationCheck.value
    )
      return;
    autoSaveTimer = setTimeout(
      () => {
        void save(true);
      },
      Math.max(0, 500 - (Date.now() - lastEditAt)),
    );
  }
  watch(snapshot, () => {
    lastEditAt = Date.now();
    autoSaved.value = false;
    scheduleAutoSave();
  });
  watch([busy, loading, () => props.canEdit], scheduleAutoSave);
  async function save(automatic = false): Promise<boolean> {
    clearTimeout(autoSaveTimer);
    for (let pending = savePromise; pending; pending = savePromise) {
      if (!(await pending)) return false;
      if (!dirty.value) return true;
    }
    if (!ownsEditor() || !alive || !record.value || publicationCheck.value)
      return false;
    if (automatic && (busy.value || autoSaveBlocked.value)) return false;
    if (!dirty.value) return true;
    if (!props.canEdit || !valid(false, automatic)) return false;
    const submittedSnapshot = snapshot();
    const id = record.value.id;
    const payload = {
      revision: record.value.revision,
      name: record.value.name.trim(),
      template_id: record.value.template_id.trim(),
      category: record.value.category,
      content: cleanContent(record.value.content),
    };
    saving.value = true;
    autoSaved.value = false;
    failure.value = '';
    savePromise = (async () => {
      try {
        const value = await updateMailTemplate(id, payload);
        if (!alive) return false;
        if (snapshot() === submittedSnapshot) accept(value);
        else {
          // Keep newer local edits; only advance the persisted baseline and revision.
          record.value = { ...value, ...JSON.parse(snapshot()) };
          savedSnapshot.value = snapshot(value);
        }
        autoSaveBlocked.value = false;
        await nextTick();
        autoSaved.value = automatic && !dirty.value;
        if (!automatic) message.success(t('saved'));
        return true;
      } catch (error) {
        if (alive) {
          autoSaveBlocked.value = true;
          showFailure(error);
        }
        return false;
      } finally {
        savePromise = undefined;
        saving.value = false;
        scheduleAutoSave();
      }
    })();
    return savePromise;
  }
  const { confirmSensitiveOperation } = useOperationConfirmation();
  function discardDraft() {
    if (
      !record.value?.published_version ||
      busy.value ||
      !props.canEdit ||
      !hasPublicationChanges.value
    )
      return;
    confirmSensitiveOperation({
      title: t('discardDraftConfirm'),
      content: t('discardDraftHint'),
      okText: t('discardDraft'),
      cancelText: t('cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!alive || !hasPublicationChanges.value) return;
        discarding.value = true;
        busy.value = true;
        clearTimeout(autoSaveTimer);
        failure.value = '';
        try {
          // Serialize with any in-flight autosave so it cannot resurrect the draft.
          if (savePromise) await savePromise;
          if (!alive || !record.value) return;
          const value = await discardMailTemplateDraft(
            record.value.id,
            record.value.revision,
          );
          if (!alive) return;
          accept(value);
          autoSaveBlocked.value = false;
          tab.value = 'content';
          selectedParameter.value = '';
          message.success(t('draftDiscarded'));
        } catch (error) {
          if (error instanceof VerificationCancelled) return;
          if (alive) {
            autoSaveBlocked.value = true;
            showFailure(error);
          }
        } finally {
          discarding.value = false;
          busy.value = false;
        }
      },
    });
  }
  async function checkPublication() {
    const submitted = unconfirmedPublication;
    if (!submitted || publicationCheck.value === 'checking' || !ownsEditor())
      return;
    const currentEditor = () =>
      alive && ownsEditor() && record.value?.id === submitted.id;
    publicationCheck.value = 'checking';
    try {
      const latest = await getMailTemplate(submitted.id);
      if (!currentEditor()) return;
      const version = latest.published_version
        ? await getMailVersion(latest.id, latest.published_version)
        : undefined;
      if (!currentEditor() || !record.value) return;
      const matched =
        version &&
        version.version === submitted.published_version + 1 &&
        !hasTemplateDifferences(submitted, version);
      const sameDraft = snapshot(latest) === snapshot(submitted);
      if (dirty.value || (!matched && !sameDraft)) {
        // Keep edits entered while offline. Keep their old revision if another
        // editor changed the saved draft, so a later save still detects conflict.
        if (sameDraft) record.value.revision = latest.revision;
        savedSnapshot.value = snapshot(latest);
        record.value.published_version = latest.published_version;
        record.value.has_draft = latest.has_draft;
        autoSaveBlocked.value = true;
      } else {
        accept(latest);
      }
      publicationRequest++;
      published.value = version;
      publicationError.value = false;
      unconfirmedPublication = undefined;
      publicationCheck.value = '';
      if (matched)
        message.success(t('publicationActive', { version: version.version }));
      else
        failure.value = latest.published_version
          ? t('publicationDifferent', { version: latest.published_version })
          : t('publicationNotLive');
    } catch {
      if (currentEditor()) publicationCheck.value = 'unknown';
    }
  }
  async function publish() {
    if (
      !record.value ||
      busy.value ||
      publicationCheck.value ||
      !hasPublicationChanges.value ||
      !valid(true)
    )
      return;
    const key = crypto.randomUUID();
    confirmSensitiveOperation({
      title: t('publishConfirm'),
      content: t('publishHint'),
      okText: t('publish'),
      cancelText: t('cancel'),
      onOk: async () => {
        if (!alive || !hasPublicationChanges.value) return;
        busy.value = true;
        publishing.value = true;
        failure.value = '';
        clearTimeout(autoSaveTimer);
        let submitted: MailTemplate | undefined;
        try {
          if (
            !(await save()) ||
            !props.canPublish ||
            !record.value ||
            !hasPublicationChanges.value ||
            !valid(true)
          )
            return;
          submitted = JSON.parse(JSON.stringify(record.value)) as MailTemplate;
          accept(
            await publishMailTemplate(
              record.value.id,
              record.value.revision,
              key,
            ),
          );
          message.success(t('publishedSuccess'));
        } catch (error) {
          if (
            alive &&
            ownsEditor() &&
            submitted &&
            !(error instanceof VerificationCancelled) &&
            isTransportFailure(error)
          ) {
            unconfirmedPublication = submitted;
            await checkPublication();
          } else if (alive && ownsEditor()) showFailure(error);
        } finally {
          publishing.value = false;
          busy.value = false;
        }
      },
    });
  }
  function restoreVersion(version: number) {
    confirmSensitiveOperation({
      title: t('restoreConfirm'),
      okText: t('restore'),
      cancelText: t('cancel'),
      onOk: async () => {
        busy.value = true;
        clearTimeout(autoSaveTimer);
        try {
          if (savePromise && !(await savePromise)) return;
          const current = record.value;
          if (!current) return;
          const old = await getMailVersion(props.id, version);
          const value = await updateMailTemplate(props.id, {
            revision: current.revision,
            name: old.name,
            category: old.category,
            content: old.content,
          });
          accept(value);
          tab.value = 'content';
          message.success(t('restored'));
        } catch (error) {
          showFailure(error);
        } finally {
          busy.value = false;
        }
      },
    });
  }
  async function confirmLeave(): Promise<boolean> {
    if (!ownsEditor()) return true;
    if (busy.value) return false;
    clearTimeout(autoSaveTimer);
    if (savePromise) await savePromise;
    if (!dirty.value) return true;
    if (
      props.canEdit &&
      !autoSaveBlocked.value &&
      (await save(true)) &&
      !dirty.value
    )
      return true;
    return new Promise((resolve) =>
      Modal.confirm({
        title: t('unsaved'),
        okText: t('discard'),
        cancelText: t('keepEditing'),
        onOk: () => {
          if (record.value) {
            accept({ ...record.value, ...JSON.parse(savedSnapshot.value) });
            autoSaveBlocked.value = false;
            failure.value = '';
          }
          resolve(true);
        },
        onCancel: () => resolve(false),
      }),
    );
  }

  onBeforeUnmount(() => {
    alive = false;
    clearTimeout(autoSaveTimer);
  });
  return {
    record,
    loading,
    loadError,
    load,
    busy,
    dirty,
    saving,
    autoSaved,
    discarding,
    publishing,
    publicationError,
    hasPublicationChanges,
    publicationCheck,
    loadPublication,
    checkPublication,
    failure,
    templateIDError,
    titleError,
    sourceError,
    tab,
    locale,
    mode,
    selectedParameter,
    save,
    discardDraft,
    publish,
    restoreVersion,
    confirmLeave,
  };
}
