// Run with: node --test tests/pendingOperations.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { webcrypto } from 'node:crypto'

const source = await readFile(new URL('../src/services/pendingOperations.js', import.meta.url), 'utf8')
const { pendingOperations: journal } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
globalThis.crypto ??= webcrypto
const data = new Map()
globalThis.localStorage = {
  getItem: key => data.has(key) ? data.get(key) : null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: key => data.delete(key),
}
const account = () => crypto.randomUUID()

test('pending operations are isolated per authenticated account', () => {
  const a = account(), b = account()
  journal.enqueue(a, { resource: 'foods', method: 'POST', payload: { name: 'Test' } })
  assert.equal(journal.list(a).length, 1)
  assert.equal(journal.list(b).length, 0)
  assert.throws(() => journal.list('offline-user'))
})

test('create replay preserves operation ID and acknowledges only after response', async () => {
  const a = account()
  const op = journal.enqueue(a, { resource: 'foods', method: 'POST', payload: { name: 'Test' } })
  let received
  const api = { foods: { create: async (body, options) => {
    received = options.operationId
    return { item: { id: 'server-food', name: body.name } }
  } } }
  const summary = await journal.replay(a, api)
  assert.equal(received, op.id)
  assert.equal(summary.acknowledged, 1)
  assert.equal(summary.results[0].item.id, 'server-food')
  assert.deepEqual(journal.list(a), [])
})

test('ambiguous network failures keep original operation for retry', async () => {
  const a = account()
  const op = journal.enqueue(a, { resource: 'meals', method: 'POST', payload: { name: 'Test', foods: [] } })
  const failed = await journal.replay(a, { meals: { create: async () => { throw new Error('offline') } } })
  assert.equal(failed.blocked, true)
  assert.equal(journal.list(a)[0].id, op.id)
  const ok = await journal.replay(a, { meals: { create: async () => ({ item: { id: 'server-meal' } }) } })
  assert.equal(ok.acknowledged, 1)
  assert.equal(journal.list(a).length, 0)
})

test('guarded update and deletion replay use stable operation IDs and base versions', async () => {
  const a = account()
  const put = journal.enqueue(a, { resource: 'foods', method: 'PUT', recordId: 'food-1', baseVersion: '2026-10-16T10:00:00Z', payload: { name: 'Edited' } })
  let options
  await journal.replay(a, { foods: { update: async (_id, _body, opts) => { options = opts; return { item: { id: 'food-1' } } } } })
  assert.equal(options.operationId, put.id)
  assert.equal(options.baseVersion, put.baseVersion)
  const del = journal.enqueue(a, { resource: 'foods', method: 'DELETE', recordId: 'food-1', baseVersion: put.baseVersion })
  await journal.replay(a, { foods: { remove: async (_id, opts) => { options = opts; return { ok: true } } } })
  assert.equal(options.operationId, del.id)
  assert.equal(journal.list(a).length, 0)
})

test('conflicts stop replay and remain visible for review', async () => {
  const a = account()
  const op = journal.enqueue(a, { resource: 'foods', method: 'DELETE', recordId: 'food-1', baseVersion: '2026-10-16T10:00:00Z' })
  const result = await journal.replay(a, { foods: { remove: async () => { throw Object.assign(new Error('conflict'), { status: 409 }) } } })
  assert.equal(result.blocked, true)
  assert.equal(journal.list(a)[0].status, 'conflict')
  const view = journal.overlay(a, 'foods', [{ id: 'food-1', name: 'Server copy' }])
  assert.equal(view[0].name, 'Server copy')
  assert.equal(view[0].syncConflict, true)
  assert.equal(op.id, journal.list(a)[0].id)
})

test('invalid JSON is not silently replaced', () => {
  const a = account()
  const key = 'nutrilog-pending-operations-v1-' + encodeURIComponent(a)
  data.set(key, '{broken')
  assert.throws(() => journal.list(a))
  assert.throws(() => journal.enqueue(a, { resource: 'foods', method: 'POST', payload: { name: 'Test' } }))
  assert.equal(data.get(key), '{broken')
})
