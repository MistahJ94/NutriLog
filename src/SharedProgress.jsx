import { useEffect, useState } from 'react'
import { Users, RefreshCw, TrendingUp } from 'lucide-react'
import { api, isOfflineMode, isNutriLogNative, sharedProgressEventsUrl } from './services'
import './SharedProgress.css'

const dayLabel = value => {
  if (!value) return 'Unknown date'
  // Server sends the sharer's local calendar day, not a UTC instant.
  const day = typeof value === 'string' ? value.slice(0, 10) : ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + 'T12:00:00') : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString()
}
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0

function Metric({ label, value, goal, unit = '' }) {
  const amount = num(value)
  const target = num(goal)
  const percent = target > 0 ? Math.min(100, amount / target * 100) : 0
  return <div className="shared-metric">
    <span className="shared-metric-label">{label}</span>
    <strong>{Math.round(amount)}{unit}{target > 0 ? ` / ${Math.round(target)}${unit}` : ''}</strong>
    {target > 0 && <>
      <div className="shared-meter" role="progressbar" aria-label={label} aria-valuenow={Math.round(amount)} aria-valuemin={0} aria-valuemax={Math.round(target)}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <small>{amount > target ? `${Math.round(amount - target)}${unit} over goal` : `${Math.round(target - amount)}${unit} remaining`}</small>
    </>}
  </div>
}

export default function SharedProgress() {
  const [connections, setConnections] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [progress, setProgress] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [liveState, setLiveState] = useState('connecting')

  const loadConnections = async () => {
    setBusy(true); setError('')
    try {
      const result = await api.connections.list()
      const accepted = (result.connections || []).filter(item => item.status === 'accepted')
      setConnections(accepted)
      setSelectedId(current => accepted.some(item => String(item.otherUserId) === current)
        ? current : String(accepted[0]?.otherUserId || ''))
    } catch (err) { setError(err.message || 'Unable to load connections') }
    finally { setBusy(false) }
  }

  useEffect(() => { if (!isOfflineMode()) loadConnections() }, [])

  useEffect(() => {
    if (!selectedId || isOfflineMode()) { setProgress(null); return }
    let active = true
    let inFlight = false
    let eventSource = null
    setProgress(null)
    setError('')
    setLiveState('connecting')
    const sync = async () => {
      if (!active || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      try {
        const result = await api.sharing.progress(selectedId)
        if (active) {
          setProgress(result)
          setLastUpdated(new Date())
          setLiveState('connected')
          setError('')
        }
      } catch (err) {
        if (active) { setLiveState('stale'); setError(err.message || 'Unable to refresh shared progress') }
      } finally { inFlight = false }
    }
    sync()
    // Cookie-authenticated web sessions get immediate server notifications.
    // Native clients use authenticated polling, since EventSource cannot attach bearer tokens.
    if (!isNutriLogNative() && typeof EventSource !== 'undefined') {
      eventSource = new EventSource(sharedProgressEventsUrl(selectedId), { withCredentials: true })
      eventSource.addEventListener('changed', sync)
      eventSource.onerror = () => { if (active) setLiveState('reconnecting') }
      eventSource.addEventListener('ready', sync)
    }
    const timer = window.setInterval(sync, 10000)
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    const onOnline = () => sync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      eventSource?.close()
    }
  }, [selectedId])

  const refresh = async () => {
    if (!selectedId) return loadConnections()
    setBusy(true)
    try {
      const result = await api.sharing.progress(selectedId)
      setProgress(result)
      setLastUpdated(new Date())
      setLiveState('connected')
      setError('')
    } catch (err) { setLiveState('stale'); setError(err.message || 'Unable to refresh progress') }
    finally { setBusy(false) }
  }

  if (isOfflineMode()) return <div className="section"><h2>Shared Progress</h2><p>Connect to a NutriLog server to view shared progress.</p></div>

  const permissions = progress?.sharing || {}
  const nutrition = Array.isArray(progress?.dailyNutrition) ? progress.dailyNutrition : []
  const sorted = [...nutrition].sort((a, b) => String(a.day || '').localeCompare(String(b.day || '')))
  const latest = sorted.find(day => day.day === progress?.today) || null
  const goals = permissions.shareGoals ? progress?.goals : null
  const visibleNutrition = permissions.shareCalories || permissions.shareMacros
  const history = Array.isArray(progress?.weightHistory) ? progress.weightHistory : []
  const activity = Array.isArray(progress?.activity) ? progress.activity : []
  const selected = connections.find(item => String(item.otherUserId) === selectedId)

  return <div className="shared-progress-page">
    <div className="planner-intro">
      <h2><Users size={25} style={{ verticalAlign: 'middle', marginRight: 8 }} />Shared Progress</h2>
      <p>View the progress people have chosen to share with you. Private food logs and account details stay private.</p>
    </div>
    <div className="section shared-toolbar">
      <label htmlFor="shared-person">Viewing progress for</label>
      <select id="shared-person" className="food-select" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={!connections.length}>
        {!connections.length && <option value="">No accepted connections</option>}
        {connections.map(item => <option key={item.id} value={String(item.otherUserId)}>{item.otherName || item.otherEmail}</option>)}
      </select>
      <button className="btn btn-secondary" type="button" onClick={refresh} disabled={busy}><RefreshCw size={17} />{busy ? 'Loading…' : 'Refresh'}</button>
      <small>Sync: {liveState} · {lastUpdated ? 'checked ' + lastUpdated.toLocaleTimeString() : 'waiting for server'} · auto-checks every 10 seconds</small>
    </div>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {!busy && !connections.length && <div className="section empty-state">No accepted connections yet. Manage invitations in Settings → Connections.</div>}
    {busy && !progress && <div className="section empty-state">Loading shared progress…</div>}
    {progress && <>
      <p className="settings-description">Server calculation: {progress.generatedAt ? new Date(progress.generatedAt).toLocaleString() : 'unknown'} · {progress.timeZone || 'Timezone not shared'}{liveState !== 'connected' ? ' · Data may be stale' : ''}</p>
      <div className="section">
        <h3>{progress.user?.displayName || selected?.otherName || selected?.otherEmail || 'Connection'} — overview</h3>
        {visibleNutrition && latest ? <>
          <p className="settings-description">Today: {dayLabel(latest.day)} · {progress.timeZone || 'UTC'} · {latest.entryCount} logged entries</p>
          {permissions.shareCalories && <div className="shared-calorie-feature">
            <div className="shared-calorie-ring" style={{ '--shared-progress': `${Math.max(0, Math.min(100, num(goals?.calories) > 0 ? num(latest.calories) / num(goals.calories) * 100 : 0))}%` }}>
              <div className="shared-calorie-ring-inner">
                <span aria-hidden="true">🔥</span>
                <strong>{Math.round(num(latest.calories)).toLocaleString()}</strong>
                <small>{num(goals?.calories) > 0 ? `of ${Math.round(num(goals.calories)).toLocaleString()} kcal` : 'kcal today'}</small>
                {num(goals?.calories) > 0 && <em>{Math.abs(Math.round(num(goals.calories) - num(latest.calories))).toLocaleString()} {num(latest.calories) > num(goals.calories) ? 'over' : 'left'}</em>}
              </div>
            </div>
          </div>}
          <div className="shared-metrics">
            {permissions.shareCalories && <Metric label="Calories" value={latest.calories} goal={goals?.calories} unit=" kcal" />}
            {permissions.shareMacros && <>
              <Metric label="Protein" value={latest.protein} goal={goals?.protein} unit=" g" />
              <Metric label="Carbs" value={latest.carbs} goal={goals?.carbs} unit=" g" />
              <Metric label="Fat" value={latest.fat} goal={goals?.fat} unit=" g" />
              <Metric label="Fiber" value={latest.fiber} goal={goals?.fiber} unit=" g" />
            </>}
          </div>
        </> : <p className="settings-description">No nutrition totals available for today.</p>}
      </div>
      {permissions.shareCharts && visibleNutrition && sorted.length > 0 && <div className="section">
        <h3><TrendingUp size={19} style={{ verticalAlign: 'middle', marginRight: 7 }} />Recent nutrition — last 7 records</h3>
        <div className="shared-history">
          {sorted.slice(-7).reverse().map((day, index) => <div className="shared-history-row" key={String(day.day) + index}>
            <strong>{dayLabel(day.day)}</strong>
            <span>{permissions.shareCalories ? `${Math.round(num(day.calories))} kcal` : ''}{permissions.shareCalories && permissions.shareMacros ? ' · ' : ''}{permissions.shareMacros ? `P ${Math.round(num(day.protein))}g · C ${Math.round(num(day.carbs))}g · F ${Math.round(num(day.fat))}g` : ''}</span>
          </div>)}
        </div>
      </div>}
      {permissions.shareWeight && <div className="section">
        <h3>Current weight</h3>
        <p>{progress.weight ? `${num(progress.weight.kg).toFixed(1)} kg` : 'No weight recorded'} {progress.weight?.recordedAt ? `· ${dayLabel(progress.weight.recordedAt)}` : ''}</p>
      </div>}
      {permissions.shareWeightHistory && <div className="section">
        <h3>Weight history</h3>
        {history.length ? <div className="shared-history">{history.slice(-10).reverse().map((entry, index) => <div className="shared-history-row" key={index}><strong>{dayLabel(entry.recordedAt)}</strong><span>{num(entry.kg).toFixed(1)} kg</span></div>)}</div> : <p>No weight history shared yet.</p>}
      </div>}
      {permissions.shareActivity && <div className="section">
        <h3>Activity — last 14 days</h3>
        {activity.length ? <div className="shared-history">{activity.slice(-14).reverse().map((entry, index) => <div className="shared-history-row" key={index}><strong>{dayLabel(entry.date)}</strong><span>{Math.round(num(entry.minutes))} min · {Math.round(num(entry.calories))} kcal · {Math.round(num(entry.workouts))} workouts</span></div>)}</div> : <p>No activity recorded in this period.</p>}
      </div>}
      {!Object.values(permissions).some(Boolean) && <div className="section empty-state">This connection has not enabled any progress categories for sharing.</div>}
    </>}
  </div>
}
