import assert from 'node:assert/strict'
import test from 'node:test'
import { CollapsePanel, Drawer, Input, Modal } from '../src/components/catalog/element-adapter'

function renderControl(
  component: any,
  attrs: Record<string, any>,
  slots: Record<string, any> = {}
) {
  const render = component.setup({}, { attrs, slots, emit() {} })
  return () => render()
}

test('applying a drawer form closes without cancellation lifecycle callbacks', () => {
  let requests = 0
  const updates: boolean[] = []
  const attrs = {
    open: true,
    onClose: () => requests++,
    'onUpdate:open': (v: boolean) => updates.push(v)
  }
  const render = renderControl(Drawer, attrs)
  attrs.open = false
  const drawer = render()
  assert.equal(drawer.props.onClose, undefined)
  drawer.props['onUpdate:modelValue'](false)
  assert.equal(requests, 0)
  assert.deepEqual(updates, [])
})

test('a manual drawer close retains unapplied input until its owner confirms', () => {
  let requests = 0
  const updates: boolean[] = []
  const attrs = {
    open: true,
    onClose: () => requests++,
    'onUpdate:open': (v: boolean) => updates.push(v)
  }
  const render = renderControl(Drawer, attrs)
  render().props.beforeClose()
  assert.equal(requests, 1)
  assert.equal(attrs.open, true)
  assert.deepEqual(updates, [])
  attrs.open = false
  render().props['onUpdate:modelValue'](false)
  assert.equal(requests, 1)
})

test('a successful modal save does not become cancellation after its leave transition', () => {
  let requests = 0
  const attrs = { open: true, onCancel: () => requests++ }
  const render = renderControl(Modal, attrs)
  attrs.open = false
  const modal = render()
  assert.equal(modal.props.onCancel, undefined)
  modal.props['onUpdate:modelValue'](false)
  assert.equal(requests, 0)
})

test('modal close requests and cancel buttons respect the owner guard', () => {
  let requests = 0
  const updates: boolean[] = []
  const attrs = {
    open: true,
    onCancel: () => requests++,
    'onUpdate:open': (v: boolean) => updates.push(v)
  }
  const render = renderControl(Modal, attrs)
  render().props.beforeClose()
  assert.equal(requests, 1)
  render().children.footer()[0].props.onClick()
  assert.equal(requests, 2)
  assert.equal(attrs.open, true)
  assert.deepEqual(updates, [])
})

test('ordinary model-owned overlays still close once on a user request', () => {
  for (const control of [Drawer, Modal]) {
    const updates: boolean[] = []
    const attrs = {
      open: true,
      'onUpdate:open': (v: boolean) => {
        updates.push(v)
        attrs.open = v
      }
    }
    const render = renderControl(control, attrs)
    render().props.beforeClose()
    assert.deepEqual(updates, [false])
    render().props['onUpdate:modelValue'](false)
    assert.deepEqual(updates, [false])
  }
})

test('merged model listeners update both a search query and its pagination state', () => {
  let query = ''
  let page = 4
  const input = renderControl(Input, {
    value: query,
    'onUpdate:value': [
      (value: string) => {
        query = value
      },
      () => {
        page = 1
      }
    ]
  })()
  input.props['onUpdate:modelValue']('draft.message')
  assert.equal(query, 'draft.message')
  assert.equal(page, 1)
})

test('collapse extras render beside their header without changing default panel content', () => {
  const body = () => 'Entry inputs'
  const panel = renderControl(
    CollapsePanel,
    { panelKey: 'entry' },
    {
      header: () => 'Menu entry',
      extra: () => 'Remove',
      default: body
    }
  )()
  const title = panel.children.title({ isActive: true })
  assert.equal(panel.props.name, 'entry')
  assert.equal(title.children[0].children, 'Menu entry')
  assert.equal(title.children[1].children, 'Remove')
  assert.equal(panel.children.default, body)
  let stopped = 0
  let prevented = 0
  title.children[1].props.onClick({ stopPropagation: () => stopped++ })
  for (const key of ['Enter', ' ', 'Tab']) {
    title.children[1].props.onKeydown({
      key,
      stopPropagation: () => stopped++,
      preventDefault: () => prevented++
    })
  }
  assert.equal(stopped, 3)
  assert.equal(prevented, 0)
})
