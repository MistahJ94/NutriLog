const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

const request = async (path, options = {}) => {
  const response = await fetch(API_BASE_URL + path, {
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'API request failed')
  return data
}

const json = (method, path, body) => request(path, {
  method,
  body: JSON.stringify(body),
})

export const api = {
  health: () => request('/health'),

  setup: () => request('/setup'),
  auth: {
    me: () => request('/auth/me'),
    register: (email, password) => json('POST', '/auth/register', { email, password }),
    login: (email, password) => json('POST', '/auth/login', { email, password }),
    setup: (email, password) => json('POST', '/auth/setup', { email, password }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    changePassword: (currentPassword, newPassword) => json('POST', '/auth/change-password', { currentPassword, newPassword }),
    revokeOtherSessions: () => json('POST', '/auth/revoke-other-sessions', {}),
    forgotPassword: email => json('POST', '/auth/forgot-password', { email }),
    resetPassword: (token, newPassword) => json('POST', '/auth/reset-password', { token, newPassword }),
  },

  admin: {
    users: () => request('/admin/users'),
    createUser: (email, password, role = 'user') => json('POST', '/admin/users', { email, password, role }),
    updateUser: (id, changes) => json('PUT', '/admin/users/' + id, changes),
    deleteUser: id => request('/admin/users/' + id, { method: 'DELETE' }),
    revokeSessions: id => request('/admin/users/' + id + '/sessions/revoke', { method: 'POST' }),
    resetPassword: (id, password) => json('POST', '/admin/users/' + id + '/password', { password }),
    smtp: () => request('/admin/smtp'),
    saveSmtp: settings => json('PUT', '/admin/smtp', settings),
    testSmtp: settings => json('POST', '/admin/smtp/test', settings),
  },

  goals: {
    get: () => request('/goals'),
    save: goals => json('PUT', '/goals', goals),
  },

  foods: {
    list: () => request('/foods'),
    create: food => json('POST', '/foods', {
      name: food.name,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      serving_size: food.servingSize,
      serving_amount: food.servingAmount,
      serving_unit: food.servingUnit,
      source: food.source || 'custom',
    }),
    remove: id => request('/foods/' + id, { method: 'DELETE' }),
  },

  meals: {
    list: () => request('/meals'),
    create: meal => json('POST', '/meals', meal),
    remove: id => request('/meals/' + id, { method: 'DELETE' }),
  },

  sync: {
    replace: data => json('PUT', '/sync', data),
  },

  logs: {
    list: () => request('/log-entries'),
    create: entry => json('POST', '/log-entries', {
      entry_type: entry.type,
      name: entry.name,
      calories: entry.calories,
      protein: entry.protein,
      carbs: entry.carbs,
      fat: entry.fat,
      fiber: entry.fiber || 0,
      foods: entry.foods || [],
      quantity: entry.quantity || 1,
      consumed_at: entry.timestamp,
    }),
    remove: id => request('/log-entries/' + id, { method: 'DELETE' }),
  },
}

export const normalizeServerData = ({ goals, foods, meals, logs }) => ({
  macroGoals: goals ? {
    calories: Number(goals.calories),
    protein: Number(goals.protein),
    carbs: Number(goals.carbs),
    fat: Number(goals.fat),
    fiber: Number(goals.fiber),
  } : null,
  savedFoods: (foods || []).map(food => ({
    id: food.id,
    name: food.name,
    calories: Number(food.calories),
    protein: Number(food.protein),
    carbs: Number(food.carbs),
    fat: Number(food.fat),
    fiber: Number(food.fiber),
    servingSize: food.serving_size,
    servingAmount: Number(food.serving_amount || 1),
    servingUnit: food.serving_unit || 'serving',
    source: food.source,
  })),
  savedMeals: (meals || []).map(meal => ({
    id: meal.id,
    name: meal.name,
    calories: Number(meal.calories),
    protein: Number(meal.protein),
    carbs: Number(meal.carbs),
    fat: Number(meal.fat),
    fiber: Number(meal.fiber),
    foods: Array.isArray(meal.foods) ? meal.foods : [],
  })),
  logEntries: (logs || []).map(entry => ({
    id: entry.id,
    type: entry.entry_type,
    name: entry.name,
    calories: Number(entry.calories),
    protein: Number(entry.protein),
    carbs: Number(entry.carbs),
    fat: Number(entry.fat),
    fiber: Number(entry.fiber),
    quantity: Number(entry.quantity || 1),
    foods: Array.isArray(entry.foods) ? entry.foods : [],
    timestamp: entry.consumed_at,
  })),
})
