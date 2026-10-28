import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const folder = await mkdtemp(resolve(tmpdir(), 'art-group-navigation-'))
const mocks = new Map([
  [
    `${root}/src/components/catalog/element-adapter.ts`,
    `import {h,defineComponent} from 'vue';
    const leaf = tag => defineComponent({setup:(_props,{slots})=>()=>h(tag,slots.default?.())});
    export const Button=leaf('button'),Alert=leaf('aside'),IconifyIcon=leaf('span');`
  ],
  [
    `${root}/src/locales/index.ts`,
    `export const $t=key=>key,catalogLabel=(_kind,key)=>key,refreshI18nCatalog=async()=>{};`
  ],
  [`${root}/src/directives/skeleton.ts`, 'export const vSkeleton = {}'],
  [
    `${root}/src/views/system/components/action-groups.ts`,
    'export const applyGroupOrder=groups=>groups,savePermissionGroupOrder=async()=>{}'
  ]
])
const built = await build({
  root,
  configFile: false,
  logLevel: 'silent',
  resolve: { alias: { '@': `${root}/src` } },
  plugins: [vue(), { name: 'group-navigation-services', load: (id) => mocks.get(id) }],
  build: {
    write: false,
    minify: false,
    lib: { entry: `${root}/src/views/system/components/action-group-nav.vue`, formats: ['es'] },
    rollupOptions: { external: ['vue'] }
  }
})
const output = (Array.isArray(built) ? built[0] : built).output
const chunk = output.find((item) => item.type === 'chunk')
if (!chunk || chunk.type !== 'chunk') throw new Error('Missing navigation module')
await writeFile(`${folder}/navigation.mjs`, chunk.code)
await symlink(resolve(root, 'node_modules'), `${folder}/node_modules`)
const { default: Navigation } = await import(pathToFileURL(`${folder}/navigation.mjs`).href)
async function selectionButtons(props: Record<string, unknown>) {
  const html = await renderToString(
    createSSRApp(Navigation, {
      groups: [{ name: 'admin:registered:one', count: 0 }],
      selected: [],
      editable: true,
      loading: false,
      ...props
    })
  )
  const buttons =
    html.match(/<button\b[^>]*class="[^"]*(?:group-select|all-groups)[^"]*"[^>]*>/g) ?? []
  assert.equal(buttons.length, 2)
  return buttons
}
test('Developer can browse groups when the optional query flag is omitted', async () => {
  for (const button of await selectionButtons({ disabled: false }))
    assert.doesNotMatch(button, /\sdisabled(?:[\s=>])/)
})
test('an explicitly denied management query keeps every selection button disabled', async () => {
  for (const button of await selectionButtons({ queryEnabled: false, disabled: false }))
    assert.match(button, /\sdisabled(?:[\s=>])/)
})
test('an explicit query grant permits browsing independently of write/edit permission', async () => {
  for (const button of await selectionButtons({
    queryEnabled: true,
    editable: false,
    disabled: false
  }))
    assert.doesNotMatch(button, /\sdisabled(?:[\s=>])/)
})
test('an active unapplied group form still prevents switching even with query permission', async () => {
  for (const button of await selectionButtons({ queryEnabled: true, disabled: true }))
    assert.match(button, /\sdisabled(?:[\s=>])/)
})
test.after(async () => {
  await rm(folder, { recursive: true, force: true })
})
