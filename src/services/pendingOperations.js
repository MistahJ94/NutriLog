// Durable, account-scoped pending operations for future offline synchronization.
// This module is deliberately not wired into API writes until the server supports
// idempotent creates and version-checked updates. Never replay blindly.
const PREFIX = 'nutrilog-pending-operations-v1-'
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
  // Removal is permitted only after explicit server confirmation.
  acknowledge(accountId, operationId) {
    const items = this.list(accountId)
    if (!items.some(item => item.id === operationId)) return false
    localStorage.setItem(keyFor(accountId), JSON.stringify(items.filter(item => item.id !== operationId)))
    return true
  },
}
