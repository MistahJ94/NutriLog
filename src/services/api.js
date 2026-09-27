const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

const request = async (path, options = {}) => {
  const response = await fetch(API_BASE_URL + path, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'API request failed')
  return data
}

export const api = { health: () => request('/health') }
