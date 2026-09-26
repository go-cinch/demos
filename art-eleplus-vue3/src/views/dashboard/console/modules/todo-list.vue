<template>
  <div class="art-card h-128 p-5 mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ $t('dashboardContent.console.todo') }}</h4>
        <p>{{ $t('dashboardContent.console.pending') }}<span class="text-danger">3</span></p>
      </div>
    </div>

    <div class="h-[calc(100%-40px)] overflow-auto">
      <ElScrollbar>
        <div
          class="flex-cb h-17.5 border-b border-g-300 text-sm last:border-b-0"
          v-for="(item, index) in list"
          :key="index"
        >
          <div>
            <p class="text-sm">{{ $t(item.username) }}</p>
            <p class="text-g-500 mt-1">{{ $t(item.date) }}</p>
          </div>
          <ElCheckbox v-model="item.complate" />
        </div>
      </ElScrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
  interface TodoItem {
    username: string
    date: string
    complate: boolean
  }

  /**
   * 待办事项列表
   * 记录每日工作任务及完成状态
   */
  const list = reactive<TodoItem[]>([
    {
      username: 'dashboardContent.todos.reviewWork',
      date: 'dashboardContent.times.am0930',
      complate: true
    },
    {
      username: 'dashboardContent.todos.replyEmail',
      date: 'dashboardContent.times.am1030',
      complate: true
    },
    {
      username: 'dashboardContent.todos.prepareReport',
      date: 'dashboardContent.times.am1100',
      complate: true
    },
    {
      username: 'dashboardContent.todos.productMeeting',
      date: 'dashboardContent.times.pm0200',
      complate: false
    },
    {
      username: 'dashboardContent.todos.organizeNotes',
      date: 'dashboardContent.times.pm0330',
      complate: false
    },
    {
      username: 'dashboardContent.todos.planTomorrow',
      date: 'dashboardContent.times.pm0630',
      complate: false
    }
  ])
</script>
