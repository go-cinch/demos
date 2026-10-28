import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import { reactive } from 'vue'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scenarioKey = '__artInboxPermissionScenario'
const state: any = { user: {}, api: {}, confirm: undefined }
;(globalThis as any)[scenarioKey] = state
const stub = (code: string) => `const state = globalThis.${scenarioKey}; ${code}`
const mocks = new Map([
  [`${root}/src/store/modules/user.ts`, stub('export const useUserStore = () => state.user')],
  [
    `${root}/src/api/msg.ts`,
    stub(`export const msgChanged = () => {};
    export const msgApi = Object.fromEntries(['list','count','get','read','readAll','remove'].map(
      key => [key, (...args) => state.api[key](...args)]
    ))`)
  ],
  [`${root}/src/utils/message-attention.ts`, 'export const visitMessages = () => {}'],
  [`${root}/src/locales/index.ts`, 'export const $t = key => key']
])
const folder = await mkdtemp(resolve(tmpdir(), 'art-inbox-permissions-'))
const built = await build({
  root,
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@': `${root}/src` } },
  plugins: [
    {
      name: 'inbox-browser-services',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/views/msg/use-inbox-feed.ts'))
          return code.replace("from 'vue'", "from 'virtual:inbox-vue'")
      },
      resolveId(id) {
        if (id === 'virtual:inbox-vue' || id === 'element-plus') return '\0' + id
      },
      load(id) {
        if (id === '\0virtual:inbox-vue')
          return `export {computed,nextTick,ref,watch} from 'vue'; export const onMounted = () => {}; export const onBeforeUnmount = () => {}`
        if (id === '\0element-plus')
          return stub('export const ElMessageBox = {confirm:(...args)=>state.confirm(...args)}')
        return mocks.get(id)
      }
    }
  ],
  build: {
    write: false,
    minify: false,
    lib: { entry: `${root}/src/views/msg/use-inbox-feed.ts`, formats: ['es'] },
    rollupOptions: { external: ['vue'] }
  }
})
const output = (Array.isArray(built) ? built[0] : built).output
const chunk = output.find((item) => item.type === 'chunk')
if (!chunk || chunk.type !== 'chunk') throw new Error('Missing inbox module')
await writeFile(`${folder}/inbox.mjs`, chunk.code)
await symlink(resolve(root, 'node_modules'), `${folder}/node_modules`)
const { useInboxFeed } = await import(pathToFileURL(`${folder}/inbox.mjs`).href)
const prefix = 'admin:btn:msg:inbox:'
function grant(keys: string[], path = '/msg/inbox') {
  state.user.info.permission.menus = [{ menu_path: path, btns: keys.map((key) => prefix + key) }]
}
function setup(keys: string[]) {
  const calls: { operation: string; id?: number }[] = []
  state.user = reactive({
    info: { scope: 'admin', userId: 1, permission: { menus: [], permission_scope: '*' } },
    language: 'en'
  })
  grant(keys)
  state.confirm = async () => {
    calls.push({ operation: 'confirm' })
  }
  const message = {
    id: 1,
    title: 'Unread',
    type: 'notice',
    published_at: 1,
    summary: 'Preview',
    content: 'Full body',
    read_at: null
  }
  state.api = {
    list: async () => ({ t: 1, items: [{ ...message }] }),
    count: async () => ({ count: 1, latest_unread_at: 1 }),
    get: async () => ({ ...message }),
    read: async (id: number) => {
      calls.push({ operation: 'read', id })
    },
    readAll: async () => {
      calls.push({ operation: 'read-all' })
    },
    remove: async (id: number) => {
      calls.push({ operation: 'delete', id })
    }
  }
  const feed = useInboxFeed()
  feed.rows.value = [{ ...message }]
  return { feed, calls, message }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('query/refresh/detail grants expose no write capability and expansion preserves Unread', async () => {
  const { feed, calls, message } = setup(['query', 'refresh', 'view-detail'])
  feed.confirmAction(false, [1])
  feed.confirmAction(false, [1], true)
  feed.confirmAction(true, [1], true)
  await feed.mark(message)
  await feed.readAll()
  await feed.toggle(message)
  await flush()
  assert.deepEqual(calls, [])
  assert.equal(feed.canSelect.value, false)
  feed.check(1, true)
  assert.deepEqual(feed.selected.value, [])
  assert.equal(feed.rows.value[0].read_at, null)
  assert.equal(feed.rows.value[0].content, 'Full body')
  assert.deepEqual(feed.expanded.value, [1])
})
for (const scope of ['wildcard-only', 'different-page', 'different-client']) {
  test(`${scope} does not authorize canonical inbox deletion`, async () => {
    const { feed, calls } = setup([])
    if (scope === 'different-page') grant(['delete', 'delete-selected'], '/system/msg')
    if (scope === 'different-client') {
      grant(['delete', 'delete-selected'])
      state.user.info.scope = 'h5'
    }
    assert.equal(feed.canSelect.value, false)
    assert.equal(feed.canControl('delete'), false)
    feed.confirmAction(false, [1])
    feed.confirmAction(false, [1], true)
    await flush()
    assert.deepEqual(calls, [])
  })
}
for (const bulk of [false, true]) {
  test(`${bulk ? 'bulk' : 'single'} deletion requires its own independent key`, async () => {
    const { feed, calls } = setup([bulk ? 'delete-selected' : 'delete'])
    feed.confirmAction(false, [1], !bulk)
    await flush()
    assert.deepEqual(calls, [])
    feed.confirmAction(false, [1], bulk)
    await flush()
    assert.deepEqual(calls, [{ operation: 'confirm' }, { operation: 'delete', id: 1 }])
  })
}
test('mark-selected-read grants selection and marking without granting deletion', async () => {
  const { feed, calls } = setup(['mark-selected-read'])
  assert.equal(feed.canSelect.value, true)
  feed.confirmAction(false, [1], true)
  await flush()
  assert.deepEqual(calls, [])
  feed.confirmAction(true, [1], true)
  await flush()
  assert.deepEqual(calls, [{ operation: 'confirm' }, { operation: 'read', id: 1 }])
})
for (const bulk of [false, true]) {
  test(`revoking ${bulk ? 'bulk' : 'single'} delete while confirmation is open prevents every DELETE`, async () => {
    const { feed, calls } = setup([bulk ? 'delete-selected' : 'delete'])
    let confirm!: () => void
    state.confirm = () =>
      new Promise<void>((resolve) => {
        confirm = resolve
      })
    feed.confirmAction(false, [1], bulk)
    grant([])
    confirm()
    await flush()
    assert.deepEqual(calls, [])
  })
}
test('revocation between bulk items prevents later DELETE requests', async () => {
  const { feed, calls } = setup(['delete-selected'])
  state.api.remove = async (id: number) => {
    calls.push({ operation: 'delete', id })
    grant([])
  }
  feed.confirmAction(false, [1, 2], true)
  await flush()
  assert.deepEqual(calls, [{ operation: 'confirm' }, { operation: 'delete', id: 1 }])
})
test('losing the last bulk grant clears selection state', async () => {
  const { feed } = setup(['delete-selected'])
  feed.selecting.value = true
  feed.check(1, true)
  assert.deepEqual(feed.selected.value, [1])
  grant(['query', 'view-detail'])
  await flush()
  assert.equal(feed.canSelect.value, false)
  assert.equal(feed.selecting.value, false)
  assert.deepEqual(feed.selected.value, [])
})
test.after(async () => {
  await rm(folder, { recursive: true, force: true })
  delete (globalThis as any)[scenarioKey]
})
