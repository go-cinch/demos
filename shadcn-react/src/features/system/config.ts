import type { ResourceConfig, ResourceKind } from './types';

export const resourceConfigs: Record<ResourceKind, ResourceConfig> = {
  action: {
    title: 'Action Management / 权限管理',
    permission: 'system.action',
    columns: [
      ['id', 'ID'],
      ['name', 'Name / 名称'],
      ['group', 'Group / 分组'],
      ['word', 'Word / 标识'],
      ['code', 'Code / 编码'],
      ['resource', 'Resource Rules / 资源规则'],
      ['menu', 'Menu Paths / 菜单路径'],
      ['button', 'Button Permission / 按钮权限'],
      ['created_at', 'Created At / 创建时间'],
      ['updated_at', 'Updated At / 更新时间']
    ].map(([key, label]) => ({ key, label })),
    fields: [
      { key: 'name', label: 'Name / 名称', type: 'text', required: true },
      { key: 'group', label: 'Group / 分组', type: 'action-group', required: true },
      { key: 'word', label: 'Word / 标识', type: 'text', required: true },
      {
        key: 'resource',
        label: 'Resource Rules / 资源规则',
        type: 'textarea',
        placeholder: 'GET|/resource|/package.Service/Method'
      },
      {
        key: 'menu',
        label: 'Menu Paths / 菜单路径',
        type: 'textarea',
        placeholder: '/system/user'
      },
      {
        key: 'button',
        label: 'Button Permission / 按钮权限',
        type: 'textarea',
        placeholder: 'system.user.read'
      }
    ],
    filters: [
      { key: 'name', label: 'Name / 名称', type: 'text' },
      { key: 'group', label: 'Group / 分组', type: 'multi-text' },
      { key: 'word', label: 'Word / 标识', type: 'multi-text' },
      { key: 'code', label: 'Code / 编码', type: 'multi-text' },
      { key: 'resource', label: 'Resource / 资源', type: 'multi-text' },
      { key: 'menu', label: 'Menu Path / 菜单路径', type: 'multi-text' },
      { key: 'button', label: 'Button Permission / 按钮权限', type: 'multi-text' }
    ]
  },
  role: {
    title: 'Role Management / 角色管理',
    permission: 'system.role',
    columns: [
      ['id', 'ID'],
      ['name', 'Name / 名称'],
      ['word', 'Word / 标识'],
      ['action_codes', 'Permissions / 权限'],
      ['created_at', 'Created At / 创建时间'],
      ['updated_at', 'Updated At / 更新时间']
    ].map(([key, label]) => ({ key, label })),
    fields: [
      { key: 'name', label: 'Name / 名称', type: 'text', required: true },
      { key: 'word', label: 'Word / 标识', type: 'text', required: true },
      { key: 'action_codes', label: 'Permissions / 权限', type: 'action-select' }
    ],
    filters: [
      { key: 'name', label: 'Name / 名称', type: 'text' },
      { key: 'word', label: 'Word / 标识', type: 'multi-text' },
      { key: 'action_code', label: 'Action Code / 权限编码', type: 'multi-text' }
    ]
  },
  user: {
    title: 'User Management / 用户管理',
    permission: 'system.user',
    columns: [
      ['id', 'ID'],
      ['username', 'Username / 用户名'],
      ['code', 'User Code / 用户编码'],
      ['role', 'Role / 角色'],
      ['status', 'Status / 状态'],
      ['metadata', 'Metadata / 元数据'],
      ['action_codes', 'Permissions / 权限'],
      ['created_at', 'Created At / 创建时间'],
      ['updated_at', 'Updated At / 更新时间']
    ].map(([key, label]) => ({ key, label })),
    fields: [
      { key: 'username', label: 'Username / 用户名', type: 'text', required: true },
      { key: 'password', label: 'Password / 密码', type: 'password', createOnly: false },
      { key: 'role_id', label: 'Role / 角色', type: 'role-select' },
      { key: 'action_codes', label: 'Permissions / 权限', type: 'action-select' }
    ],
    filters: [
      { key: 'username', label: 'Username / 用户名', type: 'text' },
      { key: 'code', label: 'User Code / 用户编码', type: 'multi-text' },
      { key: 'status', label: 'Status / 状态', type: 'multi-status' }
    ]
  },
  'user-group': {
    title: 'User Group Management / 用户组管理',
    permission: 'system.user.group',
    columns: [
      ['id', 'ID'],
      ['name', 'Name / 名称'],
      ['word', 'Word / 标识'],
      ['users', 'Members / 成员'],
      ['action_codes', 'Permissions / 权限'],
      ['created_at', 'Created At / 创建时间'],
      ['updated_at', 'Updated At / 更新时间']
    ].map(([key, label]) => ({ key, label })),
    fields: [
      { key: 'name', label: 'Name / 名称', type: 'text', required: true },
      { key: 'word', label: 'Word / 标识', type: 'text', required: true },
      { key: 'user_ids', label: 'Members / 成员', type: 'user-select' },
      { key: 'action_codes', label: 'Permissions / 权限', type: 'action-select' }
    ],
    filters: [
      { key: 'name', label: 'Name / 名称', type: 'text' },
      { key: 'word', label: 'Word / 标识', type: 'multi-text' },
      { key: 'action_code', label: 'Action Code / 权限编码', type: 'multi-text' }
    ]
  },
  dictionary: {
    title: 'Data Dictionary Management / 数据字典管理',
    permission: 'system.dictionary',
    columns: [
      ['id', 'ID'],
      ['key', 'Dictionary Key / 字典键'],
      ['name', 'Name / 名称'],
      ['value', 'Value (JSON) / 字典值（JSON）'],
      ['description', 'Description / 说明'],
      ['enabled', 'Enabled / 启用'],
      ['created_at', 'Created At / 创建时间'],
      ['updated_at', 'Updated At / 更新时间']
    ].map(([key, label]) => ({ key, label })),
    fields: [
      { key: 'key', label: 'Dictionary Key / 字典键', type: 'text', required: true },
      { key: 'name', label: 'Name / 名称', type: 'text', required: true },
      {
        key: 'value',
        label: 'Value (JSON) / 字典值（JSON）',
        type: 'json',
        required: true,
        defaultValue: []
      },
      { key: 'description', label: 'Description / 说明', type: 'textarea' },
      { key: 'enabled', label: 'Enabled / 启用', type: 'boolean', defaultValue: true }
    ],
    filters: [
      { key: 'key', label: 'Dictionary Key / 字典键', type: 'text' },
      { key: 'name', label: 'Name / 名称', type: 'text' },
      { key: 'enabled', label: 'Enabled / 启用', type: 'boolean' }
    ]
  },
  whitelist: {
    title: 'Whitelist Management / 白名单管理',
    permission: 'system.whitelist',
    columns: [
      ['id', 'ID'],
      ['category', 'Category / 类别'],
      ['resource', 'Resource Rules / 资源规则'],
      ['created_at', 'Created At / 创建时间'],
      ['updated_at', 'Updated At / 更新时间']
    ].map(([key, label]) => ({ key, label })),
    fields: [
      {
        key: 'category',
        label: 'Category / 类别',
        type: 'category',
        required: true,
        defaultValue: 0
      },
      { key: 'resource', label: 'Resource Rules / 资源规则', type: 'textarea', required: true }
    ],
    filters: [
      { key: 'category', label: 'Category / 类别', type: 'category' },
      { key: 'resource', label: 'Resource / 资源', type: 'multi-text' }
    ]
  }
};

export function isResourceKind(value: string): value is ResourceKind {
  return value in resourceConfigs;
}
