import type { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [
      {
        title: 'Overview / 概览',
        url: '/dashboard/overview',
        icon: 'dashboard',
        shortcut: ['d', 'o'],
        items: []
      },
      {
        title: 'Workspace / 工作台',
        url: '/dashboard/workspace',
        icon: 'workspace',
        shortcut: ['d', 'w'],
        items: []
      }
    ]
  },
  {
    label: 'System / 系统',
    items: [
      {
        title: 'Users / 用户',
        url: '/system/user',
        icon: 'teams',
        shortcut: ['s', 'u'],
        items: []
      },
      {
        title: 'Roles / 角色',
        url: '/system/role',
        icon: 'account',
        items: []
      },
      {
        title: 'User Groups / 用户组',
        url: '/system/user-group',
        icon: 'teams',
        items: []
      },
      {
        title: 'Actions / 权限',
        url: '/system/action',
        icon: 'code',
        items: []
      },
      {
        title: 'Dictionary / 数据字典',
        url: '/system/dictionary',
        icon: 'forms',
        items: []
      },
      {
        title: 'Developer workspace / 开发者工作台',
        url: '/system/developer',
        icon: 'code',
        items: []
      },
      {
        title: 'Messages / 消息',
        url: '/system/msg',
        icon: 'notification',
        items: []
      },

      {
        title: 'Profile / 个人中心',
        url: '/profile',
        icon: 'profile',
        shortcut: ['p', 'p'],
        items: []
      }
    ]
  },
  {
    label: 'Audit / 审计',
    items: [
      { title: 'Login logs / 登录日志', url: '/audit/login', icon: 'search', items: [] },
      { title: 'Operation logs / 操作日志', url: '/audit/operation', icon: 'search', items: [] }
    ]
  }
];
