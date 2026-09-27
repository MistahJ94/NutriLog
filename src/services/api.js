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

  auth: {
    me: () => request('/auth/me'),
    register: (email, password) => json('POST', '/auth/register', { email, password }),
    login: (email, password) => json('POST', '/auth/login', { email, password }),
    logout: () => request('/auth/logout', { method: 'POST' }),
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
    foods: Array.isArray(entry.foods) ? entry.foods : [],
    timestamp: entry.consumed_at,
  })),
})
