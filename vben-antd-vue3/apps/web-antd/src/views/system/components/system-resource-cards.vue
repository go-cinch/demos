<script setup lang="ts">
import type { ResourceKind, SystemRecord } from './system-record-format';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Empty,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import { vSkeleton } from '#/directives/skeleton';
import { $t, catalogLabel } from '#/locales';

import {
  jsonStructure,
  jsonText,
  jsonType,
  memberCount,
  memberPreview,
  permissionCount,
  permissionGroups,
  recordActionSummaries,
  recordDate,
  recordIcon,
  recordLabel,
  resourceRules,
  skeletonRecord,
} from './system-record-format';

const props = defineProps<{
  resource: ResourceKind;
  records: SystemRecord[];
  selectedKeys: number[];
  selectable: boolean;
  canDetail?: boolean;
  resetTotpLabel?: string;
  canUpdate: boolean;
  canDelete: boolean;
  canRemoveRecord?: (record: SystemRecord) => boolean;
  canSelectRecord?: (record: SystemRecord) => boolean;
  loading: boolean;
}>();
const emit = defineEmits<{
  detail: [record: SystemRecord];
  edit: [record: SystemRecord];
  remove: [record: SystemRecord];
  resetTotp: [record: SystemRecord];
  selection: [keys: number[]];
}>();

const displayRecords = computed(() =>
  props.loading && props.records.length === 0
    ? Array.from({ length: 10 }, (_, index) =>
        skeletonRecord(props.resource, -index - 1),
      )
    : props.records,
);
const cards = computed(() =>
  displayRecords.value.map((record) => {
    let identifier: string | undefined = `#${record.id}`;
    if ('key' in record) identifier = record.key;
    else if ('word' in record) identifier = record.word;
    return {
      record,
      label: recordLabel(record),
      identifier,
      actions: recordActionSummaries(record),
      permissions: permissionCount(record),
      groups: permissionGroups(record),
      dictionary: 'value' in record ? record : undefined,
      members: memberPreview(record),
      memberCount: memberCount(record),
      rules: 'resource' in record ? resourceRules(record.resource) : [],
      category: 'category' in record ? record.category : undefined,
    };
  }),
);

function select(id: number, checked: boolean) {
  const record = props.records.find((item) => item.id === id);
  if (checked && (!record || props.canSelectRecord?.(record) === false)) return;
  const keys = new Set(props.selectedKeys);
  if (checked) keys.add(id);
  else keys.delete(id);
  emit('selection', [...keys]);
}
</script>

<template>
  <section
    class="resource-cards"
    :style="{
      '--resource-card-height': resource === 'dictionary' ? '430px' : '340px',
    }"
    :aria-busy="loading"
    data-testid="management-cards"
  >
    <Empty
      v-if="cards.length === 0"
      :image="Empty.PRESENTED_IMAGE_SIMPLE"
      :description="$t('system-cards.empty')"
    />
    <div v-else v-skeleton="loading" class="resource-grid">
      <article
        v-for="card in cards"
        :key="card.record.id"
        :aria-label="card.label"
        :data-testid="`management-card-${card.record.id}`"
        :class="{ 'is-selected': selectedKeys.includes(card.record.id) }"
      >
        <Card class="resource-card" :body-style="{ padding: 0 }">
          <div class="resource-card-body">
            <div class="resource-card-heading">
              <span class="resource-icon" aria-hidden="true"
                ><IconifyIcon :icon="recordIcon(resource)"
              /></span>
              <div class="resource-identity">
                <h3>
                  <Button
                    type="text"
                    :disabled="!canDetail"
                    @click="emit('detail', card.record)"
                    >{{ card.label }}</Button
                  >
                </h3>
                <p>{{ card.identifier }}</p>
              </div>
              <Checkbox
                v-if="selectable"
                :aria-label="$t('system-cards.select', { name: card.label })"
                :checked="selectedKeys.includes(card.record.id)"
                :disabled="canSelectRecord?.(card.record) === false"
                @change="select(card.record.id, $event.target.checked)"
              />
            </div>

            <template v-if="card.dictionary">
              <div class="resource-state">
                <Tag :color="card.dictionary.enabled ? 'green' : 'default'">{{
                  $t(
                    card.dictionary.enabled
                      ? 'system.enabled.yes'
                      : 'system.enabled.no',
                  )
                }}</Tag>
              </div>
              <p class="resource-description">
                {{
                  card.dictionary.description ||
                  $t('system-cards.noDescription')
                }}
              </p>
              <div class="resource-structure">
                <Tag>{{ jsonType(card.dictionary.value) }}</Tag
                ><span>{{ jsonStructure(card.dictionary.value) }}</span>
              </div>
              <pre
                class="resource-json"
                tabindex="0"
                :aria-label="$t('system.fields.dictionaryValue')"
                >{{ jsonText(card.dictionary.value) }}</pre>
            </template>

            <template v-else>
              <div class="resource-metrics">
                <div v-if="resource === 'user-group'">
                  <strong>{{ card.memberCount }}</strong
                  ><span>{{ $t('system.fields.members') }}</span>
                </div>
                <div>
                  <strong>{{ card.permissions }}</strong
                  ><span>{{ $t('system-cards.associatedPermissions') }}</span>
                </div>
              </div>
              <div v-if="resource === 'user-group'" class="resource-members">
                <Tooltip
                  v-for="member in card.members.slice(0, 5)"
                  :key="member.id"
                  :title="member.username"
                >
                  <Avatar :size="30" :aria-label="member.username">{{
                    [...member.username][0]?.toUpperCase() || '?'
                  }}</Avatar>
                </Tooltip>
                <span v-if="card.memberCount > 5" class="resource-muted">{{
                  $t('system-cards.moreCount', {
                    count: card.memberCount - card.members.length,
                  })
                }}</span>
                <span v-if="card.memberCount === 0" class="resource-muted">{{
                  $t('system-cards.noMembers')
                }}</span>
              </div>
              <div class="resource-permissions">
                <Tag
                  v-for="action in card.actions.slice(0, 3)"
                  :key="action.code"
                  color="blue"
                  >{{ action.name || action.code }}</Tag
                >
                <span v-if="card.actions.length > 3" class="resource-muted">{{
                  $t('system-cards.moreCount', {
                    count: card.actions.length - 3,
                  })
                }}</span>
                <span v-if="card.permissions === 0" class="resource-muted">{{
                  $t('system-cards.noPermissions')
                }}</span>
              </div>
              <p v-if="card.groups.length" class="resource-group-names">
                {{ $t('system-cards.permissionGroups') }}:
                {{
                  card.groups
                    .map((key) => catalogLabel('groups', key))
                    .join('、')
                }}
              </p>
            </template>
          </div>

          <div class="resource-card-footer">
            <dl class="resource-dates">
              <div>
                <dt>{{ $t('system.fields.createdAt') }}</dt>
                <dd>{{ recordDate(card.record.created_at) }}</dd>
              </div>
              <div>
                <dt>{{ $t('system.fields.updatedAt') }}</dt>
                <dd>{{ recordDate(card.record.updated_at) }}</dd>
              </div>
            </dl>
            <div class="resource-card-actions">
              <Button
                v-if="resetTotpLabel"
                type="text"
                size="small"
                @click="emit('resetTotp', card.record)"
                >{{ resetTotpLabel }}</Button
              >
              <Button
                v-if="canDetail"
                type="link"
                size="small"
                @click="emit('detail', card.record)"
                >{{ $t('system-cards.details') }}</Button
              >
              <Button
                v-if="canUpdate"
                type="text"
                size="small"
                @click="emit('edit', card.record)"
                >{{ $t('system.common.edit') }}</Button
              >
              <Button
                v-if="canDelete && canRemoveRecord?.(card.record) !== false"
                danger
                type="text"
                size="small"
                @click="emit('remove', card.record)"
                >{{ $t('system.common.delete') }}</Button
              >
            </div>
          </div>
        </Card>
      </article>
    </div>
  </section>
</template>

<style scoped>
.resource-cards {
  min-width: 0;
}

.resource-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

.resource-grid article {
  min-width: 0;
}

.resource-card {
  height: var(--resource-card-height);
  overflow: hidden;
  background: hsl(var(--card));
  border-color: hsl(var(--border));
}

.resource-card :deep(.ant-card-body) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.is-selected .resource-card {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary));
}

.resource-card-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 20px;
  overflow: auto;
}

.resource-card-heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.resource-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 40px;
  height: 40px;
  font-size: 20px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-radius: calc(var(--radius) * 1.125);
}

.resource-identity {
  flex: 1;
  min-width: 0;
}

.resource-identity h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.resource-identity h3 :deep(.ant-btn) {
  height: auto;
  padding: 0;
  font-size: inherit;
  font-weight: inherit;
  text-align: start;
  overflow-wrap: anywhere;
  white-space: normal;
}

.resource-identity p {
  margin: 4px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.resource-state {
  margin-bottom: 12px;
}

.resource-description {
  min-height: 40px;
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.65;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.resource-structure {
  display: flex;
  gap: 3px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.resource-json {
  height: 130px;
  max-height: 130px;
  padding: 12px;
  margin: 0;
  overflow: auto;
  font:
    12px/1.65 ui-monospace,
    monospace;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: hsl(var(--muted) / 45%);
  border: 1px solid hsl(var(--border));
  border-radius: calc(var(--radius) * 0.75);
}

.resource-metrics {
  display: flex;
  gap: 30px;
  margin: 6px 0 16px;
}

.resource-metrics div {
  display: flex;
  gap: 6px;
  align-items: baseline;
}

.resource-metrics strong {
  font-size: 25px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.resource-metrics span,
.resource-muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.resource-members {
  display: flex;
  gap: 5px;
  align-items: center;
  min-height: 30px;
  margin-bottom: 15px;
}

.resource-members :deep(.ant-avatar) {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.resource-permissions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  min-height: 30px;
}

.resource-permissions :deep(.ant-tag) {
  max-width: 100%;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.resource-group-names {
  margin: 16px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.resource-section-label {
  margin: 0 0 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.resource-rule-list {
  max-height: 64px;
  overflow: auto;
}

.resource-rule {
  display: flex;
  gap: 5px;
  align-items: flex-start;
  margin-bottom: 8px;
}

.resource-rule:last-child {
  margin-bottom: 0;
}

.resource-rule :deep(.ant-tag) {
  flex: none;
  margin: 0;
}

.resource-rule code {
  min-width: 0;
  font:
    12px/1.8 ui-monospace,
    monospace;
  overflow-wrap: anywhere;
}

.resource-card-footer {
  flex: none;
  padding: 12px 16px 10px;
  background: hsl(var(--muted) / 20%);
  border-top: 1px solid hsl(var(--border));
}

.resource-dates {
  margin: 0;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.resource-dates div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  justify-content: space-between;
}

.resource-dates dd {
  margin: 0;
  margin-inline-start: auto;
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.resource-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: flex-end;
  margin-top: 9px;
}

.resource-card-actions :deep(.ant-btn) {
  padding-inline: 0;
  font-size: 12px;
  border: 0;
}

.resource-json:focus-visible,
.resource-rule-list:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

@media (max-width: 1200px) {
  .resource-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .resource-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

<style scoped>
.resource-cards {
  height: clamp(360px, 52vh, 620px);
  overflow: auto;
  scrollbar-gutter: stable;
}

.resource-cards > .ant-empty {
  padding-block: 80px;
}
</style>
