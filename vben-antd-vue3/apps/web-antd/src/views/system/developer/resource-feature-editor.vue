<script setup lang="ts">
import type { ResourceFeatureDraft } from './catalog-model';

import type { ResourceCatalog } from '#/api/system';

import { IconifyIcon } from '@vben/icons';

import { Button, FormItem, Input, Select } from 'ant-design-vue';

import { $t } from '#/locales';

const props = defineProps<{
  feature: ResourceFeatureDraft;
  catalog?: ResourceCatalog;
  resourceKey: string;
  disabled: boolean;
  error: string;
  operationOptions: { value: string; label: string }[];
}>();
const emit = defineEmits<{ patch: [change: Partial<ResourceFeatureDraft>] }>();
const t = (key: string) => $t(`developer.${key}`);
const methods = [
  'GET',
  'POST',
  'PATCH',
  'PUT',
  'DELETE',
  'HEAD',
  'OPTIONS',
].map((value) => ({ value }));
const status = (value: string) =>
  props.error && !value.trim() ? 'error' : undefined;
</script>

<template>
  <div class="catalog-feature-form">
    <div class="catalog-node-fields">
      <FormItem
        class="catalog-node-wide"
        :label="t('identifier')"
        required
        :validate-status="status(feature.key)"
        :help="status(feature.key) ? t('required') : undefined"
      >
        <Input
          :value="feature.key"
          @update:value="emit('patch', { key: $event })"
          :disabled="disabled"
          :aria-label="t('identifier')"
        />
      </FormItem>
      <FormItem
        :label="t('zh')"
        :extra="t('featureNameUsage')"
        required
        :validate-status="status(feature.zh)"
        :help="status(feature.zh) ? t('required') : undefined"
      >
        <Input
          :value="feature.zh"
          @update:value="emit('patch', { zh: $event })"
          :disabled="disabled"
          :aria-label="t('zh')"
        />
      </FormItem>
      <FormItem
        label="English"
        :extra="t('featureNameUsage')"
        required
        :validate-status="status(feature.en)"
        :help="status(feature.en) ? t('required') : undefined"
      >
        <Input
          :value="feature.en"
          @update:value="emit('patch', { en: $event })"
          :disabled="disabled"
          aria-label="English"
        />
      </FormItem>
      <FormItem
        :label="t('permissionResource')"
        :extra="t('permissionResourceHint')"
      >
        <Input
          :value="feature.permissionResource ?? ''"
          :disabled="disabled"
          :aria-label="t('permissionResource')"
          placeholder="user / role / action"
          @update:value="emit('patch', { permissionResource: $event })"
        />
      </FormItem>
      <FormItem :label="t('operation')">
        <Select
          :value="feature.operation"
          @update:value="emit('patch', { operation: String($event) })"
          :disabled="disabled"
          :options="operationOptions"
          :aria-label="t('operation')"
        />
      </FormItem>
    </div>
    <FormItem v-if="catalog" :label="t('featureEntries')">
      <Select
        mode="multiple"
        option-filter-prop="label"
        :value="feature.entryKeys ?? []"
        :disabled="disabled"
        :aria-label="t('featureEntries')"
        :options="
          Object.entries(catalog.resources)
            .filter(([key]) => key.startsWith(`${resourceKey.split(':')[0]}:`))
            .flatMap(([, node]) =>
              Object.entries(node.entries ?? {}).map(([value, entry]) => ({
                value,
                label: `${entry.path} · ${value}`,
              })),
            )
        "
        @update:value="
          emit('patch', {
            entryKeys: Array.isArray($event) ? $event.map(String) : [],
          })
        "
      />
    </FormItem>
    <div class="catalog-mapping-editor">
      <div class="catalog-mapping-editor-heading">
        <h4>
          <IconifyIcon icon="lucide:mouse-pointer-2" aria-hidden="true" />{{
            t('frontendButtons')
          }}<span class="catalog-count">{{ feature.buttons.length }}</span>
        </h4>
        <Button
          size="small"
          :disabled="disabled"
          @click="
            emit('patch', {
              buttons: [
                ...feature.buttons,
                `${resourceKey.replace(':', ':btn:')}:`,
              ],
            })
          "
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template
          >{{ t('addButton') }}
        </Button>
      </div>
      <div
        v-for="(_, index) in feature.buttons"
        :key="index"
        class="catalog-inline-mapping"
      >
        <Input
          :value="feature.buttons[index]"
          @update:value="
            emit('patch', {
              buttons: feature.buttons.map((value, i) =>
                i === index ? $event : value,
              ),
            })
          "
          :disabled="disabled"
          :aria-label="t('buttonKey')"
          :placeholder="t('buttonKey')"
        />
        <Button
          type="text"
          danger
          :disabled="disabled"
          :aria-label="`${t('remove')} ${t('buttonKey')} ${index + 1}`"
          :title="t('remove')"
          @click="
            emit('patch', {
              buttons: feature.buttons.filter((_, i) => i !== index),
            })
          "
        >
          <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
        </Button>
      </div>
      <p v-if="!feature.buttons.length" class="catalog-mapping-placeholder">
        {{ t('noButtons') }}
      </p>
    </div>
    <div class="catalog-mapping-editor">
      <div class="catalog-mapping-editor-heading">
        <h4>
          <IconifyIcon icon="lucide:network" aria-hidden="true" />{{ t('http')
          }}<span class="catalog-count">{{ feature.http.length }}</span>
        </h4>
        <Button
          size="small"
          :disabled="disabled"
          @click="
            emit('patch', {
              http: [...feature.http, { method: 'GET', path: '' }],
            })
          "
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template
          >{{ t('addHttp') }}
        </Button>
      </div>
      <div v-if="feature.http.length" class="catalog-http-labels">
        <span>{{ t('method') }}</span
        ><span>{{ t('path') }}</span>
      </div>
      <div
        v-for="(endpoint, index) in feature.http"
        :key="index"
        class="catalog-inline-mapping catalog-inline-http"
      >
        <Select
          :value="endpoint.method"
          @update:value="
            emit('patch', {
              http: feature.http.map((item, i) =>
                i === index ? { ...item, method: String($event) } : item,
              ),
            })
          "
          :disabled="disabled"
          :options="methods"
          :aria-label="t('method')"
        />
        <Input
          :value="endpoint.path"
          @update:value="
            emit('patch', {
              http: feature.http.map((item, i) =>
                i === index ? { ...item, path: $event } : item,
              ),
            })
          "
          :disabled="disabled"
          :aria-label="t('path')"
          placeholder="/api/resource"
        />
        <Button
          type="text"
          danger
          :disabled="disabled"
          :aria-label="`${t('remove')} ${t('http')} ${index + 1}`"
          :title="t('remove')"
          @click="
            emit('patch', { http: feature.http.filter((_, i) => i !== index) })
          "
        >
          <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
        </Button>
      </div>
      <p v-if="!feature.http.length" class="catalog-mapping-placeholder">
        {{ t('noHttp') }}
      </p>
    </div>
    <div class="catalog-mapping-editor">
      <div class="catalog-mapping-editor-heading">
        <h4>
          <IconifyIcon icon="lucide:workflow" aria-hidden="true" />{{ t('grpc')
          }}<span class="catalog-count">{{ feature.grpc.length }}</span>
        </h4>
        <Button
          size="small"
          :disabled="disabled"
          @click="emit('patch', { grpc: [...feature.grpc, ''] })"
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template
          >{{ t('addGrpc') }}
        </Button>
      </div>
      <div
        v-for="(_, index) in feature.grpc"
        :key="index"
        class="catalog-inline-mapping"
      >
        <Input
          :value="feature.grpc[index]"
          @update:value="
            emit('patch', {
              grpc: feature.grpc.map((value, i) =>
                i === index ? $event : value,
              ),
            })
          "
          :disabled="disabled"
          :aria-label="t('grpc')"
          placeholder="/package.Service/Method"
        />
        <Button
          type="text"
          danger
          :disabled="disabled"
          :aria-label="`${t('remove')} ${t('grpc')} ${index + 1}`"
          :title="t('remove')"
          @click="
            emit('patch', { grpc: feature.grpc.filter((_, i) => i !== index) })
          "
        >
          <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
        </Button>
      </div>
      <p v-if="!feature.grpc.length" class="catalog-mapping-placeholder">
        {{ t('noGrpc') }}
      </p>
    </div>
    <p class="catalog-mapping-note">
      <IconifyIcon icon="lucide:info" aria-hidden="true" />{{
        t('mappingHint')
      }}
    </p>
  </div>
</template>
