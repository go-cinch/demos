<script setup lang="ts">
import type { MsgPreview } from '#/api/msg';

import { computed } from 'vue';

import { useTimezoneStore } from '@vben/stores';
import { formatDateTime } from '@vben/utils';

import { Tag } from 'ant-design-vue';

import { $t } from '#/locales';

import MessageRecipients from './message-recipients.vue';
const props = defineProps<{
  record?: MsgPreview;
  editing?: boolean;
  targeted?: boolean;
}>();
const timezone = useTimezoneStore();
const targeted = computed(() =>
  props.editing ? props.targeted : props.record?.scope === 'targeted',
);
function time(value?: number) {
  void timezone.timezone;
  return formatDateTime(value);
}
</script>
<template>
  <article
    :data-testid="
      editing ? 'message-record-editor-layout' : 'message-record-detail'
    "
  >
    <section class="editor-section">
      <h3>{{ $t('system-editor.messageContent') }}</h3>
      <slot name="type">
<Tag v-if="record" color="blue">
{{
          $t(`msg.${record.type}`)
        }}
</Tag>
</slot>
      <slot name="title">
<h2 class="message-title">{{ record?.title }}</h2>
</slot>
      <slot name="content">
<p class="message-content">{{ record?.content }}</p>
</slot>
    </section>
    <section class="editor-section">
      <h3>{{ $t('system-editor.delivery') }}</h3>
      <slot name="scope">
<dl class="message-fact">
          <dt>{{ $t('msg.scope') }}</dt>
          <dd>
            <Tag v-if="record" color="purple">
{{
              $t(`msg.${record.scope}`)
            }}
</Tag>
          </dd>
        </dl>
</slot>
      <div v-show="targeted">
        <slot name="recipients">
<dl class="message-fact">
            <dt>{{ $t('msg.recipients') }}</dt>
            <dd><MessageRecipients :recipients="record?.recipients" /></dd>
          </dl>
</slot>
      </div>
      <slot name="expiry">
<dl class="message-fact">
          <dt>{{ $t('msg.expiry') }}</dt>
          <dd>
            {{
              record?.expired_at ? time(record.expired_at) : $t('msg.noExpiry')
            }}
          </dd>
        </dl>
</slot>
      <p v-if="!targeted" class="editor-note">{{ $t('msg.broadcastHint') }}</p>
    </section>
    <section v-if="record" class="editor-section">
      <h3>{{ $t('system-editor.recordInfo') }}</h3>
      <dl class="message-metadata">
        <dt>ID</dt>
        <dd>{{ record.id }}</dd>
        <dt>{{ $t('msg.published') }}</dt>
        <dd>{{ time(record.published_at) }}</dd>
        <dt>{{ $t('msg.sender') }}</dt>
        <dd>{{ record.sender_id ?? '—' }}</dd>
      </dl>
    </section>
  </article>
</template>
<style scoped>
.message-title {
  margin: 18px 0;
  overflow-wrap: anywhere;
  font-size: 20px;
  font-weight: 600;
}
.message-content {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.message-fact {
  margin: 0 0 20px;
}
.message-fact dt,
.message-metadata dt {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}
.message-fact dd {
  margin: 7px 0 0;
  overflow-wrap: anywhere;
}
.message-metadata {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  font-size: 13px;
}
.message-metadata dd {
  margin: 0;
}
</style>
