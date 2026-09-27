export const calculateMealTotals = (foods = []) =>
  foods.reduce((totals, food) => ({
    calories: totals.calories + (food.calories * food.quantity),
    protein: totals.protein + (food.protein * food.quantity),
    carbs: totals.carbs + (food.carbs * food.quantity),
    fat: totals.fat + (food.fat * food.quantity),
    fiber: totals.fiber + ((food.fiber || 0) * food.quantity),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })

export const calculateTotals = (entries = []) =>
  entries.reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
    carbs: totals.carbs + entry.carbs,
    fat: totals.fat + entry.fat,
    fiber: totals.fiber + (entry.fiber || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
