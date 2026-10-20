<script setup lang="ts">
import { IconifyIcon } from '@vben/icons';
import type { ResourceFeature } from '#/api/system';
import { $t } from '#/locales';

defineProps<{ feature?: ResourceFeature }>();
const t = (key: string) => $t(`developer.${key}`);
</script>

<template>
  <div v-if="feature" class="catalog-mapping-groups">
    <div v-if="feature.permission_resource" class="catalog-mapping-group"><div class="catalog-mapping-label">{{ t('permissionResource') }}</div><code>{{ feature.permission_resource }}</code></div>
    <div v-if="feature.entry_keys?.length" class="catalog-mapping-group">
      <div class="catalog-mapping-label"><IconifyIcon icon="lucide:panels-top-left" /><span>{{ t('featureEntries') }}</span><span class="catalog-count">{{ feature.entry_keys.length }}</span></div>
      <div class="catalog-mapping-values"><code v-for="key in feature.entry_keys" :key="key" class="catalog-binding-key">{{ key }}</code></div>
    </div>
    <div v-if="feature.btn.length" class="catalog-mapping-group">
      <div class="catalog-mapping-label">
        <IconifyIcon icon="lucide:mouse-pointer-2" aria-hidden="true" />
        <span>{{ t('frontendButtons') }}</span>
        <span class="catalog-count">{{ feature.btn.length }}</span>
      </div>
      <div class="catalog-mapping-values">
        <code
          v-for="key in feature.btn"
          :key="key"
          class="catalog-binding-key"
          >{{ key }}</code
        >
      </div>
    </div>
    <div v-if="feature.http.length" class="catalog-mapping-group">
      <div class="catalog-mapping-label">
        <IconifyIcon icon="lucide:network" aria-hidden="true" />
        <span>{{ t('http') }}</span>
        <span class="catalog-count">{{ feature.http.length }}</span>
      </div>
      <div class="catalog-endpoint-list">
        <div
          v-for="(endpoint, index) in feature.http"
          :key="index"
          class="catalog-endpoint-line"
        >
          <span class="catalog-method" :data-method="endpoint.method">{{
            endpoint.method
          }}</span>
          <code>{{ endpoint.path }}</code>
        </div>
      </div>
    </div>
    <div v-if="feature.grpc.length" class="catalog-mapping-group">
      <div class="catalog-mapping-label">
        <IconifyIcon icon="lucide:workflow" aria-hidden="true" />
        <span>{{ t('grpc') }}</span>
        <span class="catalog-count">{{ feature.grpc.length }}</span>
      </div>
      <div class="catalog-endpoint-list">
        <div
          v-for="path in feature.grpc"
          :key="path"
          class="catalog-endpoint-line"
        >
          <code>{{ path }}</code>
        </div>
      </div>
    </div>
    <p
      v-if="!feature.btn.length && !feature.http.length && !feature.grpc.length"
      class="catalog-muted catalog-mapping-empty"
    >
      {{ t('noMappings') }}
    </p>
  </div>
</template>
