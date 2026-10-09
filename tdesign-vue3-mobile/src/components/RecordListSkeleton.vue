<script setup lang="ts">
import { computed } from 'vue';
import type { ResourceKind } from '../lib/types';
import { defaultColumns } from '../lib/resource-presentation';
import { configs } from '../lib/resource-config';
import { t } from '../locales';
const props = withDefaults(
  defineProps<{
    resource?: ResourceKind;
    columns?: string[];
    rows?: number;
    selecting?: boolean;
    kind?: 'resource' | 'message' | 'sent' | 'recent';
  }>(),
  { rows: 5, kind: 'resource' },
);
const fields = computed(
  () =>
    props.columns ||
    (props.resource
      ? defaultColumns[props.resource]
      : props.kind === 'sent'
        ? ['title', 'type', 'scope', 'published_at']
        : []),
);
const has = (key: string) => fields.value.includes(key);
const summary = computed(() =>
  props.resource
    ? {
        user: ['username', 'role', 'status', 'code', 'created_at'],
        role: ['name', 'word', 'action_codes'],
        'user-group': ['name', 'word', 'users', 'action_codes'],
        action: ['name', 'word'],
        dictionary: ['name', 'key', 'enabled'],
        whitelist: ['id'],
      }[props.resource]
    : [],
);
const extra = computed(() =>
  props.resource
    ? configs.value[props.resource].columns.filter(
        (column) => fields.value.includes(column.key) && !summary.value.includes(column.key),
      )
    : [],
);
</script>
<template>
  <div
    class="record-list card skeleton-record-list"
    :class="`skeleton-resource-${resource || 'none'}`"
    role="status"
    aria-busy="true"
    :aria-label="t('loading')"
  >
    <template v-if="kind === 'resource' && resource">
      <article v-for="index in rows" :key="index" class="record-wrap" aria-hidden="true">
        <div class="record">
          <span v-if="selecting" class="record-selection"
            ><span class="skeleton-fill" style="width: 18px; height: 18px; border-radius: 50%"
          /></span>
          <div class="record-open">
            <div class="record-identity">
              <span class="avatar record-avatar skeleton-fill" />
              <div class="record-main">
                <strong><span class="skeleton-text" style="width: 112px" /></strong>
                <small v-if="resource === 'user' && has('code')"
                  ><span class="skeleton-text" style="width: 96px"
                /></small>
                <div v-if="resource === 'user' && has('role')" class="record-summary">
                  <small><span class="skeleton-text" style="width: 96px" /></small>
                </div>
                <small v-if="resource !== 'user' && (has('word') || has('key'))"
                  ><span class="skeleton-text" style="width: 96px"
                /></small>
                <div
                  v-if="['role', 'user-group'].includes(resource) && has('action_codes')"
                  class="record-summary"
                >
                  <small><span class="skeleton-text" style="width: 70px" /></small>
                </div>
              </div>
              <span v-if="has('status') || has('enabled')" class="skeleton-fill skeleton-tag" />
              <span class="skeleton-fill skeleton-chevron" />
            </div>
            <div v-if="resource === 'user' && has('created_at')" class="record-created">
              <span class="skeleton-text" style="width: 60px" /><span
                class="skeleton-text"
                style="width: 126px"
              />
            </div>
          </div>
        </div>
        <div v-if="extra.length" class="record-extra">
          <template v-for="column in extra" :key="column.key"
            ><span>{{ column.title }}</span
            ><span v-if="column.display === 'resource-rules'" class="tags"
              ><span class="resource-tag"><span class="skeleton-text" style="width: 90px" /></span
              ><span class="resource-tag"
                ><span class="skeleton-text" style="width: 60px" /></span></span
            ><span v-else-if="column.display === 'category'" class="resource-tag"
              ><span class="skeleton-text" style="width: 90px" /></span
            ><span v-else class="skeleton-text" style="width: 96px"
          /></template>
        </div>
      </article>
    </template>
    <template v-else-if="kind === 'sent'">
      <article v-for="index in rows" :key="index" class="record-wrap" aria-hidden="true">
        <div class="record">
          <span v-if="selecting" class="record-selection"
            ><span class="skeleton-fill" style="width: 18px; height: 18px; border-radius: 50%"
          /></span>
          <div class="record-open">
            <span class="avatar skeleton-fill" />
            <div class="record-main">
              <strong><span class="skeleton-text" style="width: 112px" /></strong>
              <div class="record-summary">
                <t-tag v-if="has('type')" role="presentation" variant="light"
                  ><span class="skeleton-text" style="width: 36px"
                /></t-tag>
                <t-tag v-if="has('scope')" role="presentation" variant="light"
                  ><span class="skeleton-text" style="width: 44px"
                /></t-tag>
              </div>
            </div>
            <span class="skeleton-fill skeleton-chevron" />
          </div>
        </div>
        <div v-if="has('published_at')" class="record-extra">
          <span>{{ t('app.msg.published') }}</span
          ><span><span class="skeleton-text" style="width: 126px" /></span>
        </div>
      </article>
    </template>
    <template v-else-if="kind === 'message'">
      <div v-for="index in rows" :key="index" class="skeleton-message-row" aria-hidden="true">
        <span class="skeleton-fill skeleton-message-avatar" />
        <div>
          <strong><span class="skeleton-text" style="width: 70%" /></strong
          ><small><span class="skeleton-text" style="width: 90%" /></small>
        </div>
        <span class="skeleton-text" style="width: 94px" />
      </div>
    </template>
    <template v-else>
      <div v-for="index in rows" :key="index" class="record" aria-hidden="true">
        <span class="avatar recent-avatar skeleton-fill" />
        <div class="record-main">
          <strong><span class="skeleton-text" style="width: 100px" /></strong
          ><small><span class="skeleton-text" style="width: 82px" /></small>
        </div>
        <span class="recent-date skeleton-text" style="width: 116px" />
      </div>
    </template>
  </div>
</template>
<style scoped>
.skeleton-record-list {
  padding: 0;
  background: transparent;
}
.skeleton-record-list:has(.record-wrap) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: visible;
  border: 0;
}
.skeleton-text {
  display: inline-block;
  height: 0.75em;
  max-width: 100%;
  vertical-align: middle;
  border-radius: 3px;
  background: var(--accent-light);
}
.skeleton-fill {
  background: var(--accent-light);
}
.record-created > .skeleton-text {
  height: 17px;
}
.skeleton-fill,
.skeleton-text {
  animation: skeleton-pulse 1200ms ease-in-out infinite alternate;
}
.skeleton-tag {
  width: 42px;
  height: 21px;
  border-radius: 5px;
}
.skeleton-chevron {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
.skeleton-message-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 94px;
  gap: 10px;
  align-items: center;
  padding: 12px 6px;
}
.skeleton-message-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
.skeleton-message-row strong,
.skeleton-message-row small {
  display: block;
  line-height: 22px;
}
@keyframes skeleton-pulse {
  from {
    opacity: 0.55;
  }
  to {
    opacity: 0.95;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-fill {
    background: var(--accent-light);
  }
  .record-created > .skeleton-text {
    height: 17px;
  }
  .skeleton-fill,
  .skeleton-text {
    animation: none;
  }
}
</style>
