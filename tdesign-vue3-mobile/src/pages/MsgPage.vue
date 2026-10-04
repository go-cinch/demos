<script setup lang="ts">
import type { Msg, MsgInput } from "../lib/msg";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { session } from "../lib/api";
import { msgApi, msgChanged } from "../lib/msg";
import { dateTime, parseDateTime } from "../lib/format";
import { useUnsavedForm } from "../lib/unsaved-form";
import { t } from "../locales";
import Sheet from "../components/Sheet.vue";
import Icon from "../components/Icon.vue";
import EditorForm from "../components/EditorForm.vue";
import RecordPagination from "../components/RecordPagination.vue";
import ResultToolbar from "../components/ResultToolbar.vue";
import ResultOptions from "../components/ResultOptions.vue";
import Field from "../components/Field.vue";
import RemoteSelect from "../components/RemoteSelect.vue";
import DateTimeField from "../components/DateTimeField.vue";
import DiscardSheet from "../components/DiscardSheet.vue";
import PageSkeleton from "../components/PageSkeleton.vue";
const route = useRoute();
const tr = (key: string, params?: Record<string, string | number>) =>
  t(`app.msg.${key}`, params);
const sent = computed(() => route.path === "/system/msg");
const permitted = (action: string) =>
  session.user?.permission.btns.some(
    (code: string) => code === "*" || code === `system.msg.${action}`,
  ) ?? false;
const canRead = computed(() => !sent.value || permitted("read"));
const canSend = computed(() => sent.value && permitted("send"));
const canDelete = computed(() => !sent.value || permitted("delete"));
const rows = ref<Msg[]>([]),
  total = ref(0),
  page = ref(1),
  size = ref(20);
const loading = ref(false),
  error = ref(""),
  busy = ref(false),
  status = ref(""),
  type = ref("");
const selected = ref<Msg>(),
  detailOpen = ref(false),
  detailLoading = ref(false);
const compose = ref(false),
  attempted = ref(false),
  sendError = ref(""),
  expiry = ref("");
const form = ref<MsgInput>({
  title: "",
  content: "",
  type: "notice",
  scope: "all",
  recipient_ids: [],
  expired_at: null,
});
const density = ref("default");
const bordered = ref(false),
  striped = ref(false),
  sticky = ref(true);
const visible = ref(["type", "scope", "published_at"]);
const columns = computed(() =>
  ["title", "type", "scope", "published_at"].map((key) => ({
    key,
    title: tr(key === "published_at" ? "published" : key),
  })),
);
const composeForm = ref<InstanceType<typeof EditorForm>>();
const composeSheet = ref<InstanceType<typeof Sheet>>();
const settings = ref("");
const selecting = ref(false);
const checkedIDs = ref<number[]>([]);
const checkedVisible = computed(() =>
  checkedIDs.value.filter((id) => rows.value.some((row) => row.id === id)),
);
const pendingIDs = ref<number[]>([]);
function requestBulk(read = false) {
  if (
    busy.value ||
    !checkedVisible.value.length ||
    (read ? sent.value : !canDelete.value)
  )
    return;
  pendingIDs.value = [...checkedVisible.value];
  confirmation.value = read ? "readSelected" : "deleteSelected";
}
const confirmation = ref<"delete" | "deleteSelected" | "readSelected" | "">("");
const confirmOpen = computed({
  get: () => !!confirmation.value,
  set: (v: boolean) => {
    if (!v) confirmation.value = "";
  },
});
let generation = 0,
  detailGeneration = 0,
  sendKey = "",
  lastPayload = "",
  initialDraft = "";
const dirty = () =>
  compose.value &&
  (JSON.stringify(form.value) !== initialDraft || !!expiry.value);
const { discardOpen, decide, beforeClose } = useUnsavedForm(
  dirty,
  () => busy.value,
);
const issues = computed(() => ({
  title:
    !form.value.title.trim() || [...form.value.title.trim()].length > 200
      ? tr("titleError")
      : "",
  content:
    !form.value.content.trim() || [...form.value.content.trim()].length > 20000
      ? tr("contentError")
      : "",
  recipients:
    form.value.scope === "targeted" &&
    (!form.value.recipient_ids?.length ||
      form.value.recipient_ids.length > 1000)
      ? tr("recipientError")
      : "",
  expiry:
    expiry.value &&
    (!parseDateTime(expiry.value).isValid() ||
      parseDateTime(expiry.value).valueOf() <= Date.now())
      ? tr("expiryError")
      : "",
}));
async function load() {
  const current = ++generation;
  if (!canRead.value) {
    rows.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await msgApi.list(sent.value, {
      p: page.value,
      s: size.value,
      ...(type.value ? { type: type.value } : {}),
      ...(!sent.value && status.value ? { read: status.value === "read" } : {}),
    });
    if (current !== generation) return;
    if (
      !result.items.length &&
      page.value > 1 &&
      result.t <= (page.value - 1) * size.value
    ) {
      page.value--;
      return;
    }
    rows.value = result.items;
    total.value = result.t;
  } catch (e) {
    if (current === generation) {
      error.value = (e as Error).message;
      rows.value = [];
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function openDetail(row: Msg) {
  const current = ++detailGeneration;
  detailOpen.value = true;
  selected.value = undefined;
  detailLoading.value = true;
  error.value = "";
  try {
    const result = await msgApi.get(row.id, sent.value);
    if (current !== detailGeneration || !detailOpen.value) return;
    selected.value = result;
    if (!sent.value && !result.read_at) {
      await msgApi.read(result.id);
      result.read_at = Date.now();
      msgChanged();
      await load();
    }
  } catch (e) {
    error.value = (e as Error).message;
    detailOpen.value = false;
  } finally {
    if (current === detailGeneration) detailLoading.value = false;
  }
}
async function mark(row: Msg) {
  busy.value = true;
  try {
    await msgApi.read(row.id);
    msgChanged();
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function readAll() {
  if (busy.value || sent.value) return;
  busy.value = true;
  error.value = "";
  try {
    await msgApi.readAll();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    msgChanged();
    await load();
    busy.value = false;
  }
}
async function confirm() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (
      confirmation.value === "deleteSelected" ||
      confirmation.value === "readSelected"
    ) {
      for (const id of [...pendingIDs.value]) {
        if (confirmation.value === "readSelected") await msgApi.read(id);
        else await msgApi.remove(id, sent.value);
        pendingIDs.value = pendingIDs.value.filter((value) => value !== id);
        checkedIDs.value = checkedIDs.value.filter((value) => value !== id);
      }
    } else if (selected.value)
      await msgApi.remove(selected.value.id, sent.value);
    checkedIDs.value = [];
    confirmation.value = "";
    detailOpen.value = false;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    msgChanged();
    await load();
    busy.value = false;
  }
}
function newMessage() {
  form.value = {
    title: "",
    content: "",
    type: "notice",
    scope: "all",
    recipient_ids: [],
    expired_at: null,
  };
  expiry.value = "";
  attempted.value = false;
  sendError.value = "";
  sendKey = crypto.randomUUID();
  lastPayload = "";
  initialDraft = JSON.stringify(form.value);
  compose.value = true;
}
async function send() {
  if (busy.value) return;
  attempted.value = true;
  if (Object.values(issues.value).some(Boolean)) {
    await composeForm.value?.focusInvalid();
    return;
  }
  busy.value = true;
  sendError.value = "";
  try {
    const payload = {
      ...form.value,
      recipient_ids:
        form.value.scope === "targeted" ? form.value.recipient_ids : [],
      expired_at: expiry.value ? parseDateTime(expiry.value).valueOf() : null,
    };
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPayload) {
      sendKey = crypto.randomUUID();
      lastPayload = serialized;
    }
    await msgApi.send(payload, sendKey);
    compose.value = false;
    msgChanged();
    if (page.value !== 1) page.value = 1;
    else await load();
  } catch (e) {
    sendError.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
watch([sent, status, type, size], () => {
  page.value = 1;
  detailOpen.value = false;
  void load();
});
watch(sent, () => {
  confirmation.value = "";
});
watch([sent, page, size, status, type], () => {
  checkedIDs.value = [];
});
watch(page, load);
watch(canRead, load, { immediate: true });
function refreshVisible() {
  if (!document.hidden && !busy.value && !loading.value && canRead.value)
    void load();
}
let refreshTimer: ReturnType<typeof setInterval>;
onMounted(() => {
  refreshTimer = setInterval(refreshVisible, 30000);
  window.addEventListener("cinch-msg-changed", refreshVisible);
  document.addEventListener("visibilitychange", refreshVisible);
});
onBeforeUnmount(() => {
  clearInterval(refreshTimer);
  window.removeEventListener("cinch-msg-changed", refreshVisible);
  document.removeEventListener("visibilitychange", refreshVisible);
  generation++;
  detailGeneration++;
});
</script>
<template>
  <section
    class="page management"
    data-testid="message-management-page"
    :class="[
      `density-${density}`,
      { bordered, striped, 'sticky-toolbar': sticky },
    ]"
    :aria-busy="loading"
  >
    <header class="page-heading">
      <RouterLink
        :to="sent ? '/dashboard/overview?tab=manage' : '/dashboard/overview'"
        class="back-link"
        :aria-label="t(sent ? 'manage' : 'home')"
        ><Icon name="chevron-left" :size="22"
      /></RouterLink>
      <div>
        <h1>{{ tr(sent ? "manage" : "inbox") }}</h1>
      </div>
    </header>
    <section class="search-region">
      <Field name="msg-filter-type" :label="tr('type')"
        ><RemoteSelect
          v-model="type"
          name="msg-filter-type"
          :label="tr('type')"
          :options="[
            { value: '', label: tr('allTypes') },
            { value: 'system', label: tr('system') },
            { value: 'notice', label: tr('notice') },
          ]"
      /></Field>
      <div
        v-if="!sent"
        class="segmented msg-status-filter"
        role="group"
        :aria-label="tr('read')"
      >
        <button
          v-for="value in ['', 'unread', 'read']"
          :key="value"
          :class="{ active: status === value }"
          :aria-pressed="status === value"
          @click="status = value"
        >
          {{ tr(value || "allStatus") }}
        </button>
      </div>
      <div class="search-actions message-search-actions">
        <button
          class="action-chip action-chip-quiet"
          @click="
            type = '';
            status = '';
          "
        >
          <span>{{ t("system.common.reset") }}</span></button
        ><button class="action-chip action-chip-primary" @click="load">
          <span>{{ t("system.common.search") }}</span>
        </button>
      </div>
    </section>
    <div class="results-region">
      <ResultToolbar
        :can-read="canRead"
        @refresh="load"
        @options="settings = $event"
      >
        <button
          v-if="canSend"
          class="create-button create-labeled"
          @click="newMessage"
        >
          <Icon name="add" :size="20" /><span>{{ tr("send") }}</span>
        </button>
        <button
          v-if="!sent"
          class="action-chip action-chip-quiet"
          :disabled="loading || busy"
          @click="readAll"
        >
          <Icon name="check-double" :size="16" /><span>{{
            tr("readAll")
          }}</span>
        </button>
      </ResultToolbar>
      <div class="selection-tools">
        <div class="selection-actions">
          <button
            v-if="canRead && rows.length && (canDelete || !sent)"
            class="action-chip action-chip-quiet"
            :disabled="busy || loading"
            @click="
              selecting = !selecting;
              checkedIDs = [];
            "
          >
            <Icon
              :name="selecting ? 'check' : 'check-rectangle'"
              :size="16"
            /><span>{{ t(selecting ? "done" : "select") }}</span>
          </button>
          <button
            v-if="selecting"
            class="action-chip action-chip-quiet"
            :disabled="busy || loading"
            @click="
              checkedIDs =
                checkedVisible.length === rows.length
                  ? []
                  : rows.map((row) => row.id)
            "
          >
            <Icon name="check-double" :size="16" /><span>{{
              t("system.common.selectAll")
            }}</span>
          </button>

          <button
            data-testid="message-bulk-delete"
            v-if="checkedVisible.length && canDelete"
            class="action-chip action-chip-danger"
            :disabled="busy || loading"
            @click="requestBulk()"
          >
            <Icon name="delete" :size="16" /><span>{{
              tr("deleteSelected")
            }}</span>
          </button>
          <button
            data-testid="message-bulk-read"
            v-if="checkedVisible.length && !sent"
            class="action-chip action-chip-quiet"
            :disabled="busy || loading"
            @click="requestBulk(true)"
          >
            <Icon name="check" :size="16" /><span>{{ tr("markRead") }}</span>
          </button>
        </div>
        <span class="result-count">{{
          t("system.table.total", { count: total })
        }}</span>
      </div>
      <p v-if="!canRead" class="field-hint">{{ tr("noPermission") }}</p>
      <div v-else-if="error" class="form-error" role="alert">
        <p>{{ error }}</p>
        <button @click="load">{{ tr("retry") }}</button>
      </div>
      <PageSkeleton v-else-if="loading" variant="list" />
      <div v-else class="card record-list">
        <article
          v-for="row in rows"
          :key="row.id"
          class="record-wrap"
          :data-record-id="row.id"
        >
          <div class="record">
            <t-checkbox
              v-if="selecting"
              :checked="checkedVisible.includes(row.id)"
              :disabled="busy || loading"
              :aria-label="`${t('select')} ${row.title}`"
              @change="
                checkedIDs = checkedVisible.includes(row.id)
                  ? checkedIDs.filter((id) => id !== row.id)
                  : [...checkedIDs, row.id]
              "
            />
            <button
              class="record-open"
              :aria-label="`${tr('view')} ${row.title}`"
              @click="openDetail(row)"
            >
              <span class="avatar"><Icon name="notification" /></span>
              <div class="record-main">
                <strong>{{ row.title }}</strong>
                <div class="record-summary">
                  <t-tag
                    v-if="visible.includes('type')"
                    theme="primary"
                    variant="light"
                    >{{ tr(row.type) }}</t-tag
                  ><t-tag v-if="visible.includes('scope')" variant="light">{{
                    tr(row.scope)
                  }}</t-tag
                  ><t-tag
                    v-if="row.expired_at && row.expired_at <= Date.now()"
                    >{{ tr("expired") }}</t-tag
                  >
                </div>
              </div>
              <t-tag
                v-if="!sent"
                :theme="row.read_at ? 'default' : 'primary'"
                >{{ tr(row.read_at ? "read" : "unread") }}</t-tag
              ><Icon name="chevron-right" :size="16" />
            </button>
          </div>
          <div v-if="visible.includes('published_at')" class="record-extra">
            <span>{{ tr("published") }}</span
            ><span>{{ dateTime(row.published_at) }}</span>
          </div>
          <div
            v-if="!sent && !row.read_at"
            class="selection-actions msg-read-action"
          >
            <button
              class="action-chip action-chip-quiet"
              :disabled="busy"
              @click="mark(row)"
            >
              <Icon name="check" :size="16" /><span>{{ tr("markRead") }}</span>
            </button>
          </div>
        </article>
        <t-empty v-if="!rows.length" :description="tr('empty')" />
      </div>
      <RecordPagination
        v-if="canRead"
        :page="page"
        :size="size"
        :total="total"
        :loading="loading"
        @previous="page--"
        @next="page++"
        @page-size="settings = 'pageSize'"
      />
    </div>
    <ResultOptions
      v-model:option="settings"
      v-model:density="density"
      v-model:size="size"
      v-model:visible="visible"
      v-model:bordered="bordered"
      v-model:striped="striped"
      v-model:sticky="sticky"
      :columns="columns"
      fixed-column="title"
    />
    <Sheet v-model="detailOpen" :title="tr('detail')"
      ><PageSkeleton v-if="detailLoading" /><template v-else-if="selected"
        ><div class="detail-identity">
          <span class="avatar large"
            ><Icon name="notification" :size="30"
          /></span>
          <h2>{{ selected.title }}</h2>
        </div>
        <dl class="details">
          <dt>{{ tr("type") }}</dt>
          <dd>
            <t-tag theme="primary" variant="light">{{
              tr(selected.type)
            }}</t-tag>
          </dd>
          <dt>{{ tr("scope") }}</dt>
          <dd>{{ tr(selected.scope) }}</dd>
          <dt>{{ tr("published") }}</dt>
          <dd>{{ dateTime(selected.published_at) }}</dd>
          <dt>{{ tr("content") }}</dt>
          <dd class="msg-content">{{ selected.content }}</dd>
          <dt>{{ tr("expiry") }}</dt>
          <dd>
            {{
              selected.expired_at
                ? dateTime(selected.expired_at)
                : tr("noExpiry")
            }}
          </dd>
        </dl>
        <p v-if="sent && selected.recipient_ids" class="msg-content">
          {{ tr("recipientIDs") }}: {{ selected.recipient_ids.join(", ") }}
        </p>
        <div class="detail-actions">
          <t-button
            v-if="canDelete"
            theme="danger"
            variant="outline"
            @click="confirmation = 'delete'"
            >{{ tr(sent ? "deleteGlobal" : "delete") }}</t-button
          >
        </div></template
      ></Sheet
    >
    <Sheet
      v-model="confirmOpen"
      :title="tr('confirm')"
      :before-close="() => !busy"
      ><p>
        {{
          tr(
            confirmation === "readSelected"
              ? "readSelectedConfirm"
              : confirmation === "deleteSelected"
                ? sent
                  ? "deleteSelectedGlobalConfirm"
                  : "deleteSelectedConfirm"
                : sent
                  ? "deleteGlobalConfirm"
                  : "deleteConfirm",
          )
        }}
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="sheet-actions">
        <t-button :disabled="busy" @click="confirmation = ''">{{
          tr("cancel")
        }}</t-button
        ><t-button
          :theme="
            confirmation === 'delete' || confirmation === 'deleteSelected'
              ? 'danger'
              : 'primary'
          "
          :loading="busy"
          @click="confirm"
          >{{ tr("confirm") }}</t-button
        >
      </div></Sheet
    >
    <Sheet
      ref="composeSheet"
      v-model="compose"
      :title="tr('send')"
      :before-close="beforeClose"
    >
      <EditorForm ref="composeForm" :busy="busy" @submit="send">
        <Field
          name="msg-title"
          :label="tr('title')"
          required
          :error="attempted ? issues.title : ''"
          ><t-input
            v-model="form.title"
            name="msg-title"
            :placeholder="t('system.common.enter', { field: tr('title') })"
        /></Field>
        <Field
          name="msg-content"
          :label="tr('content')"
          required
          :error="attempted ? issues.content : ''"
          ><t-textarea
            v-model="form.content"
            name="msg-content"
            :placeholder="t('system.common.enter', { field: tr('content') })"
            :autosize="{ minRows: 3, maxRows: 9 }"
        /></Field>
        <Field name="msg-type" :label="tr('type')"
          ><RemoteSelect
            v-model="form.type"
            name="msg-type"
            :label="tr('type')"
            :options="
              ['system', 'notice'].map((value) => ({ value, label: tr(value) }))
            "
        /></Field>
        <Field name="msg-scope" :label="tr('scope')"
          ><RemoteSelect
            v-model="form.scope"
            name="msg-scope"
            :label="tr('scope')"
            :options="
              ['all', 'targeted'].map((value) => ({ value, label: tr(value) }))
            "
        /></Field>
        <Field
          v-if="form.scope === 'targeted'"
          name="msg-recipients"
          :label="tr('recipients')"
          required
          :error="attempted ? issues.recipients : ''"
          ><RemoteSelect
            v-model="form.recipient_ids"
            msg-recipients
            multiple
            name="msg-recipients"
            :label="tr('recipients')"
        /></Field>
        <Field
          name="msg-expiry"
          :label="tr('expiry')"
          :error="attempted ? issues.expiry : ''"
          ><DateTimeField id="msg-expiry" v-model="expiry" name="msg-expiry"
        /></Field>
        <template #feedback
          ><p v-if="sendError" class="form-error" role="alert">
            {{ sendError }}
          </p></template
        >
        <template #actions>
          <t-button :disabled="busy" @click="composeSheet?.requestClose()">{{
            t("cancel")
          }}</t-button>
          <t-button :loading="busy" theme="primary" type="submit">{{
            tr("send")
          }}</t-button>
        </template>
      </EditorForm>
    </Sheet>
    <DiscardSheet v-model="discardOpen" @decide="decide" />
  </section>
</template>
<style scoped>
.msg-status-filter {
  grid-template-columns: repeat(3, 1fr);
}
.msg-read-action {
  justify-content: flex-end;
  padding-bottom: 10px;
}
.msg-content {
  max-height: 384px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
