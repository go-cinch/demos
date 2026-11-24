<script lang="ts" setup>
import { computed } from 'vue';

interface Props {
  companyName?: string;
  companySiteLink?: string;
  date?: string;
  icp?: string;
  icpLink?: string;
}

defineOptions({
  name: 'Copyright',
});

const props = withDefaults(defineProps<Props>(), {
  companyName: 'go-cinch',
  companySiteLink: 'https://github.com/go-cinch/demos',
  date: String(new Date().getFullYear()),
  icp: '',
  icpLink: '',
});

function safeHref(value: string) {
  const base = 'https://copyright.invalid';
  try {
    if (value.startsWith('/') && !value.startsWith('//')) {
      const { hash, origin, pathname, search } = new URL(value, base);
      if (origin === base && !pathname.startsWith('//'))
        return `${pathname}${search}${hash}`;
      return undefined;
    }
    const url = new URL(value);
    if (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password
    ) {
      return value;
    }
  } catch {
    // The editor may contain an incomplete URL while the user is typing.
  }
}

const companyHref = computed(() => safeHref(props.companySiteLink));
const icpHref = computed(() =>
  safeHref(props.icpLink || 'https://beian.miit.gov.cn/'),
);
</script>

<template>
  <div class="text-md flex-center">
    <!-- ICP Link -->
    <a
      v-if="icp && icpHref"
      :href="icpHref"
      class="mx-1 hover:text-primary-hover"
      rel="noopener noreferrer"
      target="_blank"
    >
      {{ icp }}
    </a>
    <span v-else-if="icp" class="mx-1">{{ icp }}</span>

    <!-- Copyright Text -->
    Copyright © {{ date || new Date().getFullYear() }}

    <!-- Company Link -->
    <a
      v-if="companyName && companyHref"
      :href="companyHref"
      class="mx-1 hover:text-primary-hover"
      rel="noopener noreferrer"
      target="_blank"
    >
      {{ companyName }}
    </a>
    <span v-else-if="companyName" class="mx-1">{{ companyName }}</span>
  </div>
</template>
