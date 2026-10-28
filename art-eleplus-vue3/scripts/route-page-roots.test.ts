import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from '@vue/compiler-sfc'
import * as Vue from 'vue'

const views = resolve(dirname(fileURLToPath(import.meta.url)), '../src/views')
async function template(path: string) {
  const filename = resolve(views, path)
  return { filename, block: parse(await readFile(filename, 'utf8')).descriptor.template! }
}

type HostNode = { type: string; children: HostNode[]; parent: HostNode | null; text: string }
const node = (type: string, text = ''): HostNode => ({ type, children: [], parent: null, text })
function renderer() {
  const teleport = node('body')
  const remove = (child: HostNode) => {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = null
  }
  return Vue.createRenderer<HostNode, HostNode>({
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
    parentNode: (target) => target.parent,
    nextSibling: (target) =>
      target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
    patchProp: () => {},
    insert(child, parent, anchor) {
      remove(child)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
    },
    remove,
    querySelector: () => teleport
  })
}
async function pageRootShape(path: string) {
  const { block } = await template(path)
  const roots = block.ast.children.filter(
    (child: any) => child.type !== 3 && (child.type !== 2 || child.content.trim())
  )
  // Use the actual SFC root structure while omitting business setup/data and
  // nested content. Drawer deliberately keeps Element's teleport root shape.
  const drawer = Vue.defineComponent({
    inheritAttrs: false,
    render: () => Vue.h(Vue.Teleport, { to: 'body' }, [Vue.h('aside')])
  })
  const rootVNode = (root: any) => (root.tag === 'ElDrawer' ? Vue.h(drawer) : Vue.h(root.tag))
  return Vue.defineComponent({
    name: 'ActualPageRootShape',
    render: () =>
      roots.length === 1 ? rootVNode(roots[0]) : Vue.h(Vue.Fragment, null, roots.map(rootVNode))
  })
}
for (const [path, cached] of [
  ['msg/MessageTable.vue', true],
  ['msg/index.vue', false]
] as const) {
  test(`${path} leaves an out-in route transition and mounts the next page`, async () => {
    const page = await pageRootShape(path)
    let mounted = false
    const dictionary = Vue.defineComponent({
      setup() {
        Vue.onMounted(() => {
          mounted = true
        })
        return () => Vue.h('div', 'Dictionary Management')
      }
    })
    const current = Vue.shallowRef<Vue.Component>(page)
    const warnings: string[] = []
    const route =
      '<component :is="current" :key="current === page ? \'messages\' : \'dictionary\'" class="art-page-view" />'
    const render = Vue.compile(
      `<BaseTransition mode="out-in" :on-leave="leave">${
        cached ? `<KeepAlive>${route}</KeepAlive>` : route
      }</BaseTransition>`
    )
    const app = renderer().createApp({
      components: { BaseTransition: Vue.BaseTransition, KeepAlive: Vue.KeepAlive },
      setup: () => ({
        current,
        page,
        leave: (_element: unknown, done: () => void) => queueMicrotask(done)
      }),
      render
    })
    app.config.warnHandler = (warning) => warnings.push(warning)
    app.mount(node('root'))
    current.value = dictionary
    await Vue.nextTick()
    await Vue.nextTick()
    assert.equal(mounted, true, 'Dictionary must mount after leaving the real message template')
    assert.deepEqual(
      warnings.filter((warning) => /non-element|fragment or text or teleport/.test(warning)),
      []
    )
    app.unmount()
  })
}

test('direct management, audit, profile and dashboard pages retain a single element root', async () => {
  const paths = [
    'system/components/ManagementPage.vue',
    'audit/AuditPage.vue',
    'system/user-center/index.vue',
    'dashboard/analysis/index.vue',
    'dashboard/console/index.vue'
  ]
  for (const path of paths) {
    const { block } = await template(path)
    const roots = block.ast.children.filter(
      (child: any) => child.type !== 3 && (child.type !== 2 || child.content.trim())
    )
    assert.equal(roots.length, 1, path)
    assert.equal((roots[0] as any).tag, 'div', path)
  }
})
