<template>
  <div class="art-card h-128 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ $t('dashboardContent.console.activity') }}</h4>
        <p>{{ $t('dashboardContent.console.newItems') }}<span class="text-success">+6</span></p>
      </div>
    </div>

    <div class="h-9/10 mt-2 overflow-hidden">
      <ElScrollbar>
        <div
          class="h-17.5 leading-17.5 border-b border-g-300 text-sm overflow-hidden last:border-b-0"
          v-for="(item, index) in list"
          :key="index"
        >
          <span class="text-g-800 font-medium">{{ $t(item.username) }}</span>
          <span class="mx-2 text-g-600">{{ $t(item.type) }}</span>
          <span class="text-theme">{{ $t(item.target) }}</span>
        </div>
      </ElScrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
  interface DynamicItem {
    username: string
    type: string
    target: string
  }

  /**
   * 用户动态列表
   * 记录用户的关注、发文、提问、兑换等各类活动
   */
  const list = reactive<DynamicItem[]>([
    {
      username: 'dashboardContent.names.alex',
      type: 'dashboardContent.actions.followed',
      target: 'dashboardContent.names.sam'
    },
    {
      username: 'dashboardContent.names.emma',
      type: 'dashboardContent.actions.published',
      target: 'dashboardContent.targets.vueNotes'
    },
    {
      username: 'dashboardContent.names.alex',
      type: 'dashboardContent.actions.followed',
      target: 'dashboardContent.names.sam'
    },
    {
      username: 'dashboardContent.names.emma',
      type: 'dashboardContent.actions.published',
      target: 'dashboardContent.targets.vueNotes'
    },
    {
      username: 'dashboardContent.names.sam',
      type: 'dashboardContent.actions.asked',
      target: 'dashboardContent.targets.themeQuestion'
    },
    {
      username: 'dashboardContent.names.chris',
      type: 'dashboardContent.actions.redeemed',
      target: 'dashboardContent.targets.bookLife'
    },
    {
      username: 'dashboardContent.names.taylor',
      type: 'dashboardContent.actions.closed',
      target: 'dashboardContent.names.chris'
    },
    {
      username: 'dashboardContent.names.jordan',
      type: 'dashboardContent.actions.redeemed',
      target: 'dashboardContent.targets.bookHabits'
    }
  ])
</script>
