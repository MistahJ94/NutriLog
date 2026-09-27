import { useEffect, useState } from 'react'
import { api } from './services'

const blankGoals = { calories: 2000, protein: 150, carbs: 200, fat: 65, fiber: 25 }

const AuthScreen = ({ onAuthenticated }) => {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = mode === 'login'
        ? await api.auth.login(email, password)
        : await api.auth.register(email, password)
      await onAuthenticated(result.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">🥗</div>
        <h1>NutriLog</h1>
        <p>{mode === 'login' ? 'Sign in to your nutrition tracker' : 'Create your NutriLog account'}</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}</button>
        </form>
        <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

const loadServerData = async userId => {
  const local = (() => {
    try {
      return {
        foods: JSON.parse(localStorage.getItem('savedFoods') || '[]'),
        meals: JSON.parse(localStorage.getItem('savedMeals') || '[]'),
        logs: JSON.parse(localStorage.getItem('logEntries') || '[]'),
        goals: JSON.parse(localStorage.getItem('macroGoals') || 'null') || blankGoals,
      }
    } catch {
      return { foods: [], meals: [], logs: [], goals: blankGoals }
    }
  })()

  const [goalsResult, foodsResult, mealsResult, logsResult] = await Promise.all([
    api.goals.get(),
    api.foods.list(),
    api.meals.list(),
    api.logs.list(),
  ])

  const emptyServer = !goalsResult.goals && !foodsResult.items.length && !mealsResult.items.length && !logsResult.items.length
  const localOwner = localStorage.getItem('nutrilog_owner_id')
  const canMigrateLegacyData = !localOwner && (local.foods.length || local.meals.length || local.logs.length)

  if (emptyServer && canMigrateLegacyData) {
    await api.sync.replace({ goals: local.goals, foods: local.foods, meals: local.meals, logs: local.logs })
    localStorage.setItem('nutrilog_owner_id', userId)
    return loadServerData(userId)
  }

  localStorage.setItem('nutrilog_owner_id', userId)
  return {
    goals: goalsResult.goals || blankGoals,
    foods: foodsResult.items,
    meals: mealsResult.items,
    logs: logsResult.items,
  }
}

export default function AuthGate({ App }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState(null)

  const authenticated = async currentUser => {
    const serverData = await loadServerData(currentUser.id)
    setData(serverData)
    setUser(currentUser)
    setReady(true)
  }

  useEffect(() => {
    api.auth.me()
      .then(async result => {
        if (result.user) await authenticated(result.user)
        else setReady(true)
      })
      .catch(() => setReady(true))
  }, [])

  if (!ready) return <div className="auth-loading">Loading NutriLog…</div>
  if (!user) return <AuthScreen onAuthenticated={authenticated} />
  return <App user={user} initialServerData={data} onLogout={async () => { await api.auth.logout(); ['savedFoods','savedMeals','logEntries','dailyGoal','macroGoals'].forEach(key => localStorage.removeItem(key)); setUser(null); setData(null) }} />
}
