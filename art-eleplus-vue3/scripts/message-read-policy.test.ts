import assert from 'node:assert/strict'
import test from 'node:test'
import { markMessageRead } from '../src/utils/message-read-policy'

test('detail access without mark-read leaves unread state untouched and sends no PATCH', async () => {
  const message = { id: 1, content: 'Complete body', read_at: null as number | null }
  let patches = 0
  assert.equal(
    await markMessageRead(
      message,
      () => false,
      async () => {
        patches++
      }
    ),
    false
  )
  assert.equal(patches, 0)
  assert.equal(message.read_at, null)
  assert.equal(message.content, 'Complete body')
})

test('revoking permission while the detail GET is pending prevents automatic marking', async () => {
  let allowed = true
  let complete!: (value: { id: number; read_at: null }) => void
  const detail = new Promise<{ id: number; read_at: null }>((resolve) => {
    complete = resolve
  })
  let patches = 0
  const open = async () => {
    const message = await detail
    await markMessageRead(
      message,
      () => allowed,
      async () => {
        patches++
      }
    )
    return message
  }
  const pending = open()
  allowed = false
  complete({ id: 2, read_at: null })
  assert.equal((await pending).read_at, null)
  assert.equal(patches, 0)
})

test('granting the exact permission before the detail response enables marking once', async () => {
  let allowed = false
  const message = { id: 3, read_at: null as number | null }
  let patches = 0
  allowed = true
  assert.equal(
    await markMessageRead(
      message,
      () => allowed,
      async (id) => {
        assert.equal(id, 3)
        patches++
      }
    ),
    true
  )
  assert.equal(patches, 1)
  assert.ok(message.read_at! > 0)
  assert.equal(
    await markMessageRead(
      message,
      () => allowed,
      async () => {
        patches++
      }
    ),
    false
  )
  assert.equal(patches, 1)
})

test('a failed PATCH preserves unread state', async () => {
  const message = { id: 4, read_at: null as number | null }
  await assert.rejects(
    markMessageRead(
      message,
      () => true,
      async () => {
        throw new Error('offline')
      }
    ),
    /offline/
  )
  assert.equal(message.read_at, null)
})

test('an already-read message never generates a redundant PATCH', async () => {
  const message = { id: 5, read_at: 123 }
  let patches = 0
  assert.equal(
    await markMessageRead(
      message,
      () => true,
      async () => {
        patches++
      }
    ),
    false
  )
  assert.equal(message.read_at, 123)
  assert.equal(patches, 0)
})
