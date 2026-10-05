<script setup lang="ts">
import { computed } from 'vue';
import { t } from '../locales';

const props = withDefaults(
  defineProps<{
    variant?: 'list' | 'options' | 'overview' | 'management' | 'profile' | 'page';
    density?: 'compact' | 'default' | 'loose';
  }>(),
  { variant: 'page', density: 'default' },
);

function textRow(width: string, height = '16px') {
  return [{ type: 'text' as const, width, height }];
}
function rectRow(width: string, height: string) {
  return [{ type: 'rect' as const, width, height }];
}
const identityRows = [
  { type: 'text' as const, width: '112px', height: '21px' },
  { type: 'text' as const, width: '96px', height: '17px' },
];
const recentRows = [
  { type: 'text' as const, width: '100px', height: '18px' },
  { type: 'text' as const, width: '82px', height: '16px' },
];
const profileRows = [
  { type: 'text' as const, width: '136px', height: '26px' },
  { type: 'text' as const, width: '80px', height: '17px' },
  { type: 'text' as const, width: '112px', height: '17px' },
];
const fallbackRows = computed(() => {
  if (props.variant === 'options')
    return Array.from({ length: 4 }, () => [
      { type: 'circle' as const, size: '32px', marginRight: '12px' },
      { type: 'text' as const, width: '68%', height: '16px' },
    ]);
  return [
    { type: 'text' as const, width: '36%', height: '24px' },
    { type: 'text' as const, width: '68%', height: '14px' },
    { type: 'rect' as const, width: '100%', height: '132px' },
    { type: 'rect' as const, width: '100%', height: '92px' },
  ];
});
const structured = computed(() =>
  ['list', 'overview', 'management', 'profile'].includes(props.variant),
);
</script>

<template>
  <div
    class="page-skeleton"
    :class="[
      `page-skeleton-${variant}`,
      `density-${density}`,
      { 'page-skeleton-structured': structured },
    ]"
    role="status"
    aria-busy="true"
    :aria-label="t('loading')"
  >
    <div v-if="variant === 'overview'" aria-hidden="true">
      <div class="skeleton-heading">
        <t-skeleton animation="gradient" :row-col="textRow('94px', '34px')" />
        <t-skeleton animation="gradient" :row-col="textRow('148px', '14px')" />
      </div>
      <div class="skeleton-summary-card">
        <div class="skeleton-summary-label">
          <t-skeleton animation="gradient" :row-col="textRow('74px', '20px')" />
          <t-skeleton animation="gradient" :row-col="rectRow('22px', '22px')" />
        </div>
        <div class="skeleton-summary-total">
          <t-skeleton animation="gradient" :row-col="textRow('126px', '46px')" />
          <t-skeleton animation="gradient" :row-col="textRow('54px', '17px')" />
        </div>
        <div class="skeleton-stat-grid">
          <div v-for="index in 3" :key="index" class="skeleton-stat">
            <t-skeleton
              animation="gradient"
              :row-col="textRow(index === 1 ? '68px' : '38px', '28px')"
            />
            <t-skeleton animation="gradient" :row-col="textRow('42px', '17px')" />
          </div>
        </div>
      </div>
      <div class="skeleton-section-heading">
        <t-skeleton animation="gradient" :row-col="textRow('74px', '19px')" />
        <t-skeleton animation="gradient" :row-col="textRow('66px', '15px')" />
      </div>
      <div class="skeleton-app-list">
        <div v-for="index in 4" :key="index" class="skeleton-app-row">
          <t-skeleton
            class="skeleton-app-icon"
            animation="gradient"
            :row-col="rectRow('48px', '48px')"
          />
          <t-skeleton animation="gradient" :row-col="textRow('56px', '17px')" />
        </div>
      </div>
      <div class="skeleton-review">
        <t-skeleton animation="gradient" :row-col="rectRow('100%', '44px')" />
      </div>
      <div class="skeleton-section-heading">
        <t-skeleton animation="gradient" :row-col="textRow('74px', '19px')" />
        <t-skeleton animation="gradient" :row-col="textRow('52px', '15px')" />
      </div>
      <div class="skeleton-recent-list">
        <div v-for="index in 5" :key="index" class="skeleton-recent-row">
          <t-skeleton
            class="skeleton-recent-avatar"
            animation="gradient"
            :row-col="rectRow('34px', '34px')"
          />
          <t-skeleton class="skeleton-recent-identity" animation="gradient" :row-col="recentRows" />
          <t-skeleton animation="gradient" :row-col="textRow('78px', '14px')" />
          <t-skeleton animation="gradient" :row-col="rectRow('14px', '14px')" />
        </div>
      </div>
    </div>
    <div v-else-if="variant === 'profile'" aria-hidden="true">
      <div class="skeleton-heading">
        <t-skeleton animation="gradient" :row-col="textRow('66px', '34px')" />
        <t-skeleton animation="gradient" :row-col="textRow('112px', '14px')" />
      </div>
      <div class="skeleton-profile-head">
        <t-skeleton
          class="skeleton-profile-avatar"
          animation="gradient"
          :row-col="rectRow('64px', '64px')"
        />
        <t-skeleton class="skeleton-profile-identity" animation="gradient" :row-col="profileRows" />
      </div>
      <div class="skeleton-section-heading">
        <t-skeleton animation="gradient" :row-col="textRow('74px', '19px')" />
      </div>
      <div class="skeleton-profile-menu">
        <div v-for="index in 2" :key="index" class="skeleton-profile-menu-row">
          <t-skeleton
            class="skeleton-menu-icon"
            animation="gradient"
            :row-col="rectRow('31px', '31px')"
          />
          <t-skeleton animation="gradient" :row-col="textRow('94px', '20px')" />
          <t-skeleton
            class="skeleton-trailing"
            animation="gradient"
            :row-col="rectRow('14px', '14px')"
          />
        </div>
      </div>
      <div class="skeleton-about">
        <t-skeleton animation="gradient" :row-col="rectRow('30px', '30px')" />
        <t-skeleton animation="gradient" :row-col="textRow('184px', '17px')" />
        <t-skeleton animation="gradient" :row-col="textRow('218px', '17px')" />
      </div>
      <t-skeleton animation="gradient" :row-col="rectRow('100%', '46px')" />
    </div>
    <div v-else-if="variant === 'list' || variant === 'management'" aria-hidden="true">
      <template v-if="variant === 'management'">
        <div class="skeleton-management-heading">
          <t-skeleton animation="gradient" :row-col="textRow('136px', '34px')" />
        </div>
        <div class="skeleton-filters">
          <t-skeleton animation="gradient" :row-col="rectRow('100%', '44px')" />
          <div class="skeleton-filter-tabs">
            <t-skeleton
              v-for="index in 4"
              :key="index"
              animation="gradient"
              :row-col="textRow('42px', '17px')"
            />
          </div>
        </div>
        <div class="skeleton-toolbar">
          <t-skeleton animation="gradient" :row-col="rectRow('82px', '44px')" />
          <div class="skeleton-toolbar-actions">
            <t-skeleton
              v-for="index in 4"
              :key="index"
              animation="gradient"
              :row-col="rectRow('34px', '44px')"
            />
          </div>
        </div>
        <div class="skeleton-record-count">
          <t-skeleton animation="gradient" :row-col="textRow('42px', '17px')" />
          <t-skeleton animation="gradient" :row-col="textRow('82px', '17px')" />
        </div>
      </template>
      <div class="skeleton-directory-list">
        <div v-for="index in 5" :key="index" class="skeleton-directory-record">
          <div class="skeleton-directory-identity">
            <t-skeleton
              class="skeleton-directory-avatar"
              animation="gradient"
              :row-col="rectRow('38px', '38px')"
            />
            <t-skeleton
              class="skeleton-directory-name"
              animation="gradient"
              :row-col="identityRows"
            />
            <t-skeleton animation="gradient" :row-col="rectRow('42px', '21px')" />
            <t-skeleton animation="gradient" :row-col="rectRow('14px', '14px')" />
          </div>
          <div class="skeleton-directory-summary">
            <t-skeleton animation="gradient" :row-col="textRow('58px', '14px')" />
            <t-skeleton animation="gradient" :row-col="textRow('126px', '14px')" />
          </div>
        </div>
      </div>
      <div v-if="variant === 'management'" class="skeleton-pagination">
        <t-skeleton animation="gradient" :row-col="rectRow('33px', '33px')" />
        <t-skeleton animation="gradient" :row-col="textRow('76px', '17px')" />
        <t-skeleton animation="gradient" :row-col="textRow('62px', '17px')" />
        <t-skeleton animation="gradient" :row-col="rectRow('33px', '33px')" />
      </div>
    </div>
    <t-skeleton v-else animation="gradient" :row-col="fallbackRows" />
  </div>
</template>

<style scoped>
.page-skeleton-structured {
  --skeleton-record-padding: 14px;
  --skeleton-summary-gap: 8px;
}
.page-skeleton-structured.density-compact {
  --skeleton-record-padding: 10px;
  --skeleton-summary-gap: 6px;
}
.page-skeleton-structured.density-loose {
  --skeleton-record-padding: 22px;
  --skeleton-summary-gap: 12px;
}
.page-skeleton-structured :deep(.t-skeleton__row) {
  min-height: 0;
  padding: 0;
  margin: 0;
  border: 0;
}
.page-skeleton-structured :deep(.t-skeleton--type-rect) {
  box-shadow: none;
  border-radius: 5px;
}
.page-skeleton-structured :deep(.t-skeleton--type-text) {
  max-width: 100%;
}
.page-skeleton-list.page-skeleton-structured {
  padding: 0;
}
.skeleton-heading {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-bottom: 18px;
}
.skeleton-section-heading,
.skeleton-summary-label,
.skeleton-toolbar,
.skeleton-record-count,
.skeleton-pagination,
.skeleton-directory-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.skeleton-section-heading {
  min-height: 32px;
  margin: 18px 0 9px;
}
.skeleton-summary-card {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  margin-bottom: 22px;
}
.skeleton-summary-total {
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin-top: 3px;
}
.skeleton-stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 13px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}
.skeleton-stat {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 5px;
  padding-left: 17px;
  min-width: 0;
}
.skeleton-stat:first-child {
  padding-left: 0;
}
.skeleton-stat + .skeleton-stat {
  border-left: 1px solid var(--line);
}
.skeleton-recent-list,
.skeleton-profile-menu {
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  padding: 0 14px;
}
.skeleton-app-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}
.skeleton-app-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.skeleton-app-icon :deep(.t-skeleton--type-rect) {
  border-radius: 14px;
}
.skeleton-profile-menu-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.skeleton-trailing {
  margin-left: auto;
}
.skeleton-review {
  margin-top: 21px;
}
.skeleton-review :deep(.t-skeleton--type-rect) {
  border-radius: 12px;
}
.skeleton-recent-row,
.skeleton-directory-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.skeleton-recent-row {
  min-height: 66px;
}
.skeleton-recent-row + .skeleton-recent-row,
.skeleton-profile-menu-row + .skeleton-profile-menu-row {
  border-top: 1px solid var(--line);
}
.skeleton-recent-avatar,
.skeleton-directory-avatar {
  flex-shrink: 0;
}
.skeleton-recent-avatar :deep(.t-skeleton--type-rect),
.skeleton-directory-avatar :deep(.t-skeleton--type-rect) {
  border-radius: 10px;
}
.skeleton-recent-identity,
.skeleton-directory-name {
  flex: 1;
  min-width: 0;
}
.skeleton-recent-identity :deep(.t-skeleton__row + .t-skeleton__row),
.skeleton-directory-name :deep(.t-skeleton__row + .t-skeleton__row) {
  margin-top: 4px;
}
.skeleton-profile-head {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 20px;
  margin-bottom: 25px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
}
.skeleton-profile-avatar {
  flex: 0 0 64px;
}
.skeleton-profile-avatar :deep(.t-skeleton--type-rect) {
  border-radius: 18px;
}
.skeleton-profile-identity {
  flex: 1;
  min-width: 0;
}
.skeleton-profile-identity :deep(.t-skeleton__row + .t-skeleton__row) {
  margin-top: 6px;
}
.skeleton-profile-menu-row {
  min-height: 63px;
}
.skeleton-menu-icon :deep(.t-skeleton--type-rect) {
  border-radius: 9px;
}
.skeleton-about {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 0 27px;
}
.skeleton-management-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}
.skeleton-filters {
  margin-bottom: 18px;
}
.skeleton-filter-tabs {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 17px;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--line);
}
.skeleton-filter-actions,
.skeleton-toolbar-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
.skeleton-filter-actions {
  justify-content: flex-end;
  margin-top: 12px;
}
.skeleton-toolbar {
  margin-bottom: 12px;
}
.skeleton-record-count {
  min-height: 38px;
  margin-bottom: 4px;
}
.skeleton-directory-record {
  padding: var(--skeleton-record-padding);
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
}
.skeleton-directory-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.skeleton-directory-summary {
  margin-top: var(--skeleton-summary-gap);
  padding-top: var(--skeleton-summary-gap);
  border-top: 1px solid var(--line);
}
.skeleton-pagination {
  margin-top: 15px;
}
</style>
