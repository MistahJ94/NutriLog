// Durable, account-scoped pending operations for future offline synchronization.
// This module is deliberately not wired into API writes until the server supports
// idempotent creates and version-checked updates. Never replay blindly.
const PREFIX = 'nutrilog-pending-operations-v1-' 
const replayingAccounts = new Set()
const allowedResources = new Set(['foods', 'meals'])
const allowedMethods = new Set(['POST', 'PUT', 'DELETE'])
const keyFor = accountId => {
  const id = String(accountId || '').trim()
  if (!id || id === 'default' || id === 'offline-user') throw new Error('An authenticated account ID is required')
  return PREFIX + encodeURIComponent(id)
}
const parse = value => {
  if (!value) return []
  const data = JSON.parse(value)
  if (!Array.isArray(data)) throw new Error('Pending operation storage is invalid; refusing to overwrite it')
  return data
}
export const pendingOperations = {
  list(accountId) {
    return parse(localStorage.getItem(keyFor(accountId)))
  },
  enqueue(accountId, operation) {
    if (!allowedResources.has(operation?.resource) || !allowedMethods.has(operation?.method)) {
      throw new Error('Unsupported pending operation')
    }
    if (operation.method !== 'POST' && !operation.recordId) {
      throw new Error('Existing record ID required')
    }
    const items = this.list(accountId)
    const id = crypto.randomUUID()
    const entry = {
      id, resource: operation.resource, method: operation.method,
      recordId: operation.recordId ?? null,
      payload: operation.payload ?? null,
      baseVersion: operation.baseVersion ?? null,
      createdAt: new Date().toISOString(),
      status: 'pending',
    }
    items.push(entry)
    localStorage.setItem(keyFor(accountId), JSON.stringify(items))
    return entry
  },
  markConflict(accountId, operationId, message) {
    const items = this.list(accountId)
    const index = items.findIndex(item => item.id === operationId)
    if (index < 0) return false
    items[index] = { ...items[index], status: 'conflict', error: String(message || 'Remote changes require review') }
    localStorage.setItem(keyFor(accountId), JSON.stringify(items))
    return true
  },
  // No background replay runs without an authenticated account and explicit caller.
  // Stop at the first ambiguous result; preserve the queue for manual recovery.
  async replay(accountId, api) {
    const accountKey = keyFor(accountId)
    if (replayingAccounts.has(accountKey)) return { acknowledged: 0, blocked: true, busy: true }
    replayingAccounts.add(accountKey)
    try {
    const items = this.list(accountId)
    const summary = { acknowledged: 0, blocked: false }
    for (const item of items) {
      if (item.status === 'conflict') { summary.blocked = true; break }
      const service = api[item.resource]
      if (!service) throw new Error('Unknown pending resource')
      try {
        if (item.method === 'POST') {
          // Stable IDs cannot prevent resurrection after a successful create
          // was subsequently deleted. Require a durable server replay ledger.
          this.markConflict(accountId, item.id, 'Create requires server replay history before safe retry')
          summary.blocked = true
          break
        } else if (item.method === 'PUT') {
          if (!item.baseVersion) {
            this.markConflict(accountId, item.id, 'Missing original server version; review before retrying')
            summary.blocked = true; break
          }
          await service.update(item.recordId, item.payload, { baseVersion: item.baseVersion })
        } else if (item.method === 'DELETE') {
          if (!item.baseVersion) { summary.blocked = true; break }
          await service.remove(item.recordId, { baseVersion: item.baseVersion })
        }
        this.acknowledge(accountId, item.id)
        summary.acknowledged += 1
      } catch (error) {
        if (error.status === 409 || error.status === 404 || error.status === 400) {
          this.markConflict(accountId, item.id, error.message)
        }
        summary.blocked = true
        break
      }
    }
    return summary
    } finally { replayingAccounts.delete(accountKey) }
  },
  // Overlay unsent changes on top of a fresh server snapshot. A pending
  // deletion stays hidden; a pending update remains visible until resolved.
  // Temporary creates use their operation ID as a stable local-only key.
  overlay(accountId, resource, serverItems) {
    if (!allowedResources.has(resource)) throw new Error('Unsupported pending resource')
    const items = new Map((serverItems || []).map(item => [String(item.id), item]))
    for (const op of this.list(accountId)) {
      if (op.resource !== resource) continue
      if (op.method === 'DELETE') items.delete(String(op.recordId))
      else if (op.method === 'PUT') {
        const existing = items.get(String(op.recordId))
        items.set(String(op.recordId), { ...(existing || {}), ...op.payload, id: op.recordId, pendingSync: true, syncConflict: op.status === 'conflict' || !existing })
      } else if (op.method === 'POST') {
        items.set('pending:' + op.id, { ...op.payload, id: 'pending:' + op.id, pendingSync: true, syncConflict: op.status === 'conflict' })
      }
    }
    return [...items.values()]
  },
  // Removal is permitted only after explicit server confirmation.
  acknowledge(accountId, operationId) {
    const items = this.list(accountId)
    if (!items.some(item => item.id === operationId)) return false
    localStorage.setItem(keyFor(accountId), JSON.stringify(items.filter(item => item.id !== operationId)))
    return true
  },
}
