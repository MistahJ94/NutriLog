import { useEffect, useState } from 'react'
import { api, getConfiguredServerUrl, setConfiguredServerUrl, clearConfiguredServerUrl, isNutriLogNative, isOfflineMode, setOfflineMode } from './services'

const blankGoals = { calories: 2000, protein: 150, carbs: 200, fat: 65, fiber: 25 }
const ModeChoiceScreen = ({ onOffline, onServer }) => (
  <div className="auth-screen">
    <div className="auth-card">
      <div className="auth-logo">🥗</div>
      <h1>NutriLog</h1>
      <p>Choose how you want to use NutriLog on this device.</p>
      <button className="btn btn-primary" type="button" onClick={onOffline}>Use Offline</button>
      <button className="btn btn-secondary" type="button" style={{ marginTop: 12, width: '100%' }} onClick={onServer}>Connect to a Server</button>
      <p style={{ marginTop: 14, fontSize: '0.85rem', opacity: 0.75 }}>
        Offline mode stores your NutriLog data on this device. A server is required for accounts and syncing between devices.
      </p>
    </div>
  </div>
)

const ServerConnectionScreen = ({ onConnected }) => {
  const [serverUrl, setServerUrl] = useState(getConfiguredServerUrl())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const connect = async event => {
    event.preventDefault()
    const value = serverUrl.trim().replace(/\/$/, '')
    if (!/^https?:\/\//i.test(value)) return setError('Enter a complete server URL beginning with https://')
    if (isNutriLogNative() && !/^https:\/\//i.test(value)) return setError('The Android app requires an HTTPS server URL.')
    setBusy(true); setError('')
    try {
      const response = await fetch(value + '/api/health', {
        method: 'GET',
        headers: { 'X-NutriLog-Client': 'capacitor' },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok || result.service !== 'nutrilog-api') {
        throw new Error(result.error || 'The server responded, but it is not a compatible NutriLog server.')
      }
      setConfiguredServerUrl(value)
      onConnected()
    } catch (err) {
      clearConfiguredServerUrl()
      setError(err?.message || 'Could not connect to that server.')
    } finally { setBusy(false) }
  }
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">🥗</div>
        <h1>Connect to NutriLog</h1>
        <p>Enter the address of the NutriLog server you want to use.</p>
        <form onSubmit={connect}>
          <label>Server URL<input type="url" value={serverUrl} onChange={e => setServerUrl(e.target.value)} placeholder="https://nutrilog.example.com" required autoCapitalize="none" autoCorrect="off" /></label>
          <p style={{ marginTop: -4, fontSize: '0.85rem', opacity: 0.75 }}>Example only: https://nutrilog.example.com</p>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Testing connection…' : 'Connect'}</button>
        </form>
      </div>
    </div>
  )
}


const AuthScreen = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [forgot, setForgot] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.auth.login(email, password)
      await onAuthenticated(result.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const requestReset = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api.auth.forgotPassword(email)
      setMessage(result.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (forgot) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo">🥗</div>
          <h1>Reset Password</h1>
          <p>Enter your account email to request a password reset.</p>
          <form onSubmit={requestReset}>
            <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
            {error && <div className="auth-error">{error}</div>}
            {message && <div className="auth-message">{message}</div>}
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : 'Send Reset Link'}</button>
          </form>
          <button className="btn btn-secondary" style={{ marginTop: 12, width: '100%' }} onClick={() => { setForgot(false); setError(''); setMessage('') }}>Back to Sign In</button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">🥗</div>
        <h1>NutriLog</h1>
        <p>Sign in to your nutrition tracker</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="current-password" /></label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Please wait…' : 'Sign In'}</button>
        </form>
        <button type="button" className="auth-link" onClick={() => { setForgot(true); setError(''); setMessage('') }}>Forgot password?</button>
      </div>
    </div>
  )
}

const OfflineStartScreen = ({ onStart }) => (
  <div className="auth-screen">
    <div className="auth-card">
      <div className="auth-logo">🥗</div>
      <h1>Offline Mode</h1>
      <p>No server is required. Your foods, meals, goals, and food log will be stored on this device.</p>
      <button className="btn btn-primary" type="button" onClick={onStart}>Start NutriLog Offline</button>
      <p style={{ marginTop: 14, fontSize: '0.85rem', opacity: 0.75 }}>
        Offline data does not automatically sync to another device.
      </p>
    </div>
  </div>
)

const ResetPasswordScreen = ({ token }) => {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const submit = async event => {
    event.preventDefault()
    if (password !== confirm) return setError('Passwords do not match')
    setBusy(true)
    setError('')
    try {
      await api.auth.resetPassword(token, password)
      setDone(true)
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
        <h1>Set New Password</h1>
        {done ? (
          <>
            <p>Your password has been reset. You can now sign in.</p>
            <button className="btn btn-primary" onClick={() => { window.location.href = window.location.pathname }}>Back to Sign In</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>New Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" /></label>
            <label>Confirm Password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" /></label>
            {error && <div className="auth-error">{error}</div>}
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Resetting…' : 'Reset Password'}</button>
          </form>
        )}
      </div>
    </div>
  )
}

const SetupScreen = ({ onAuthenticated }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async event => {
    event.preventDefault()
    if (password !== confirm) return setError('Passwords do not match')
    setBusy(true)
    setError('')
    try {
      const result = await api.auth.setup(email, password)
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
        <h1>NutriLog Setup</h1>
        <p>Create the first administrator account. This setup is only available while no users exist.</p>
        <form onSubmit={submit}>
          <label>Administrator Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
          <label>Confirm Password<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" /></label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating administrator…' : 'Create Administrator'}</button>
        </form>
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

  const [goalsResult, foodsResult, mealsResult, logsResult, preferencesResult] = await Promise.all([
    api.goals.get(),
    api.foods.list(),
    api.meals.list(),
    api.logs.list(),
    api.preferences.get(),
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
    preferences: preferencesResult.preferences || null,
  }
}

export default function AuthGate({ App }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [setupRequired, setSetupRequired] = useState(false)
  const [data, setData] = useState(null)
  const [offline, setOffline] = useState(() => isOfflineMode())
  const [serverConnected, setServerConnected] = useState(() => isOfflineMode() || !isNutriLogNative() || Boolean(getConfiguredServerUrl()))

  const authenticated = async currentUser => {
    const serverData = await loadServerData(currentUser.id)
    setData(serverData)
    setUser(currentUser)
    setReady(true)
  }

  useEffect(() => {
    if (!serverConnected) return
    api.setup()
      .then(async setup => {
        setSetupRequired(Boolean(setup.setupRequired))
        if (setup.setupRequired) {
          setReady(true)
          return
        }
        const result = await api.auth.me()
        if (result.user) await authenticated(result.user)
        else setReady(true)
      })
      .catch(() => setReady(true))
  }, [serverConnected])

  if (!serverConnected && isNutriLogNative()) return <ModeChoiceScreen onOffline={() => { setOfflineMode(true); setOffline(true); setServerConnected(true); setReady(false) }} onServer={() => { setOfflineMode(false); setOffline(false) }} />
  if (!serverConnected) return <ServerConnectionScreen onConnected={() => { setOfflineMode(false); setServerConnected(true); setReady(false) }} />
  if (!ready) return <div className="auth-loading">Loading NutriLog…</div>
  const resetToken = new URLSearchParams(window.location.search).get('reset')
  if (resetToken && !user) return <ResetPasswordScreen token={resetToken} />
  if (setupRequired && !user) return <SetupScreen onAuthenticated={authenticated} />
  if (!user) return offline ? <OfflineStartScreen onStart={() => { setUser({ id: 'offline-user', email: 'offline@local', role: 'user', is_active: true }); setData(null); setReady(true) }} /> : <AuthScreen onAuthenticated={authenticated} />
  return <App user={user} initialServerData={data} onLogout={async () => { await api.auth.logout(); ['savedFoods','savedMeals','logEntries','dailyGoal','macroGoals'].forEach(key => localStorage.removeItem(key)); setUser(null); setData(null) }} onChangeServer={async () => { await api.auth.logout(); clearConfiguredServerUrl(); setUser(null); setData(null); setReady(false); setServerConnected(false) }} />
}
