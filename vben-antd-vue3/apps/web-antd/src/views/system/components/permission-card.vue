<script setup lang="ts">
import type { PermissionOption } from './permission-presentation';

import { computed } from 'vue';
import { IconifyIcon } from '@vben/icons';
import { Tag } from 'ant-design-vue';
import { $t } from '#/locales';

import {
  permissionButtons, permissionDescription, permissionGroup, permissionName,
  permissionPages, permissionRisk, permissionScope,
} from './permission-presentation';

const props = defineProps<{ permission?: PermissionOption; code: string; detailsOnly?: boolean }>();
const name = computed(() => props.permission ? permissionName(props.permission) : props.code);
const pages = computed(() => props.permission ? permissionPages(props.permission) : []);
const buttons = computed(() => props.permission ? permissionButtons(props.permission) : []);
</script>

<template>
  <article class="permission-card" :class="{ 'details-only': detailsOnly }" :aria-label="name">
    <header v-if="!detailsOnly">
      <div class="permission-name">
        <strong>{{ name }}</strong>
        <Tag v-if="permission && permissionRisk(permission)" color="red">{{ $t('system-editor.highRiskPermission') }}</Tag>
      </div>
      <slot name="action"></slot>
    </header>
    <template v-if="permission">
      <p v-if="!detailsOnly" class="permission-description">{{ permissionDescription(permission) }}</p>
      <div v-if="!detailsOnly" class="permission-context">
        <span>{{ permissionGroup(permission.group) }}</span>
        <span>{{ permissionScope(permission) }}</span>
      </div>
      <details class="permission-details" :open="detailsOnly || undefined">
        <summary v-show="!detailsOnly"><IconifyIcon icon="lucide:chevron-right" aria-hidden="true" />{{ $t('permission-assignment.details') }}</summary>
        <dl>
          <dt>{{ $t('permission-assignment.pages') }}</dt>
          <dd class="permission-tags"><Tag v-for="page in pages" :key="page" color="blue">{{ page }}</Tag><span v-if="!pages.length">{{ $t('permission-assignment.noPage') }}</span></dd>
          <dt>{{ $t('permission-assignment.buttons') }}</dt>
          <dd class="permission-tags"><Tag v-for="button in buttons" :key="button" color="purple">{{ button }}</Tag><span v-if="!buttons.length">{{ $t('permission-assignment.noButton') }}</span></dd>
          <dt>{{ $t('system.fields.word') }}</dt><dd><code>{{ permission.word }}</code></dd>
          <dt>{{ $t('system.fields.code') }}</dt><dd><code>{{ code }}</code></dd>
        </dl>
      </details>
    </template>
    <p v-else class="permission-description">{{ $t('system-cards.unresolvedHint') }}</p>
  </article>
</template>

<style scoped>
.details-only .permission-details { margin-top: 0; }
.details-only dl { margin-top: 0; }
.permission-card { min-width: 0; padding: 14px 16px; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) * .875); background: hsl(var(--card)); }
.permission-card.details-only { padding: 0; border: 0; background: transparent; }
header, .permission-name { display: flex; align-items: center; gap: 8px; }
.permission-name { flex: 1; min-width: 0; flex-wrap: wrap; }
.permission-name strong { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.permission-description { margin: 7px 0; color: hsl(var(--muted-foreground)); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.permission-context { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: hsl(var(--muted-foreground)); }
.permission-context span + span::before { content: '·'; margin-right: 12px; }
.permission-details { margin-top: 10px; font-size: 12px; }
summary { display: flex; align-items: center; gap: 4px; width: fit-content; min-height: 28px; color: hsl(var(--primary)); cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 2px; }
summary svg { width: 14px; height: 14px; }
details[open] summary svg { transform: rotate(90deg); }
dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 10px 16px; margin: 8px 0 0; padding-top: 12px; border-top: 1px solid hsl(var(--border)); }
dt { color: hsl(var(--muted-foreground)); }
dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.permission-tags { display: flex; flex-wrap: wrap; gap: 5px; }
:deep(.ant-tag) { margin: 0; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
</style>
