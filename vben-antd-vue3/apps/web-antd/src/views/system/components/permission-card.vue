<script setup lang="ts">
import type { ActionRecord } from '#/api';

import { Tag } from 'ant-design-vue';

import { $t } from '#/locales';

import { resourceRules, ruleColor, splitLines } from './system-record-format';
defineProps<{ permission?: ActionRecord; code: string }>();
</script>
<template>
  <article class="permission-card" :aria-label="permission?.name || code">
    <header>
      <div class="permission-name">
        <strong>{{ permission?.name || code }}</strong><span>{{ code }}</span>
      </div>
      <Tag v-if="permission?.group">{{ permission.group }}</Tag>
      <slot name="action"></slot>
    </header>
    <dl v-if="permission">
      <dt>{{ $t('system.fields.word') }}</dt>
      <dd>{{ permission.word || '—' }}</dd>
      <dt>{{ $t('system.fields.resourceRules') }}</dt>
      <dd class="permission-rules">
        <div
          v-for="(rule, index) in resourceRules(permission.resource)"
          :key="index"
          class="permission-rule"
        >
          <Tag v-if="rule.method" :color="ruleColor(rule)">
{{
            rule.method
          }}
</Tag><code>{{ rule.path }}</code>
        </div>
        <span v-if="!permission.resource">—</span>
      </dd>
      <dt>{{ $t('system.fields.menuPaths') }}</dt>
      <dd class="permission-tags">
        <Tag
          v-for="path in splitLines(permission.menu)"
          :key="path"
          color="blue"
          >
{{ path }}
</Tag><span v-if="!permission.menu">—</span>
      </dd>
      <dt>{{ $t('system.fields.buttonPermission') }}</dt>
      <dd class="permission-tags">
        <Tag
          v-for="button in splitLines(permission.button)"
          :key="button"
          color="blue"
          >
{{ button }}
</Tag><span v-if="!permission.button">—</span>
      </dd>
    </dl>
    <p v-else class="permission-unresolved">
      {{ $t('system-cards.unresolvedHint') }}
    </p>
  </article>
</template>
<style scoped>
.permission-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.875);
}
header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.permission-name {
  flex: 1;
  min-width: 0;
}
.permission-name strong {
  display: block;
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.permission-name span,
.permission-unresolved {
  display: block;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  margin-top: 3px;
  overflow-wrap: anywhere;
}
dl {
  margin: 16px 0 0;
  font-size: 13px;
}
dt {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  margin-bottom: 5px;
}
dd {
  margin: 0 0 16px;
  overflow-wrap: anywhere;
}
dd:last-child {
  margin-bottom: 0;
}
.permission-rule {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.permission-rule + .permission-rule {
  margin-top: 6px;
}
.permission-rule code {
  min-width: 0;
  font:
    12px/1.8 ui-monospace,
    monospace;
  overflow-wrap: anywhere;
}
.permission-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
:deep(.ant-tag) {
  margin: 0;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
.permission-rule :deep(.ant-tag) {
  flex: none;
}
.permission-rules {
  max-height: 200px;
  overflow: auto;
}
</style>
