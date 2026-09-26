/**
 * 快速入口配置
 * 包含：应用列表、快速链接等配置
 */
import { WEB_LINKS } from '@/utils/constants'
import type { FastEnterConfig } from '@/types/config'

const fastEnterConfig: FastEnterConfig = {
  // 显示条件（屏幕宽度）
  minWidth: 1200,
  // 应用列表
  applications: [
    {
      name: 'fastEnter.workspace',
      description: 'fastEnter.workspaceDescription',
      icon: 'ri:pie-chart-line',
      iconColor: '#377dff',
      enabled: true,
      order: 1,
      routeName: 'Console'
    },
    {
      name: 'fastEnter.analysis',
      description: 'fastEnter.analysisDescription',
      icon: 'ri:game-line',
      iconColor: '#ff3b30',
      enabled: true,
      order: 2,
      routeName: 'Analysis'
    },
    {
      name: 'fastEnter.fireworks',
      description: 'fastEnter.fireworksDescription',
      icon: 'ri:loader-line',
      iconColor: '#7A7FFF',
      enabled: true,
      order: 3,
      routeName: 'Fireworks'
    },
    {
      name: 'fastEnter.chat',
      description: 'fastEnter.chatDescription',
      icon: 'ri:user-line',
      iconColor: '#13DEB9',
      enabled: true,
      order: 4,
      routeName: 'Chat'
    },
    {
      name: 'fastEnter.docs',
      description: 'fastEnter.docsDescription',
      icon: 'ri:bill-line',
      iconColor: '#ffb100',
      enabled: true,
      order: 5,
      link: WEB_LINKS.DOCS
    },
    {
      name: 'fastEnter.support',
      description: 'fastEnter.supportDescription',
      icon: 'ri:user-location-line',
      iconColor: '#ff6b6b',
      enabled: true,
      order: 6,
      link: WEB_LINKS.COMMUNITY
    },
    {
      name: 'fastEnter.changelog',
      description: 'fastEnter.changelogDescription',
      icon: 'ri:gamepad-line',
      iconColor: '#38C0FC',
      enabled: true,
      order: 7,
      routeName: 'ChangeLog'
    },
    {
      name: 'fastEnter.bilibili',
      description: 'fastEnter.bilibiliDescription',
      icon: 'ri:bilibili-line',
      iconColor: '#FB7299',
      enabled: true,
      order: 8,
      link: WEB_LINKS.BILIBILI
    }
  ],
  // 快速链接
  quickLinks: [
    {
      name: 'fastEnter.login',
      enabled: true,
      order: 1,
      routeName: 'Login'
    },
    {
      name: 'fastEnter.register',
      enabled: true,
      order: 2,
      routeName: 'Register'
    },
    {
      name: 'fastEnter.pricing',
      enabled: true,
      order: 3,
      routeName: 'Pricing'
    },
    {
      name: 'fastEnter.profile',
      enabled: true,
      order: 4,
      routeName: 'Profile'
    },
    {
      name: 'fastEnter.comments',
      enabled: true,
      order: 5,
      routeName: 'ArticleComment'
    }
  ]
}

export default Object.freeze(fastEnterConfig)
