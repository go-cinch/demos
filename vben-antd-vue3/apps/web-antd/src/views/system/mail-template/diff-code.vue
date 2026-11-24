<script setup lang="ts">
import type { DiffSegment } from './inline-comparison';

import { computed } from 'vue';

import { $t } from '#/locales';

import { foldSegment } from './inline-comparison';

const props = defineProps<{
  segments: DiffSegment[];
  compact: boolean;
  side: 'after' | 'before';
  rowId: string;
  expanded: Set<string>;
  activeChange: number;
}>();
const emit = defineEmits<{ expand: [id: string] }>();
const segmentKey = (id: number) => `${props.rowId}:${id}`;
const parts = computed(() =>
  props.segments.map((segment) => ({ ...segment, fold: foldSegment(segment) })),
);
</script>

<template>
  <code
    ><template v-for="part in parts" :key="part.id"
      ><component
        :is="part.changed ? (side === 'before' ? 'del' : 'ins') : 'span'"
        :class="{
          'changed-character': part.changed,
          'active-change': part.changeIndex === activeChange,
        }"
        :data-change-index="part.changeIndex"
        :aria-current="part.changeIndex === activeChange ? 'true' : undefined"
        ><template
          v-if="compact && part.fold && !expanded.has(segmentKey(part.id))"
          >{{ part.fold.prefix
          }}<button
            type="button"
            class="folded-content"
            :aria-label="
              $t('mail-template.expandUnchangedCharacters', {
                count: part.fold.count,
              })
            "
            :aria-expanded="false"
            @click="emit('expand', segmentKey(part.id))"
          >
            {{
              $t('mail-template.foldedCharacters', { count: part.fold.count })
            }}</button
          >{{ part.fold.suffix }}</template
        ><template v-else>{{ part.text }}</template></component
      ></template
    ></code
  >
</template>

<style scoped>
code {
  flex: 1;
  min-width: 0;
  font:
    12px/1.7 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.changed-character {
  font-weight: 700;
  color: inherit;
  border-radius: 2px;
  box-decoration-break: clone;
}

del.changed-character {
  text-decoration: line-through;
  background: rgb(239 68 68 / 28%);
}

ins.changed-character {
  text-decoration: underline;
  text-underline-offset: 3px;
  background: rgb(34 197 94 / 32%);
}

.active-change {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
  scroll-margin-block: 100px;
}

.folded-content {
  padding: 0 6px;
  margin: 0 4px;
  font: inherit;
  color: hsl(var(--foreground));
  cursor: pointer;
  background: hsl(var(--muted));
  border: 1px dashed hsl(var(--muted-foreground));
  border-radius: 4px;
}

.folded-content:hover {
  background: hsl(var(--accent));
}

.folded-content:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
</style>
