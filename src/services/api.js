const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:')
const getServerUrl = () => String(localStorage.getItem('nutrilog-server-url') || '').trim().replace(/\/$/, '')
export const getConfiguredServerUrl = () => getServerUrl()
export const setConfiguredServerUrl = value => localStorage.setItem('nutrilog-server-url', String(value || '').trim().replace(/\/$/, ''))
export const clearConfiguredServerUrl = () => localStorage.removeItem('nutrilog-server-url')
export const isNutriLogNative = isNativeApp

const getApiBaseUrl = () => {
  const configured = getServerUrl()
  return configured ? configured + '/api' : '/api'
}

const request = async (path, options = {}) => {
  const token = localStorage.getItem('nutrilog-session-token')
  const response = await fetch(getApiBaseUrl() + path, {
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token && isNativeApp() ? { Authorization: 'Bearer ' + token } : {}),
      ...(isNativeApp() ? { 'X-NutriLog-Client': 'capacitor' } : {}),
      ...options.headers,
    },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'API request failed')
  return data
}
const json = (method, path, body) => request(path, { method, body: JSON.stringify(body) })

export const api = {
  health: () => request('/health'),
  setup: () => request('/setup'),
  auth: {
    me: () => request('/auth/me'),
    register: async (email, password) => { const result = await json('POST', '/auth/register', { email, password }); if (result.token && isNativeApp()) localStorage.setItem('nutrilog-session-token', result.token); return result },
    login: async (email, password) => { const result = await json('POST', '/auth/login', { email, password }); if (result.token && isNativeApp()) localStorage.setItem('nutrilog-session-token', result.token); return result },
    setup: async (email, password) => { const result = await json('POST', '/auth/setup', { email, password }); if (result.token && isNativeApp()) localStorage.setItem('nutrilog-session-token', result.token); return result },
    logout: async () => { try { return await request('/auth/logout', { method: 'POST' }) } finally { localStorage.removeItem('nutrilog-session-token') } },
    changePassword: (currentPassword, newPassword) => json('POST', '/auth/change-password', { currentPassword, newPassword }),
    revokeOtherSessions: () => json('POST', '/auth/revoke-other-sessions', {}),
    forgotPassword: email => json('POST', '/auth/forgot-password', { email }),
    resetPassword: (token, newPassword) => json('POST', '/auth/reset-password', { token, newPassword }),
  },
  admin: {
    users: () => request('/admin/users'), createUser: (email, password, role = 'user') => json('POST', '/admin/users', { email, password, role }), updateUser: (id, changes) => json('PUT', '/admin/users/' + id, changes), deleteUser: id => request('/admin/users/' + id, { method: 'DELETE' }), revokeSessions: id => request('/admin/users/' + id + '/sessions/revoke', { method: 'POST' }), resetPassword: (id, password) => json('POST', '/admin/users/' + id + '/password', { password }), smtp: () => request('/admin/smtp'), saveSmtp: settings => json('PUT', '/admin/smtp', settings), testSmtp: settings => json('POST', '/admin/smtp/test', settings), disableSmtp: () => request('/admin/smtp', { method: 'DELETE' }),
  },
  preferences: { get: () => request('/preferences'), save: preferences => json('PUT', '/preferences', preferences) },
  health: { get: () => request('/health-profile'), save: profile => json('PUT', '/health-profile', profile) },
  activities: { list: () => request('/activities'), create: activity => json('POST', '/activities', activity), remove: id => request('/activities/' + id, { method: 'DELETE' }) },
  weight: { list: () => request('/weight'), create: entry => json('POST', '/weight', entry), remove: id => request('/weight/' + id, { method: 'DELETE' }) },
  goals: { get: () => request('/goals'), save: goals => json('PUT', '/goals', goals) },
  foods: {
    list: () => request('/foods'),
    create: food => json('POST', '/foods', { name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, fiber: food.fiber, serving_size: food.servingSize, serving_amount: food.servingAmount, serving_unit: food.servingUnit, source: food.source || 'custom' }),
    update: (id, food) => json('PUT', '/foods/' + id, { name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, fiber: food.fiber, serving_size: food.servingSize, serving_amount: food.servingAmount, serving_unit: food.servingUnit, source: food.source || 'custom' }),
    remove: id => request('/foods/' + id, { method: 'DELETE' }),
  },
  meals: { list: () => request('/meals'), create: meal => json('POST', '/meals', meal), remove: id => request('/meals/' + id, { method: 'DELETE' }) },
  sync: { replace: data => json('PUT', '/sync', data) },
  logs: { list: () => request('/log-entries'), create: entry => json('POST', '/log-entries', { entry_type: entry.type, name: entry.name, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, fiber: entry.fiber || 0, foods: entry.foods || [], quantity: entry.quantity || 1, consumed_at: entry.timestamp }), remove: id => request('/log-entries/' + id, { method: 'DELETE' }) },
}

export const normalizeServerData = ({ goals, foods, meals, logs }) => ({
  macroGoals: goals ? { calories: Number(goals.calories), protein: Number(goals.protein), carbs: Number(goals.carbs), fat: Number(goals.fat), fiber: Number(goals.fiber) } : null,
  savedFoods: (foods || []).map(food => ({ id: food.id, name: food.name, calories: Number(food.calories), protein: Number(food.protein), carbs: Number(food.carbs), fat: Number(food.fat), fiber: Number(food.fiber), servingSize: food.serving_size, servingAmount: Number(food.serving_amount || 1), servingUnit: food.serving_unit || 'serving', source: food.source })),
  savedMeals: (meals || []).map(meal => ({ id: meal.id, name: meal.name, calories: Number(meal.calories), protein: Number(meal.protein), carbs: Number(meal.carbs), fat: Number(meal.fat), fiber: Number(meal.fiber), foods: Array.isArray(meal.foods) ? meal.foods : [] })),
  logEntries: (logs || []).map(entry => ({ id: entry.id, type: entry.entry_type, name: entry.name, calories: Number(entry.calories), protein: Number(entry.protein), carbs: Number(entry.carbs), fat: Number(entry.fat), fiber: Number(entry.fiber), quantity: Number(entry.quantity || 1), foods: Array.isArray(entry.foods) ? entry.foods : [], timestamp: entry.consumed_at })),
})
