<script lang="ts" setup>
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

withDefaults(defineProps<Props>(), {
  companyName: 'go cinch',
  companySiteLink: 'https://github.com/go-cinch/demos',
  date: '2024',
  icp: '',
  icpLink: '',
});
</script>

<template>
  <div class="text-md flex-center">
    <!-- ICP Link -->
    <a
      v-if="icp"
      :href="icpLink || 'https://beian.miit.gov.cn/'"
      class="mx-1 hover:text-primary-hover"
      rel="noopener noreferrer"
      target="_blank"
    >
      {{ icp }}
    </a>

    <!-- Copyright Text -->
    Copyright © {{ date }}

    <!-- Company Link -->
    <a
      v-if="companyName && companySiteLink"
      :href="companySiteLink"
      class="mx-1 hover:text-primary-hover"
      target="_blank"
    >
      {{ companyName }}
    </a>
    <span v-else-if="companyName" class="mx-1">{{ companyName }}</span>
  </div>
</template>
