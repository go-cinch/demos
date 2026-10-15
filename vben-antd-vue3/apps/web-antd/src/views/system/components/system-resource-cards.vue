<script setup lang="ts">
import type { ResourceKind, SystemRecord } from './system-record-format';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Avatar, Button, Card, Checkbox, Empty, Tag, Tooltip } from 'ant-design-vue';

import { vSkeleton } from '#/directives/skeleton';
import { $t } from '#/locales';

import {
  memberCount, memberPreview, jsonStructure, jsonText, jsonType, permissionCount, permissionGroups, recordActions,
  recordDate, recordIcon, recordLabel, resourceRules, ruleColor, skeletonRecord,
} from './system-record-format';

const props = defineProps<{
  resource: ResourceKind;
  records: SystemRecord[];
  selectedKeys: number[];
  selectable: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  loading: boolean;
}>();
const emit = defineEmits<{
  detail: [record: SystemRecord];
  edit: [record: SystemRecord];
  remove: [record: SystemRecord];
  selection: [keys: number[]];
}>();

const displayRecords = computed(() => props.loading && !props.records.length
  ? Array.from({ length: 10 }, (_, index) => skeletonRecord(props.resource, -index - 1))
  : props.records);
const cards = computed(() => displayRecords.value.map((record) => ({
  record,
  label: recordLabel(record),
  identifier: 'key' in record ? record.key : 'word' in record ? record.word : `#${record.id}`,
  actions: recordActions(record),
  permissions: permissionCount(record),
  groups: permissionGroups(record),
  dictionary: 'value' in record ? record : undefined,
  members: memberPreview(record),
  memberCount: memberCount(record),
  rules: 'resource' in record ? resourceRules(record.resource) : [],
  category: 'category' in record ? record.category : undefined,
})));

function select(id: number, checked: boolean) {
  const keys = new Set(props.selectedKeys);
  if (checked) keys.add(id);
  else keys.delete(id);
  emit('selection', [...keys]);
}
</script>

<template>
  <section class="resource-cards" :style="{ '--resource-card-height': resource === 'dictionary' ? '430px' : resource === 'whitelist' ? '260px' : '340px' }" :class="{ 'resource-cards-whitelist': resource === 'whitelist' }" :aria-busy="loading" data-testid="management-cards">
    <Empty v-if="cards.length === 0" :image="Empty.PRESENTED_IMAGE_SIMPLE" :description="$t('system-cards.empty')" />
    <div v-else v-skeleton="loading" class="resource-grid">
      <article
        v-for="card in cards" :key="card.record.id"
        :aria-label="card.label"
        :data-testid="`management-card-${card.record.id}`"
        :class="{ 'is-selected': selectedKeys.includes(card.record.id) }"
      >
        <Card class="resource-card" :body-style="{ padding: 0 }">
          <div class="resource-card-body">
            <div class="resource-card-heading">
              <span class="resource-icon" aria-hidden="true"><IconifyIcon :icon="recordIcon(resource)" /></span>
              <div class="resource-identity">
                <h3><Button type="text" @click="emit('detail', card.record)">{{ card.label }}</Button></h3>
                <p v-if="resource === 'whitelist'"><Tag :color="card.category === 0 ? 'blue' : 'green'">{{ $t(card.category === 0 ? 'system.category.permission' : 'system.category.jwt') }}</Tag></p>
                <p v-else>{{ card.identifier }}</p>
              </div>
              <Checkbox
                v-if="selectable"
                :aria-label="$t('system-cards.select', { name: card.label })"
                :checked="selectedKeys.includes(card.record.id)"
                @change="select(card.record.id, $event.target.checked)"
              />
            </div>

            <template v-if="card.dictionary">
              <div class="resource-state"><Tag :color="card.dictionary.enabled ? 'green' : 'default'">{{ $t(card.dictionary.enabled ? 'system.enabled.yes' : 'system.enabled.no') }}</Tag></div>
              <p class="resource-description">{{ card.dictionary.description || $t('system-cards.noDescription') }}</p>
              <div class="resource-structure"><Tag>{{ jsonType(card.dictionary.value) }}</Tag><span>{{ jsonStructure(card.dictionary.value) }}</span></div>
              <pre class="resource-json" tabindex="0" :aria-label="$t('system.fields.dictionaryValue')">{{ jsonText(card.dictionary.value) }}</pre>
            </template>

            <template v-else-if="resource === 'whitelist'">
              <p class="resource-section-label">{{ $t('system.fields.resourceRules') }}</p>
              <div class="resource-rule-list" tabindex="0" :aria-label="$t('system.fields.resourceRules')">
                <div v-for="(rule, index) in card.rules" :key="index" class="resource-rule">
                  <Tag v-if="rule.method" :color="ruleColor(rule, card.category)">{{ rule.method }}</Tag>
                  <code>{{ rule.path }}</code>
                </div>
                <span v-if="!card.rules.length" class="resource-muted">—</span>
              </div>
            </template>

            <template v-else>
              <div class="resource-metrics">
                <div v-if="resource === 'user-group'"><strong>{{ card.memberCount }}</strong><span>{{ $t('system.fields.members') }}</span></div>
                <div><strong>{{ card.permissions }}</strong><span>{{ $t('system-cards.associatedPermissions') }}</span></div>
              </div>
              <div v-if="resource === 'user-group'" class="resource-members">
                <Tooltip v-for="member in card.members.slice(0, 5)" :key="member.id" :title="member.username">
                  <Avatar :size="30" :aria-label="member.username">{{ [...member.username][0]?.toUpperCase() || '?' }}</Avatar>
                </Tooltip>
                <span v-if="card.memberCount > 5" class="resource-muted">{{ $t('system-cards.moreCount', { count: card.memberCount - card.members.length }) }}</span>
                <span v-if="card.memberCount === 0" class="resource-muted">{{ $t('system-cards.noMembers') }}</span>
              </div>
              <div class="resource-permissions">
                <Tag v-for="action in card.actions.slice(0, 3)" :key="action.code" color="blue">{{ action.name || action.code }}</Tag>
                <span v-if="card.actions.length > 3" class="resource-muted">{{ $t('system-cards.moreCount', { count: card.actions.length - 3 }) }}</span>
                <span v-if="card.permissions === 0" class="resource-muted">{{ $t('system-cards.noPermissions') }}</span>
              </div>
              <p v-if="card.groups.length" class="resource-group-names">{{ $t('system-cards.permissionGroups') }}: {{ card.groups.join('、') }}</p>
            </template>
          </div>

          <div class="resource-card-footer">
            <dl class="resource-dates">
              <div><dt>{{ $t('system.fields.createdAt') }}</dt><dd>{{ recordDate(card.record.created_at) }}</dd></div>
              <div><dt>{{ $t('system.fields.updatedAt') }}</dt><dd>{{ recordDate(card.record.updated_at) }}</dd></div>
            </dl>
            <div class="resource-card-actions">
              <Button type="link" size="small" @click="emit('detail', card.record)">{{ $t('system-cards.details') }}</Button>
              <Button v-if="canUpdate" type="text" size="small" @click="emit('edit', card.record)">{{ $t('system.common.edit') }}</Button>
              <Button v-if="canDelete" danger type="text" size="small" @click="emit('remove', card.record)">{{ $t('system.common.delete') }}</Button>
            </div>
          </div>
        </Card>
      </article>
    </div>
  </section>
</template>

<style scoped>
.resource-cards { min-width: 0; }
.resource-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
.resource-grid article { min-width: 0; }
.resource-card { height: var(--resource-card-height); overflow: hidden; border-color: hsl(var(--border)); background: hsl(var(--card)); }
.resource-card :deep(.ant-card-body) { display: flex; flex-direction: column; height: 100%; }
.is-selected .resource-card { border-color: hsl(var(--primary)); box-shadow: 0 0 0 1px hsl(var(--primary)); }
.resource-card-body { flex: 1; min-width: 0; min-height: 0; overflow: auto; padding: 20px; }
.resource-card-heading { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.resource-icon { flex: none; display: grid; width: 40px; height: 40px; place-items: center; border-radius: calc(var(--radius) * 1.125); color: hsl(var(--primary)); background: hsl(var(--primary) / 8%); font-size: 20px; }
.resource-identity { flex: 1; min-width: 0; }
.resource-identity h3 { margin: 0; font-size: 15px; font-weight: 600; }
.resource-identity h3 :deep(.ant-btn) { height: auto; padding: 0; font-size: inherit; font-weight: inherit; text-align: start; white-space: normal; overflow-wrap: anywhere; }
.resource-identity p { margin: 4px 0 0; color: hsl(var(--muted-foreground)); font-size: 12px; overflow-wrap: anywhere; }
.resource-state { margin-bottom: 12px; }
.resource-description { min-height: 40px; margin: 0 0 12px; color: hsl(var(--muted-foreground)); font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.resource-structure { display: flex; align-items: center; gap: 3px; margin-bottom: 10px; color: hsl(var(--muted-foreground)); font-size: 12px; }
.resource-json { height: 130px; max-height: 130px; overflow: auto; margin: 0; padding: 12px; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) * 0.75); background: hsl(var(--muted) / 45%); color: hsl(var(--foreground)); font: 12px/1.65 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.resource-metrics { display: flex; gap: 30px; margin: 6px 0 16px; }
.resource-metrics div { display: flex; align-items: baseline; gap: 6px; }
.resource-metrics strong { font-size: 25px; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
.resource-metrics span, .resource-muted { font-size: 12px; color: hsl(var(--muted-foreground)); }
.resource-members { display: flex; align-items: center; min-height: 30px; gap: 5px; margin-bottom: 15px; }
.resource-members :deep(.ant-avatar) { color: hsl(var(--primary)); background: hsl(var(--primary) / 10%); }
.resource-permissions { display: flex; flex-wrap: wrap; align-items: center; min-height: 30px; gap: 5px; }
.resource-permissions :deep(.ant-tag) { max-width: 100%; margin: 0; white-space: normal; overflow-wrap: anywhere; }
.resource-group-names { margin: 16px 0 0; font-size: 12px; color: hsl(var(--muted-foreground)); overflow-wrap: anywhere; }
.resource-section-label { margin: 0 0 8px; color: hsl(var(--muted-foreground)); font-size: 12px; }
.resource-rule-list { max-height: 64px; overflow: auto; }
.resource-rule { display: flex; align-items: flex-start; gap: 5px; margin-bottom: 8px; }
.resource-rule:last-child { margin-bottom: 0; }
.resource-rule :deep(.ant-tag) { flex: none; margin: 0; }
.resource-rule code { min-width: 0; font: 12px/1.8 ui-monospace, monospace; overflow-wrap: anywhere; }
.resource-card-footer { flex: none; padding: 12px 16px 10px; border-top: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 20%); }
.resource-dates { margin: 0; font-size: 11px; color: hsl(var(--muted-foreground)); }
.resource-dates div { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; }
.resource-dates dd { margin: 0; margin-inline-start: auto; text-align: end; font-variant-numeric: tabular-nums; }
.resource-card-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 16px; margin-top: 9px; }
.resource-card-actions :deep(.ant-btn) { padding-inline: 0; border: 0; font-size: 12px; }
.resource-cards-whitelist .resource-card-body { padding: 16px; }
.resource-cards-whitelist .resource-card-heading { gap: 10px; margin-bottom: 12px; }
.resource-cards-whitelist .resource-icon { width: 32px; height: 32px; font-size: 18px; }
.resource-cards-whitelist .resource-identity p :deep(.ant-tag) { margin: 0; }
.resource-cards-whitelist .resource-section-label { margin-bottom: 6px; }
.resource-cards-whitelist .resource-card-footer { flex: none; padding: 8px 12px; }
.resource-cards-whitelist .resource-card-actions { margin-top: 6px; }
.resource-json:focus-visible, .resource-rule-list:focus-visible { outline: 2px solid hsl(var(--primary)); outline-offset: 2px; }
@media (max-width: 1200px) { .resource-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { .resource-grid { grid-template-columns: minmax(0, 1fr); } }

</style>

<style scoped>
.resource-cards { height: clamp(360px, 52vh, 620px); overflow: auto; scrollbar-gutter: stable; }
.resource-cards > .ant-empty { padding-block: 80px; }
</style>
