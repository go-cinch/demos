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
    label: 'System / 系统管理',
    items: [
      {
        title: 'Users / 用户管理',
        url: '/system/user',
        icon: 'teams',
        shortcut: ['s', 'u'],
        items: []
      },
      { title: 'Roles / 角色管理', url: '/system/role', icon: 'account', items: [] },
      { title: 'User Groups / 用户组管理', url: '/system/user-group', icon: 'teams', items: [] },
      { title: 'Actions / 权限管理', url: '/system/action', icon: 'code', items: [] },
      { title: 'Data Dictionary / 数据字典', url: '/system/dictionary', icon: 'forms', items: [] },
      { title: 'Whitelist / 白名单管理', url: '/system/whitelist', icon: 'circleCheck', items: [] },
      {
        title: 'Profile / 个人中心',
        url: '/profile',
        icon: 'profile',
        shortcut: ['p', 'p'],
        items: []
      }
    ]
  }
];
