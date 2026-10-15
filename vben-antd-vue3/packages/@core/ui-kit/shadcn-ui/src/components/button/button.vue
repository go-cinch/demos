<script setup lang="ts">
import type { VbenButtonProps } from './button';

import { computed } from 'vue';

import { LoaderCircle } from '@vben-core/icons';
import { cn } from '@vben-core/shared/utils';

import { Primitive } from 'reka-ui';

import { buttonVariants } from '../../ui';

interface Props extends VbenButtonProps {}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
  class: '',
  disabled: false,
  loading: false,
  size: 'default',
  variant: 'default',
});

const isDisabled = computed(() => {
  return props.disabled || props.loading;
});
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
    :disabled="isDisabled"
    :aria-busy="loading"
    :data-loading="loading || undefined"
  >
    <slot></slot>
    <LoaderCircle
      v-if="loading"
      aria-hidden="true"
      class="text-md ml-2 size-4 shrink-0 animate-spin motion-reduce:animate-none"
    />
  </Primitive>
</template>
