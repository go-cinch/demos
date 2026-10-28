/** Element Plus controls for the catalog workspaces. Business models are shared
 * with the PC reference; every rendered input remains an Art / Element control. */
import { defineComponent, h, ref, watch } from 'vue'
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCheckboxGroup,
  ElCollapse,
  ElCollapseItem,
  ElDialog,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElRadioButton,
  ElRadioGroup,
  ElResult,
  ElSegmented,
  ElSelect,
  ElSkeleton,
  ElSwitch,
  ElTabPane,
  ElTabs,
  ElTag,
  ElTooltip,
  ElTree
} from 'element-plus'
import { Icon } from '@iconify/vue'
const normalize = (attrs: Record<string, any>): any =>
  new Proxy(attrs, {
    get(target, key) {
      if (typeof key !== 'string') return Reflect.get(target, key)
      return target[key] ?? target[key.replace(/[A-Z]/g, (part) => '-' + part.toLowerCase())]
    }
  })
const control = (name: string, render: (a: any, s: any, emit: any) => any): any =>
  defineComponent({
    name: `Catalog${name}`,
    inheritAttrs: false,
    setup(_p, { attrs, slots, emit }) {
      return () => render(normalize(attrs), slots, emit)
    }
  })
const events = (a: any, key: string, value: unknown) => {
  const handler = a[`onUpdate:${key}`]
  // Vue merges v-model with explicit update listeners into a handler array.
  for (const callback of Array.isArray(handler) ? handler : [handler]) {
    if (typeof callback === 'function') callback(value)
  }
}
const model = (a: any, key = 'value') => ({
  ...a,
  modelValue: a[key],
  'onUpdate:modelValue': (value: unknown) => {
    events(a, key, value)
  }
})
export const IconifyIcon = Icon
export const Button = control('Button', (a, s) =>
  h(
    ElButton,
    {
      ...a,
      type: a.danger
        ? 'danger'
        : a.type === 'default' || a.type === 'text' || a.type === 'link'
          ? undefined
          : a.type,
      link: a.type === 'link',
      text: a.type === 'text'
    },
    s
  )
)
export const Input = control('Input', (a, s) =>
  h(
    ElInput,
    {
      ...model(a),
      clearable: a.allowClear,
      onInput: (value: string) => a.onChange?.({ target: { value } }),
      onKeydown: (e: KeyboardEvent) => {
        a.onKeydown?.(e)
        if (e.key === 'Enter') a.onPressEnter?.(e)
      }
    },
    s
  )
)
export const Textarea = control('Textarea', (a, s) =>
  h(
    ElInput,
    {
      ...model(a),
      type: 'textarea',
      rows: a.autoSize?.minRows ?? a.rows ?? 4,
      autosize: a.autoSize,
      onInput: (value: string) => a.onChange?.({ target: { value } })
    },
    s
  )
)
Input.TextArea = Textarea
export const InputPassword = control('Password', (a, s) =>
  h(ElInput, { ...model(a), type: 'password', showPassword: true }, s)
)
export const InputNumber = control('Number', (a, s) => h(ElInputNumber, model(a), s))
export const Switch = control('Switch', (a, s) => h(ElSwitch, model(a, 'checked'), s))
export const Checkbox = control('Checkbox', (a, s) =>
  h(
    ElCheckbox,
    {
      ...model(a, 'checked'),
      indeterminate: a.indeterminate,
      onChange: (checked: boolean) => a.onChange?.({ target: { checked } })
    },
    s
  )
)
export const CheckboxGroup = control('CheckboxGroup', (a, s) =>
  h(ElCheckboxGroup, model(a), {
    ...s,
    default: () =>
      a.options
        ? a.options.map((o: any) =>
            h(ElCheckbox, { value: o.value, disabled: o.disabled }, () => o.label)
          )
        : s.default?.()
  })
)
export const Select = control('Select', (a, s) =>
  h(
    ElSelect,
    {
      ...model(a),
      filterable: a.showSearch,
      multiple: a.mode === 'multiple' || a.mode === 'tags',
      allowCreate: a.mode === 'tags',
      defaultFirstOption: true,
      clearable: a.allowClear,
      filterMethod: a.filterOption === false ? (query: string) => a.onSearch?.(query) : undefined,
      onVisibleChange: (visible: boolean) => a.onDropdownVisibleChange?.(visible),
      onChange: (value: unknown) => a.onChange?.(value)
    },
    {
      ...s,
      default: () =>
        a.options
          ? a.options.map((o: any) =>
              h(ElOption, { key: o.value, value: o.value, label: o.label, disabled: o.disabled })
            )
          : s.default?.()
    }
  )
)
export const Alert = control('Alert', (a, s) =>
  h(
    ElAlert,
    {
      ...a,
      title: a.message,
      type: a.type === 'warning' ? 'warning' : (a.type ?? 'info'),
      closable: a.closable ?? false,
      showIcon: a.showIcon
    },
    { ...s, default: () => [a.description, s.description?.(), s.action?.(), s.default?.()] }
  )
)
export const Empty = control('Empty', (a, s) => h(ElEmpty, a, s))
export const Tag = control('Tag', (a, s) =>
  h(
    ElTag,
    {
      ...a,
      type:
        (
          {
            red: 'danger',
            orange: 'warning',
            green: 'success',
            blue: 'primary',
            default: 'info',
            purple: 'primary',
            cyan: 'success'
          } as any
        )[a.color] ?? 'info',
      effect: 'light',
      onClose: a.onClose
    },
    s
  )
)
export const Tooltip = control('Tooltip', (a, s) =>
  h(
    ElTooltip,
    { ...a, content: typeof a.title === 'string' ? a.title : undefined },
    { ...s, content: s.title ?? s.content }
  )
)
export const FormItem = control('FormItem', (a, s) =>
  h(
    ElFormItem,
    {
      ...a,
      prop: a.name,
      for: a.htmlFor,
      error: a.help,
      required: a.required,
      class: [a.class, { 'catalog-field-warning': a.validateStatus === 'warning' }]
    },
    {
      ...s,
      default: () => [
        s.default?.(),
        a.extra || s.extra
          ? h('div', { class: 'catalog-field-extra' }, a.extra ?? s.extra?.())
          : null
      ]
    }
  )
)
export const Form: any = control('Form', (a, s) =>
  h(ElForm, { ...a, labelPosition: 'top', novalidate: true }, s)
)
Form.useInjectFormItemContext = () => ({ onFieldChange() {}, onFieldBlur() {} })
export const FormItemRest = control('FormItemRest', (_a, s) => s.default?.())
export const Spin = control('Spin', (a, s) =>
  h('div', { 'aria-busy': a.spinning, class: 'catalog-loading-region' }, [
    a.spinning ? h(ElSkeleton, { animated: true, rows: 3 }) : null,
    h(
      'div',
      { style: a.spinning ? { opacity: 0.5, pointerEvents: 'none' } : undefined },
      s.default?.()
    )
  ])
)
export const Skeleton = control('Skeleton', (a, s) =>
  h(ElSkeleton, { ...a, animated: true, loading: true, rows: 8 }, s)
)
export const Segmented = control('Segmented', (a, s) =>
  h(ElSegmented, { ...model(a), options: a.options, onChange: a.onChange }, s)
)
export const Tabs = control('Tabs', (a, s) => {
  const tabProps = model(a, 'activeKey')
  // ElTabs emits tabChange, not change. Forwarding this adapter callback would
  // install a native change listener and catch changes from nested form fields.
  delete tabProps.onChange
  return h(
    ElTabs,
    {
      ...tabProps,
      // A controlled tab can reject navigation while its unsaved-edit prompt is
      // open. Element's internal selection must wait for the owner to accept it.
      beforeLeave: (key: string | number) => {
        if (a['onUpdate:activeKey'] || key === a.activeKey) return true
        a.onChange?.(key)
        return false
      },
      onTabChange: (key: unknown) => {
        if (a['onUpdate:activeKey']) a.onChange?.(key)
      }
    },
    s
  )
})
export const TabPane = control('TabPane', (a, s) =>
  h(ElTabPane, { ...a, name: a.tabKey ?? a.key, label: a.tab }, { ...s, label: s.tab ?? s.label })
)
export const Collapse = control('Collapse', (a, s) => h(ElCollapse, model(a, 'activeKey'), s))
export const CollapsePanel = control('CollapsePanel', (a, s) =>
  h(
    ElCollapseItem,
    { ...a, name: a.panelKey ?? a.key, title: typeof a.header === 'string' ? a.header : undefined },
    {
      ...s,
      title: (scope: unknown) =>
        h(
          'span',
          { style: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%' } },
          [
            h(
              'span',
              { style: { flex: 1, minWidth: 0 } },
              s.header?.(scope) ?? s.title?.(scope) ?? a.header
            ),
            s.extra
              ? h(
                  'span',
                  {
                    style: { display: 'inline-flex', alignItems: 'center', flexShrink: 0 },
                    onClick: (event: MouseEvent) => event.stopPropagation(),
                    onKeydown: (event: KeyboardEvent) => {
                      // Keep native button activation; only prevent the collapse
                      // header from handling the same Enter or Space key.
                      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
                    }
                  },
                  s.extra(scope)
                )
              : null
          ]
        )
    }
  )
)
export const RadioGroup = control('RadioGroup', (a, s) =>
  h(
    ElRadioGroup,
    { ...model(a), onChange: (value: unknown) => a.onChange?.({ target: { value } }) },
    s
  )
)
export const RadioButton = control('RadioButton', (a, s) => h(ElRadioButton, a, s))
export const Pagination = control('Pagination', (a) =>
  h(ElPagination, {
    ...a,
    currentPage: a.current,
    pageSize: a.pageSize,
    total: a.total,
    layout: 'total, sizes, prev, pager, next',
    pageSizes: [10, 20, 50, 100],
    onCurrentChange: (page: number) => {
      events(a, 'current', page)
      a.onChange?.(page, a.pageSize)
    },
    onSizeChange: (size: number) => {
      events(a, 'pageSize', size)
      a.onChange?.(1, size)
    }
  })
)
function requestOverlayClose(a: any, event: 'onClose' | 'onCancel') {
  // The owner may keep the overlay open while confirming unapplied input.
  if (a[event]) a[event]()
  else events(a, 'open', false)
}
export const Drawer = control('Drawer', (a, s) => {
  const drawerProps = { ...a }
  // Element emits close for every leave transition, including a successful
  // Apply that changes open to false. Only beforeClose is a user close request.
  delete drawerProps.onClose
  return h(
    ElDrawer,
    {
      ...drawerProps,
      modelValue: a.open,
      size: a.width ?? 720,
      destroyOnClose: a.destroyOnClose,
      showClose: a.closable ?? true,
      closeOnClickModal: a.maskClosable ?? true,
      closeOnPressEscape: a.keyboard ?? true,
      beforeClose: () => requestOverlayClose(a, 'onClose'),
      'onUpdate:modelValue': (open: boolean) => {
        if (open !== a.open) events(a, 'open', open)
      }
    },
    s
  )
})
export const Result = control('Result', (a, s) =>
  h(
    ElResult,
    {
      ...a,
      icon: a.status === '403' ? 'warning' : a.status === 'error' ? 'error' : 'info',
      subTitle: a.subTitle
    },
    s
  )
)
const modalComponent = control('Modal', (a, s) => {
  const modalProps = { ...a }
  delete modalProps.onCancel
  return h(
    ElDialog,
    {
      ...modalProps,
      modelValue: a.open,
      width: a.width ?? 640,
      showClose: a.closable ?? true,
      closeOnPressEscape: a.keyboard ?? true,
      closeOnClickModal: a.maskClosable ?? true,
      beforeClose: () => requestOverlayClose(a, 'onCancel'),
      'onUpdate:modelValue': (open: boolean) => {
        if (open !== a.open) events(a, 'open', open)
      }
    },
    {
      ...s,
      footer:
        s.footer ??
        (() =>
          a.footer === null
            ? null
            : [
                h(
                  ElButton,
                  {
                    disabled: a.cancelButtonProps?.disabled,
                    onClick: () => requestOverlayClose(a, 'onCancel')
                  },
                  () => a.cancelText ?? 'Cancel'
                ),
                h(
                  ElButton,
                  {
                    type: a.okButtonProps?.danger ? 'danger' : 'primary',
                    disabled: a.okButtonProps?.disabled,
                    loading: a.confirmLoading,
                    onClick: a.onOk
                  },
                  () => a.okText ?? 'OK'
                )
              ])
    }
  )
})
export const Modal: any = modalComponent
Modal.confirm = (a: any) => {
  void ElMessageBox.confirm(a.content, a.title, {
    confirmButtonText: a.okText,
    cancelButtonText: a.cancelText,
    type: a.okButtonProps?.danger ? 'warning' : 'info',
    closeOnClickModal: false,
    beforeClose: async (action, instance, done) => {
      if (action !== 'confirm') {
        a.onCancel?.()
        done()
        return
      }
      instance.confirmButtonLoading = true
      try {
        const result = await a.onOk?.()
        if (result !== false) done()
      } catch {
        /* Preserve the prompt and draft after a failed asynchronous action. */
      } finally {
        instance.confirmButtonLoading = false
      }
    }
  }).catch(() => {})
}
export const message = ElMessage
export const Page = control('Page', (a, s) =>
  h('div', { ...a, class: ['page-content', a.class] }, s.default?.())
)
export const Tree: any = defineComponent({
  name: 'CatalogTree',
  inheritAttrs: false,
  setup(_p, { attrs, slots: s }) {
    const a: any = normalize(attrs)
    const tree = ref<any>()
    const allKeys = () => {
      const keys: string[] = []
      const walk = (nodes: any[]) =>
        nodes.forEach((n) => {
          keys.push(String(n.key))
          walk(n.children ?? [])
        })
      walk((a.treeData as any[]) ?? [])
      return keys
    }
    watch(
      () => a.expandedKeys,
      () => {
        const expanded = new Set((a.expandedKeys as any[]) ?? [])
        for (const key of allKeys()) {
          const node = tree.value?.getNode(key)
          if (node) node.expanded = expanded.has(key)
        }
      },
      { deep: true, flush: 'post' }
    )
    return () =>
      h(
        ElTree,
        {
          ...a,
          ref: tree,
          data: a.treeData,
          nodeKey: 'key',
          props: { label: 'title', children: 'children', disabled: 'disabled' },
          defaultExpandedKeys: a.expandedKeys,
          currentNodeKey: (a.selectedKeys as any[])?.[0],
          highlightCurrent: true,
          expandOnClickNode: false,
          onNodeClick: (data: any) => a.onSelect?.([data.key], { node: data, selected: true }),
          onNodeExpand: (data: any) => {
            events(a, 'expandedKeys', [
              ...new Set([...((a.expandedKeys as any[]) ?? []), data.key])
            ])
            a.onExpand?.([...new Set([...((a.expandedKeys as any[]) ?? []), data.key])])
          },
          onNodeCollapse: (data: any) => {
            const keys = ((a.expandedKeys as any[]) ?? []).filter((k) => k !== data.key)
            events(a, 'expandedKeys', keys)
            a.onExpand?.(keys)
          }
        },
        { default: ({ data }: any) => s.title?.(data) ?? data.title }
      )
  }
})
