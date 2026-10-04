<script setup lang="ts">
import { Card } from 'ant-design-vue';
</script>
<template>
  <Card class="system-section-card"><slot></slot></Card>
</template>
<style scoped>
.system-section-card.ant-card {
  border-color: hsl(var(--border));
  border-radius: 8px;
}

:deep(.ant-table-cell) {
  overflow-wrap: anywhere;
  white-space: normal;
}
:deep(.system-table-row-striped > td) {
  background-color: rgb(127 127 127 / 6%) !important;
}
:deep(.ant-table-cell-fix-right) {
  background: hsl(var(--card)) !important;
}
</style>
