// Durable, account-scoped pending operations for offline synchronization.
// The app must persist edits before invoking replay. Do not bypass version checks.
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
    // Avoid enqueuing writes against temporary local-only IDs. Such writes
    // require dependency resolution after the parent create is acknowledged.
    if (operation.recordId && String(operation.recordId).startsWith('pending:')) {
      throw new Error('Cannot queue changes to an unsynchronized record')
    }
    if (operation.method !== 'POST' && !operation.baseVersion) {
      throw new Error('A server record version is required for safe offline edits')
    }
    if (operation.method !== 'DELETE' && (!operation.payload || typeof operation.payload !== 'object' || Array.isArray(operation.payload))) {
      throw new Error('Pending write payload must be an object')
    }
    // Until dependency-aware coalescing is implemented, a second mutation
    // against the same server record could replay against a stale version.
    // Reject it rather than risking a partial or out-of-order update.
    if (operation.recordId && items.some(item =>
      item.resource === operation.resource &&
      String(item.recordId) === String(operation.recordId)
    )) {
      throw new Error('This record already has an unsynchronized change; sync or resolve it first')
    }
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
    if (replayingAccounts.has(accountKey)) return { acknowledged: 0, blocked: true, busy: true, results: [] }
    replayingAccounts.add(accountKey)
    try {
    const items = this.list(accountId)
    const summary = { acknowledged: 0, blocked: false, results: [] }
    for (const item of items) {
      if (item.status === 'conflict') { summary.blocked = true; break }
      if (!allowedResources.has(item.resource) || !allowedMethods.has(item.method) ||
          typeof item.id !== 'string' ||
          (item.method !== 'POST' && (!item.recordId || !item.baseVersion)) ||
          (item.method !== 'DELETE' && (!item.payload || typeof item.payload !== 'object' || Array.isArray(item.payload)))) {
        this.markConflict(accountId, item.id, 'Invalid queued operation; review local data before retrying')
        summary.blocked = true
        break
      }
      const service = api[item.resource]
      if (!service) throw new Error('Unknown pending resource')
      try {
        let response = null
        if (item.method === 'POST') {
          // The server records the operation ID and response atomically with
          // creation, and retains the receipt after the item is deleted.
          response = await service.create(item.payload, { operationId: item.id })
        } else if (item.method === 'PUT') {
          if (!item.baseVersion) {
            this.markConflict(accountId, item.id, 'Missing original server version; review before retrying')
            summary.blocked = true
            break
          }
          response = await service.update(item.recordId, item.payload, { baseVersion: item.baseVersion, operationId: item.id })
        } else if (item.method === 'DELETE') {
          if (!item.baseVersion) {
            this.markConflict(accountId, item.id, 'Missing original server version; review before retrying')
            summary.blocked = true
            break
          }
          response = await service.remove(item.recordId, { baseVersion: item.baseVersion, operationId: item.id })
        }
        this.acknowledge(accountId, item.id)
        summary.results.push({ operationId: item.id, resource: item.resource, method: item.method, recordId: item.recordId, deleted: response?.deleted === true, item: response?.item || null })
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
      if (op.method === 'DELETE') {
        // A rejected deletion is not a successful local delete. Keep the
        // server record visible and flagged so it can be reviewed.
        if (op.status === 'conflict') {
          const existing = items.get(String(op.recordId))
          if (existing) items.set(String(op.recordId), { ...existing, pendingSync: true, syncConflict: true })
        } else {
          items.delete(String(op.recordId))
        }
      }
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
