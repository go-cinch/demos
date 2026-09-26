<script lang="ts" setup>
import type {
  WorkbenchProjectItem,
  WorkbenchQuickNavItem,
  WorkbenchTodoItem,
  WorkbenchTrendItem,
} from '@vben/common-ui';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  AnalysisChartCard,
  WorkbenchHeader,
  WorkbenchProject,
  WorkbenchQuickNav,
  WorkbenchTodo,
  WorkbenchTrends,
} from '@vben/common-ui';
import { preferences } from '@vben/preferences';
import { useUserStore } from '@vben/stores';
import { openWindow } from '@vben/utils';

import { $t } from '#/locales';

import AnalyticsVisitsSource from '../analytics/analytics-visits-source.vue';

const userStore = useUserStore();

// 这是一个示例数据，实际项目中需要根据实际情况进行调整
// url 也可以是内部路由，在 navTo 方法中识别处理，进行内部跳转
// 例如：url: /dashboard/workspace
const projectItems = computed<WorkbenchProjectItem[]>(() => [
  {
    color: '',
    content: $t('page.dashboard.workspacePage.projects.githubQuote'),
    date: '2021-04-01',
    group: $t('page.dashboard.workspacePage.groups.openSource'),
    icon: 'carbon:logo-github',
    title: 'Github',
    url: 'https://github.com',
  },
  {
    color: '#3fb27f',
    content: $t('page.dashboard.workspacePage.projects.vueQuote'),
    date: '2021-04-01',
    group: $t('page.dashboard.workspacePage.groups.algorithm'),
    icon: 'ion:logo-vue',
    title: 'Vue',
    url: 'https://vuejs.org',
  },
  {
    color: '#e18525',
    content: $t('page.dashboard.workspacePage.projects.htmlQuote'),
    date: '2021-04-01',
    group: $t('page.dashboard.workspacePage.groups.web'),
    icon: 'ion:logo-html5',
    title: 'Html5',
    url: 'https://developer.mozilla.org/zh-CN/docs/Web/HTML',
  },
  {
    color: '#bf0c2c',
    content: $t('page.dashboard.workspacePage.projects.angularQuote'),
    date: '2021-04-01',
    group: 'UI',
    icon: 'ion:logo-angular',
    title: 'Angular',
    url: 'https://angular.io',
  },
  {
    color: '#00d8ff',
    content: $t('page.dashboard.workspacePage.projects.reactQuote'),
    date: '2021-04-01',
    group: $t('page.dashboard.workspacePage.groups.technology'),
    icon: 'bx:bxl-react',
    title: 'React',
    url: 'https://reactjs.org',
  },
  {
    color: '#EBD94E',
    content: $t('page.dashboard.workspacePage.projects.javascriptQuote'),
    date: '2021-04-01',
    group: $t('page.dashboard.workspacePage.groups.architecture'),
    icon: 'ion:logo-javascript',
    title: 'Js',
    url: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript',
  },
]);

// 同样，这里的 url 也可以使用以 http 开头的外部链接
const quickNavItems = computed<WorkbenchQuickNavItem[]>(() => [
  {
    color: '#1fdaca',
    icon: 'ion:home-outline',
    title: $t('page.dashboard.workspacePage.navigation.home'),
    url: '/',
  },
  {
    color: '#bf0c2c',
    icon: 'ion:grid-outline',
    title: $t('page.dashboard.workspacePage.navigation.dashboard'),
    url: '/dashboard',
  },
  {
    color: '#e18525',
    icon: 'ion:layers-outline',
    title: $t('page.dashboard.workspacePage.navigation.components'),
    url: '/demos/features/icons',
  },
  {
    color: '#3fb27f',
    icon: 'ion:settings-outline',
    title: $t('page.dashboard.workspacePage.navigation.systemManagement'),
    url: '/demos/features/login-expired', // 这里的 URL 是示例，实际项目中需要根据实际情况进行调整
  },
  {
    color: '#4daf1bc9',
    icon: 'ion:key-outline',
    title: $t('page.dashboard.workspacePage.navigation.accessManagement'),
    url: '/demos/access/page-control',
  },
  {
    color: '#00d8ff',
    icon: 'ion:bar-chart-outline',
    title: $t('page.dashboard.workspacePage.navigation.charts'),
    url: '/analytics',
  },
]);

const todoCompletion = ref([false, true, false, false, false]);
const todoItems = computed<WorkbenchTodoItem[]>(() => [
  {
    get completed() {
      return todoCompletion.value[0] ?? false;
    },
    set completed(value) {
      todoCompletion.value[0] = value;
    },
    content: $t('page.dashboard.workspacePage.todos.codeReview.content'),
    date: '2024-07-30 11:00:00',
    title: $t('page.dashboard.workspacePage.todos.codeReview.title'),
  },
  {
    get completed() {
      return todoCompletion.value[1] ?? false;
    },
    set completed(value) {
      todoCompletion.value[1] = value;
    },
    content: $t('page.dashboard.workspacePage.todos.performance.content'),
    date: '2024-07-30 11:00:00',
    title: $t('page.dashboard.workspacePage.todos.performance.title'),
  },
  {
    get completed() {
      return todoCompletion.value[2] ?? false;
    },
    set completed(value) {
      todoCompletion.value[2] = value;
    },
    content: $t('page.dashboard.workspacePage.todos.security.content'),
    date: '2024-07-30 11:00:00',
    title: $t('page.dashboard.workspacePage.todos.security.title'),
  },
  {
    get completed() {
      return todoCompletion.value[3] ?? false;
    },
    set completed(value) {
      todoCompletion.value[3] = value;
    },
    content: $t('page.dashboard.workspacePage.todos.dependencies.content'),
    date: '2024-07-30 11:00:00',
    title: $t('page.dashboard.workspacePage.todos.dependencies.title'),
  },
  {
    get completed() {
      return todoCompletion.value[4] ?? false;
    },
    set completed(value) {
      todoCompletion.value[4] = value;
    },
    content: $t('page.dashboard.workspacePage.todos.uiIssue.content'),
    date: '2024-07-30 11:00:00',
    title: $t('page.dashboard.workspacePage.todos.uiIssue.title'),
  },
]);
const trendItems = computed<WorkbenchTrendItem[]>(() => [
  {
    avatar: 'svg:avatar-1',
    content: $t('page.dashboard.workspacePage.trends.items.createdProject'),
    date: $t('page.dashboard.workspacePage.trends.dates.justNow'),
    title: $t('page.dashboard.workspacePage.people.william'),
  },
  {
    avatar: 'svg:avatar-2',
    content: $t('page.dashboard.workspacePage.trends.items.followedWilliam'),
    date: $t('page.dashboard.workspacePage.trends.dates.oneHourAgo'),
    title: $t('page.dashboard.workspacePage.people.evan'),
  },
  {
    avatar: 'svg:avatar-3',
    content: $t('page.dashboard.workspacePage.trends.items.postedUpdate'),
    date: $t('page.dashboard.workspacePage.trends.dates.oneDayAgo'),
    title: $t('page.dashboard.workspacePage.people.chris'),
  },
  {
    avatar: 'svg:avatar-4',
    content: $t('page.dashboard.workspacePage.trends.items.publishedVite'),
    date: $t('page.dashboard.workspacePage.trends.dates.twoDaysAgo'),
    title: 'go cinch',
  },
  {
    avatar: 'svg:avatar-1',
    content: $t('page.dashboard.workspacePage.trends.items.repliedOptimization'),
    date: $t('page.dashboard.workspacePage.trends.dates.threeDaysAgo'),
    title: $t('page.dashboard.workspacePage.people.peter'),
  },
  {
    avatar: 'svg:avatar-2',
    content: $t('page.dashboard.workspacePage.trends.items.closedRunIssue'),
    date: $t('page.dashboard.workspacePage.trends.dates.oneWeekAgo'),
    title: $t('page.dashboard.workspacePage.people.jack'),
  },
  {
    avatar: 'svg:avatar-3',
    content: $t('page.dashboard.workspacePage.trends.items.postedUpdate'),
    date: $t('page.dashboard.workspacePage.trends.dates.oneWeekAgo'),
    title: $t('page.dashboard.workspacePage.people.william'),
  },
  {
    avatar: 'svg:avatar-4',
    content: $t('page.dashboard.workspacePage.trends.items.pushedGithub'),
    date: '2021-04-01 20:00',
    title: $t('page.dashboard.workspacePage.people.william'),
  },
  {
    avatar: 'svg:avatar-4',
    content: $t('page.dashboard.workspacePage.trends.items.publishedAdminVben'),
    date: '2021-03-01 20:00',
    title: 'go cinch',
  },
]);

const router = useRouter();

// 这是一个示例方法，实际项目中需要根据实际情况进行调整
// This is a sample method, adjust according to the actual project requirements
function navTo(nav: WorkbenchProjectItem | WorkbenchQuickNavItem) {
  if (nav.url?.startsWith('http')) {
    openWindow(nav.url);
    return;
  }
  if (nav.url?.startsWith('/')) {
    router.push(nav.url).catch((error) => {
      console.error('Navigation failed:', error);
    });
  } else {
    console.warn(`Unknown URL for navigation item: ${nav.title} -> ${nav.url}`);
  }
}
</script>

<template>
  <div class="p-5">
    <WorkbenchHeader
      :avatar="userStore.userInfo?.avatar || preferences.app.defaultAvatar"
    >
      <template #title>
        {{
          $t('page.dashboard.workspacePage.header.greeting', {
            name: userStore.userInfo?.realName ?? '',
          })
        }}
      </template>
      <template #description>
        {{ $t('page.dashboard.workspacePage.header.weather') }}
      </template>
      <template #actions>
        <div class="flex flex-col justify-center text-right">
          <span class="text-foreground/80">
            {{ $t('page.dashboard.workspacePage.stats.todos') }}
          </span>
          <span class="text-2xl">2/10</span>
        </div>

        <div class="mx-12 flex flex-col justify-center text-right md:mx-16">
          <span class="text-foreground/80">
            {{ $t('page.dashboard.workspacePage.stats.projects') }}
          </span>
          <span class="text-2xl">8</span>
        </div>
        <div class="mr-4 flex flex-col justify-center text-right md:mr-10">
          <span class="text-foreground/80">
            {{ $t('page.dashboard.workspacePage.stats.teams') }}
          </span>
          <span class="text-2xl">300</span>
        </div>
      </template>
    </WorkbenchHeader>

    <div class="flex flex-col lg:flex-row">
      <div class="mr-4 w-full lg:w-3/5">
        <WorkbenchProject
          :items="projectItems"
          :title="$t('page.dashboard.workspacePage.sections.projects')"
          @click="navTo"
        />
        <WorkbenchTrends
          :items="trendItems"
          class="mt-5"
          :title="$t('page.dashboard.workspacePage.sections.latestActivity')"
        />
      </div>
      <div class="w-full lg:w-2/5">
        <WorkbenchQuickNav
          :items="quickNavItems"
          class="lg:mt-0"
          :title="$t('page.dashboard.workspacePage.sections.quickNavigation')"
          @click="navTo"
        />
        <WorkbenchTodo
          :items="todoItems"
          class="mt-5"
          :title="$t('page.dashboard.workspacePage.sections.todos')"
        />
        <AnalysisChartCard
          class="mt-5"
          :title="$t('page.dashboard.overviewPage.cards.visitSource')"
        >
          <AnalyticsVisitsSource />
        </AnalysisChartCard>
      </div>
    </div>
  </div>
</template>
