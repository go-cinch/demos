<script lang="ts" setup>
import type { NotificationItem } from './types';

import { watch } from 'vue';

import { Bell, CircleCheckBig, CircleX, MailCheck } from '@vben/icons';
import { $t } from '@vben/locales';

import {
  VbenAvatar,
  VbenButton,
  VbenIconButton,
  VbenPopover,
  VbenScrollbar,
} from '@vben-core/shadcn-ui';

import { useToggle } from '@vueuse/core';

defineOptions({ name: 'NotificationPopup' });

withDefaults(
  defineProps<{
    /** 显示圆点 */
    dot?: boolean;
    disabled?: boolean;
    triggerLabel?: string;
    /** 消息列表 */
    notifications?: NotificationItem[];
  }>(),
  {
    dot: false,
    disabled: false,
    triggerLabel: undefined,
    notifications: () => [],
  },
);

const emit = defineEmits<{
  clear: [];
  makeAll: [];
  onClick: [NotificationItem];
  read: [NotificationItem];
  remove: [NotificationItem];
  viewAll: [];
  openChange: [boolean];
}>();

const [open, toggle] = useToggle();
watch(open, (value) => emit('openChange', value));

const close = () => {
  open.value = false;
};

function handleViewAll() {
  emit('viewAll');
  close();
}

function handleMakeAll() {
  emit('makeAll');
}

function handleClear() {
  emit('clear');
}

defineExpose({ toggle, close });
</script>
<template>
  <VbenPopover
    v-model:open="open"
    content-class="notification-popover w-max min-w-[min(18rem,calc(100vw-1.5rem))] max-w-[min(25rem,calc(100vw-1.5rem))] p-0"
    :content-props="{ align: 'end', sideOffset: 8 }"
  >
    <template #trigger>
      <div class="mr-2 flex-center h-full" @click.stop="toggle()">
        <VbenIconButton
          class="bell-button relative text-foreground"
          :aria-label="triggerLabel || $t('ui.widgets.notifications')"
          :aria-expanded="open"
        >
          <span v-if="dot" class="absolute top-0.5 right-0.5 size-2 rounded-full bg-primary"></span>
          <Bell class="size-4" />
        </VbenIconButton>
      </div>
    </template>

    <div
      class="notification-preview"
      data-testid="notification-preview"
      role="region"
      :aria-label="$t('ui.widgets.notifications')"
    >
      <header class="flex items-center justify-between p-4 py-3">
        <div class="text-foreground">{{ $t('ui.widgets.notifications') }}</div>
        <VbenIconButton
          :disabled="disabled || notifications.length <= 0"
          :tooltip="$t('ui.widgets.markAllAsRead')"
          :aria-label="$t('ui.widgets.markAllAsRead')"
          @click="handleMakeAll"
        >
          <span class="sr-only">{{ $t('ui.widgets.markAllAsRead') }}</span>
          <MailCheck class="size-4" />
        </VbenIconButton>
      </header>
      <VbenScrollbar v-if="notifications.length > 0">
        <ul class="flex! max-h-90 w-full flex-col">
          <template v-for="item in notifications" :key="item.id ?? item.title">
            <li
              class="notification-row border-t border-border hover:bg-accent"
              @click="!disabled && emit('onClick', item)"
            >
              <slot name="content" :item="item">
                <div data-testid="notification-avatar" class="self-start">
                  <VbenAvatar :src="item.avatar" :alt="item.avatarName || item.title" :size="40" />
                </div>
                <button
                  type="button"
                  class="notification-copy text-left"
                  :aria-label="item.title"
                  :disabled="disabled"
                  @click.stop="emit('onClick', item)"
                >
                  <span class="notification-title font-semibold" data-testid="notification-title">{{
                    item.title
                  }}</span>
                  <span
                    class="notification-message text-xs text-muted-foreground"
                    data-testid="notification-content"
                    >{{ item.message }}</span
                  >
                  <time class="notification-date text-xs text-muted-foreground">{{
                    item.date
                  }}</time>
                </button>
                <div class="notification-actions">
                  <slot name="action" :item="item">
                    <slot name="action-prepend" :item="item"></slot>
                    <VbenIconButton
                      size="xs"
                      variant="ghost"
                      class="h-6 w-6 p-0"
                      :class="{ 'text-destructive': item.isRead }"
                      :disabled="disabled"
                      :aria-label="$t(item.isRead ? 'common.delete' : 'common.confirm')"
                      @click.stop="item.isRead ? emit('remove', item) : emit('read', item)"
                    >
                      <CircleX v-if="item.isRead" class="size-4" />
                      <CircleCheckBig v-else class="size-4" />
                    </VbenIconButton>
                    <slot name="action-append" :item="item"></slot>
                  </slot>
                </div>
              </slot>
            </li>
          </template>
        </ul>
      </VbenScrollbar>

      <template v-else>
        <div class="flex-center min-h-37.5 w-full text-muted-foreground">
          <slot name="empty">{{ $t('common.noData') }}</slot>
        </div>
      </template>

      <footer class="flex items-center justify-between border-t border-border px-4 py-3">
        <VbenButton
          :disabled="disabled || notifications.length <= 0"
          size="sm"
          variant="ghost"
          @click="handleClear"
        >
          {{ $t('ui.widgets.clearNotifications') }}
        </VbenButton>
        <VbenButton size="sm" @click="handleViewAll">
          {{ $t('ui.widgets.viewAll') }}
        </VbenButton>
      </footer>
    </div>
  </VbenPopover>
</template>

<style scoped>
.notification-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px;
}
.notification-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  text-align: start;
}
.notification-title,
.notification-message,
.notification-date {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 20px;
}
.notification-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

:deep(.bell-button) {
  &:hover {
    svg {
      animation: bell-ring 1s both;
    }
  }
}

@keyframes bell-ring {
  0%,
  100% {
    transform-origin: top;
  }

  15% {
    transform: rotateZ(10deg);
  }

  30% {
    transform: rotateZ(-10deg);
  }

  45% {
    transform: rotateZ(5deg);
  }

  60% {
    transform: rotateZ(-5deg);
  }

  75% {
    transform: rotateZ(2deg);
  }
}
</style>
