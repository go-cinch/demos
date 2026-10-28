import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createRenderer, defineComponent, h, ref, reactive } from 'vue'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const state = {
  locale: ref('en'),
  revision: ref(0),
  names: {
    en: { 'admin:system:user': 'User', 'admin:system:role': 'Role' },
    zh: { 'admin:system:user': '用户', 'admin:system:role': '角色' }
  } as Record<string, Record<string, string>>,
  summary: {
    total: 11,
    counts: {},
    trend: [],
    groups: [
      { name: 'admin:system:user', count: 8, id: 1 },
      { name: 'admin:system:role', count: 2, id: 2 },
      { name: 'admin:custom:unknown', count: 1, id: 3 },
      { name: '', count: 0, id: 4 }
    ]
  }
}
const scenarioKey = '__artOverviewLabelScenario'
;(globalThis as any)[scenarioKey] = state
const stub = (code: string) => `const state=globalThis.${scenarioKey}; ${code}`
const mocks = new Map([
  [
    `${root}/src/utils/admin/service.ts`,
    stub('export const getAdminSummary=async()=>state.summary')
  ],
  [
    `${root}/src/utils/admin/preferences.ts`,
    "import {ref}from'vue';export const useAdminTimezone=()=>ref('UTC')"
  ],
  [`${root}/src/utils/admin/statistics-warning.ts`, 'export const useStatisticsWarning=()=>false'],
  [
    `${root}/src/locales/catalog.ts`,
    stub(
      'export const catalogGroupWords=()=>{void state.revision.value;return Object.keys(state.names[state.locale.value])}'
    )
  ],
  [
    `${root}/src/locales/index.ts`,
    stub(`export const catalogLabel=(_kind,key)=>state.names[state.locale.value][key]??key;
    export const $t=(key,params={})=>{
      const zh=state.locale.value==='zh';
      if(key.endsWith('.ungrouped'))return zh?'未分组':'Ungrouped';
      if(key.endsWith('.selectGroup'))return (zh?'筛选权限分组：':'Filter permission group: ')+params.name;
      if(key.endsWith('.groupMembers'))return (zh?'查看团队：':'View team: ')+params.name+' ('+params.count+')';
      return key;
    }`)
  ]
])
const folder = await mkdtemp(resolve(tmpdir(), 'art-overview-labels-'))
const built = await build({
  root,
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@': `${root}/src` } },
  plugins: [vue(), { name: 'overview-services', load: (id) => mocks.get(id) }],
  build: {
    write: false,
    minify: false,
    lib: { entry: `${root}/src/views/system/components/ManagementOverview.vue`, formats: ['es'] },
    rollupOptions: { external: ['vue'] }
  }
})
const output = (Array.isArray(built) ? built[0] : built).output
const chunk = output.find((item) => item.type === 'chunk')
if (!chunk || chunk.type !== 'chunk') throw new Error('Missing overview module')
await writeFile(`${folder}/overview.mjs`, chunk.code)
await symlink(resolve(root, 'node_modules'), `${folder}/node_modules`)
const { default: Overview } = await import(pathToFileURL(`${folder}/overview.mjs`).href)

type HostNode = {
  type: string
  text: string
  props: Record<string, any>
  parent: HostNode | null
  children: HostNode[]
}
const node = (type: string, text = ''): HostNode => ({
  type,
  text,
  props: {},
  parent: null,
  children: []
})
function renderer() {
  const remove = (child: HostNode) => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  }
  return createRenderer<HostNode, HostNode>({
    createElement: node,
    createText: (text) => node('text', text),
    createComment: (text) => node('comment', text),
    setText: (target, text) => {
      target.text = text
    },
    setElementText: (target, text) => {
      target.text = text
      target.children = []
    },
    patchProp: (target, key, _before, value) => {
      target.props[key] = value
    },
    parentNode: (target) => target.parent,
    nextSibling: (target) =>
      target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
    remove,
    insert(child, parent, anchor) {
      remove(child)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
    }
  })
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
const nodes = (root: HostNode): HostNode[] => [root, ...root.children.flatMap(nodes)]
const text = (root: HostNode): string => root.text + root.children.map(text).join('')
async function mount(resource = 'role', overrides: Record<string, unknown> = {}) {
  state.locale.value = 'en'
  const props = reactive({
    resource,
    allowed: true,
    canQuery: true,
    canDetail: true,
    revision: 0,
    filters: { groups_all: JSON.stringify(['admin:system:role']) },
    ...overrides
  })
  const filters: unknown[] = []
  const groups: unknown[] = []
  const app = renderer().createApp({
    render: () =>
      h(Overview, {
        ...props,
        onFilter: (value: unknown) => filters.push(value),
        onGroup: (value: unknown) => groups.push(value)
      })
  })
  const block = defineComponent({
    setup:
      (_props, { slots }) =>
      () =>
        h('section', slots.default?.())
  })
  for (const name of ['ElCard', 'ElAlert', 'ElButton', 'ElRadioGroup', 'ElRadioButton'])
    app.component(name, block)
  const root = node('root')
  app.mount(root)
  await flush()
  const buttons = () =>
    nodes(root)
      .find((item) => item.props.class === 'overview-groups')!
      .children.filter((item) => item.type === 'button')
  return { props, filters, groups, buttons, close: () => app.unmount() }
}
test('Role distribution uses localized names and accessible labels while preserving canonical AND keys', async () => {
  const page = await mount()
  try {
    let bars = page.buttons()
    assert.equal(bars[0].props['aria-label'], 'Filter permission group: User')
    assert.equal(text(bars[0]), 'User8')
    assert.equal(bars[1].props['aria-pressed'], true)
    bars[0].props.onClick()
    assert.deepEqual(page.filters, [
      { groups_all: JSON.stringify(['admin:system:role', 'admin:system:user']) }
    ])
    state.locale.value = 'zh'
    await flush()
    bars = page.buttons()
    assert.equal(bars[0].props['aria-label'], '筛选权限分组：用户')
    assert.equal(text(bars[0]), '用户8')
    assert.equal(text(bars[2]), 'admin:custom:unknown1')
    assert.equal(text(bars[3]), '未分组0')
    bars[2].props.onClick()
    assert.deepEqual(page.filters.at(-1), {
      groups_all: JSON.stringify(['admin:system:role', 'admin:custom:unknown'])
    })
    bars[3].props.onClick()
    assert.deepEqual(page.filters.at(-1), {
      groups_all: JSON.stringify(['admin:system:role', ''])
    })
    bars[1].props.onClick()
    assert.deepEqual(page.filters.at(-1), { groups_all: undefined })
  } finally {
    page.close()
  }
})
test('Action distribution refreshes catalog names without changing exact filter payloads', async () => {
  const page = await mount('action', {
    filters: { groups_exact: JSON.stringify(['admin:system:role']) }
  })
  try {
    page.buttons()[0].props.onClick()
    assert.deepEqual(page.filters, [
      { groups_exact: JSON.stringify(['admin:system:role', 'admin:system:user']) }
    ])
    state.names.en!['admin:system:user'] = 'People'
    state.revision.value++
    await flush()
    assert.equal(text(page.buttons()[0]), 'People8')
    assert.equal(page.buttons()[0].props['aria-label'], 'Filter permission group: People')
    assert.equal(
      page.buttons()[2].props['aria-label'],
      'Filter permission group: admin:custom:unknown'
    )
    assert.equal(page.buttons()[3].props['aria-label'], 'Filter permission group: Ungrouped')
  } finally {
    state.names.en!['admin:system:user'] = 'User'
    state.revision.value++
    page.close()
  }
})
test('team names stay literal and their detail action remains independent of query permission', async () => {
  const page = await mount('user-group', { canQuery: false })
  try {
    assert.equal(text(page.buttons()[0]), 'admin:system:user8')
    assert.equal(page.buttons()[0].props['aria-label'], 'View team: admin:system:user (8)')
    page.buttons()[0].props.onClick()
    assert.deepEqual(page.groups, [1])
    assert.deepEqual(page.filters, [])
    page.props.canDetail = false
    await flush()
    assert.equal(page.buttons()[0].props.disabled, true)
    page.buttons()[0].props.onClick()
    assert.deepEqual(page.groups, [1])
  } finally {
    page.close()
  }
})
test('a denied query keeps localized bars disabled and emits no filters', async () => {
  const page = await mount('role', { canQuery: false })
  try {
    assert.equal(page.buttons()[0].props.disabled, true)
    page.buttons()[0].props.onClick()
    assert.deepEqual(page.filters, [])
  } finally {
    page.close()
  }
})
test.after(async () => {
  await rm(folder, { recursive: true, force: true })
  delete (globalThis as any)[scenarioKey]
})
