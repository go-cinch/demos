import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  clearRegistrationLogin,
  consumeRegistrationLogin,
  stageRegistrationLogin
} from '../src/utils/registration-login'

beforeEach(clearRegistrationLogin)

test('hands registered credentials to login exactly once, preserving password whitespace', () => {
  const credentials = { username: ' abc123 ', password: ' new secret ' }
  stageRegistrationLogin(credentials)
  credentials.password = 'changed later'
  assert.deepEqual(consumeRegistrationLogin(), { username: 'abc123', password: ' new secret ' })
  assert.equal(consumeRegistrationLogin(), undefined)
})

test('a new registration replaces the pending handoff and cancellation clears it', () => {
  stageRegistrationLogin({ username: 'first', password: 'one' })
  stageRegistrationLogin({ username: 'second', password: 'two' })
  assert.deepEqual(consumeRegistrationLogin(), { username: 'second', password: 'two' })
  stageRegistrationLogin({ username: 'cancelled', password: 'three' })
  clearRegistrationLogin()
  assert.equal(consumeRegistrationLogin(), undefined)
})

test('does not access browser storage or URL state', () => {
  for (const name of ['localStorage', 'sessionStorage', 'history', 'location']) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get: () => {
        throw new Error(`Unexpected access to ${name}`)
      }
    })
  }
  stageRegistrationLogin({ username: 'abc123', password: 'secret' })
  assert.deepEqual(consumeRegistrationLogin(), { username: 'abc123', password: 'secret' })
})

test('a fresh module has no pending credentials, like a page reload', async () => {
  stageRegistrationLogin({ username: 'abc123', password: 'secret' })
  const fresh = await import(`../src/utils/registration-login.ts?reload=${Date.now()}`)
  assert.equal(fresh.consumeRegistrationLogin(), undefined)
  assert.deepEqual(consumeRegistrationLogin(), { username: 'abc123', password: 'secret' })
})
