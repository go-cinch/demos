<script lang="ts" setup>
import type { TabDefinition } from '@vben-core/typings';

import type { TabConfig, TabsProps } from '../../types';

import { computed } from 'vue';

import { Pin, PinOff, X } from '@vben-core/icons';
import { VbenContextMenu, VbenIcon } from '@vben-core/shadcn-ui';

interface Props extends TabsProps {}

defineOptions({
  name: 'VbenTabs',

  inheritAttrs: false,
});
const props = withDefaults(defineProps<Props>(), {
  contentClass: 'vben-tabs-content',
  contextMenus: () => [],
  tabs: () => [],
});

const emit = defineEmits<{
  close: [string];
  pin: [TabDefinition];
  unpin: [TabDefinition];
}>();
const active = defineModel<string>('active');

const typeWithClass = computed(() => {
  const typeClasses: Record<string, { content: string }> = {
    brisk: {
      content: `h-full after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[1.5px] after:bg-primary after:scale-x-0 after:transition-[transform] after:ease-out after:duration-300 hover:after:scale-x-100 after:origin-left [&.is-active]:after:scale-x-100 [&:not(:first-child)]:border-l last:border-r last:border-r border-border`,
    },
    card: {
      content:
        'h-[calc(100%-6px)] rounded-md ml-2 border border-border  transition-all',
    },
    plain: {
      content:
        'h-full [&:not(:first-child)]:border-l last:border-r border-border',
    },
  };

  return typeClasses[props.styleType || 'plain'] || { content: '' };
});

const tabsView = computed(() => {
  return props.tabs.map((tab) => {
    const { fullPath, meta, name, path, key } = tab || {};
    const { affixTab, icon, newTabTitle, tabClosable, title } = meta || {};
    return {
      affixTab: !!affixTab,
      closable: Reflect.has(meta, 'tabClosable') ? !!tabClosable : true,
      fullPath,
      icon: icon as string,
      key,
      meta,
      name,
      path,
      title: (newTabTitle || title || name) as string,
    } as TabConfig;
  });
});

function onMouseDown(e: MouseEvent, tab: TabConfig) {
  if (
    e.button === 1 &&
    tab.closable &&
    !tab.affixTab &&
    tabsView.value.length > 1 &&
    props.middleClickToClose
  ) {
    e.preventDefault();
    e.stopPropagation();
    emit('close', tab.key);
  }
}
</script>

<template>
  <div
    :class="contentClass"
    class="relative flex! h-full w-max items-center overflow-hidden pr-6"
  >
    <TransitionGroup name="slide-left">
      <div
        v-for="(tab, i) in tabsView"
        :key="tab.key"
        :class="[
          {
            'is-active bg-primary/15 dark:bg-accent': tab.key === active,
            draggable: !tab.affixTab,
            'affix-tab': tab.affixTab,
          },
          typeWithClass.content,
        ]"
        :data-index="i"
        class="group tab-item translate-all relative flex cursor-pointer select-none [&:not(.is-active)]:hover:bg-accent"
        data-tab-item="true"
        @click="active = tab.key"
        @mousedown="onMouseDown($event, tab)"
      >
        <VbenContextMenu
          :handler-data="tab"
          :menus="contextMenus"
          :modal="false"
          item-class="pr-6"
        >
          <div class="relative flex size-full items-center">
            <!-- extra -->
            <div
              class="absolute top-1/2 right-1.5 z-3 flex items-center overflow-hidden translate-y-[-50%]"
            >
              <!-- pin-icon -->
              <Pin
                v-show="!tab.affixTab"
                aria-label="Pin tab"
                class="pointer-events-none mr-0 h-3.5 w-0 shrink-0 scale-75 cursor-pointer rounded-full opacity-0 transition-all duration-200 ease-out group-hover:pointer-events-auto group-hover:mr-0.5 group-hover:w-3.5 group-hover:scale-100 group-hover:opacity-100 group-[.is-active]:text-primary hover:bg-accent hover:stroke-accent-foreground group-[.is-active]:dark:text-accent-foreground"
                title="Pin tab"
                @click.stop="() => emit('pin', tab)"
              />
              <!-- close-icon -->
              <X
                v-show="!tab.affixTab && tabsView.length > 1 && tab.closable"
                aria-label="Close tab"
                class="size-3 cursor-pointer rounded-full stroke-accent-foreground/80 transition-all group-[.is-active]:text-primary hover:bg-accent hover:stroke-accent-foreground group-[.is-active]:dark:text-accent-foreground"
                title="Close tab"
                @click.stop="() => emit('close', tab.key)"
              />
              <PinOff
                v-show="tab.affixTab"
                aria-label="Unpin tab"
                class="pointer-events-none mt-px h-3.5 w-0 shrink-0 scale-75 cursor-pointer rounded-full opacity-0 transition-all duration-200 ease-out group-hover:pointer-events-auto group-hover:w-3.5 group-hover:scale-100 group-hover:opacity-100 group-[.is-active]:text-primary hover:bg-accent hover:stroke-accent-foreground group-[.is-active]:dark:text-accent-foreground"
                title="Unpin tab"
                @click.stop="() => emit('unpin', tab)"
              />
            </div>

            <!-- tab-item-main -->
            <div
              :class="
                tab.affixTab ? 'pr-0 group-hover:pr-3' : 'pr-3 group-hover:pr-7'
              "
              class="mx-3 mr-4 flex h-full items-center overflow-hidden rounded-tl-[5px] rounded-tr-[5px] text-accent-foreground transition-all duration-300 group-[.is-active]:text-primary group-[.is-active]:dark:text-accent-foreground"
            >
              <VbenIcon
                v-if="showIcon"
                :icon="tab.icon"
                class="mr-2 flex size-4 items-center overflow-hidden group-hover:animate-[shrink_0.3s_ease-in-out]"
                fallback
              />

              <span class="flex-1 overflow-hidden text-sm whitespace-nowrap">
                {{ tab.title }}
              </span>
            </div>
          </div>
        </VbenContextMenu>
      </div>
    </TransitionGroup>
  </div>
</template>
