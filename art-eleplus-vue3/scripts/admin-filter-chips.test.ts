import assert from 'node:assert/strict'
import test from 'node:test'
import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { adminFilterChips } from '../src/utils/admin/model'

const text = (key: string, params: Record<string, string | number> = {}) =>
  key === 'system-insights.ungrouped' ? 'Ungrouped' : `${key}:${params.name ?? ''}`
const rawNames = ['admin:system:user', 'admin:system:role']

test('AND-group chips localize registered names while retaining raw keys and serialized removal', () => {
  const filters = { groups_all: JSON.stringify(rawNames) }
  const before = JSON.stringify(filters)
  const labels: Record<string, string> = {
    'admin:system:user': '用户',
    'admin:system:role': '角色'
  }
  const chips = adminFilterChips(filters, 'UTC', text, (key) => labels[key] ?? key)
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ['system-insights.roleGroupFilter:用户', 'system-insights.roleGroupFilter:角色']
  )
  assert.equal(chips[0].key, 'groups_all:admin:system:user')
  assert.deepEqual(chips[0].clear, { groups_all: JSON.stringify(['admin:system:role']) })
  assert.equal(JSON.stringify(filters), before)
})

test('exact-group chips use the same labels without changing their own filter key', () => {
  const chips = adminFilterChips({ groups_exact: JSON.stringify(rawNames) }, 'UTC', text, (key) =>
    key.endsWith(':user') ? 'User' : 'Role'
  )
  assert.equal(chips[0].label, 'system-insights.groupFilter:User')
  assert.equal(chips[0].key, 'groups_exact:admin:system:user')
  assert.deepEqual(chips[0].clear, { groups_exact: JSON.stringify(['admin:system:role']) })
})

test('unknown names fall back to raw keys and empty names use the localized ungrouped label', () => {
  const chips = adminFilterChips(
    { groups_all: JSON.stringify(['unknown:group', '']) },
    'UTC',
    text,
    () => ''
  )
  assert.equal(chips[0].label, 'system-insights.roleGroupFilter:unknown:group')
  assert.equal(chips[1].label, 'system-insights.roleGroupFilter:Ungrouped')
  assert.equal(chips[1].key, 'groups_all:')
  assert.deepEqual(chips[1].clear, { groups_all: JSON.stringify(['unknown:group']) })
  assert.deepEqual(adminFilterChips({ groups_exact: '[""]' }, 'UTC', text)[0].clear, {
    groups_exact: undefined
  })
})

test('callers without a label callback retain previous display and clearing semantics', () => {
  const chips = adminFilterChips({ groups_exact: JSON.stringify([rawNames[0]]) }, 'UTC', text)
  assert.equal(chips[0].label, `system-insights.groupFilter:${rawNames[0]}`)
  assert.deepEqual(chips[0].clear, { groups_exact: undefined })
})

test('updated language and catalog labels change display without changing filter identity', () => {
  let label = 'User'
  const filters = { groups_all: JSON.stringify([rawNames[0]]) }
  const first = adminFilterChips(filters, 'UTC', text, () => label)[0]
  label = '用户'
  const second = adminFilterChips(filters, 'UTC', text, () => label)[0]
  label = '用户管理'
  const third = adminFilterChips(filters, 'UTC', text, () => label)[0]
  assert.equal(first.label, 'system-insights.roleGroupFilter:User')
  assert.equal(second.label, 'system-insights.roleGroupFilter:用户')
  assert.equal(third.label, 'system-insights.roleGroupFilter:用户管理')
  assert.equal(first.key, third.key)
  assert.deepEqual(first.clear, third.clear)
})

test('computed chip labels react to locale switches and refreshed catalog messages', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: { groups: { 'admin:system:user': 'User' } },
      zh: { groups: { 'admin:system:user': '用户' } }
    }
  })
  const catalogRevision = ref(0)
  const chips = computed(() => {
    void catalogRevision.value
    return adminFilterChips({ groups_all: JSON.stringify([rawNames[0]]) }, 'UTC', text, (key) =>
      i18n.global.te(`groups.${key}`) ? i18n.global.t(`groups.${key}`) : key
    )
  })
  assert.equal(chips.value[0].label, 'system-insights.roleGroupFilter:User')
  i18n.global.locale.value = 'zh'
  assert.equal(chips.value[0].label, 'system-insights.roleGroupFilter:用户')
  i18n.global.mergeLocaleMessage('zh', { groups: { 'admin:system:user': '用户管理' } })
  catalogRevision.value++
  assert.equal(chips.value[0].label, 'system-insights.roleGroupFilter:用户管理')
  assert.equal(chips.value[0].key, 'groups_all:admin:system:user')
})
