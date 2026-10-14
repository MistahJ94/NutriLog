import { useEffect, useState } from 'react'
import { Users, RefreshCw, TrendingUp } from 'lucide-react'
import { api, isOfflineMode } from './services'
import './SharedProgress.css'

const dayLabel = value => {
  if (!value) return 'Unknown date'
  const date = new Date(value)
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
    let active = true
    setProgress(null)
    if (!selectedId) return () => { active = false }
    setBusy(true); setError('')
    api.sharing.progress(selectedId)
      .then(result => { if (active) setProgress(result) })
      .catch(err => { if (active) setError(err.message || 'Unable to load shared progress') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [selectedId])

  const refresh = async () => {
    if (!selectedId) return loadConnections()
    setBusy(true); setError('')
    try { setProgress(await api.sharing.progress(selectedId)) }
    catch (err) { setError(err.message || 'Unable to refresh progress') }
    finally { setBusy(false) }
  }

  if (isOfflineMode()) return <div className="section"><h2>Shared Progress</h2><p>Connect to a NutriLog server to view shared progress.</p></div>

  const permissions = progress?.sharing || {}
  const nutrition = Array.isArray(progress?.dailyNutrition) ? progress.dailyNutrition : []
  const sorted = [...nutrition].sort((a, b) => String(a.day || '').localeCompare(String(b.day || '')))
  const latest = sorted[sorted.length - 1]
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
    </div>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {!busy && !connections.length && <div className="section empty-state">No accepted connections yet. Manage invitations in Settings → Connections.</div>}
    {busy && !progress && <div className="section empty-state">Loading shared progress…</div>}
    {progress && <>
      <div className="section">
        <h3>{progress.user?.displayName || selected?.otherName || selected?.otherEmail || 'Connection'} — overview</h3>
        {visibleNutrition && latest ? <>
          <p className="settings-description">Latest recorded nutrition: {dayLabel(latest.day)}</p>
          <div className="shared-metrics">
            {permissions.shareCalories && <Metric label="Calories" value={latest.calories} goal={goals?.calories} unit=" kcal" />}
            {permissions.shareMacros && <>
              <Metric label="Protein" value={latest.protein} goal={goals?.protein} unit=" g" />
              <Metric label="Carbs" value={latest.carbs} goal={goals?.carbs} unit=" g" />
              <Metric label="Fat" value={latest.fat} goal={goals?.fat} unit=" g" />
              <Metric label="Fiber" value={latest.fiber} goal={goals?.fiber} unit=" g" />
            </>}
          </div>
        </> : <p className="settings-description">No daily nutrition totals available to you yet.</p>}
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
