const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:')
const normalizeServerUrl = value => String(value || '').trim().replace(/\/+$/, '').replace(/\/api$/i, '')
const getServerUrl = () => normalizeServerUrl(localStorage.getItem('nutrilog-server-url') || '')
export const getConfiguredServerUrl = () => getServerUrl()
export const setConfiguredServerUrl = value => localStorage.setItem('nutrilog-server-url', normalizeServerUrl(value))
export const clearConfiguredServerUrl = () => localStorage.removeItem('nutrilog-server-url')
export const isNutriLogNative = isNativeApp

const getApiBaseUrl = () => {
  const configured = getServerUrl()
  return configured ? configured + '/api' : '/api'
}

const request = async (path, options = {}) => {
  const token = localStorage.getItem('nutrilog-session-token')
  const url = getApiBaseUrl() + path
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token && isNativeApp() ? { Authorization: 'Bearer ' + token } : {}),
    ...(isNativeApp() ? { 'X-NutriLog-Client': 'capacitor' } : {}),
    ...options.headers,
  }

  if (isNativeApp()) {
    console.info('[NutriLog API] Request:', options.method || 'GET', url)
  }

  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers,
  })
  const data = await response.json().catch(() => ({}))

  if (isNativeApp()) {
    console.info('[NutriLog API] Response:', response.status, url, data)
  }

  if (!response.ok) throw new Error(data.error || 'API request failed')
  return data
}

const json = (method, path, body) => request(path, { method, body: JSON.stringify(body) })

const offlineEnabled = () => localStorage.getItem('nutrilog-offline-mode') === 'true'
export const isOfflineMode = offlineEnabled
export const setOfflineMode = enabled => {
  if (enabled) localStorage.setItem('nutrilog-offline-mode', 'true')
  else localStorage.removeItem('nutrilog-offline-mode')
}

const localJson = (key, fallback = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) } catch { return fallback }
}
const saveLocalJson = (key, value) => localStorage.setItem(key, JSON.stringify(value))
const localId = prefix => prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
const offlineUser = () => ({ id: 'offline-user', email: 'offline@local', role: 'user', is_active: true })

const offlineApi = {
  setup: async () => ({ setupRequired: false }),
  auth: {
    me: async () => ({ user: offlineUser() }),
    register: async () => ({ user: offlineUser() }),
    login: async () => ({ user: offlineUser() }),
    setup: async () => ({ user: offlineUser() }),
    logout: async () => ({ ok: true }),
    changePassword: async () => ({ ok: true }),
    revokeOtherSessions: async () => ({ ok: true }),
    forgotPassword: async () => ({ message: 'Password recovery is unavailable in offline mode.' }),
    resetPassword: async () => ({ ok: true }),
  },
  admin: {
    users: async () => ({ users: [] }),
    createUser: async () => { throw new Error('Account management requires a NutriLog server.') },
    updateUser: async () => { throw new Error('Account management requires a NutriLog server.') },
    deleteUser: async () => { throw new Error('Account management requires a NutriLog server.') },
    revokeSessions: async () => { throw new Error('Account management requires a NutriLog server.') },
    resetPassword: async () => { throw new Error('Account management requires a NutriLog server.') },
    smtp: async () => ({ settings: null, configured: false }),
    saveSmtp: async () => { throw new Error('Email settings require a NutriLog server.') },
    testSmtp: async () => { throw new Error('Email settings require a NutriLog server.') },
    disableSmtp: async () => ({ ok: true }),
  },
  connections: {
    list: async () => ({ connections: localJson('nutrilog-offline-connections', []) }),
    invite: async email => { throw new Error('Connections require a NutriLog server.') },
    accept: async () => { throw new Error('Connections require a NutriLog server.') },
    decline: async () => { throw new Error('Connections require a NutriLog server.') },
    remove: async () => { throw new Error('Connections require a NutriLog server.') },
  },
  sharing: {
    get: async () => ({ sharing: localJson('nutrilog-offline-sharing', { shareCalories: false, shareMacros: false, shareWeight: false, shareWeightHistory: false, shareActivity: false, shareGoals: false, shareCharts: false }) }),
    save: async sharing => { saveLocalJson('nutrilog-offline-sharing', sharing); return { sharing } },
    progress: async () => { throw new Error('Shared progress requires a NutriLog server.') },
  },
  preferences: {
    get: async () => ({ preferences: localJson('nutrilog-offline-preferences', null) }),
    save: async preferences => { saveLocalJson('nutrilog-offline-preferences', preferences); return { preferences } },
  },
  healthProfile: {
    get: async () => ({ profile: localJson('nutrilog-offline-health-profile', null) }),
    save: async profile => { saveLocalJson('nutrilog-offline-health-profile', profile); return { profile } },
  },
  activities: {
    list: async () => ({ items: localJson('nutrilog-offline-activities', []) }),
    create: async activity => {
      const item = { ...activity, id: activity.id || localId('activity') }
      const items = localJson('nutrilog-offline-activities', [])
      items.unshift(item); saveLocalJson('nutrilog-offline-activities', items); return { item }
    },
    remove: async id => {
      saveLocalJson('nutrilog-offline-activities', localJson('nutrilog-offline-activities', []).filter(item => item.id !== id)); return { ok: true }
    },
  },
  weight: {
    list: async () => ({ items: localJson('nutrilog-offline-weight', []) }),
    create: async entry => {
      const item = { ...entry, id: entry.id || localId('weight') }
      const items = localJson('nutrilog-offline-weight', [])
      items.unshift(item); saveLocalJson('nutrilog-offline-weight', items); return { item }
    },
    remove: async id => {
      saveLocalJson('nutrilog-offline-weight', localJson('nutrilog-offline-weight', []).filter(item => item.id !== id)); return { ok: true }
    },
  },
  goals: {
    get: async () => ({ goals: localJson('nutrilog-offline-goals', null) }),
    save: async goals => { saveLocalJson('nutrilog-offline-goals', goals); return { goals } },
  },
  foods: {
    list: async () => ({ items: localJson('savedFoods', []) }),
    create: async food => {
      const item = { ...food, id: food.id || localId('food'), source: food.source || 'custom', servingSize: food.servingSize || ((food.servingAmount || 1) + ' ' + (food.servingUnit || 'serving')) }
      const items = localJson('savedFoods', []); items.unshift(item); saveLocalJson('savedFoods', items); return { item }
    },
    update: async (id, food) => {
      const items = localJson('savedFoods', [])
      const item = { ...food, id, source: food.source || 'custom', servingSize: food.servingSize || ((food.servingAmount || 1) + ' ' + (food.servingUnit || 'serving')) }
      saveLocalJson('savedFoods', items.map(existing => existing.id === id ? item : existing)); return { item }
    },
    remove: async id => { saveLocalJson('savedFoods', localJson('savedFoods', []).filter(item => item.id !== id)); return { ok: true } },
  },
  meals: {
    list: async () => ({ items: localJson('savedMeals', []) }),
    create: async meal => {
      const item = { ...meal, id: meal.id || localId('meal') }
      const items = localJson('savedMeals', []); items.unshift(item); saveLocalJson('savedMeals', items); return { item }
    },
    update: async (id, meal) => {
      const item = { ...meal, id }
      saveLocalJson('savedMeals', localJson('savedMeals', []).map(existing => existing.id === id ? item : existing)); return { item }
    },
    remove: async id => { saveLocalJson('savedMeals', localJson('savedMeals', []).filter(item => item.id !== id)); return { ok: true } },
  },
  sync: {
    replace: async data => {
      if (data.foods) saveLocalJson('savedFoods', data.foods)
      if (data.meals) saveLocalJson('savedMeals', data.meals)
      if (data.logs) saveLocalJson('logEntries', data.logs)
      if (data.goals) saveLocalJson('macroGoals', data.goals)
      return { ok: true }
    },
  },
  logs: {
    list: async () => ({ items: localJson('logEntries', []) }),
    create: async entry => {
      const item = { ...entry, id: entry.id || localId('log'), type: entry.type || entry.entry_type, timestamp: entry.timestamp || entry.consumed_at }
      const items = localJson('logEntries', []); items.unshift(item); saveLocalJson('logEntries', items); return { item }
    },
    update: async (id, entry) => {
      const item = { ...entry, id, type: entry.type || entry.entry_type, timestamp: entry.timestamp || entry.consumed_at }
      saveLocalJson('logEntries', localJson('logEntries', []).map(existing => existing.id === id ? item : existing)); return { item }
    },
    remove: async id => { saveLocalJson('logEntries', localJson('logEntries', []).filter(item => item.id !== id)); return { ok: true } },
  },
}

export const api = {
  health: () => offlineEnabled() ? Promise.resolve({ ok: true, service: 'nutrilog-offline' }) : request('/health'),
  setup: () => offlineEnabled() ? offlineApi.setup() : request('/setup'),
  auth: {
    me: () => offlineEnabled() ? offlineApi.auth.me() : request('/auth/me'),
    register: async (email, password) => offlineEnabled() ? offlineApi.auth.register(email, password) : (async () => { const result = await json('POST', '/auth/register', { email, password }); if (result.token && isNativeApp()) localStorage.setItem('nutrilog-session-token', result.token); return result })(),
    login: async (email, password) => offlineEnabled() ? offlineApi.auth.login(email, password) : (async () => { const result = await json('POST', '/auth/login', { email, password }); if (result.token && isNativeApp()) localStorage.setItem('nutrilog-session-token', result.token); return result })(),
    setup: async (email, password) => offlineEnabled() ? offlineApi.auth.setup(email, password) : (async () => { const result = await json('POST', '/auth/setup', { email, password }); if (result.token && isNativeApp()) localStorage.setItem('nutrilog-session-token', result.token); return result })(),
    logout: async () => { if (offlineEnabled()) return offlineApi.auth.logout(); try { return await request('/auth/logout', { method: 'POST' }) } finally { localStorage.removeItem('nutrilog-session-token') } },
    changePassword: (currentPassword, newPassword) => offlineEnabled() ? offlineApi.auth.changePassword(currentPassword, newPassword) : json('POST', '/auth/change-password', { currentPassword, newPassword }),
    revokeOtherSessions: () => offlineEnabled() ? offlineApi.auth.revokeOtherSessions() : json('POST', '/auth/revoke-other-sessions', {}),
    forgotPassword: email => offlineEnabled() ? offlineApi.auth.forgotPassword(email) : json('POST', '/auth/forgot-password', { email }),
    resetPassword: (token, newPassword) => offlineEnabled() ? offlineApi.auth.resetPassword(token, newPassword) : json('POST', '/auth/reset-password', { token, newPassword }),
  },
  admin: {
    users: (...args) => offlineEnabled() ? offlineApi.admin.users(...args) : request('/admin/users'),
    createUser: (...args) => offlineEnabled() ? offlineApi.admin.createUser(...args) : json('POST', '/admin/users', { email: args[0], password: args[1], role: args[2] || 'user' }),
    updateUser: (...args) => offlineEnabled() ? offlineApi.admin.updateUser(...args) : json('PUT', '/admin/users/' + args[0], args[1]),
    deleteUser: id => offlineEnabled() ? offlineApi.admin.deleteUser(id) : request('/admin/users/' + id, { method: 'DELETE' }),
    revokeSessions: id => offlineEnabled() ? offlineApi.admin.revokeSessions(id) : request('/admin/users/' + id + '/sessions/revoke', { method: 'POST' }),
    resetPassword: (id, password) => offlineEnabled() ? offlineApi.admin.resetPassword(id, password) : json('POST', '/admin/users/' + id + '/password', { password }),
    smtp: () => offlineEnabled() ? offlineApi.admin.smtp() : request('/admin/smtp'),
    saveSmtp: settings => offlineEnabled() ? offlineApi.admin.saveSmtp(settings) : json('PUT', '/admin/smtp', settings),
    testSmtp: settings => offlineEnabled() ? offlineApi.admin.testSmtp(settings) : json('POST', '/admin/smtp/test', settings),
    disableSmtp: () => offlineEnabled() ? offlineApi.admin.disableSmtp() : request('/admin/smtp', { method: 'DELETE' }),
  },
  connections: {
    list: () => offlineEnabled() ? offlineApi.connections.list() : request('/connections'),
    invite: email => offlineEnabled() ? offlineApi.connections.invite(email) : json('POST', '/connections/invite', { email }),
    accept: id => offlineEnabled() ? offlineApi.connections.accept(id) : json('POST', '/connections/' + id + '/accept', {}),
    decline: id => offlineEnabled() ? offlineApi.connections.decline(id) : json('POST', '/connections/' + id + '/decline', {}),
    remove: id => offlineEnabled() ? offlineApi.connections.remove(id) : request('/connections/' + id, { method: 'DELETE' }),
  },
  sharing: {
    get: () => offlineEnabled() ? offlineApi.sharing.get() : request('/progress/sharing'),
    save: sharing => offlineEnabled() ? offlineApi.sharing.save(sharing) : json('PUT', '/progress/sharing', sharing),
    progress: id => offlineEnabled() ? offlineApi.sharing.progress(id) : request('/progress/' + id),
  },
  preferences: {
    get: () => offlineEnabled() ? offlineApi.preferences.get() : request('/preferences'),
    save: preferences => offlineEnabled() ? offlineApi.preferences.save(preferences) : json('PUT', '/preferences', preferences),
  },
  healthProfile: {
    get: () => offlineEnabled() ? offlineApi.healthProfile.get() : request('/health-profile'),
    save: profile => offlineEnabled() ? offlineApi.healthProfile.save(profile) : json('PUT', '/health-profile', profile),
  },
  activities: {
    list: () => offlineEnabled() ? offlineApi.activities.list() : request('/activities'),
    create: activity => offlineEnabled() ? offlineApi.activities.create(activity) : json('POST', '/activities', activity),
    remove: id => offlineEnabled() ? offlineApi.activities.remove(id) : request('/activities/' + id, { method: 'DELETE' }),
  },
  weight: {
    list: () => offlineEnabled() ? offlineApi.weight.list() : request('/weight'),
    create: entry => offlineEnabled() ? offlineApi.weight.create(entry) : json('POST', '/weight', entry),
    remove: id => offlineEnabled() ? offlineApi.weight.remove(id) : request('/weight/' + id, { method: 'DELETE' }),
  },
  goals: {
    get: () => offlineEnabled() ? offlineApi.goals.get() : request('/goals'),
    save: goals => offlineEnabled() ? offlineApi.goals.save(goals) : json('PUT', '/goals', goals),
  },
  foods: {
    list: () => offlineEnabled() ? offlineApi.foods.list() : request('/foods'),
    create: food => offlineEnabled() ? offlineApi.foods.create(food) : json('POST', '/foods', { name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, fiber: food.fiber, serving_size: food.servingSize, serving_amount: food.servingAmount, serving_unit: food.servingUnit, source: food.source || 'custom' }),
    update: (id, food) => offlineEnabled() ? offlineApi.foods.update(id, food) : json('PUT', '/foods/' + id, { name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, fiber: food.fiber, serving_size: food.servingSize, serving_amount: food.servingAmount, serving_unit: food.servingUnit, source: food.source || 'custom' }),
    remove: id => offlineEnabled() ? offlineApi.foods.remove(id) : request('/foods/' + id, { method: 'DELETE' }),
  },
  meals: {
    list: () => offlineEnabled() ? offlineApi.meals.list() : request('/meals'),
    create: meal => offlineEnabled() ? offlineApi.meals.create(meal) : json('POST', '/meals', meal),
    update: (id, meal) => offlineEnabled() ? offlineApi.meals.update(id, meal) : json('PUT', '/meals/' + id, meal),
    remove: id => offlineEnabled() ? offlineApi.meals.remove(id) : request('/meals/' + id, { method: 'DELETE' }),
  },
  sync: {
    replace: data => offlineEnabled() ? offlineApi.sync.replace(data) : json('PUT', '/sync', data),
  },
  logs: {
    list: () => offlineEnabled() ? offlineApi.logs.list() : request('/log-entries'),
    create: entry => offlineEnabled() ? offlineApi.logs.create(entry) : json('POST', '/log-entries', { entry_type: entry.type, name: entry.name, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, fiber: entry.fiber || 0, foods: entry.foods || [], quantity: entry.quantity || 1, consumed_at: entry.timestamp }),
    update: (id, entry) => offlineEnabled() ? offlineApi.logs.update(id, entry) : json('PUT', '/log-entries/' + id, { entry_type: entry.type, name: entry.name, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, fiber: entry.fiber || 0, foods: entry.foods || [], quantity: entry.quantity || 1, consumed_at: entry.timestamp }),
    remove: id => offlineEnabled() ? offlineApi.logs.remove(id) : request('/log-entries/' + id, { method: 'DELETE' }),
  },
}


export const normalizeServerData = ({ goals, foods, meals, logs }) => ({
  macroGoals: goals ? { calories: Number(goals.calories), protein: Number(goals.protein), carbs: Number(goals.carbs), fat: Number(goals.fat), fiber: Number(goals.fiber) } : null,
  savedFoods: (foods || []).map(food => ({ id: food.id, name: food.name, calories: Number(food.calories), protein: Number(food.protein), carbs: Number(food.carbs), fat: Number(food.fat), fiber: Number(food.fiber), servingSize: food.serving_size, servingAmount: Number(food.serving_amount || 1), servingUnit: food.serving_unit || 'serving', source: food.source })),
  savedMeals: (meals || []).map(meal => ({ id: meal.id, name: meal.name, calories: Number(meal.calories), protein: Number(meal.protein), carbs: Number(meal.carbs), fat: Number(meal.fat), fiber: Number(meal.fiber), foods: Array.isArray(meal.foods) ? meal.foods : [] })),
  logEntries: (logs || []).map(entry => ({ id: entry.id, type: entry.entry_type, name: entry.name, calories: Number(entry.calories), protein: Number(entry.protein), carbs: Number(entry.carbs), fat: Number(entry.fat), fiber: Number(entry.fiber), quantity: Number(entry.quantity || 1), foods: Array.isArray(entry.foods) ? entry.foods : [], timestamp: entry.consumed_at })),
})
