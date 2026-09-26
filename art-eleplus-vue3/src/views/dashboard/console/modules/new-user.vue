<template>
  <div class="art-card p-5 h-128 overflow-hidden mb-5 max-sm:mb-4">
    <div class="art-card-header">
      <div class="title">
        <h4>{{ $t('dashboardContent.console.newUsers') }}</h4>
        <p
          >{{ $t('dashboardContent.console.growthThisMonth')
          }}<span class="text-success">+20%</span></p
        >
      </div>
      <ElRadioGroup v-model="radio2">
        <ElRadioButton value="thisMonth">{{
          $t('dashboardContent.common.thisMonth')
        }}</ElRadioButton>
        <ElRadioButton value="lastMonth">{{
          $t('dashboardContent.common.lastMonth')
        }}</ElRadioButton>
        <ElRadioButton value="thisYear">{{ $t('dashboardContent.common.thisYear') }}</ElRadioButton>
      </ElRadioGroup>
    </div>
    <ArtTable
      class="w-full"
      :data="tableData"
      style="width: 100%"
      size="large"
      :border="false"
      :stripe="false"
      :header-cell-style="{ background: 'transparent' }"
    >
      <template #default>
        <ElTableColumn :label="$t('dashboardContent.console.avatar')" prop="avatar" width="150px">
          <template #default="scope">
            <div style="display: flex; align-items: center">
              <img class="size-9 rounded-lg" :src="scope.row.avatar" alt="avatar" />
              <span class="ml-2">{{ $t(scope.row.username) }}</span>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="$t('dashboardContent.console.region')" prop="province">
          <template #default="scope">{{ $t(scope.row.province) }}</template>
        </ElTableColumn>
        <ElTableColumn :label="$t('dashboardContent.console.gender')" prop="avatar">
          <template #default="scope">
            <div style="display: flex; align-items: center">
              <span style="margin-left: 10px">{{
                $t(
                  scope.row.sex === 1
                    ? 'dashboardContent.common.male'
                    : 'dashboardContent.common.female'
                )
              }}</span>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn :label="$t('dashboardContent.console.progress')" width="240">
          <template #default="scope">
            <ElProgress
              :percentage="scope.row.pro"
              :color="scope.row.color"
              :stroke-width="4"
              :aria-label="`${$t(scope.row.username)} ${$t('dashboardContent.console.progress')}: ${scope.row.pro}%`"
            />
          </template>
        </ElTableColumn>
      </template>
    </ArtTable>
  </div>
</template>

<script setup lang="ts">
  import avatar1 from '@/assets/images/avatar/avatar1.webp'
  import avatar2 from '@/assets/images/avatar/avatar2.webp'
  import avatar3 from '@/assets/images/avatar/avatar3.webp'
  import avatar4 from '@/assets/images/avatar/avatar4.webp'
  import avatar5 from '@/assets/images/avatar/avatar5.webp'
  import avatar6 from '@/assets/images/avatar/avatar6.webp'

  interface UserTableItem {
    username: string
    province: string
    sex: 0 | 1
    age: number
    percentage: number
    pro: number
    color: string
    avatar: string
  }

  const ANIMATION_DELAY = 100

  const radio2 = ref('thisMonth')

  /**
   * 新用户表格数据
   * 包含用户基本信息和完成进度
   */
  const tableData = reactive<UserTableItem[]>([
    {
      username: 'dashboardContent.names.alex',
      province: 'dashboardContent.regions.beijing',
      sex: 0,
      age: 22,
      percentage: 60,
      pro: 0,
      color: 'var(--art-primary)',
      avatar: avatar1
    },
    {
      username: 'dashboardContent.names.emma',
      province: 'dashboardContent.regions.shenzhen',
      sex: 1,
      age: 21,
      percentage: 20,
      pro: 0,
      color: 'var(--art-secondary)',
      avatar: avatar2
    },
    {
      username: 'dashboardContent.names.sam',
      province: 'dashboardContent.regions.shanghai',
      sex: 1,
      age: 23,
      percentage: 60,
      pro: 0,
      color: 'var(--art-warning)',
      avatar: avatar3
    },
    {
      username: 'dashboardContent.names.chris',
      province: 'dashboardContent.regions.changsha',
      sex: 0,
      age: 28,
      percentage: 50,
      pro: 0,
      color: 'var(--art-info)',
      avatar: avatar4
    },
    {
      username: 'dashboardContent.names.taylor',
      province: 'dashboardContent.regions.zhejiang',
      sex: 1,
      age: 26,
      percentage: 70,
      pro: 0,
      color: 'var(--art-error)',
      avatar: avatar5
    },
    {
      username: 'dashboardContent.names.jordan',
      province: 'dashboardContent.regions.hubei',
      sex: 1,
      age: 25,
      percentage: 90,
      pro: 0,
      color: 'var(--art-success)',
      avatar: avatar6
    }
  ])

  /**
   * 添加进度条动画效果
   * 延迟后将进度值从 0 更新到目标百分比，触发动画
   */
  const addAnimation = (): void => {
    setTimeout(() => {
      tableData.forEach((item) => {
        item.pro = item.percentage
      })
    }, ANIMATION_DELAY)
  }

  onMounted(() => {
    addAnimation()
  })
</script>

<style lang="scss" scoped>
  .art-card {
    :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
      color: var(--el-color-primary) !important;
      background: transparent !important;
    }
  }
</style>
