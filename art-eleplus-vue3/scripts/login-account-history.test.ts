import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  clearLegacyLoginCredentials,
  clearLoginAccountHistory,
  readLoginAccountHistory,
  recordLoginAccount,
  removeLoginAccount
} from '../src/utils/login-account-history'

const historyKey = 'LOGIN_ACCOUNT_HISTORY_admin.example'
let values: Map<string, string>

beforeEach(() => {
  values = new Map()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { hostname: 'admin.example' } }
  })
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    }
  })
})

test('deletes previous plaintext credentials without migrating them', () => {
  const credentials = JSON.stringify({ username: 'legacy-account', password: 'old-secret' })
  values.set('art-auth-remember', credentials)
  values.set('art-auth-remember:admin.example', credentials)
  clearLegacyLoginCredentials()
  assert.equal(values.has('art-auth-remember'), false)
  assert.equal(values.has('art-auth-remember:admin.example'), false)
  assert.deepEqual(readLoginAccountHistory(), [])
  assert.equal(values.has(historyKey), false)
})

test('stores only trimmed successful account names, newest first, deduplicated and capped', () => {
  for (let index = 0; index < 12; index++) recordLoginAccount(` account-${index} `)
  recordLoginAccount(' account-5 ')
  const expected = [
    'account-5',
    'account-11',
    'account-10',
    'account-9',
    'account-8',
    'account-7',
    'account-6',
    'account-4',
    'account-3',
    'account-2'
  ]
  assert.deepEqual(readLoginAccountHistory(), expected)
  assert.deepEqual(JSON.parse(values.get(historyKey)!), expected)
  recordLoginAccount('   ')
  assert.deepEqual(readLoginAccountHistory(), expected)
})

test('ignores objects, blank strings, duplicates and corrupt storage', () => {
  values.set(
    historyKey,
    JSON.stringify([
      ' alice ',
      { username: 'bob', password: 'secret' },
      null,
      3,
      '',
      'alice',
      'carol'
    ])
  )
  assert.deepEqual(readLoginAccountHistory(), ['alice', 'carol'])
  assert.equal(values.get(historyKey), '["alice","carol"]')
  values.set(historyKey, '{invalid')
  assert.deepEqual(readLoginAccountHistory(), [])
  assert.equal(values.has(historyKey), false)
  values.set(historyKey, JSON.stringify({ username: 'alice', password: 'secret' }))
  assert.deepEqual(readLoginAccountHistory(), [])
  assert.equal(values.has(historyKey), false)
  values.set(
    historyKey,
    JSON.stringify(Array.from({ length: 12 }, (_, index) => `account-${index}`))
  )
  assert.equal(readLoginAccountHistory().length, 10)
  assert.equal(JSON.parse(values.get(historyKey)!).length, 10)
})

test('keeps history scoped to hostname and removes accounts without changing others', () => {
  values.set('LOGIN_ACCOUNT_HISTORY_other.example', '["other-account"]')
  recordLoginAccount('alice')
  recordLoginAccount('bob')
  assert.deepEqual(removeLoginAccount('alice'), ['bob'])
  assert.deepEqual(clearLoginAccountHistory(), [])
  assert.equal(values.has(historyKey), false)
  assert.equal(values.get('LOGIN_ACCOUNT_HISTORY_other.example'), '["other-account"]')
})

test('authentication remains usable when browser storage is unavailable', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      throw new Error('Storage blocked')
    }
  })
  assert.doesNotThrow(clearLegacyLoginCredentials)
  assert.deepEqual(readLoginAccountHistory(), [])
  assert.deepEqual(recordLoginAccount('alice'), ['alice'])
  assert.deepEqual(removeLoginAccount('alice'), [])
  assert.deepEqual(clearLoginAccountHistory(), [])
})
