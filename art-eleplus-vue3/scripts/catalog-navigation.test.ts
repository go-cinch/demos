import assert from 'node:assert/strict'
import test from 'node:test'
import { createMemoryHistory, createRouter } from 'vue-router'
import { buildCatalogNavigation, relativeRouteTree } from '../src/router/core/catalog-navigation'
import { RouteValidator } from '../src/router/core/RouteValidator'
import { RouteTransformer } from '../src/router/core/RouteTransformer'

const page = (path: string, name: string): any => ({
  path,
  name,
  component: path,
  meta: { title: name }
})
const routes: any[] = [
  {
    path: '/system',
    name: 'System',
    component: '/index/index',
    meta: { title: 'System' },
    children: [
      page('user', 'SystemUser'),
      page('role', 'SystemRole'),
      page('action', 'SystemAction')
    ]
  },
  {
    path: '/audit',
    name: 'Audit',
    component: '/index/index',
    meta: { title: 'Audit' },
    children: [page('login', 'AuditLogin')]
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: '/index/index',
    meta: { title: 'Dashboard' },
    children: [page('overview', 'Overview'), page('workspace', 'Workspace')]
  },
  page('/profile', 'Profile'),
  page('/msg/inbox', 'Inbox')
]
const leaf = (key: string, path: string): any => ({
  resource_key: key,
  menu_key: key.replace(':', ':menu:'),
  menu_path: path
})
const directory = (key: string, children: any[]): any => ({ resource_key: key, children })
function build(navigation: any[], allowed: any[]) {
  return buildCatalogNavigation(routes, {
    words: [],
    navigation,
    menus: allowed.map((item) => ({ menu_key: item.menu_key, menu_path: item.menu_path, btns: [] }))
  })
}
function registered(tree: any[]) {
  const validation = new RouteValidator().validate(tree)
  assert.deepEqual(validation.errors, [])
  assert.deepEqual(validation.warnings, [])
  const transformer = new RouteTransformer({
    load: () => ({}),
    loadLayout: () => ({}),
    loadIframe: () => ({})
  } as any)
  const router = createRouter({ history: createMemoryHistory(), routes: [] })
  for (const route of tree) router.addRoute(transformer.transform(route) as any)
  const relative = (items: any[], depth = 0) =>
    items.forEach((route) => {
      if (depth) assert.equal(route.path.startsWith('/'), false)
      if (depth && route.children?.length) assert.equal(route.component, undefined)
      if (route.children) relative(route.children, depth + 1)
    })
  relative(tree)
  return router
}
const user = leaf('admin:system:user', '/system/user')
const role = leaf('admin:system:role', '/system/role')
const action = leaf('admin:system:action', '/system/action')
const login = leaf('admin:audit:login', '/audit/login')

test('a User-only account registers its actual page and universal dashboard without extra pages', () => {
  const tree = build([directory('admin:system', [user])], [user])
  assert.equal(tree[0].path, '/system')
  assert.equal(tree[0].children![0].path, 'user')
  const router = registered(tree)
  assert.equal(router.resolve('/system/user').name, 'SystemUser')
  assert.equal(router.resolve('/dashboard/overview').name, 'Overview')
  assert.equal(router.hasRoute('SystemRole'), false)
})

test('multiple children retain server order and one registration for every public page', () => {
  const tree = build([directory('admin:system', [role, user, action])], [role, user, action])
  assert.deepEqual(
    tree[0].children!.map((child) => child.name),
    ['SystemRole', 'SystemUser', 'SystemAction']
  )
  const router = registered(tree)
  for (const [path, name] of [
    ['/system/user', 'SystemUser'],
    ['/system/role', 'SystemRole'],
    ['/system/action', 'SystemAction']
  ]) {
    assert.equal(router.resolve(path).name, name)
    assert.equal(router.getRoutes().filter((route) => route.name === name).length, 1)
  }
})

test('mixed custom directories use a real common prefix instead of synthetic public URLs', () => {
  const tree = build([directory('admin:custom', [user, login])], [user, login])
  assert.equal(tree[0].path, '/')
  assert.deepEqual(
    tree[0].children!.map((child) => child.path),
    ['system/user', 'audit/login']
  )
  assert.equal(tree[0].redirect, '/system/user')
  const router = registered(tree)
  assert.equal(router.resolve('/system/user').name, 'SystemUser')
  assert.equal(router.resolve('/audit/login').name, 'AuditLogin')
})

test('nested custom and pathless directories preserve hierarchy without nested app layouts', () => {
  const tree = build([directory('admin:outer', [directory('admin:inner', [user])])], [user])
  assert.equal(tree[0].children![0].path, '')
  assert.equal(tree[0].children![0].component, undefined)
  assert.equal(tree[0].children![0].redirect, '/system/user')
  assert.equal(registered(tree).resolve('/system/user').name, 'SystemUser')
  const mixed = build(
    [directory('admin:system', [role, directory('admin:custom', [login])])],
    [role, login]
  )
  assert.equal(registered(mixed).resolve('/audit/login').name, 'AuditLogin')
})

test('references deduplicate pages while hidden allowed pages survive and forbidden pages do not', () => {
  const inbox = leaf('admin:default:inbox', '/msg/inbox')
  const tree = build(
    [directory('admin:first', [user]), directory('admin:second', [user])],
    [user, inbox]
  )
  assert.equal(tree.filter((route) => String(route.name).startsWith('ResourceDirectory')).length, 1)
  assert.equal(tree.find((route) => route.name === 'Inbox')!.meta.isHide, true)
  const router = registered(tree)
  assert.equal(router.getRoutes().filter((route) => route.name === 'SystemUser').length, 1)
  assert.equal(router.resolve('/msg/inbox').name, 'Inbox')
  assert.equal(router.hasRoute('SystemRole'), false)
})

test('top-level direct entries never replace each other through an empty wrapper name', () => {
  const inbox = leaf('admin:default:inbox', '/msg/inbox')
  const profile = leaf('admin:default:profile', '/profile')
  const router = registered(build([], [inbox, profile]))
  for (const [path, name] of [
    ['/msg/inbox', 'Inbox'],
    ['/profile', 'Profile'],
    ['/dashboard/overview', 'Overview']
  ]) {
    assert.equal(router.resolve(path).name, name)
  }
})

test('native conversion rejects incompatible directories instead of blindly removing a slash', () => {
  assert.throws(
    () =>
      relativeRouteTree([
        {
          path: '/_resource/custom',
          meta: { title: 'Custom' },
          children: [page('/system/user', 'SystemUser')]
        }
      ]),
    /outside its directory/
  )
})

test('normalized absolute UI paths convert back to a native relative registration tree', () => {
  const tree = relativeRouteTree([
    {
      path: '/',
      name: 'CustomRoot',
      component: '/index/index',
      meta: { title: 'Root' },
      children: [
        {
          path: '/system',
          name: 'CustomSystem',
          meta: { title: 'System' },
          children: [page('/system/user', 'SystemUser')]
        }
      ]
    }
  ])
  assert.equal(tree[0].children![0].path, 'system')
  assert.equal(tree[0].children![0].children![0].path, 'user')
  assert.equal(registered(tree).resolve('/system/user').name, 'SystemUser')
})

test('separate references to the same directory cannot replace each others pages', () => {
  const tree = build(
    [directory('admin:system', [user]), directory('admin:system', [role])],
    [user, role]
  )
  const router = registered(tree)
  assert.equal(router.resolve('/system/user').name, 'SystemUser')
  assert.equal(router.resolve('/system/role').name, 'SystemRole')
  assert.notEqual(tree[0].name, tree[1].name)
})

test('missing navigation never falls back to every static page', () => {
  const tree = buildCatalogNavigation(routes, {
    words: [],
    menus: [{ menu_key: user.menu_key, menu_path: user.menu_path, btns: [] }]
  })
  const router = registered(tree)
  assert.equal(router.hasRoute('SystemUser'), true)
  assert.equal(router.hasRoute('SystemRole'), false)
  assert.equal(router.hasRoute('SystemAction'), false)
  assert.equal(router.hasRoute('Overview'), true)
})
