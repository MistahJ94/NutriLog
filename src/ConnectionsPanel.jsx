import { useEffect, useState } from 'react'
import { UserPlus, Users, Check, X, Trash2, Eye, Lock, Save, RefreshCw } from 'lucide-react'
import { api, isOfflineMode } from './services'

const defaultSharing = {
  shareCalories: false,
  shareMacros: false,
  shareWeight: false,
  shareWeightHistory: false,
  shareActivity: false,
  shareGoals: false,
  shareCharts: false
}

const formatDate = value => value ? new Date(value).toLocaleDateString() : ''

function ProgressViewer({ progress, onClose }) {
  if (!progress) return null
  const nutrition = progress.dailyNutrition || []
  const latestNutrition = nutrition[nutrition.length - 1]
  const activity = progress.activity || []

  return (
    <div className="section" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ marginBottom: 4 }}><Eye size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />Shared Progress</h3>
          <p className="settings-description" style={{ margin: 0 }}>{progress.user.email}</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onClose}>Close</button>
      </div>

      {progress.sharing.shareWeight && (
        <div className="food-item">
          <div className="food-info">
            <h3>Current Weight</h3>
            <div className="food-details"><span>{progress.weight ? progress.weight.kg.toFixed(1) + ' kg' : 'No weight recorded'}</span>{progress.weight?.recordedAt && <span>{formatDate(progress.weight.recordedAt)}</span>}</div>
          </div>
        </div>
      )}

      {progress.sharing.shareGoals && progress.goals && (
        <div className="section" style={{ marginTop: 12 }}>
          <h3>Shared Goals</h3>
          <div className="data-stats">
            <div className="data-stat-item"><div className="data-stat-info"><span className="data-stat-value">{progress.goals.calories}</span><span className="data-stat-label">Calories</span></div></div>
            <div className="data-stat-item"><div className="data-stat-info"><span className="data-stat-value">{progress.goals.protein}g</span><span className="data-stat-label">Protein</span></div></div>
            <div className="data-stat-item"><div className="data-stat-info"><span className="data-stat-value">{progress.goals.carbs}g</span><span className="data-stat-label">Carbs</span></div></div>
            <div className="data-stat-item"><div className="data-stat-info"><span className="data-stat-value">{progress.goals.fat}g</span><span className="data-stat-label">Fat</span></div></div>
          </div>
        </div>
      )}

      {(progress.sharing.shareCalories || progress.sharing.shareMacros) && latestNutrition && (
        <div className="section" style={{ marginTop: 12 }}>
          <h3>Latest Day</h3>
          <div className="data-stats">
            {progress.sharing.shareCalories && <div className="data-stat-item"><div className="data-stat-info"><span className="data-stat-value">{Math.round(latestNutrition.calories || 0)}</span><span className="data-stat-label">Calories</span></div></div>}
            {progress.sharing.shareMacros && <><div className="data-stat-item"><div className="data-stat-info"><span className="data-stat-value">{Math.round(latestNutrition.protein || 0)}g</span><span className="data-stat-label">Protein</span></div></div><div className="data-stat-item"><div className="data-stat-info"><span className="data-stat-value">{Math.round(latestNutrition.carbs || 0)}g</span><span className="data-stat-label">Carbs</span></div></div><div className="data-stat-item"><div className="data-stat-info"><span className="data-stat-value">{Math.round(latestNutrition.fat || 0)}g</span><span className="data-stat-label">Fat</span></div></div></>}
          </div>
        </div>
      )}

      {progress.sharing.shareWeightHistory && progress.weightHistory?.length > 0 && (
        <div className="section" style={{ marginTop: 12 }}>
          <h3>Weight History</h3>
          <div className="food-list">
            {progress.weightHistory.slice().reverse().map((entry, index) => (
              <div className="food-item" key={entry.recordedAt + '-' + index}>
                <div className="food-info"><h3>{entry.kg.toFixed(1)} kg</h3><div className="food-details"><span>{formatDate(entry.recordedAt)}</span></div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {progress.sharing.shareActivity && activity.length > 0 && (
        <div className="section" style={{ marginTop: 12 }}>
          <h3>Activity — Last 14 Days</h3>
          <div className="food-list">
            {activity.slice().reverse().map(entry => (
              <div className="food-item" key={entry.date}>
                <div className="food-info"><h3>{formatDate(entry.date)}</h3><div className="food-details"><span>{Math.round(entry.minutes)} min</span><span>{Math.round(entry.calories)} kcal</span><span>{entry.workouts} workouts</span></div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!progress.sharing.shareCalories && !progress.sharing.shareMacros && !progress.sharing.shareWeight && !progress.sharing.shareWeightHistory && !progress.sharing.shareActivity && !progress.sharing.shareGoals && !progress.sharing.shareCharts && (
        <p className="empty-state">This user has not enabled any progress categories for sharing.</p>
      )}
    </div>
  )
}

export default function ConnectionsPanel() {
  const [connections, setConnections] = useState([])
  const [sharing, setSharing] = useState(defaultSharing)
  const [serverSearch, setServerSearch] = useState('')
  const [serverUsers, setServerUsers] = useState([])
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchBusy, setSearchBusy] = useState(false)
  const [connectBusy, setConnectBusy] = useState(null)
  const [directEmail, setDirectEmail] = useState('')
  const [directBusy, setDirectBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null)
  const [loadingProgress, setLoadingProgress] = useState(null)

  const load = async () => {
    setBusy(true); setError('')
    try {
      const [connectionsResult, sharingResult] = await Promise.all([api.connections.list(), api.sharing.get()])
      setConnections(connectionsResult.connections || [])
      setSharing({ ...defaultSharing, ...(sharingResult.sharing || {}) })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  const saveSharing = async () => {
    setSaving(true); setError('')
    try { const result = await api.sharing.save(sharing); setSharing({ ...defaultSharing, ...result.sharing }); alert('Progress sharing settings saved.') }
    catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const searchServerUsers = async event => {
    event.preventDefault()
    const query = serverSearch.trim()
    if (query.length < 3) { setError('Enter at least 3 characters to search server users.'); return }
    setSearchBusy(true); setError('')
    try {
      const result = await api.connections.search(query)
      const connectedIds = new Set(connections.map(connection => connection.otherUserId))
      setServerUsers((result.users || []).filter(serverUser => !connectedIds.has(serverUser.id)))
    } catch (err) { setError(err.message); setServerUsers([]) }
    finally { setSearchBusy(false) }
  }

  const addByEmail = async event => {
    event.preventDefault()
    const email = directEmail.trim()
    if (!email) { setError('Enter the account email address.'); return }
    setDirectBusy(true); setError('')
    try {
      await api.connections.invite(email)
      setDirectEmail('')
      await load()
      alert('Connection request sent.')
    } catch (err) { setError(err.message) }
    finally { setDirectBusy(false) }
  }

  const connectUser = async serverUser => {
    setConnectBusy(serverUser.id); setError('')
    try {
      await api.connections.invite(serverUser.email)
      setServerUsers(items => items.filter(item => item.id !== serverUser.id))
      await load()
      alert('Connection request sent.')
    } catch (err) { setError(err.message) }
    finally { setConnectBusy(null) }
  }

  const respond = async (id, action) => {
    setError('')
    try {
      if (action === 'accept') await api.connections.accept(id)
      else await api.connections.decline(id)
      await load()
    } catch (err) { setError(err.message) }
  }

  const remove = async id => {
    if (!confirm('Remove this connection? They will no longer be able to view your shared progress.')) return
    try { await api.connections.remove(id); setConnections(items => items.filter(item => item.id !== id)); if (progress?.connectionId === id) setProgress(null) }
    catch (err) { setError(err.message) }
  }

  const viewProgress = async connection => {
    setLoadingProgress(connection.id); setError('')
    try {
      const result = await api.sharing.progress(connection.otherUserId)
      setProgress({ ...result, connectionId: connection.id })
    } catch (err) { setError(err.message) }
    finally { setLoadingProgress(null) }
  }

  return (
    <div className="section" style={{ marginBottom: 20 }}>
      <div className="planner-intro" style={{ marginBottom: 20 }}>
        <h2><Users size={26} style={{ verticalAlign: 'middle', marginRight: 8 }} />Connections & Progress Sharing</h2>
        <p>Connect with people you trust and choose exactly what progress they can see.</p>
      </div>

      <div className="info-box" style={{ marginBottom: 18 }}>
        <p><Lock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /><strong>Private by default.</strong> Your food log, saved foods, saved meals, health profile, account details, and passwords are never shared through connections.</p>
      </div>

      {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

      {isOfflineMode() ? (
        <div className="empty-state"><p>Connections require a NutriLog server. Offline nutrition data remains private on this device.</p></div>
      ) : (
        <>
          <div className="section">
            <h3>Progress Sharing</h3>
            <p className="settings-description">Choose which categories an accepted connection may view. Nothing is shared until you accept a connection request.</p>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              {[
                ['shareCalories', 'Calories', 'Daily calorie totals'],
                ['shareMacros', 'Macros', 'Protein, carbs, fat, and fiber totals'],
                ['shareWeight', 'Current Weight', 'Your latest recorded weight'],
                ['shareWeightHistory', 'Weight History', 'Historical weight entries'],
                ['shareActivity', 'Activity', 'Activity minutes, calories, and workout counts'],
                ['shareGoals', 'Goals', 'Your calorie and macro targets'],
                ['shareCharts', 'Progress Charts', 'Daily nutrition trend data for future chart views']
              ].map(([key, label, description]) => (
                <label key={key} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, border: '1px solid var(--border-color, #d6d6d6)', borderRadius: 10, cursor: 'pointer', background: 'var(--card-bg, transparent)' }}>
                  <input type="checkbox" checked={Boolean(sharing[key])} onChange={event => setSharing(prev => ({ ...prev, [key]: event.target.checked }))} />
                  <span><strong>{label}</strong><small style={{ display: 'block', color: 'var(--text-muted, #667)', marginTop: 2 }}>{description}</small></span>
                </label>
              ))}
            </div>
            <button className="btn btn-primary" type="button" onClick={saveSharing} disabled={saving} style={{ marginTop: 14 }}><Save size={18} />{saving ? 'Saving…' : 'Save Sharing Settings'}</button>
          </div>

          <div className="section" style={{ marginTop: 16 }}>
            <h3><UserPlus size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />Add a Connection</h3>
            <p className="settings-description">Find another NutriLog account on this server and send them an in-app connection request. SMTP or email setup is not required.</p>
            <form onSubmit={searchServerUsers} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
              <input className="connection-email-input" type="email" value={serverSearch} onChange={event => setServerSearch(event.target.value)} placeholder="Search by account email" minLength={3} style={{ flex: '1 1 240px' }} />
              <button className="btn btn-primary" type="submit" disabled={searchBusy}><UserPlus size={18} />{searchBusy ? 'Searching…' : 'Find User'}</button>
            </form>
            <form onSubmit={addByEmail} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <input className="connection-email-input" type="email" value={directEmail} onChange={event => setDirectEmail(event.target.value)} placeholder="Enter exact email to add" style={{ flex: '1 1 240px' }} />
              <button className="btn btn-secondary" type="submit" disabled={directBusy}><UserPlus size={18} />{directBusy ? 'Sending…' : 'Add by Email'}</button>
            </form>
            {serverUsers.length > 0 && (
              <div className="food-list" style={{ marginTop: 12 }}>
                {serverUsers.map(serverUser => (
                  <div className="food-item" key={serverUser.id}>
                    <div className="food-info">
                      <h3>{serverUser.email}</h3>
                      <div className="food-details"><span>NutriLog user on this server</span></div>
                    </div>
                    <div className="food-actions">
                      <button className="btn btn-primary" type="button" onClick={() => connectUser(serverUser)} disabled={connectBusy === serverUser.id}>
                        <UserPlus size={16} />{connectBusy === serverUser.id ? 'Sending…' : 'Connect'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!searchBusy && serverSearch.trim().length >= 3 && serverUsers.length === 0 && (
              <p className="settings-description" style={{ marginTop: 10 }}>No matching active NutriLog users were found.</p>
            )}
            <p className="settings-description" style={{ marginTop: 10 }}>Email invitations can still be used by the API, but the normal server-user connection flow does not send email.</p>
          </div>

          <div className="section" style={{ marginTop: 16 }}>
            <h3>Connections</h3>
            {busy ? <div className="empty-state"><RefreshCw className="spinner" size={28} /><p>Loading connections…</p></div> : connections.length === 0 ? <div className="empty-state"><Users size={28} /><p>No connections yet.</p></div> : (
              <div className="food-list">
                {connections.map(connection => (
                  <div className="food-item" key={connection.id}>
                    <div className="food-info">
                      <h3>{connection.otherEmail}</h3>
                      <div className="food-details">
                        <span className="time-badge">{connection.status}</span>
                        <span>{connection.direction === 'incoming' ? 'Incoming request' : 'Outgoing request'}</span>
                      </div>
                    </div>
                    <div className="food-actions">
                      {connection.status === 'pending' && connection.direction === 'incoming' && <>
                        <button className="btn btn-primary" type="button" onClick={() => respond(connection.id, 'accept')}><Check size={16} />Accept</button>
                        <button className="btn btn-danger" type="button" onClick={() => respond(connection.id, 'decline')}><X size={16} />Decline</button>
                      </>}
                      {connection.status === 'accepted' && <button className="btn btn-secondary" type="button" onClick={() => viewProgress(connection)} disabled={loadingProgress === connection.id}><Eye size={16} />{loadingProgress === connection.id ? 'Loading…' : 'View Progress'}</button>}
                      <button className="btn btn-danger" type="button" onClick={() => remove(connection.id)}><Trash2 size={16} />Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {progress && <ProgressViewer progress={progress} onClose={() => setProgress(null)} />}
        </>
      )}
    </div>
  )
}
