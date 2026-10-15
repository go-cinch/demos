import type { VueNode } from 'ant-design-vue/es/_util/type';

import { h } from 'vue';

import SkeletonOptions from './skeleton-options.vue';

export function renderSkeletonOptions(menuNode: VueNode, loading: boolean) {
  return h(SkeletonOptions, { loading }, { default: () => menuNode });
}
