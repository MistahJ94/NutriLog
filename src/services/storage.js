const STORAGE_KEYS = {
  foods: 'savedFoods',
  meals: 'savedMeals',
  logs: 'logEntries',
  dailyGoal: 'dailyGoal',
  macroGoals: 'macroGoals',
}

const DEFAULT_MACRO_GOALS = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 65,
  fiber: 25,
}

const safeParse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

export const storage = {
  load() {
    const macroGoals = safeParse(localStorage.getItem(STORAGE_KEYS.macroGoals), null)
    const dailyGoal = Number.parseInt(localStorage.getItem(STORAGE_KEYS.dailyGoal), 10)

    return {
      savedFoods: safeParse(localStorage.getItem(STORAGE_KEYS.foods), []),
      savedMeals: safeParse(localStorage.getItem(STORAGE_KEYS.meals), []),
      logEntries: safeParse(localStorage.getItem(STORAGE_KEYS.logs), []),
      macroGoals: macroGoals || DEFAULT_MACRO_GOALS,
      dailyGoal: Number.isFinite(dailyGoal) ? dailyGoal : (macroGoals?.calories || DEFAULT_MACRO_GOALS.calories),
    }
  },

  save(key, value) {
    const storageKey = STORAGE_KEYS[key]
    if (!storageKey) throw new Error(`Unknown storage key: ${key}`)
    localStorage.setItem(storageKey, typeof value === 'string' ? value : JSON.stringify(value))
  },

  exportData(data) {
    return {
      version: '2.0',
      app: 'NutriLog',
      exportDate: new Date().toISOString(),
      data,
    }
  },

  importData(payload) {
    if (!payload || typeof payload !== 'object' || !payload.data) {
      throw new Error('Invalid NutriLog backup format')
    }
    return payload.data
  },
}

export { DEFAULT_MACRO_GOALS }
