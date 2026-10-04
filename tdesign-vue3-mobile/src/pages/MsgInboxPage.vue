<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { Msg } from '../lib/msg';
import { msgApi, msgChanged } from '../lib/msg';
import { MessageFeed } from '../lib/message-feed';
import { dateTime } from '../lib/format';
import { t } from '../locales';
import Icon from '../components/Icon.vue';
import { SwipeCell } from 'tdesign-mobile-vue';
import PageSkeleton from '../components/PageSkeleton.vue';
const tr = (key: string, params?: Record<string, string | number>) => t(`app.msg.${key}`, params);
const type = ref('');
function createFeed() {
  const value = type.value;
  return new MessageFeed(
    (page) => msgApi.list(false, { p: page, s: 20, ...(value ? { type: value } : {}) }),
    20,
  );
}
let feed = createFeed();
const state = shallowRef(feed.snapshot());
let unsubscribe = feed.subscribe(() => {
  state.value = feed.snapshot();
});
const rows = computed(() => state.value.rows);
const loading = computed(() => state.value.loading);
const error = computed(() => state.value.error);
const busy = ref(false);
const deletingID = ref<number | null>(null);
const swipeID = ref<number | null>(null);
let disposed = false;
async function readAll() {
  if (busy.value || loading.value) return;
  busy.value = true;
  swipeID.value = null;
  feed.setError('');
  let failure = '';
  try {
    await msgApi.readAll();
  } catch (error) {
    failure = (error as Error).message;
  } finally {
    msgChanged();
    await feed.load();
    if (!disposed) {
      if (failure) feed.setError(failure);
      busy.value = false;
    }
  }
}
async function remove(row: Msg) {
  if (busy.value) return;
  busy.value = true;
  deletingID.value = row.id;
  feed.setError('');
  let failure = '';
  try {
    await msgApi.remove(row.id, false);
    swipeID.value = null;
    msgChanged();
    await feed.load();
  } catch (error) {
    failure = (error as Error).message;
  } finally {
    if (!disposed) {
      if (failure) feed.setError(failure);
      busy.value = false;
      deletingID.value = null;
    }
  }
}
function swipeChanged(id: number, side?: string) {
  if (side === 'right') swipeID.value = id;
  else if (swipeID.value === id) swipeID.value = null;
}
// The native component handles touch; pointer input also supports desktop previews.
let pointerStart: { id: number; x: number; y: number } | undefined;
function startPointer(event: PointerEvent, id: number) {
  if (
    event.pointerType === 'mouse' &&
    event.button === 0 &&
    !busy.value &&
    (event.target as Element)?.closest('.message-body')
  ) {
    event.preventDefault();
    pointerStart = { id, x: event.clientX, y: event.clientY };
  }
}
function endPointer(event: PointerEvent, id: number) {
  const start = pointerStart;
  pointerStart = undefined;
  if (!start || start.id !== id || busy.value) return;
  const dx = event.clientX - start.x,
    dy = event.clientY - start.y;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) swipeID.value = dx < 0 ? id : null;
}
watch(type, () => {
  feed.dispose();
  unsubscribe();
  feed = createFeed();
  state.value = feed.snapshot();
  unsubscribe = feed.subscribe(() => {
    state.value = feed.snapshot();
  });
  swipeID.value = null;
  void feed.load();
});
const sentinel = ref<HTMLElement>();
let scrollRoot: HTMLElement | null = null;
let observer: IntersectionObserver;
function observeScrollRoot() {
  observer?.disconnect();
  scrollRoot?.removeEventListener('scroll', checkLoadMore);
  scrollRoot = null;
  for (
    let parent = sentinel.value?.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) {
      scrollRoot = parent;
      break;
    }
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void checkLoadMore();
    },
    { root: scrollRoot, rootMargin: '0px 0px 250px 0px' },
  );
  if (sentinel.value) observer.observe(sentinel.value);
  scrollRoot?.addEventListener('scroll', checkLoadMore, { passive: true });
  window.addEventListener('scroll', checkLoadMore, { passive: true });
  void checkLoadMore();
}
let checkScheduled = false;
async function checkLoadMore() {
  if (checkScheduled || disposed) return;
  checkScheduled = true;
  await nextTick();
  // Measure after the appended rows have reached the browser layout.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  checkScheduled = false;
  if (
    disposed ||
    !sentinel.value ||
    busy.value ||
    state.value.refreshing ||
    state.value.loadingMore ||
    state.value.moreError ||
    state.value.error ||
    !state.value.hasMore
  )
    return;
  const rootClips = scrollRoot && /auto|scroll/.test(getComputedStyle(scrollRoot).overflowY);
  const bottom = rootClips ? scrollRoot!.getBoundingClientRect().bottom : innerHeight;
  if (sentinel.value.getBoundingClientRect().top <= bottom + 250) await feed.loadMore();
}
watch([state, busy], () => {
  void checkLoadMore();
});
function refreshVisible() {
  if (!document.hidden && !busy.value && !state.value.refreshing) void feed.load();
}
let timer: ReturnType<typeof setInterval>;
onMounted(() => {
  observeScrollRoot();
  window.addEventListener('resize', observeScrollRoot);
  timer = setInterval(refreshVisible, 30000);
  window.addEventListener('cinch-msg-changed', refreshVisible);
  document.addEventListener('visibilitychange', refreshVisible);
  void feed.load();
});
onBeforeUnmount(() => {
  disposed = true;
  feed.dispose();
  unsubscribe();
  observer?.disconnect();
  scrollRoot?.removeEventListener('scroll', checkLoadMore);
  window.removeEventListener('scroll', checkLoadMore);
  window.removeEventListener('resize', observeScrollRoot);
  clearInterval(timer);
  window.removeEventListener('cinch-msg-changed', refreshVisible);
  document.removeEventListener('visibilitychange', refreshVisible);
});
</script>
<template>
  <section class="page message-page" data-testid="message-inbox-page" :aria-busy="loading">
    <header class="page-heading">
      <RouterLink to="/profile" class="back-link" :aria-label="t('mine')"
        ><Icon name="chevron-left" :size="22"
      /></RouterLink>
      <h1>{{ tr('inbox') }}</h1>
      <button
        class="icon-button message-read-all"
        :aria-label="tr('readAll')"
        :title="tr('readAll')"
        :disabled="loading || busy"
        :aria-busy="busy && deletingID === null"
        @click="readAll"
      >
        <Icon name="broom" :size="23" />
      </button>
    </header>
    <section class="message-filters" :aria-label="tr('type')">
      <div class="message-type-tabs" role="group" :aria-label="tr('type')">
        <button
          v-for="value in ['', 'system', 'notice']"
          :key="value"
          :class="{ active: type === value }"
          :aria-pressed="type === value"
          :disabled="busy"
          @click="type = value"
        >
          {{ tr(value || 'allTypes') }}
        </button>
      </div>
    </section>
    <div class="results-region">
      <div v-if="error" class="form-error" role="alert">
        <p>{{ error }}</p>
        <button class="action-chip action-chip-quiet" @click="feed.load()">
          {{ tr('retry') }}
        </button>
      </div>
      <PageSkeleton v-if="loading" variant="list" />
      <div v-else class="message-list">
        <article
          v-for="row in rows"
          :key="row.id"
          class="message-item"
          :class="{ 'is-unread': !row.read_at }"
          :data-record-id="row.id"
          tabindex="0"
          :aria-label="`${row.title}, ${tr(row.read_at ? 'read' : 'unread')}`"
          @keydown.left.prevent="!busy && (swipeID = row.id)"
          @keydown.right.prevent="swipeID = null"
          @keydown.esc.prevent="swipeID = null"
        >
          <SwipeCell
            :opened="[false, swipeID === row.id]"
            :disabled="busy"
            @change="(side) => swipeChanged(row.id, side)"
            @pointerdown="startPointer($event, row.id)"
            @pointerup="endPointer($event, row.id)"
            @pointercancel="pointerStart = undefined"
          >
            <div class="message-body">
              <span class="message-avatar" aria-hidden="true"
                ><Icon :name="row.type === 'system' ? 'secured' : 'notification'" :size="24" /><span
                  v-if="!row.read_at"
                  class="message-unread-dot"
              /></span>
              <span class="message-main">
                <strong class="message-title">{{ row.title }}</strong>
                <span class="message-preview">{{ row.content }}</span>
              </span>
              <time class="message-time" :aria-label="tr('published')">{{
                dateTime(row.published_at)
              }}</time>
            </div>
            <template #right
              ><button
                class="message-delete"
                :aria-label="`${tr('delete')} ${row.title}`"
                :aria-hidden="swipeID !== row.id"
                :inert="swipeID !== row.id"
                :tabindex="swipeID === row.id ? 0 : -1"
                :disabled="busy"
                :aria-busy="deletingID === row.id"
                @click.stop="remove(row)"
              >
                <Icon name="delete" :size="19" /><span>{{ tr('delete') }}</span>
              </button></template
            >
          </SwipeCell>
        </article>
        <t-empty v-if="!rows.length && !error" :description="tr('empty')" />
      </div>
      <div
        ref="sentinel"
        class="message-feed-footer"
        :class="{ 'message-feed-footer-idle': !state.loadingMore && !state.moreError }"
        role="status"
        aria-live="polite"
        :aria-busy="state.loadingMore"
      >
        <div v-if="state.moreError" class="message-load-error">
          <span>{{ state.moreError }}</span
          ><button class="action-chip action-chip-quiet" @click="feed.loadMore()">
            {{ tr('retry') }}
          </button>
        </div>
        <t-loading v-else-if="state.loadingMore" :text="tr('loadingMore')" size="16px" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.message-feed-footer-idle {
  min-height: 1px;
  padding: 0;
}

.message-page > .page-heading {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 44px;
  align-items: center;
  min-height: 44px;
  gap: 6px;
  margin: 0 0 12px;
}
.message-page .back-link,
.message-page .message-read-all {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  line-height: 0;
  color: var(--accent);
  background: transparent;
}
.message-page .page-heading h1 {
  margin: 0;
  font-size: 21px;
  line-height: 28px;
  font-weight: 600;
}

.message-list {
  min-width: 0;
}
.message-item + .message-item {
  border-top: 1px solid var(--line);
}

.message-body {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 94px;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 12px 6px;
  text-align: left;
}
.message-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  max-width: 44px;
  height: 44px;
  border-radius: 12px;
  color: var(--accent);
  background: var(--accent-light);
}

.message-unread-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 9px;
  height: 9px;
  border: 2px solid var(--bg);
  border-radius: 50%;
  background: var(--danger);
}
.message-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}
.message-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  line-height: 22px;
  font-weight: 500;
}
.is-unread .message-title {
  font-weight: 650;
}
.message-time {
  width: 94px;
  min-width: 0;
  align-self: center;
  text-align: left;
  color: var(--muted);
  font-size: 11px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
}
.message-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--muted);
  font-size: 13px;
  line-height: 18px;
}

@media (max-width: 360px) {
  .message-body {
    grid-template-columns: 40px minmax(0, 1fr) 84px;
    gap: 8px;
    padding-inline: 4px;
  }
  .message-avatar {
    width: 40px;
    max-width: 40px;
    height: 40px;
  }
  .message-time {
    width: 84px;
    font-size: 10px;
  }
}

.message-body {
  min-height: 84px;
  cursor: default;
  touch-action: pan-y;
}
.message-item {
  min-width: 0;
  overflow: hidden;
}
.message-item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 12px;
}
.message-item :deep(.t-swipe-cell) {
  background: transparent;
}
.message-delete {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 80px;
  height: 100%;
  min-height: 84px;
  padding: 0;
  color: var(--bg);
  background: var(--danger);
  border-radius: 0;
  font-size: 13px;
  font-weight: 600;
}
</style>
