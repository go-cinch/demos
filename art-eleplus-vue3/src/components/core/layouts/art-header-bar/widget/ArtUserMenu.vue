<!-- 用户菜单 -->
<template>
  <ElPopover
    ref="userMenuPopover"
    placement="bottom-end"
    :width="240"
    :hide-after="0"
    :offset="10"
    trigger="hover"
    :show-arrow="false"
    popper-class="user-menu-popover"
    popper-style="padding: 5px 16px;"
  >
    <template #reference>
      <button
        type="button"
        data-testid="user-avatar"
        class="mr-5 rounded-full max-sm:mr-4"
        :aria-label="$t('msg.account')"
        ><ElAvatar :size="34" class="user-text-avatar">{{
          userInfo.userName?.trim().slice(0, 2).toUpperCase()
        }}</ElAvatar></button
      >
    </template>
    <template #default>
      <div class="pt-3">
        <div class="flex-c pb-1 px-0">
          <ElAvatar :size="40" class="user-text-avatar mr-3 shrink-0">{{
            userInfo.userName?.trim().slice(0, 2).toUpperCase()
          }}</ElAvatar>
          <div class="w-[calc(100%-60px)] h-full">
            <span class="block text-sm font-medium text-g-800 truncate">{{
              userInfo.userName
            }}</span>
            <span class="block mt-0.5 text-xs text-g-500 truncate">{{
              userInfo.role?.name || userInfo.code || '-'
            }}</span>
          </div>
        </div>
        <ul class="py-4 mt-3 border-t border-g-300/80">
          <li class="btn-item" @click="goPage('/profile')">
            <ArtSvgIcon icon="ri:user-3-line" />
            <span>{{ $t('profile.title') }}</span>
          </li>
          <div class="w-full h-px my-2 bg-g-300/80"></div>
          <button type="button" class="log-out c-p w-full" @click="loginOut">
            {{ $t('topBar.user.logout') }}
          </button>
        </ul>
      </div>
    </template>
  </ElPopover>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { useRouter } from 'vue-router'
  import { ElMessageBox } from 'element-plus'
  import { useUserStore } from '@/store/modules/user'

  defineOptions({ name: 'ArtUserMenu' })

  const router = useRouter()
  const { t } = useI18n()
  const userStore = useUserStore()

  const { getUserInfo: userInfo } = storeToRefs(userStore)
  const userMenuPopover = ref()

  /**
   * 页面跳转
   * @param {string} path - 目标路径
   */
  const goPage = (path: string): void => {
    closeUserMenu()
    router.push(path)
  }

  /**
   * 用户登出确认
   */
  const loginOut = (): void => {
    closeUserMenu()
    setTimeout(() => {
      ElMessageBox.confirm(t('common.logOutTips'), t('common.tips'), {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        customClass: 'login-out-dialog'
      }).then(() => {
        userStore.logOut()
      })
    }, 200)
  }

  /**
   * 关闭用户菜单弹出层
   */
  const closeUserMenu = (): void => {
    setTimeout(() => {
      userMenuPopover.value.hide()
    }, 100)
  }
</script>

<style scoped>
  @reference '@styles/core/tailwind.css';

  @layer components {
    .btn-item {
      @apply flex items-center p-2 mb-3 select-none rounded-md cursor-pointer last:mb-0;

      span {
        @apply text-sm;
      }

      .art-svg-icon {
        @apply mr-2 text-base;
      }

      &:hover {
        background-color: var(--art-gray-200);
      }
    }
  }

  .log-out {
    @apply py-1.5
    mt-5
    text-xs
    text-center
    border
    border-g-400
    rounded-md
    transition-all
    duration-200
    hover:shadow-xl;
  }
</style>

<style scoped>
  .user-text-avatar {
    background: var(--el-fill-color);
    color: var(--el-text-color-primary);
    font-size: 14px;
    font-weight: 500;
  }
</style>
