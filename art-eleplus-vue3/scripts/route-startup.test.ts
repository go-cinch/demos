import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import {
  createMemoryHistory,
  createWebHashHistory,
  createRouter,
  type RouterHistory
} from 'vue-router'

// Keep the real guard → MenuProcessor → RouteRegistry → validator/transformer
// chain. Only browser services, API responses, stores and view loading are stubbed.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const state: any = { user: {}, menus: [], loaded: [], fetch: undefined }
const scenarioKey = '__artRouteStartupScenario'
;(globalThis as any)[scenarioKey] = state
const stub = (body: string) => `const state = globalThis.${scenarioKey}; ${body}`
const mocks: Record<string, string> = {
  'store/modules/user': stub('export const useUserStore = () => state.user'),
  'store/modules/setting': 'export const useSettingStore = () => ({showNprogress:false})',
  'store/modules/menu': stub(`export const useMenuStore = () => ({
    setMenuList: menus => state.menus = menus, addRemoveRouteFns: () => {},
    removeAllDynamicRoutes: () => {}
  })`),
  'store/modules/worktab': 'export const useWorktabStore = () => ({validateWorktabs:()=>{}})',
  'hooks/core/useAppMode': 'export const useAppMode = () => ({isFrontendMode:{value:true}})',
  'hooks/core/useCommon':
    'export const useCommon = () => ({homePath:{value:"/dashboard/overview"}})',
  'api/auth': stub('export const fetchGetUserInfo = () => state.fetch()'),
  'api/system-manage': 'export const fetchGetMenuList = () => {throw Error("wrong mode")}',
  utils: 'export const formatMenuTitle = value => value',
  'utils/navigation': 'export const setWorktab = () => {}',
  'utils/router': 'export const setPageTitle = () => {}',
  'utils/ui': 'export const loadingService = {showLoading:()=>{},hideLoading:()=>{}}',
  'utils/http/status': 'export const ApiStatus = {unauthorized:401}',
  'utils/http/error': 'export const isHttpError = error => Boolean(error?.code)',
  'router/routes/staticRoutes': `export const staticRoutes = [
    {path:'/auth/login',name:'Login'}, {path:'/:pathMatch(.*)*',name:'Exception404'}
  ]`,
  'router/core/ComponentLoader': stub(`export class ComponentLoader {
    load(path) { return async () => {state.loaded.push(path);await state.load?.(path);return {render:()=>null}} }
    loadLayout() {return this.load('/index/index')}
    loadIframe() {return this.load('/outside/Iframe')}
  }`)
}
const mockedPaths = new Map(
  Object.entries(mocks).flatMap(([path, code]) =>
    [`${root}/src/${path}.ts`, `${root}/src/${path}/index.ts`].map((file) => [file, code])
  )
)
const folder = await mkdtemp(resolve(tmpdir(), 'art-route-startup-'))
const built = await build({
  root,
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@': `${root}/src` } },
  plugins: [{ name: 'route-browser-dependencies', load: (id) => mockedPaths.get(id) }],
  build: {
    write: false,
    minify: false,
    lib: { entry: `${root}/src/router/guards/beforeEach.ts`, formats: ['es'] },
    rollupOptions: { external: ['vue', 'vue-router', 'nprogress'] }
  }
})
const output = (Array.isArray(built) ? built[0] : built).output
const code = output.find((item) => item.type === 'chunk')
if (!code || code.type !== 'chunk') throw new Error('Missing guard module')
await writeFile(`${folder}/guard.mjs`, code.code)
await symlink(resolve(root, 'node_modules'), `${folder}/node_modules`)
const guard = await import(pathToFileURL(`${folder}/guard.mjs`).href)

const userMenu = {
  menu_key: 'admin:menu:system:user',
  menu_path: '/system/user',
  btns: ['admin:btn:system:user:query', 'admin:btn:system:user:view-detail']
}
function info(menus = [userMenu]) {
  return {
    scope: 'admin',
    roles: [...menus.map((menu) => menu.menu_path), '/dashboard/overview'],
    permission: {
      menus,
      navigation: [
        {
          resource_key: 'admin:system',
          children: menus.map((menu) => ({
            resource_key: menu.menu_key.replace(':menu:', ':'),
            menu_key: menu.menu_key,
            menu_path: menu.menu_path
          }))
        }
      ]
    }
  }
}
function setup(history: RouterHistory = createMemoryHistory()) {
  guard.resetRouteInitState()
  state.loaded = []
  state.menus = []
  state.load = undefined
  state.user = {
    isLogin: true,
    passwordResetRequired: false,
    info: {},
    setUserInfo: (value: any) => {
      state.user.info = value
    },
    checkAndClearWorktabs: () => {},
    logOut: () => {
      state.user.isLogin = false
    }
  }
  const router = createRouter({
    history,
    routes: [
      { path: '/auth/login', name: 'Login', component: {} },
      { path: '/:pathMatch(.*)*', name: 'Exception404', component: {} },
      { path: '/500', name: 'Exception500', component: {} }
    ]
  })
  guard.setupBeforeEachGuard(router)
  return router
}
function deferredInfo() {
  let finish!: (value: unknown) => void
  let fail!: (error: unknown) => void
  let started!: () => void
  const waiting = new Promise<void>((resolve) => {
    started = resolve
  })
  state.fetch = () => {
    started()
    return new Promise((resolve, reject) => {
      finish = resolve
      fail = reject
    })
  }
  return {
    waiting,
    finish: (value = info()) => finish(value),
    fail: (error: unknown) => fail(error)
  }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('actual route startup preserves authorized direct URLs and keeps other pages absent', async () => {
  const router = setup()
  state.fetch = async () => info()
  await router.push('/system/user?username=alice#record')
  assert.equal(router.currentRoute.value.fullPath, '/system/user?username=alice#record')
  assert.ok(state.loaded.includes('/system/user'))
  assert.equal(router.hasRoute('SystemRole'), false)
})
for (const phase of ['response', 'pending'] as const) {
  test(`latest target survives ${phase} initialization, including its query and hash`, async () => {
    const router = setup(),
      response = deferredInfo()
    const initial = router.push('/dashboard/overview')
    await response.waiting
    const target = router.push('/system/user?username=alice#record')
    if (phase === 'pending') await settle()
    else await Promise.resolve()
    response.finish()
    await Promise.all([initial, target])
    assert.equal(router.currentRoute.value.fullPath, '/system/user?username=alice#record')
    assert.ok(state.loaded.includes('/system/user'))
  })
}
test('a newer unauthorized target is denied without loading its page or an older target', async () => {
  const router = setup(),
    response = deferredInfo()
  const initial = router.push('/system/user')
  await response.waiting
  const target = router.push('/system/role?name=forbidden#detail')
  await settle()
  response.finish()
  await Promise.all([initial, target])
  assert.equal(router.currentRoute.value.name, 'Exception404')
  assert.equal(router.hasRoute('SystemRole'), false)
  assert.equal(state.loaded.includes('/system/role'), false)
  assert.equal(state.loaded.includes('/system/user'), false)
})
test('the newest of several pending targets wins', async () => {
  const router = setup(),
    response = deferredInfo()
  const initial = router.push('/dashboard/overview')
  await response.waiting
  const denied = router.push('/system/role')
  await settle()
  const target = router.push('/system/user?username=latest#details')
  await settle()
  response.finish()
  await Promise.all([initial, denied, target])
  assert.equal(router.currentRoute.value.fullPath, '/system/user?username=latest#details')
})
test('logout invalidates the old response and pending target before route registration', async () => {
  const router = setup(),
    response = deferredInfo()
  const initial = router.push('/dashboard/overview')
  await response.waiting
  const target = router.push('/system/user')
  await settle()
  state.user.isLogin = false
  guard.resetRouterState(20)
  await router.push('/auth/login')
  response.finish()
  await Promise.all([initial, target])
  assert.equal(router.currentRoute.value.path, '/auth/login')
  assert.deepEqual(state.user.info, {})
  assert.equal(router.hasRoute('SystemUser'), false)
  await new Promise((resolve) => setTimeout(resolve, 25))
})
test('an expired Auth response cannot register routes and a later session retries cleanly', async () => {
  const router = setup(),
    response = deferredInfo()
  const initial = router.push('/dashboard/overview')
  await response.waiting
  const target = router.push('/system/user')
  await settle()
  state.user.isLogin = false
  guard.resetRouteInitState()
  await router.push('/auth/login')
  response.fail({ code: 401, message: 'expired' })
  await Promise.all([initial, target])
  assert.equal(router.currentRoute.value.path, '/auth/login')
  assert.equal(router.hasRoute('SystemUser'), false)
  state.user.isLogin = true
  state.fetch = async () => info()
  await router.push('/system/user')
  assert.equal(router.currentRoute.value.path, '/system/user')
})
test('an earlier session cannot overwrite grants or the URL of a newer session', async () => {
  const router = setup(),
    response = deferredInfo()
  const initial = router.push('/system/user')
  await response.waiting
  guard.resetRouteInitState()
  const roleMenu = { ...userMenu, menu_key: 'admin:menu:system:role', menu_path: '/system/role' }
  state.fetch = async () => info([roleMenu])
  await router.push('/system/role?word=member#row')
  response.finish()
  await initial
  assert.equal(router.currentRoute.value.fullPath, '/system/role?word=member#row')
  assert.equal(router.hasRoute('SystemUser'), false)
  assert.equal(state.user.info.permission.menus[0].menu_path, '/system/role')
})

/** A minimal native window surface for the real web hash history implementation.
 * Vue Router's routerHistory.listen subscription is installed only after initial
 * navigation; native popstate before readiness updates history but runs no guard.
 */
function nativeHashWindow(path: string) {
  const previous = new Map(
    ['window', 'document', 'history', 'location'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)
    ])
  )
  let url = new URL(`http://art.test/#${path}`)
  const listeners = new Map<string, Set<(event: any) => void>>()
  const history = {
    state: null as any,
    length: 1,
    replaceState(value: unknown, _unused: string, path: string) {
      this.state = value
      url = new URL(path, url)
    },
    pushState(value: unknown, unused: string, path: string) {
      this.length++
      this.replaceState(value, unused, path)
    },
    go() {}
  }
  const location = new Proxy({}, { get: (_target, key) => (url as any)[key] })
  const window = {
    history,
    location,
    scrollX: 0,
    scrollY: 0,
    addEventListener(type: string, callback: (event: any) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(callback)
    },
    removeEventListener(type: string, callback: (event: any) => void) {
      listeners.get(type)?.delete(callback)
    }
  }
  for (const [key, value] of Object.entries({
    window,
    history,
    location,
    document: { querySelector: () => null }
  })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  return {
    changeHash(path: string) {
      url = new URL(`/#${path}`, url)
      history.state = null
      history.length++
      for (const callback of listeners.get('popstate') ?? []) callback({ state: null })
    },
    get url() {
      return url.href
    },
    restore() {
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else delete (globalThis as any)[key]
      }
    }
  }
}
for (const phase of ['pending', 'response'] as const) {
  test(`same-document native hash change after reload/${phase} survives first navigation`, async () => {
    const native = nativeHashWindow('/dashboard/overview')
    const history = createWebHashHistory()
    try {
      const router = setup(history),
        response = deferredInfo()
      const initial = router.push(history.location)
      await response.waiting
      if (phase === 'response') response.finish()
      native.changeHash('/system/user?username=native#row')
      assert.equal(history.location, '/system/user?username=native#row')
      assert.deepEqual(state.loaded, [])
      if (phase === 'pending') response.finish()
      await initial
      assert.equal(router.currentRoute.value.fullPath, '/system/user?username=native#row')
      assert.equal(native.url, 'http://art.test/#/system/user?username=native#row')
      assert.ok(state.loaded.includes('/system/user'))
    } finally {
      history.destroy()
      native.restore()
    }
  })
}
test('cold native hash startup still opens the authorized target', async () => {
  const native = nativeHashWindow('/system/user?username=cold#row')
  const history = createWebHashHistory()
  try {
    const router = setup(history)
    state.fetch = async () => info()
    await router.push(history.location)
    assert.equal(router.currentRoute.value.fullPath, '/system/user?username=cold#row')
    assert.ok(state.loaded.includes('/system/user'))
  } finally {
    history.destroy()
    native.restore()
  }
})
test('an early native hash change to an ungranted page remains the native 404', async () => {
  const native = nativeHashWindow('/dashboard/overview')
  const history = createWebHashHistory()
  try {
    const router = setup(history),
      response = deferredInfo()
    const initial = router.push(history.location)
    await response.waiting
    native.changeHash('/system/role?word=forbidden#row')
    response.finish()
    await initial
    assert.equal(router.currentRoute.value.name, 'Exception404')
    assert.equal(router.hasRoute('SystemRole'), false)
    assert.equal(state.loaded.includes('/system/role'), false)
  } finally {
    history.destroy()
    native.restore()
  }
})

function deferredFirstView() {
  let release!: () => void
  let started!: () => void
  const waiting = new Promise<void>((resolve) => {
    started = resolve
  })
  const component = new Promise<void>((resolve) => {
    release = resolve
  })
  state.load = (path: string) => {
    if (path === '/dashboard/analysis') {
      started()
      return component
    }
  }
  return { waiting, release: () => release() }
}
function routeArrives(router: ReturnType<typeof createRouter>, path: string) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      remove()
      reject(new Error(`Expected ${path}, received ${router.currentRoute.value.fullPath}`))
    }, 500)
    const remove = router.afterEach((to, _from, failure) => {
      if (!failure && to.fullPath === path) {
        clearTimeout(timer)
        remove()
        resolve()
      }
    })
  })
}
for (const target of ['/system/user?username=late#row', '/system/role?word=forbidden#row']) {
  test(`native target during the first async page load survives until ready: ${target}`, async () => {
    const native = nativeHashWindow('/dashboard/overview')
    const history = createWebHashHistory()
    try {
      const router = setup(history),
        component = deferredFirstView()
      state.fetch = async () => info()
      const initial = router.push(history.location)
      await component.waiting
      assert.equal(router.currentRoute.value.path, '/')
      const arrived = routeArrives(router, target)
      native.changeHash(target)
      component.release()
      await initial
      await arrived
      assert.equal(native.url, `http://art.test/#${target}`)
      if (target.startsWith('/system/role')) {
        assert.equal(router.currentRoute.value.name, 'Exception404')
        assert.equal(state.loaded.includes('/system/role'), false)
      } else assert.ok(state.loaded.includes('/system/user'))
    } finally {
      history.destroy()
      native.restore()
    }
  })
}
test('the latest of several native targets wins while the first async page is loading', async () => {
  const native = nativeHashWindow('/dashboard/overview'),
    history = createWebHashHistory()
  try {
    const router = setup(history),
      component = deferredFirstView()
    state.fetch = async () => info()
    const initial = router.push(history.location)
    await component.waiting
    const arrived = routeArrives(router, '/system/user?username=latest#row')
    native.changeHash('/system/user?username=older#row')
    native.changeHash('/system/role')
    native.changeHash('/system/user?username=latest#row')
    component.release()
    await initial
    await arrived
    assert.equal(state.loaded.includes('/system/role'), false)
  } finally {
    history.destroy()
    native.restore()
  }
})
test('a programmatic navigation after a native target supersedes it during startup', async () => {
  const native = nativeHashWindow('/dashboard/overview'),
    history = createWebHashHistory()
  try {
    const router = setup(history),
      component = deferredFirstView()
    const roleMenu = { ...userMenu, menu_key: 'admin:menu:system:role', menu_path: '/system/role' }
    state.fetch = async () => info([userMenu, roleMenu])
    const initial = router.push(history.location)
    await component.waiting
    native.changeHash('/system/user?username=older#row')
    await router.push('/system/role?word=programmatic#row')
    component.release()
    await initial
    await settle()
    assert.equal(router.currentRoute.value.fullPath, '/system/role?word=programmatic#row')
    assert.equal(state.loaded.includes('/system/user'), false)
  } finally {
    history.destroy()
    native.restore()
  }
})
test('a newer programmatic directory redirect supersedes an older native target', async () => {
  const native = nativeHashWindow('/dashboard/overview'),
    history = createWebHashHistory()
  try {
    const router = setup(history),
      component = deferredFirstView()
    state.fetch = async () => info()
    const initial = router.push(history.location)
    await component.waiting
    native.changeHash('/system/role?word=older#row')
    await router.push('/system?username=programmatic#row')
    component.release()
    await initial
    await settle()
    assert.equal(router.currentRoute.value.fullPath, '/system/user?username=programmatic#row')
    assert.equal(state.loaded.includes('/system/role'), false)
  } finally {
    history.destroy()
    native.restore()
  }
})
test('logout during the first async page load discards the saved native target', async () => {
  const native = nativeHashWindow('/dashboard/overview'),
    history = createWebHashHistory()
  try {
    const router = setup(history),
      component = deferredFirstView()
    state.fetch = async () => info()
    const initial = router.push(history.location)
    await component.waiting
    native.changeHash('/system/user?username=expired#row')
    state.user.isLogin = false
    guard.resetRouterState(0)
    await router.push('/auth/login')
    component.release()
    await initial
    await settle()
    assert.equal(router.currentRoute.value.path, '/auth/login')
    assert.equal(state.loaded.includes('/system/user'), false)
  } finally {
    history.destroy()
    native.restore()
  }
})
test('a saved native directory target follows the normal configured redirect', async () => {
  const native = nativeHashWindow('/dashboard/overview'),
    history = createWebHashHistory()
  try {
    const router = setup(history),
      component = deferredFirstView()
    state.fetch = async () => info()
    const initial = router.push(history.location)
    await component.waiting
    const arrived = routeArrives(router, '/system/user?username=directory#row')
    native.changeHash('/system?username=directory#row')
    component.release()
    await initial
    await arrived
    assert.equal(router.currentRoute.value.redirectedFrom?.path, '/system')
  } finally {
    history.destroy()
    native.restore()
  }
})

test.after(async () => {
  await rm(folder, { recursive: true, force: true })
  delete (globalThis as any)[scenarioKey]
})
