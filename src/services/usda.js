const USDA_ENDPOINT = 'https://api.nal.usda.gov/fdc/v1/foods/search'

const getNutrient = (nutrients, nutrientId) => {
  const nutrient = nutrients.find(item => item.nutrientId === nutrientId)
  return nutrient ? Math.round(nutrient.value) : 0
}

export const searchUsdaFoods = async (query, apiKey = 'DEMO_KEY') => {
  if (!query?.trim()) return []

  const params = new URLSearchParams({
    api_key: apiKey,
    query: query.trim(),
    pageSize: '10',
  })

  const response = await fetch(`${USDA_ENDPOINT}?${params.toString()}`)
  if (!response.ok) throw new Error('USDA food search failed')

  const data = await response.json()
  return data.foods || []
}

export const mapUsdaFood = (food) => {
  const nutrients = food.foodNutrients || []

  return {
    name: food.description || '',
    calories: getNutrient(nutrients, 1008),
    protein: getNutrient(nutrients, 1003),
    carbs: getNutrient(nutrients, 1005),
    fat: getNutrient(nutrients, 1004),
    fiber: getNutrient(nutrients, 1079),
    servingSize: food.servingSize
      ? `${food.servingSize} ${food.servingSizeUnit || 'g'}`
      : '100g',
  }
}
