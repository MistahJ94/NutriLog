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


export const scaleNutrition = (item, quantity = 1) => {
  const multiplier = Number(quantity) || 1
  return {
    calories: Math.round((Number(item.calories) || 0) * multiplier * 100) / 100,
    protein: Math.round((Number(item.protein) || 0) * multiplier * 100) / 100,
    carbs: Math.round((Number(item.carbs) || 0) * multiplier * 100) / 100,
    fat: Math.round((Number(item.fat) || 0) * multiplier * 100) / 100,
    fiber: Math.round((Number(item.fiber) || 0) * multiplier * 100) / 100,
  }
}
