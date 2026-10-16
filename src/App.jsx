import { Fragment, useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Target, TrendingUp, Flame, Coffee, UtensilsCrossed, BookOpen, Edit, Search, Loader, ClipboardList, Settings, Download, Upload, Users, Shield, UserCheck, UserX, KeyRound, RefreshCw, Save, BarChart3, ChevronDown, CalendarDays } from 'lucide-react'
import HealthGoals from './HealthGoals'
import ActivityBoard from './ActivityBoard'
import ConnectionsPanel from './ConnectionsPanel'
import SharedProgress from './SharedProgress'
import PullToRefresh from './PullToRefresh'

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}
import { storage, api, normalizeServerData, calculateMealTotals, scaleNutrition, getConfiguredServerUrl, isNutriLogNative, isOfflineMode } from './services'
import { pendingOperations } from './services/pendingOperations'

// Goal-relative color scale shared by the nutrition progress rings.
// A zero or missing goal has no meaningful completion percentage.
const nutritionProgress = (value, goal) => {
  const target = Number(goal)
  const amount = Number(value)
  if (!(target > 0) || !Number.isFinite(amount)) return { percent: 0, color: '#64748b', valid: false }
  const percent = Math.max(0, amount / target * 100)
  const color = percent === 0 ? '#64748b'
    : percent <= 20 ? '#ef233c'
    : percent <= 40 ? '#f97316'
    : percent <= 60 ? '#fb923c'
    : percent <= 80 ? '#facc15'
    : percent < 100 ? '#84cc16'
    : percent === 100 ? '#22c55e'
    : percent <= 150 ? '#06b6d4' : '#2563eb'
  return { percent, color, valid: true }
}

function FoodLogNutritionSummary({ totals, goals }) {
  const nutrients = [
    { key: 'calories', label: 'Calories', unit: 'kcal', Icon: Flame },
    { key: 'protein', label: 'Protein', unit: 'g', Icon: Target },
    { key: 'carbs', label: 'Carbs', unit: 'g', Icon: TrendingUp },
    { key: 'fat', label: 'Fat', unit: 'g', Icon: UtensilsCrossed },
    { key: 'fiber', label: 'Fiber', unit: 'g', Icon: BookOpen }
  ]
  return (
    <section className="food-log-nutrition-summary" aria-label="Selected day nutrition progress">
      {nutrients.map(({ key, label, unit, Icon }) => {
        const value = Number(totals?.[key]) || 0
        const goal = Number(goals?.[key]) || 0
        const progress = nutritionProgress(value, goal)
        return (
          <div className="food-log-nutrition-item" key={key} aria-label={label + ': ' + Math.round(progress.percent) + '% of daily goal'}>
            <div className="food-log-nutrition-ring" style={{
              '--food-log-ring-color': progress.color,
              '--food-log-ring-progress': Math.min(100, progress.percent) + '%',
              '--food-log-ring-overflow': Math.min(100, Math.max(0, progress.percent - 100)) + '%'
            }}>
              <div className="food-log-nutrition-ring-center">
                <Icon size={16} aria-hidden="true" />
                <strong>{progress.valid ? Math.round(progress.percent) + '%' : '—'}</strong>
              </div>
            </div>
            <strong className="food-log-nutrition-label">{label}</strong>
            <span className="food-log-nutrition-amount">{Number(value.toFixed(key === 'calories' ? 0 : 1)).toLocaleString()} {unit}</span>
            <small>of {Number(goal.toFixed(key === 'calories' ? 0 : 1)).toLocaleString()} {unit}</small>
          </div>
        )
      })}
    </section>
  )
}

function LoggedMealServingInput({ quantity, foodName, onCommit }) {
  const [draft, setDraft] = useState(String(quantity ?? 1))
  useEffect(() => { setDraft(String(quantity ?? 1)) }, [quantity])
  const commit = () => {
    const trimmed = draft.trim()
    const parsed = Number(trimmed)
    if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
      setDraft(String(quantity ?? 1))
      return
    }
    const normalized = String(parsed)
    setDraft(normalized)
    if (parsed !== Number(quantity)) onCommit(normalized)
  }
  return <input className="quantity-input" type="text" inputMode="decimal"
    value={draft}
    onBeforeInput={event => {
      const native = event.nativeEvent
      if (native.inputType !== 'insertText' || !native.data) return
      const element = event.currentTarget
      const start = element.selectionStart ?? draft.length
      const end = element.selectionEnd ?? start
      const inserted = native.data.replace(',', '.')
      const next = draft.slice(0, start) + inserted + draft.slice(end)
      if (!/^\d*(?:\.\d*)?$/.test(next)) { event.preventDefault(); return }
      event.preventDefault()
      setDraft(next)
      requestAnimationFrame(() => {
        if (document.activeElement === element) element.setSelectionRange(start + inserted.length, start + inserted.length)
      })
    }}
    onChange={event => {
      const next = event.target.value.replace(',', '.')
      if (/^\d*(?:\.\d*)?$/.test(next)) setDraft(next)
    }}
    onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    aria-label={`Servings of ${foodName}`} title="Enter a positive quantity, such as 0.5" />
}

function AdminPanel({ user }) {
  const [users, setUsers] = useState([])
  const [expandedAccountId, setExpandedAccountId] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'user' })
  const [smtp, setSmtp] = useState({ host: '', port: 587, security: 'starttls', username: '', password: '', fromEmail: '', fromName: 'NutriLog', publicUrl: '' })
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [smtpBusy, setSmtpBusy] = useState(true)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpTesting, setSmtpTesting] = useState(false)
  const [testEmail, setTestEmail] = useState(user.email)

  const loadUsers = async () => {
    setBusy(true); setError('')
    try { const result = await api.admin.users(); setUsers(result.users) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const loadSmtp = async () => {
    setSmtpBusy(true)
    try {
      const result = await api.admin.smtp()
      if (result.settings) {
        setSmtp(prev => ({ ...prev, ...result.settings, password: '' }))
        setSmtpConfigured(Boolean(result.configured))
      }
    } catch (err) { setError(err.message) }
    finally { setSmtpBusy(false) }
  }

  useEffect(() => { loadUsers(); loadSmtp() }, [])

  const createUser = async event => {
    event.preventDefault()
    try {
      await api.admin.createUser(newUser.email, newUser.password, newUser.role)
      setNewUser({ email: '', password: '', role: 'user' }); await loadUsers()
    } catch (err) { alert(err.message) }
  }

  const toggleUser = async account => {
    if (!confirm((account.is_active ? 'Disable' : 'Enable') + ' account ' + account.email + '? ' + (account.is_active ? 'They will no longer be able to sign in. Their nutrition data will be kept.' : 'They will be allowed to sign in again.'))) return
    try { await api.admin.updateUser(account.id, { is_active: !account.is_active }); await loadUsers() }
    catch (err) { alert(err.message) }
  }

  const changeRole = async account => {
    const role = account.role === 'admin' ? 'user' : 'admin'
    if (!confirm('Change ' + account.email + ' to ' + role + '?')) return
    try { await api.admin.updateUser(account.id, { role }); await loadUsers() }
    catch (err) { alert(err.message) }
  }

  const resetPassword = async account => {
    const password = prompt('Enter a new password for ' + account.email + ' (8-128 characters):')
    if (password === null) return
    try { await api.admin.resetPassword(account.id, password); alert('Password reset. All existing sessions for this user were revoked.') }
    catch (err) { alert(err.message) }
  }

  const revokeSessions = async account => {
    if (!confirm('Sign ' + account.email + ' out of all existing sessions? They will need to sign in again.')) return
    try { await api.admin.revokeSessions(account.id); alert('Sessions revoked for ' + account.email) }
    catch (err) { alert(err.message) }
  }

  const deleteUser = async account => {
    if (!confirm('Delete ' + account.email + '? This permanently deletes their nutrition data.')) return
    try { await api.admin.deleteUser(account.id); await loadUsers() }
    catch (err) { alert(err.message) }
  }

  const saveSmtp = async event => {
    event.preventDefault()
    setSmtpSaving(true)
    try {
      await api.admin.saveSmtp(smtp)
      setSmtp(prev => ({ ...prev, password: '' }))
      setSmtpConfigured(true)
      alert('SMTP settings saved. The SMTP password is stored encrypted on the server.')
      await loadSmtp()
    } catch (err) { alert(err.message) }
    finally { setSmtpSaving(false) }
  }

  const testSmtp = async () => {
    setSmtpTesting(true)
    try {
      await api.admin.testSmtp({ ...smtp, testEmail })
      alert('Test email sent successfully.')
    } catch (err) { alert(err.message) }
    finally { setSmtpTesting(false) }
  }

  return (
    <div className="settings-container">
      <div className="planner-intro">
        <h2><Shield size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Administrator</h2>
        <p>Manage NutriLog accounts, access, and server email settings.</p>
      </div>

      <div className="section">
        <h2><Settings size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />Email & SMTP</h2>
        <p className="settings-description">Configure password-recovery email without editing files on the server. Only administrators can see or change these settings.</p>
        {smtpBusy ? <div className="empty-state"><RefreshCw className="spinner" size={28} /><p>Loading email settings…</p></div> : (
          <form onSubmit={saveSmtp}>
            <div className="content-grid">
              <div>
                <div className="form-group"><label>SMTP Host<input value={smtp.host} onChange={e => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.example.com" required /></label></div>
                <div className="form-group"><label>SMTP Port<input type="number" min="1" max="65535" value={smtp.port} onChange={e => setSmtp({ ...smtp, port: Number(e.target.value) })} required /></label></div>
                <div className="form-group"><label>Security<select className="food-select" value={smtp.security} onChange={e => setSmtp({ ...smtp, security: e.target.value })}><option value="starttls">STARTTLS</option><option value="ssl">SSL/TLS</option><option value="none">None</option></select></label></div>
                <div className="form-group"><label>SMTP Username<input value={smtp.username} onChange={e => setSmtp({ ...smtp, username: e.target.value })} placeholder="Optional" autoComplete="off" /></label></div>
                <div className="form-group"><label>SMTP Password<input type="password" value={smtp.password} onChange={e => setSmtp({ ...smtp, password: e.target.value })} placeholder={smtpConfigured ? 'Leave blank to keep current password' : 'Optional if server does not require authentication'} autoComplete="new-password" /></label></div>
              </div>
              <div>
                <div className="form-group"><label>From Email<input type="email" value={smtp.fromEmail} onChange={e => setSmtp({ ...smtp, fromEmail: e.target.value })} placeholder="noreply@example.com" required /></label></div>
                <div className="form-group"><label>From Name<input value={smtp.fromName} onChange={e => setSmtp({ ...smtp, fromName: e.target.value })} placeholder="NutriLog" /></label></div>
                <div className="form-group"><label>Public URL<input type="url" value={smtp.publicUrl} onChange={e => setSmtp({ ...smtp, publicUrl: e.target.value })} placeholder="https://nutrilog.example.com" required /></label></div>
                <div className="form-group"><label>Test Email Address<input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} required /></label></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={smtpSaving}><Settings size={18} />{smtpSaving ? 'Saving…' : 'Save SMTP Settings'}</button>
              <button className="btn btn-secondary" type="button" onClick={testSmtp} disabled={smtpTesting || !smtp.host}>{smtpTesting ? 'Sending…' : 'Send Test Email'}</button>
              {smtpConfigured && <button className="btn btn-danger" type="button" onClick={async () => { if (!confirm('Disable email password recovery?')) return; try { await api.admin.disableSmtp(); setSmtp({ host: '', port: 587, security: 'starttls', username: '', password: '', fromEmail: '', fromName: 'NutriLog', publicUrl: '' }); setSmtpConfigured(false); alert('SMTP password recovery has been disabled.') } catch (err) { alert(err.message) } }}>Disable SMTP</button>}
            </div>
            <p style={{ marginTop: 14, color: '#666', fontSize: '0.9rem' }}>
              {smtpConfigured ? 'SMTP is configured. The stored password is never displayed.' : 'SMTP is not configured. Password recovery email is disabled until you save valid settings.'}
            </p>
          </form>
        )}
      </div>

      <div className="content-grid">
        <div className="section">
          <h2><Users size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />Create User</h2>
          <form onSubmit={createUser}>
            <div className="form-group"><label>Email<input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required /></label></div>
            <div className="form-group"><label>Temporary Password<input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} minLength={8} required /></label></div>
            <div className="form-group"><label>Role<select className="food-select" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}><option value="user">User</option><option value="admin">Administrator</option></select></label></div>
            <button className="btn btn-primary"><UserCheck size={18} />Create Account</button>
          </form>
        </div>

        <div className="section">
          <h2>Accounts ({users.length})</h2>
          {error && <div className="auth-error">{error}</div>}
          {busy ? <div className="empty-state"><RefreshCw className="spinner" size={32} /><p>Loading users…</p></div> : (
            <div className="food-list nutrilog-admin-account-list">
              {users.map(account => (
                <div className="food-item" key={account.id}>
                  <div className="food-info">
                    <h3>{account.email} {account.id === user.id && <span className="time-badge">You</span>}</h3>
                    <div className="food-details">
                      <span className="time-badge">{account.role}</span>
                      <span className={account.is_active ? 'time-badge' : 'badge-meal-small'}>{account.is_active ? 'active' : 'disabled'}</span>
                      <span>{new Date(account.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="nutrilog-account-options">
                    <button type="button" className="btn btn-secondary nutrilog-account-options-toggle"
                      aria-expanded={expandedAccountId === account.id}
                      aria-controls={'account-actions-' + account.id}
                      onClick={() => setExpandedAccountId(current => current === account.id ? null : account.id)}>
                      <Settings size={16} /> {expandedAccountId === account.id ? 'Hide Options' : 'Manage Account'}
                    </button>
                    {expandedAccountId === account.id && (
                      <div className="nutrilog-account-actions" id={'account-actions-' + account.id}>
                        <div className="nutrilog-account-action">
                          <div><strong>Reset Password</strong><p>Choose a new password. Existing sessions will be signed out.</p></div>
                          <button type="button" className="btn btn-secondary" onClick={() => resetPassword(account)}><KeyRound size={16} /> Reset</button>
                        </div>
                        <div className="nutrilog-account-action">
                          <div><strong>Revoke Sessions</strong><p>Sign this account out everywhere. Its data and password stay unchanged.</p></div>
                          <button type="button" className="btn btn-secondary" onClick={() => revokeSessions(account)}><RefreshCw size={16} /> Sign Out</button>
                        </div>
                        <div className="nutrilog-account-action">
                          <div><strong>Change Role</strong><p>{account.role === 'admin' ? 'Remove administrator privileges and make this a regular user.' : 'Give this user administrator access to account and server settings.'}</p></div>
                          <button type="button" className="btn btn-secondary" onClick={() => changeRole(account)} disabled={account.id === user.id}><Shield size={16} /> {account.role === 'admin' ? 'Make User' : 'Make Admin'}</button>
                        </div>
                        <div className="nutrilog-account-action">
                          <div><strong>{account.is_active ? 'Disable Account' : 'Enable Account'}</strong><p>{account.is_active ? 'Prevent sign-in without deleting this account or its nutrition data.' : 'Restore sign-in access to this account.'}</p></div>
                          <button type="button" className={account.is_active ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => toggleUser(account)} disabled={account.id === user.id}>{account.is_active ? <UserX size={16} /> : <UserCheck size={16} />}{account.is_active ? ' Disable' : ' Enable'}</button>
                        </div>
                        <div className="nutrilog-account-action nutrilog-account-action-danger">
                          <div><strong>Delete Account</strong><p>Permanently delete this account and its nutrition data. This cannot be undone.</p></div>
                          <button type="button" className="btn btn-danger" onClick={() => deleteUser(account)} disabled={account.id === user.id}><Trash2 size={16} /> Delete</button>
                        </div>
                        {account.id === user.id && <p className="nutrilog-account-self-note">You cannot change your own role, disable your own account, or delete your own account here.</p>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
function App({ user, initialServerData, onRefresh, onLogout, onChangeServer }) {
  const [profileName, setProfileName] = useState(user?.displayName || '')
  const [profileSaving, setProfileSaving] = useState(false)
  // Navigation
  const [activeTab, setActiveTabState] = useState(() => {
    const stored = sessionStorage.getItem('nutrilog-active-tab')
    return ['tracker', 'planner', 'foods', 'meals', 'settings', 'admin'].includes(stored) ? stored : 'tracker'
  })
  const activeTabRef = useRef(activeTab)
  const navigationStack = useRef([])
  const navigatingBack = useRef(false)
  const backActionRef = useRef(() => false)
  const setActiveTab = next => {
    const tab = typeof next === 'function' ? next(activeTabRef.current) : next
    if (!tab || tab === activeTabRef.current) return
    if (!navigatingBack.current) {
      navigationStack.current.push(activeTabRef.current)
      window.history.pushState({ nutrilogTab: tab }, '')
    }
    activeTabRef.current = tab
    sessionStorage.setItem('nutrilog-active-tab', tab)
    setActiveTabState(tab)
  }
  useEffect(() => {
    const onPopState = () => {
      // An open editor takes priority over changing tabs.
      if (backActionRef.current()) {
        window.history.pushState({ nutrilogTab: activeTabRef.current }, '')
        return
      }
      const previous = navigationStack.current.pop()
      if (previous) {
        navigatingBack.current = true
        setActiveTab(previous)
        navigatingBack.current = false
      }
    }
    const onKeyDown = event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (backActionRef.current()) { event.preventDefault(); return }
      if (navigationStack.current.length) { event.preventDefault(); window.history.back() }
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('keydown', onKeyDown)
    // Capacitor Android hardware Back is not guaranteed to emit a web popstate.
    const nativeApp = window.Capacitor?.Plugins?.App
    let listener
    let cancelled = false
    if (isNutriLogNative() && nativeApp?.addListener) {
      Promise.resolve(nativeApp.addListener('backButton', () => {
        if (backActionRef.current()) return
        if (navigationStack.current.length) { window.history.back(); return }
        if (activeTabRef.current !== 'tracker') {
          activeTabRef.current = 'tracker'
          setActiveTabState('tracker')
          return
        }
        nativeApp.exitApp?.()
      })).then(handle => { if (cancelled) handle?.remove?.(); else listener = handle }).catch(console.error)
    }
    return () => {
      cancelled = true
      listener?.remove?.()
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
  const [connectionsRefreshToken, setConnectionsRefreshToken] = useState(0)

  const connectionsRefreshResolve = useRef(null)

  const handlePullRefresh = async () => {
    if (typeof onRefresh !== 'function') return

    await onRefresh()

    if (activeTab !== 'settings' || isOfflineMode()) return

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (connectionsRefreshResolve.current?.timer === timer) {
          connectionsRefreshResolve.current = null
          reject(new Error('Connections refresh timed out. Please try again.'))
        }
      }, 15000)

      connectionsRefreshResolve.current = { resolve, reject, timer }
      setConnectionsRefreshToken(value => value + 1)
    })
  }

  useEffect(() => {
    if (activeTab !== 'settings') {
      const pending = connectionsRefreshResolve.current
      if (pending) {
        connectionsRefreshResolve.current = null
        clearTimeout(pending.timer)
        pending.resolve()
      }
    }
  }, [activeTab])

  useEffect(() => {
    return () => {
      const pending = connectionsRefreshResolve.current
      if (pending) {
        connectionsRefreshResolve.current = null
        clearTimeout(pending.timer)
        pending.resolve()
      }
    }
  }, [])

  const handleConnectionsRefreshComplete = result => {
    const pending = connectionsRefreshResolve.current
    if (!pending) return

    connectionsRefreshResolve.current = null
    clearTimeout(pending.timer)

    if (result?.ok) pending.resolve()
    else pending.reject(new Error(result?.error || 'Unable to refresh connections.'))
  }
  const [graphType, setGraphType] = useState('bars')
  const [graphMetric, setGraphMetric] = useState('calories')
  const [activeGraphPoint, setActiveGraphPoint] = useState(null)
  const tabDefaults = ['tracker', 'planner', 'foods', 'meals', 'goals', 'activity', 'graphs', 'shared', 'settings']
  const tabLabels = {
    tracker: 'Tracker',
    planner: 'Planner',
    foods: 'Foods',
    meals: 'Meals',
    goals: 'Goals',
    activity: 'Activity',
    graphs: 'Progress',
    shared: 'Shared Progress',
    settings: 'Settings',
    admin: 'Admin'
  }
  const tabIcons = {
    tracker: Flame,
    planner: ClipboardList,
    foods: Coffee,
    meals: UtensilsCrossed,
    goals: Target,
    activity: TrendingUp,
    graphs: BarChart3,
    shared: Users,
    settings: Settings,
    admin: Shield
  }
  const [tabOrder, setTabOrder] = useState(() => {
    try {
      const serverOrder = Array.isArray(initialServerData?.preferences?.tabOrder) ? initialServerData.preferences.tabOrder : null
      if (serverOrder?.length) return serverOrder
      const key = 'nutrilog-tab-order-' + (user?.id || 'default')
      const saved = JSON.parse(localStorage.getItem(key))
      const available = user?.role === 'admin' ? [...tabDefaults, 'admin'] : tabDefaults
      if (!Array.isArray(saved)) return available
      const valid = saved.filter(tab => available.includes(tab))
      return [...valid, ...available.filter(tab => !valid.includes(tab))]
    } catch {
      return user?.role === 'admin' ? [...tabDefaults, 'admin'] : tabDefaults
    }
  })
  const [customizeTabs, setCustomizeTabs] = useState(false)
  const [showMobileMore, setShowMobileMore] = useState(false)
  const tabDragRef = useRef(null)
  const [draggingTab, setDraggingTab] = useState(null)
  const [theme, setTheme] = useState(() => initialServerData?.preferences?.theme || localStorage.getItem('nutrilog-theme') || 'orange')
  const [mode, setMode] = useState(() => initialServerData?.preferences?.mode || localStorage.getItem('nutrilog-mode') || 'light')
  const [customAccent, setCustomAccent] = useState(() => initialServerData?.preferences?.customAccent || localStorage.getItem('nutrilog-custom-accent') || '#F97316')
  const [trackerLayout, setTrackerLayout] = useState(() => {
    try {
      // Prefer the account's server-backed layout, then its device backup.
      // Keep the legacy key as a migration fallback for existing APK installs.
      const serverLayout = initialServerData?.preferences?.trackerLayout
      const accountKey = 'nutrilog-tracker-layout-' + (user?.id || 'default')
      const accountLayout = JSON.parse(localStorage.getItem(accountKey) || 'null')
      const legacyLayout = JSON.parse(localStorage.getItem('nutrilog-tracker-layout') || 'null')
      const saved = (serverLayout && typeof serverLayout === 'object' && Object.keys(serverLayout).length)
        ? serverLayout : (accountLayout || legacyLayout)
      return {
        template: saved?.template || 'balanced',
        columns: Number(saved?.columns) || 3,
        customize: false,
        cards: saved?.cards && typeof saved.cards === 'object' ? saved.cards : {},
        order: Array.isArray(saved?.order) && saved.order.length ? saved.order : ['calories', 'remaining', 'protein', 'carbs', 'fat', 'fiber']
      }
    } catch {
      return { template: 'custom', columns: 3, customize: false, cards: {}, order: ['calories', 'remaining', 'protein', 'carbs', 'fat', 'fiber'] }
    }
  })
  const [draggingTrackerCard, setDraggingTrackerCard] = useState(null)
  const [resizingTrackerCard, setResizingTrackerCard] = useState(null)
  const [foodSearch, setFoodSearch] = useState('')
  const [mealSearch, setMealSearch] = useState('')
  const [mealSort, setMealSort] = useState('az')
  const [plannerSyncStatus, setPlannerSyncStatus] = useState('checking')
  const [visiblePlannerSyncStatus, setVisiblePlannerSyncStatus] = useState('saving')
  const syncAnimationStartedAt = useRef(Date.now())
  const plannerLocalChangeRevision = useRef(0)
  const plannerConfirmedRevision = useRef(0)
  const plannerHasConfirmedSync = useRef(false)
  const syncDisplayTimer = useRef(null)
  useEffect(() => {
    if (syncDisplayTimer.current) clearTimeout(syncDisplayTimer.current)
    if (plannerSyncStatus === 'checking' || plannerSyncStatus === 'saving' || plannerSyncStatus === 'pending') {
      if (visiblePlannerSyncStatus !== 'saving') syncAnimationStartedAt.current = Date.now()
      setVisiblePlannerSyncStatus('saving')
      return
    }
    const elapsed = Date.now() - syncAnimationStartedAt.current
    syncDisplayTimer.current = setTimeout(() => {
      setVisiblePlannerSyncStatus(plannerSyncStatus)
    }, Math.max(0, 2000 - elapsed))
    return () => { if (syncDisplayTimer.current) clearTimeout(syncDisplayTimer.current) }
  }, [plannerSyncStatus])
  useEffect(() => () => { if (syncDisplayTimer.current) clearTimeout(syncDisplayTimer.current) }, [])
  const [plannerView, setPlannerView] = useState('week')
  const [plannerAnchor, setPlannerAnchor] = useState(() => getLocalDateString())
  const [plannedMealId, setPlannedMealId] = useState('')
  const [plannedMealSlot, setPlannedMealSlot] = useState('Breakfast')
  const plannedMealsStorageKey = 'nutrilog-planned-meals-' + (user?.id || 'default')
  const plannedMealsDeletedKey = 'nutrilog-planned-meals-deleted-' + (user?.id || 'default')
  const readDeletedMealIds = () => {
    try { const value = JSON.parse(localStorage.getItem(plannedMealsDeletedKey) || '[]'); return Array.isArray(value) ? value.map(String) : [] }
    catch { return [] }
  }
  const readLocalPlannedMeals = () => {
    try {
      const value = JSON.parse(localStorage.getItem(plannedMealsStorageKey) || '[]')
      return Array.isArray(value) ? value : []
    } catch { return [] }
  }
  const combinePlannedMeals = (local, server) => {
    // Never discard a local draft merely because the server snapshot is stale.
    const deleted = new Set(readDeletedMealIds())
    const result = [...local.filter(item => !item || item.id == null || !deleted.has(String(item.id)))]
    const indices = new Map(result.map((item, index) => item && typeof item === 'object' && item.id != null ? [String(item.id), index] : null).filter(Boolean))
    const revision = item => { const time = Date.parse(item?.updatedAt || ''); return Number.isFinite(time) ? time : 0 }
    for (const item of server) {
      if (item && item.id != null && deleted.has(String(item.id))) continue
      const id = item?.id == null ? null : String(item.id)
      const index = id == null ? undefined : indices.get(id)
      if (index === undefined) {
        if (id != null) indices.set(id, result.length)
        result.push(item)
      } else if (revision(item) > revision(result[index])) {
        result[index] = item
      }
    }
    return result
  }
  const [plannedMeals, setPlannedMeals] = useState(() => {
    const local = readLocalPlannedMeals()
    const server = initialServerData?.preferences?.trackerLayout?.plannedMeals
    return combinePlannedMeals(local, Array.isArray(server) ? server : [])
  })
  useEffect(() => {
    const local = readLocalPlannedMeals()
    const server = initialServerData?.preferences?.trackerLayout?.plannedMeals
    const combined = combinePlannedMeals(local, Array.isArray(server) ? server : [])
    setPlannedMeals(combined)
    localStorage.setItem(plannedMealsStorageKey, JSON.stringify(combined))
  }, [user?.id])
  const savePlannedMeals = next => {
    const nextIds = new Set(next.filter(item => item && item.id != null).map(item => String(item.id)))
    const removed = plannedMeals.filter(item => item && item.id != null && !nextIds.has(String(item.id))).map(item => String(item.id))
    if (removed.length) {
      localStorage.setItem(plannedMealsDeletedKey, JSON.stringify([...new Set([...readDeletedMealIds(), ...removed])]))
    }
    const previous = new Map(plannedMeals.filter(item => item && item.id != null).map(item => [String(item.id), item]))
    const now = new Date().toISOString()
    const versioned = next.map(item => {
      if (!item || item.id == null) return item
      const old = previous.get(String(item.id))
      if (old && JSON.stringify(old) === JSON.stringify(item)) return item
      return { ...item, updatedAt: now }
    })
    localStorage.setItem(plannedMealsStorageKey, JSON.stringify(versioned))
    setPlannedMeals(versioned)
    plannerLocalChangeRevision.current += 1
    setPlannerSyncStatus('pending')
  }
  const scheduleSavedMeal = event => {
    event.preventDefault()
    const meal = savedMeals.find(item => String(item.id) === String(plannedMealId))
    if (!meal) return
    const scheduled = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
      date: plannerAnchor, slot: plannedMealSlot,
      mealId: String(meal.id), name: meal.name,
      calories: Number(meal.calories) || 0
    }
    savePlannedMeals([...plannedMeals, scheduled])
  }
  const [foodSort, setFoodSort] = useState('newest')
  const [quickFoodFilter, setQuickFoodFilter] = useState('all')
  const [favoriteFoodIds, setFavoriteFoodIds] = useState(() => {
    try {
      const key = 'nutrilog-favorite-foods-' + (user?.id || 'default')
      const stored = JSON.parse(localStorage.getItem(key) || '[]')
      return Array.isArray(stored) ? stored.map(String) : []
    } catch { return [] }
  })
  useEffect(() => {
    try {
      const key = 'nutrilog-favorite-foods-' + (user?.id || 'default')
      const stored = JSON.parse(localStorage.getItem(key) || '[]')
      setFavoriteFoodIds(Array.isArray(stored) ? stored.map(String) : [])
    } catch { setFavoriteFoodIds([]) }
  }, [user?.id])
  const toggleFavoriteFood = id => {
    setFavoriteFoodIds(prev => {
      const value = String(id)
      const next = prev.includes(value) ? prev.filter(item => item !== value) : [...prev, value]
      localStorage.setItem('nutrilog-favorite-foods-' + (user?.id || 'default'), JSON.stringify(next))
      return next
    })
  }
  const [foodLogQuantities, setFoodLogQuantities] = useState({})
  
  // Ref for click outside detection
  const quickLogSearchRef = useRef(null)
  
  // Track if initial load is complete
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  
  // Food Database
  const [savedFoods, setSavedFoods] = useState([])
  
  // Meals Database
  const [savedMeals, setSavedMeals] = useState([])
  const [editingMealId, setEditingMealId] = useState(null)
  
  // Today's log (foods and meals consumed)
  const [logEntries, setLogEntries] = useState([])
  
  // Goals (for backward compatibility, keep dailyGoal)
  const [dailyGoal, setDailyGoal] = useState(2000)
  const [goalInput, setGoalInput] = useState(2000)
  
  // Macro Goals
  const [macroGoals, setMacroGoals] = useState({
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65,
    fiber: 25
  })
  
  const [macroGoalsInput, setMacroGoalsInput] = useState({
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65,
    fiber: 25
  })
  
  // Form states
  const [foodFormData, setFoodFormData] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '',
    servingAmount: '1',
    servingUnit: 'serving'
  })
  const [editingFoodId, setEditingFoodId] = useState(null)
  const [editingFoodForm, setEditingFoodForm] = useState({
    name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '',
    servingAmount: '1', servingUnit: 'serving'
  })
  
  const [mealFormData, setMealFormData] = useState({
    name: '',
    selectedFoods: []
  })
  const [mealFoodsExpanded, setMealFoodsExpanded] = useState(true)
  const [mealFoodSearch, setMealFoodSearch] = useState('')
  const [mealFoodSort, setMealFoodSort] = useState('name')
  const [trackerHistoryDate, setTrackerHistoryDate] = useState(() => getLocalDateString())
  const [showTrackerHistory, setShowTrackerHistory] = useState(false)
  const [historyCalendarVisible, setHistoryCalendarVisible] = useState(false)
  const [mealHistoryDate, setMealHistoryDate] = useState(() => getLocalDateString())
  const [showMealHistory, setShowMealHistory] = useState(false)
  const [expandedLogEntryId, setExpandedLogEntryId] = useState(null)
  const [editingLogMeal, setEditingLogMeal] = useState(null)
  const [loggedMealFoodSearch, setLoggedMealFoodSearch] = useState('')
  const [editingLogEntry, setEditingLogEntry] = useState(null)
  // Latest overlay state is read by native Back, browser Back and Escape.
  // Priority: entry editor, meal editor, food editor, meal form, expanded meal.
  backActionRef.current = () => {
    if (editingLogEntry) { setEditingLogEntry(null); return true }
    if (editingLogMeal) { setEditingLogMeal(null); return true }
    if (editingFoodId) { setEditingFoodId(null); return true }
    if (editingMealId) { setEditingMealId(null); return true }
    if (expandedLogEntryId) { setExpandedLogEntryId(null); return true }
    return false
  }
  
  const [quickLogForm, setQuickLogForm] = useState({
    selectedItem: null,
    itemType: '', // 'food' or 'meal'
    date: getLocalDateString(), // Default to today
    searchQuery: '',
    showSuggestions: false,
    quantity: '1'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.mode = mode
    document.documentElement.style.setProperty('--custom-accent', customAccent)
    localStorage.setItem('nutrilog-theme', theme)
    localStorage.setItem('nutrilog-mode', mode)
    localStorage.setItem('nutrilog-custom-accent', customAccent)
  }, [theme, mode, customAccent])

  useEffect(() => {
    // APK upgrades retain WebView storage; an account-scoped backup also avoids
    // one user's tile arrangement overwriting another user's arrangement.
    const persisted = JSON.stringify({
      template: trackerLayout.template,
      columns: trackerLayout.columns,
      cards: trackerLayout.cards,
      order: trackerLayout.order
    })
    localStorage.setItem('nutrilog-tracker-layout-' + (user?.id || 'default'), persisted)
    localStorage.setItem('nutrilog-tracker-layout', persisted)
  }, [trackerLayout, user?.id])

  // Recheck the device timezone when returning to the app and periodically while open.
  // This also catches travel and daylight-saving-related timezone configuration changes.
  const [deviceTimeZone, setDeviceTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  // Manual selection is account-scoped and overrides unreliable Android WebView detection.
  const timeZoneStorageKey = 'nutrilog-timezone-' + (user?.id || 'default')
  const [timeZoneOverride, setTimeZoneOverride] = useState(() =>
    localStorage.getItem('nutrilog-timezone-' + (user?.id || 'default')) || 'auto'
  )
  const selectedTimeZone = timeZoneOverride === 'auto' ? deviceTimeZone : timeZoneOverride

  // Calendar-day grouping is always evaluated in the user's selected IANA zone.
  const zonedDay = value => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: selectedTimeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).reduce((parts, part) => ({ ...parts, [part.type]: part.value }), {})
  }
  const zonedDateKey = value => {
    const parts = zonedDay(value)
    return parts.year ? parts.year + '-' + parts.month + '-' + parts.day : ''
  }
  const zonedToday = () => zonedDateKey(new Date())
  const zonedClock = value => new Intl.DateTimeFormat('en-US', {
    timeZone: selectedTimeZone, hour: '2-digit', minute: '2-digit'
  }).format(new Date(value))

  useEffect(() => {
    localStorage.setItem(timeZoneStorageKey, timeZoneOverride)
  }, [timeZoneStorageKey, timeZoneOverride])
  useEffect(() => {
    const checkTimeZone = () => {
      const current = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      setDeviceTimeZone(previous => previous === current ? previous : current)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') checkTimeZone() }
    window.addEventListener('focus', checkTimeZone)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(checkTimeZone, 60000)
    return () => {
      window.removeEventListener('focus', checkTimeZone)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [])

  // Serialize preference writes so an older response cannot overwrite a newer plan.
  const preferenceSaveQueue = useRef(Promise.resolve())
  const preferenceSyncVersion = useRef(initialServerData?.preferences?.syncVersion ?? null)
  const preferenceConflict = useRef(false)
  const remotePlansHydrating = useRef(false)
  const preferenceSaveRevision = useRef(0)
  const latestPreferences = useRef(null)
  const [syncRetry, setSyncRetry] = useState(0)

  const [plannerSyncError, setPlannerSyncError] = useState('')
  const recoverPlannedMeals = async () => {
    setPlannerSyncError('')
    setPlannerSyncStatus('saving')
    try {
      // Preserve the original draft before normalizing legacy IDs.
      const backupKey = 'nutrilog-planned-meals-recovery-backup-' + (user?.id || 'default')
      if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, JSON.stringify(plannedMeals))
      // Legacy storage may contain JSON-encoded meal objects rather than objects.
      const decoded = plannedMeals.map(item => {
        if (typeof item !== 'string') return item
        try {
          const parsed = JSON.parse(item)
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : item
        } catch { return item }
      })
      const malformed = decoded.map((item, index) => (!item || typeof item !== 'object' || Array.isArray(item)) ? index + 1 : null).filter(Boolean)
      const normalized = decoded.flatMap((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return []
        const existingId = item.id == null ? '' : String(item.id).trim()
        // Deterministic across retries and browser restarts for the same entry.
        const fallbackId = 'recovered-' + (user?.id || 'account') + '-' + index + '-' +
          Array.from(JSON.stringify(item)).reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36)
        return [{ ...item, id: existingId && existingId.length <= 100 ? existingId : fallbackId }]
      })
      if (malformed.length) {
        const describe = index => {
          const value = decoded[index - 1]
          if (value === null) return 'null'
          if (Array.isArray(value)) return 'array (' + value.length + ' elements)'
          if (typeof value === 'string') return 'string (' + value.length + ' characters)'
          return typeof value
        }
        setPlannerSyncError('Invalid entries: ' + malformed.map(index => '#' + index + ' = ' + describe(index)).join(', ') + '. Original local data and recovery backup are preserved; valid meals may have uploaded, but full sync is not confirmed.')
      }
      if (!normalized.length) throw new Error('No valid planned meal objects to recover. Local backup is preserved.')
      const result = await api.preferences.mergePlannedMeals(normalized, readDeletedMealIds())
      const remotePlans = result.plannedMeals || []
      const ids = new Set(remotePlans.map(item => String(item.id)))
      const deleted = new Set(readDeletedMealIds())
      const missing = normalized.filter(item => !deleted.has(String(item.id)) && !ids.has(String(item.id)))
      if (missing.length) throw new Error('Server returned ' + remotePlans.length + ' of ' + normalized.length + ' submitted meals; ' + missing.length + ' missing. First missing ID: ' + String(missing[0].id).slice(0, 90))
      preferenceSyncVersion.current = result.syncVersion
      preferenceConflict.current = false
      if (!malformed.length) {
        remotePlansHydrating.current = true
        setPlannedMeals(remotePlans)
        localStorage.setItem('nutrilog-planned-meals-' + (user?.id || 'default'), JSON.stringify(remotePlans))
      }
      // Partial uploads are not fully synced: retain all local entries unchanged.
      setPlannerSyncStatus(malformed.length ? 'error' : 'saved')
    } catch (error) {
      setPlannerSyncError(String(error?.message || 'Unknown server error'))
      preferenceConflict.current = true
      setPlannerSyncStatus('conflict')
    }
  }

  useEffect(() => {
    if (!isInitialLoadComplete || preferenceConflict.current) return
    if (remotePlansHydrating.current) { remotePlansHydrating.current = false; return }
    const preferences = {
      theme, mode, customAccent,
      trackerLayout: { template: trackerLayout.template, columns: trackerLayout.columns, cards: trackerLayout.cards,
        order: trackerLayout.order, timeZone: selectedTimeZone, plannedMeals },
      tabOrder
    }
    latestPreferences.current = preferences
    const revision = ++preferenceSaveRevision.current
    const timer = setTimeout(() => {
      preferenceSaveQueue.current = preferenceSaveQueue.current.catch(() => {}).then(async () => {
        // Ignore stale queued writes; only send the latest state.
        if (revision !== preferenceSaveRevision.current) return
        try {
          if (preferenceSyncVersion.current === null) {
            const current = (await api.preferences.get()).preferences
            if (current?.syncVersion) {
              preferenceSyncVersion.current = current.syncVersion
            }
          }
          if (revision !== preferenceSaveRevision.current) return
          const result = await api.preferences.save({ ...latestPreferences.current, syncVersion: preferenceSyncVersion.current })
          preferenceSyncVersion.current = result.syncVersion ?? preferenceSyncVersion.current
        } catch (error) {
          if (String(error?.message || '').includes('changed on another device')) {
            preferenceConflict.current = true
          }
        }
      })
    }, 600)
    return () => clearTimeout(timer)
  }, [theme, mode, customAccent, trackerLayout.template, trackerLayout.columns, trackerLayout.cards,
    trackerLayout.order, tabOrder, isInitialLoadComplete, selectedTimeZone, syncRetry])

  // Read the account's latest plans when this device becomes active, without
  // overwriting local edits that have not yet been confirmed by the server.
  // Reconcile plans on activation and periodically while online. The merge
  // endpoint unions by ID; never replace an unsynced local draft with a snapshot.
  const plannerReconcileBusy = useRef(false)
  const refreshAccountPlans = async () => {
    if (isOfflineMode() || plannerReconcileBusy.current || !isInitialLoadComplete) return
    plannerReconcileBusy.current = true
    const revisionAtStart = plannerLocalChangeRevision.current
    if (!plannerHasConfirmedSync.current || revisionAtStart > plannerConfirmedRevision.current) setPlannerSyncStatus('saving')
    try {
      const local = readLocalPlannedMeals()
      const valid = local.filter(item => item && typeof item === 'object' && !Array.isArray(item) && item.id != null && String(item.id).trim())
      const malformed = local.length !== valid.length
      const response = await api.preferences.mergePlannedMeals(valid, readDeletedMealIds())
      const remote = response
      const serverPlans = response?.plannedMeals
      if (!Array.isArray(serverPlans)) throw new Error('Server returned no planned meal list')
      const deletedFromServer = Array.isArray(response.deletedIds) ? response.deletedIds.map(String) : []
      const allDeleted = [...new Set([...readDeletedMealIds(), ...deletedFromServer])]
      localStorage.setItem(plannedMealsDeletedKey, JSON.stringify(allDeleted))
      const combined = combinePlannedMeals(local, serverPlans)
      const deleted = new Set(allDeleted)
      if (!valid.filter(item => !deleted.has(String(item.id))).every(item => serverPlans.some(saved => saved && String(saved.id) === String(item.id))) || serverPlans.some(item => item && deleted.has(String(item.id)))) {
        throw new Error('Server did not confirm every local planned meal')
      }
      preferenceSyncVersion.current = remote?.syncVersion ?? preferenceSyncVersion.current
      preferenceConflict.current = false
      if (revisionAtStart !== plannerLocalChangeRevision.current) return
      if (JSON.stringify(combined) !== JSON.stringify(local)) {
        remotePlansHydrating.current = true
        localStorage.setItem(plannedMealsStorageKey, JSON.stringify(combined))
        setPlannedMeals(combined)
      }
      if (malformed) {
        plannerHasConfirmedSync.current = false
        setPlannerSyncError('Some legacy planned meal entries remain local only; recovery is required.')
        setPlannerSyncStatus('error')
      } else if (revisionAtStart === plannerLocalChangeRevision.current) {
        plannerConfirmedRevision.current = revisionAtStart
        plannerHasConfirmedSync.current = true
        setPlannerSyncError('')
        setPlannerSyncStatus('saved')
      }
    } catch (error) {
      if (revisionAtStart === plannerLocalChangeRevision.current) {
        plannerHasConfirmedSync.current = false
        setPlannerSyncError(String(error?.message || 'Automatic sync failed'))
        setPlannerSyncStatus('error')
      }
    } finally {
      plannerReconcileBusy.current = false
    }
  }
  useEffect(() => {
    const onActive = () => { if (document.visibilityState === 'visible') refreshAccountPlans() }
    window.addEventListener('focus', onActive)
    window.addEventListener('online', onActive)
    document.addEventListener('visibilitychange', onActive)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshAccountPlans()
    }, 5000)
    onActive()
    return () => {
      window.removeEventListener('focus', onActive)
      window.removeEventListener('online', onActive)
      document.removeEventListener('visibilitychange', onActive)
      clearInterval(interval)
    }
  }, [user?.id, plannedMeals, isInitialLoadComplete, syncRetry])
  useEffect(() => {
    const available = user?.role === 'admin' ? [...tabDefaults, 'admin'] : tabDefaults
    const normalized = [...tabOrder.filter(tab => available.includes(tab)), ...available.filter(tab => !tabOrder.includes(tab))]
    if (normalized.join('|') !== tabOrder.join('|')) setTabOrder(normalized)
    localStorage.setItem('nutrilog-tab-order-' + (user?.id || 'default'), JSON.stringify(normalized))
  }, [tabOrder, user?.id, user?.role])

  const moveTab = (tabId, direction) => {
    setTabOrder(prev => {
      const index = prev.indexOf(tabId)
      const target = index + direction
      if (index < 0 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const beginTabDrag = (event, tabId) => {
    if (!customizeTabs) return
    event.preventDefault()
    event.stopPropagation()
    const tab = event.currentTarget?.closest('.tab-btn')
    if (!tab) return

    tabDragRef.current = {
      tabId,
      tab,
      startX: event.clientX,
      startY: event.clientY
    }

    if (event.currentTarget?.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingTab(tabId)
    tab.style.zIndex = '20'
    tab.style.transition = 'none'
    tab.style.willChange = 'transform'
  }

  useEffect(() => {
    if (!draggingTab) return

    const handlePointerMove = event => {
      const drag = tabDragRef.current
      if (!drag || drag.tabId !== draggingTab) return
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      drag.tab.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.03)`
    }

    const handlePointerUp = event => {
      const drag = tabDragRef.current
      if (!drag || drag.tabId !== draggingTab) return

      const tabs = [...document.querySelectorAll('.tab-navigation .tab-btn[data-tab-id]')]
        .filter(tab => tab.dataset.tabId !== drag.tabId)

      let target = null
      let closest = Infinity
      for (const tab of tabs) {
        const rect = tab.getBoundingClientRect()
        const distance = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2))
        if (distance < closest) {
          closest = distance
          target = tab
        }
      }

      if (target && closest < Math.max(target.offsetWidth, target.offsetHeight) * 0.9) {
        const targetId = target.dataset.tabId
        setTabOrder(prev => {
          const next = [...prev]
          const from = next.indexOf(drag.tabId)
          const to = next.indexOf(targetId)
          if (from < 0 || to < 0 || from === to) return prev
          const [moved] = next.splice(from, 1)
          next.splice(to, 0, moved)
          return next
        })
      }

      drag.tab.style.transition = 'transform 160ms ease'
      drag.tab.style.transform = ''
      setTimeout(() => {
        if (drag.tab) {
          drag.tab.style.zIndex = ''
          drag.tab.style.willChange = ''
          drag.tab.style.transition = ''
        }
      }, 180)

      tabDragRef.current = null
      setDraggingTab(null)
    }

    const handlePointerCancel = () => {
      const drag = tabDragRef.current
      if (drag?.tab) {
        drag.tab.style.transform = ''
        drag.tab.style.zIndex = ''
        drag.tab.style.willChange = ''
        drag.tab.style.transition = ''
      }
      tabDragRef.current = null
      setDraggingTab(null)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [draggingTab, customizeTabs])

  // Replay only authenticated account operations, then reconcile temporary IDs
  // using confirmed server results. Keep conflicts in the journal for review.
  useEffect(() => {
    if (!user?.id || isOfflineMode()) return
    let active = true
    const syncPending = async () => {
      if (!navigator.onLine || !active) return
      try {
        const summary = await pendingOperations.replay(user.id, api)
        if (!active || !summary.results?.length) return
        const reconcile = (previous, resource) => {
          let next = previous
          for (const result of summary.results) {
            if (result.resource !== resource) continue
            const id = result.method === 'POST' ? 'pending:' + result.operationId : result.recordId
            if (result.method === 'DELETE' || result.deleted) next = next.filter(entry => String(entry.id) !== String(id))
            else if (result.item) {
              const resolved = { ...result.item, updatedAt: result.item.updated_at || result.item.updatedAt, pendingSync: false }
              next = next.some(entry => String(entry.id) === String(id))
                ? next.map(entry => String(entry.id) === String(id) ? resolved : entry)
                : [...next, resolved]
            }
          }
          return next
        }
        setSavedFoods(previous => reconcile(previous, 'foods'))
        setSavedMeals(previous => reconcile(previous, 'meals'))
        // Refresh the complete snapshot after the local IDs have been resolved.
        if (typeof onRefresh === 'function') await onRefresh()
      } catch (error) {
        console.error('[NutriLog sync] Pending edits remain on this device', error)
      }
    }
    const onResume = () => { void syncPending() }
    window.addEventListener('online', onResume)
    window.addEventListener('focus', onResume)
    void syncPending()
    return () => {
      active = false
      window.removeEventListener('online', onResume)
      window.removeEventListener('focus', onResume)
    }
  }, [user?.id, onRefresh])

  // Load data through the application storage service.
  useEffect(() => {
    const local = storage.load()
    const data = initialServerData ? normalizeServerData(initialServerData) : local
    // Keep account-scoped pending edits visible when server data refreshes.
    // Never apply another account's queue to this account's records.
    let visibleFoods = data.savedFoods
    let visibleMeals = data.savedMeals
    if (user?.id && !isOfflineMode()) {
      try {
        visibleFoods = pendingOperations.overlay(user.id, 'foods', visibleFoods)
        visibleMeals = pendingOperations.overlay(user.id, 'meals', visibleMeals)
      } catch (error) {
        console.error('[NutriLog sync] Pending edits could not be loaded; preserving cached view', error)
        visibleFoods = local.savedFoods
        visibleMeals = local.savedMeals
      }
    }
    setSavedFoods(visibleFoods)
    setSavedMeals(visibleMeals)
    setLogEntries(data.logEntries)
    const goals = data.macroGoals || local.macroGoals
    const calories = Number(goals?.calories || local.dailyGoal || 2000)
    setGoalInput(previous =>
      previous === dailyGoal ? calories : previous
    )
    setMacroGoalsInput(previous =>
      JSON.stringify(previous) === JSON.stringify(macroGoals)
        ? goals
        : previous
    )
    setDailyGoal(calories)
    setMacroGoals(goals)
    setIsInitialLoadComplete(true)
  }, [initialServerData, user?.id])

  // Refresh server-authoritative Tracker logs without reloading other screens.
  // Do not apply a response that overlaps a local log mutation or open editor.
  const trackerLogRevision = useRef(0)
  const trackerLogWrites = useRef(0)
  const trackerLogRefreshBusy = useRef(false)
  const trackedLogWrite = async operation => {
    trackerLogRevision.current += 1
    trackerLogWrites.current += 1
    try { return await operation() }
    finally {
      trackerLogRevision.current += 1
      trackerLogWrites.current -= 1
    }
  }
  useEffect(() => {
    if (!user?.id || !isInitialLoadComplete || isOfflineMode()) return
    let disposed = false
    const refreshLogs = async () => {
      if (disposed || document.visibilityState !== 'visible' || trackerLogRefreshBusy.current ||
          trackerLogWrites.current || editingLogEntry || editingLogMeal) return
      trackerLogRefreshBusy.current = true
      const revision = trackerLogRevision.current
      try {
        const response = await api.logs.list()
        if (disposed || trackerLogWrites.current || revision !== trackerLogRevision.current ||
            !Array.isArray(response.items)) return
        const remote = normalizeServerData({ logs: response.items }).logEntries
        setLogEntries(current => JSON.stringify(current) === JSON.stringify(remote) ? current : remote)
      } catch (error) {
        console.warn('[NutriLog] Tracker log refresh failed:', error)
      } finally {
        trackerLogRefreshBusy.current = false
      }
    }
    const onActive = () => { void refreshLogs() }
    const interval = setInterval(onActive, 5000)
    window.addEventListener('focus', onActive)
    document.addEventListener('visibilitychange', onActive)
    return () => {
      disposed = true
      clearInterval(interval)
      window.removeEventListener('focus', onActive)
      document.removeEventListener('visibilitychange', onActive)
    }
  }, [user?.id, isInitialLoadComplete, editingLogEntry, editingLogMeal])

  // Persist state through the storage service. This adapter can later be
  // replaced by the authenticated API without changing the UI components.
  useEffect(() => { if (isInitialLoadComplete) storage.save('foods', savedFoods) }, [savedFoods, isInitialLoadComplete])
  useEffect(() => { if (isInitialLoadComplete) storage.save('meals', savedMeals) }, [savedMeals, isInitialLoadComplete])
  useEffect(() => { if (isInitialLoadComplete) storage.save('logs', logEntries) }, [logEntries, isInitialLoadComplete])
  useEffect(() => { if (isInitialLoadComplete) storage.save('dailyGoal', dailyGoal.toString()) }, [dailyGoal, isInitialLoadComplete])
  useEffect(() => { if (isInitialLoadComplete) storage.save('macroGoals', macroGoals) }, [macroGoals, isInitialLoadComplete])

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (quickLogSearchRef.current && !quickLogSearchRef.current.contains(event.target)) {
        setQuickLogForm(prev => ({ ...prev, showSuggestions: false }))
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Food Database Handlers
  const handleFoodFormChange = (e) => {
    const { name, value } = e.target
    setFoodFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveFood = async (e) => {
    e.preventDefault()
    if (!foodFormData.name || !foodFormData.calories) {
      alert('Please enter at least food name and calories')
      return
    }
    const draft = {
      name: foodFormData.name,
      calories: parseFloat(foodFormData.calories) || 0,
      protein: parseFloat(foodFormData.protein) || 0,
      carbs: parseFloat(foodFormData.carbs) || 0,
      fat: parseFloat(foodFormData.fat) || 0,
      fiber: parseFloat(foodFormData.fiber) || 0,
      servingSize: `${foodFormData.servingAmount || 1} ${foodFormData.servingUnit || 'serving'}`,
      servingAmount: Number(foodFormData.servingAmount) || 1,
      servingUnit: foodFormData.servingUnit || 'serving'
    }
    let pendingCreate = null
    try {
      // Journal first: if the request reaches the server but its response is
      // lost, replay uses the same operation ID and cannot create a duplicate.
      if (user?.id && !isOfflineMode()) {
        pendingCreate = pendingOperations.enqueue(user.id, { resource: 'foods', method: 'POST', payload: draft })
      }
      const serverFood = user
        ? (await api.foods.create(draft, pendingCreate ? { operationId: pendingCreate.id } : {})).item
        : null
      const newFood = serverFood ? { ...draft, ...serverFood, id: serverFood.id, updatedAt: serverFood.updated_at, servingSize: serverFood.serving_size || draft.servingSize, calories: Number(serverFood.calories), protein: Number(serverFood.protein), carbs: Number(serverFood.carbs), fat: Number(serverFood.fat), fiber: Number(serverFood.fiber) } : { ...draft, id: Date.now() }
      if (pendingCreate) pendingOperations.acknowledge(user.id, pendingCreate.id)
      setSavedFoods(prev => [newFood, ...prev])
      setFoodFormData({ name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '', servingAmount: '1', servingUnit: 'serving' })
    } catch (error) {
      if (pendingCreate && (error.isNetworkError || error.status >= 500)) {
        // Do not discard an ambiguous request. The server may have committed it.
        setSavedFoods(prev => [{ ...draft, id: 'pending:' + pendingCreate.id, pendingSync: true }, ...prev])
        setFoodFormData({ name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '', servingAmount: '1', servingUnit: 'serving' })
        alert('Food saved on this device. It is pending synchronization; do not delete or edit it until synced.')
      } else {
        // A definitive HTTP rejection is not an offline edit.
        if (pendingCreate && error.status >= 400 && error.status < 500 && error.status !== 409) pendingOperations.acknowledge(user.id, pendingCreate.id)
        if (pendingCreate && error.status === 409) pendingOperations.markConflict(user.id, pendingCreate.id, error.message)
        alert(error.message)
      }
    }
  }

  const handleDeleteFood = async (id) => {
    let pendingWrite = null
    try {
      if (user?.id && !isOfflineMode()) {
        const original = savedFoods.find(item => String(item.id) === String(id))
        pendingWrite = pendingOperations.enqueue(user.id, {
          resource: 'foods', method: 'DELETE', recordId: id,
          baseVersion: original?.updatedAt || original?.updated_at || null
        })
      }
      if (user) await api.foods.remove(id, pendingWrite ? { baseVersion: pendingWrite.baseVersion, operationId: pendingWrite.id } : {})
      if (pendingWrite) pendingOperations.acknowledge(user.id, pendingWrite.id)
      setSavedFoods(prev => prev.filter(item => String(item.id) !== String(id)))
    } catch (error) {
      if (pendingWrite && (error.isNetworkError || error.status >= 500)) {
        setSavedFoods(prev => prev.filter(item => String(item.id) !== String(id)))
        alert('Food deletion saved on this device and pending synchronization.')
      } else {
        if (pendingWrite && error.status >= 400 && error.status < 500 && error.status !== 409) pendingOperations.acknowledge(user.id, pendingWrite.id)
        if (pendingWrite && error.status === 409) pendingOperations.markConflict(user.id, pendingWrite.id, error.message)
        alert(error.message)
      }
    }
  }

  const startEditFood = food => {
    setEditingFoodId(food.id)
    setEditingFoodForm({
      name: food.name || '', calories: food.calories ?? '', protein: food.protein ?? '',
      carbs: food.carbs ?? '', fat: food.fat ?? '', fiber: food.fiber ?? '',
      servingAmount: food.servingAmount ?? 1, servingUnit: food.servingUnit || 'serving'
    })
  }

  const handleEditingFoodChange = e => {
    const { name, value } = e.target
    setEditingFoodForm(prev => ({ ...prev, [name]: value }))
  }

  const cancelEditFood = () => setEditingFoodId(null)

  const handleUpdateFood = async e => {
    e.preventDefault()
    if (!editingFoodForm.name || editingFoodForm.calories === '') {
      alert('Please enter at least food name and calories')
      return
    }
    const draft = {
      name: editingFoodForm.name,
      calories: parseFloat(editingFoodForm.calories) || 0,
      protein: parseFloat(editingFoodForm.protein) || 0,
      carbs: parseFloat(editingFoodForm.carbs) || 0,
      fat: parseFloat(editingFoodForm.fat) || 0,
      fiber: parseFloat(editingFoodForm.fiber) || 0,
      servingSize: `${editingFoodForm.servingAmount || 1} ${editingFoodForm.servingUnit || 'serving'}`,
      servingAmount: Number(editingFoodForm.servingAmount) || 1,
      servingUnit: editingFoodForm.servingUnit || 'serving'
    }
    let pendingWrite = null
    try {
      if (user?.id && !isOfflineMode()) {
        const original = savedFoods.find(food => String(food.id) === String(editingFoodId))
        pendingWrite = pendingOperations.enqueue(user.id, {
          resource: 'foods', method: 'PUT', recordId: editingFoodId,
          baseVersion: original?.updatedAt || original?.updated_at || null,
          payload: draft
        })
      }
      const result = user
        ? (await api.foods.update(editingFoodId, draft, pendingWrite ? { baseVersion: pendingWrite.baseVersion, operationId: pendingWrite.id } : {})).item
        : { ...draft, id: editingFoodId }
      if (pendingWrite) pendingOperations.acknowledge(user.id, pendingWrite.id)
      const updatedFood = {
        ...draft, ...result, id: editingFoodId,
        updatedAt: result?.updated_at || result?.updatedAt,
        servingSize: result?.serving_size || draft.servingSize,
        calories: Number(result?.calories ?? draft.calories),
        protein: Number(result?.protein ?? draft.protein),
        carbs: Number(result?.carbs ?? draft.carbs),
        fat: Number(result?.fat ?? draft.fat),
        fiber: Number(result?.fiber ?? draft.fiber),
        servingAmount: Number(result?.serving_amount ?? draft.servingAmount),
        servingUnit: result?.serving_unit || draft.servingUnit
      }
      setSavedFoods(prev => prev.map(food => food.id === editingFoodId ? updatedFood : food))
      setEditingFoodId(null)
    } catch (error) {
      if (pendingWrite && (error.isNetworkError || error.status >= 500)) {
        setSavedFoods(prev => prev.map(food => String(food.id) === String(editingFoodId)
          ? { ...food, ...draft, pendingSync: true } : food))
        setEditingFoodId(null)
        alert('Food changes saved on this device and pending synchronization.')
      } else {
        if (pendingWrite && error.status >= 400 && error.status < 500 && error.status !== 409) pendingOperations.acknowledge(user.id, pendingWrite.id)
        if (pendingWrite && error.status === 409) pendingOperations.markConflict(user.id, pendingWrite.id, error.message)
        alert(error.message)
      }
    }
  }

  // Meal Builder Handlers
  const handleMealFormChange = (e) => {
    const { name, value } = e.target
    setMealFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleAddFoodToMeal = (foodId) => {
    const food = savedFoods.find(f => String(f.id) === String(foodId))
    if (!food) return

    setMealFormData(prev => ({
      ...prev,
      selectedFoods: [...prev.selectedFoods, { ...food, quantity: 1 }]
    }))
  }

  const handleRemoveFoodFromMeal = (index) => {
    setMealFormData(prev => ({
      ...prev,
      selectedFoods: prev.selectedFoods.filter((_, i) => i !== index)
    }))
  }

  const handleFoodQuantityChange = (index, quantity) => {
    setMealFormData(prev => ({
      ...prev,
      selectedFoods: prev.selectedFoods.map((food, i) =>
        i === index ? { ...food, quantity } : food
      )
    }))
  }

  const handleFoodQuantityBlur = (index) => {
    setMealFormData(prev => ({
      ...prev,
      selectedFoods: prev.selectedFoods.map((food, i) => {
        if (i !== index) return food
        const value = Number(food.quantity)
        return {
          ...food,
          quantity: Number.isFinite(value) && value > 0 ? value : 1
        }
      })
    }))
  }

  const sortedMealFoods = [...mealFormData.selectedFoods].sort((a, b) => {
    if (mealFoodSort === 'name') return String(a.name || '').localeCompare(String(b.name || ''))
    if (mealFoodSort === 'calories') return Number(b.calories || 0) - Number(a.calories || 0)
    if (mealFoodSort === 'protein') return Number(b.protein || 0) - Number(a.protein || 0)
    if (mealFoodSort === 'carbs') return Number(b.carbs || 0) - Number(a.carbs || 0)
    if (mealFoodSort === 'fat') return Number(b.fat || 0) - Number(a.fat || 0)
    if (mealFoodSort === 'quantity') return Number(b.quantity || 0) - Number(a.quantity || 0)
    return 0
  })

  const handleLogMealFromBuilder = async () => {
    if (mealFormData.selectedFoods.length === 0) {
      alert('Please add at least one food to the meal.')
      return
    }

    const normalizedFoods = mealFormData.selectedFoods.map(food => ({
      ...food,
      quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1
    }))

    const totals = calculateMealTotals(normalizedFoods)
    const draft = {
      type: 'meal',
      name: mealFormData.name.trim() || 'Meal',
      ...totals,
      quantity: 1,
      timestamp: new Date().toISOString(),
      foods: normalizedFoods
    }

    try {
      const newEntry = await createLogEntry(draft)
      setLogEntries(prev => [newEntry, ...prev])
      setMealFormData({ name: '', selectedFoods: [] })
      setEditingMealId(null)
      setActiveTab('tracker')
    } catch (error) {
      alert(error.message)
    }
  }

  const handleSaveMeal = async (e) => {
    e.preventDefault()
    if (!mealFormData.name || mealFormData.selectedFoods.length === 0) {
      alert('Please enter a meal name and add at least one food')
      return
    }
    const normalizedFoods = mealFormData.selectedFoods.map(food => ({
      ...food,
      quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1
    }))
    const totals = calculateMealTotals(normalizedFoods)
    const draft = { name: mealFormData.name, foods: normalizedFoods, ...totals }
    let pendingWrite = null
    try {
      if (user?.id && !isOfflineMode()) {
        const original = editingMealId ? savedMeals.find(meal => String(meal.id) === String(editingMealId)) : null
        pendingWrite = pendingOperations.enqueue(user.id, {
          resource: 'meals',
          method: editingMealId ? 'PUT' : 'POST',
          recordId: editingMealId || null,
          baseVersion: original?.updatedAt || original?.updated_at || null,
          payload: draft
        })
      }
      const newMeal = user
        ? (editingMealId
            ? (await api.meals.update(editingMealId, draft, pendingWrite ? { baseVersion: pendingWrite.baseVersion, operationId: pendingWrite.id } : {})).item
            : (await api.meals.create(draft, pendingWrite ? { operationId: pendingWrite.id } : {})).item)
        : { ...draft, id: editingMealId || Date.now() }
      if (pendingWrite) pendingOperations.acknowledge(user.id, pendingWrite.id)
      const versionedMeal = { ...newMeal, updatedAt: newMeal.updated_at || newMeal.updatedAt }
      setSavedMeals(prev => editingMealId
        ? prev.map(meal => meal.id === editingMealId ? versionedMeal : meal)
        : [versionedMeal, ...prev]
      )
      setMealFormData({ name: '', selectedFoods: [] })
      setEditingMealId(null)
    } catch (error) {
      if (pendingWrite && (error.isNetworkError || error.status >= 500)) {
        const pendingMeal = { ...draft, id: editingMealId || 'pending:' + pendingWrite.id, pendingSync: true }
        setSavedMeals(prev => editingMealId
          ? prev.map(meal => String(meal.id) === String(editingMealId) ? { ...meal, ...pendingMeal } : meal)
          : [pendingMeal, ...prev]
        )
        setMealFormData({ name: '', selectedFoods: [] })
        setEditingMealId(null)
        alert('Meal saved on this device and pending synchronization.')
      } else {
        if (pendingWrite && error.status >= 400 && error.status < 500 && error.status !== 409) pendingOperations.acknowledge(user.id, pendingWrite.id)
        if (pendingWrite && error.status === 409) pendingOperations.markConflict(user.id, pendingWrite.id, error.message)
        alert(error.message)
      }
    }
  }

  const handleEditMeal = (meal) => {
    setEditingMealId(meal.id)
    setMealFormData({
      name: meal.name,
      selectedFoods: meal.foods || []
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteMeal = async (id) => {
    let pendingWrite = null
    try {
      if (user?.id && !isOfflineMode()) {
        const original = savedMeals.find(item => String(item.id) === String(id))
        pendingWrite = pendingOperations.enqueue(user.id, {
          resource: 'meals', method: 'DELETE', recordId: id,
          baseVersion: original?.updatedAt || original?.updated_at || null
        })
      }
      if (user) await api.meals.remove(id, pendingWrite ? { baseVersion: pendingWrite.baseVersion, operationId: pendingWrite.id } : {})
      if (pendingWrite) pendingOperations.acknowledge(user.id, pendingWrite.id)
      setSavedMeals(prev => prev.filter(item => String(item.id) !== String(id)))
    } catch (error) {
      if (pendingWrite && (error.isNetworkError || error.status >= 500)) {
        setSavedMeals(prev => prev.filter(item => String(item.id) !== String(id)))
        alert('Meal deletion saved on this device and pending synchronization.')
      } else {
        if (pendingWrite && error.status >= 400 && error.status < 500 && error.status !== 409) pendingOperations.acknowledge(user.id, pendingWrite.id)
        if (pendingWrite && error.status === 409) pendingOperations.markConflict(user.id, pendingWrite.id, error.message)
        alert(error.message)
      }
    }
  }

  // Tracker Handlers
  const handleQuickLogSearchChange = (e) => {
    const query = e.target.value
    setQuickLogForm(prev => ({ 
      ...prev, 
      searchQuery: query,
      showSuggestions: query.length > 0,
      selectedItem: null,
      itemType: ''
    }))
  }

  const handleSelectSuggestion = (item, type) => {
    setQuickLogForm(prev => ({ 
      ...prev, 
      selectedItem: item,
      itemType: type,
      searchQuery: item.name,
      showSuggestions: false,
      quantity: '1'
    }))
  }

  const handleQuickLogDateChange = (e) => {
    setQuickLogForm(prev => ({ ...prev, date: e.target.value }))
  }
  // Search categories reuse saved foods and recent log history.
  const getFilteredSuggestions = () => {
    const query = quickLogForm.searchQuery.trim().toLowerCase()
    const recentNames = new Set(
      [...logEntries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 100).filter(entry => entry.type === 'food')
        .map(entry => String(entry.name || '').toLowerCase())
    )
    const matches = item => !query || String(item.name || '').toLowerCase().includes(query)
    const foods = savedFoods.filter(food => {
      if (!matches(food)) return false
      if (quickFoodFilter === 'recent') return recentNames.has(String(food.name || '').toLowerCase())
      if (quickFoodFilter === 'favorites') return favoriteFoodIds.includes(String(food.id))
      return true
    })
    const meals = quickFoodFilter === 'all' ? savedMeals.filter(matches) : []
    return { foods, meals }
  }

  const createLogEntry = async (entry) => {
    const saved = user ? (await trackedLogWrite(() => api.logs.create(entry))).item : null
    return saved ? {
      id: saved.id,
      type: saved.entry_type,
      name: saved.name,
      calories: Number(saved.calories),
      protein: Number(saved.protein),
      carbs: Number(saved.carbs),
      fat: Number(saved.fat),
      fiber: Number(saved.fiber),
      foods: Array.isArray(saved.foods) ? saved.foods : [],
      quantity: Number(saved.quantity || entry.quantity || 1),
      timestamp: saved.consumed_at,
    } : { ...entry, id: Date.now() }
  }

  const handleQuickLog = async (e) => {
    e.preventDefault()
    if (!quickLogForm.selectedItem) {
      alert('Please select a food or meal')
      return
    }
    const selectedDate = new Date(quickLogForm.date + 'T' + new Date().toTimeString().split(' ')[0])
    const quantity = Number(quickLogForm.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert('Please enter a valid serving quantity.')
      return
    }
    const scaled = scaleNutrition(quickLogForm.selectedItem, quantity)
    const draft = {
      type: quickLogForm.itemType,
      name: quickLogForm.selectedItem.name,
      ...scaled,
      quantity,
      timestamp: selectedDate.toISOString(),
      ...(quickLogForm.itemType === 'meal' ? { foods: quickLogForm.selectedItem.foods } : {})
    }
    try {
      const newEntry = await createLogEntry(draft)
      setLogEntries(prev => [newEntry, ...prev])
      setQuickLogForm({ selectedItem: null, itemType: '', date: getLocalDateString(), searchQuery: '', showSuggestions: false, quantity: '1' })
    } catch (error) {
      alert(error.message)
    }
  }

  const handleLogSavedFood = async (food, requestedQuantity = 1) => {
    const quantity = Number(requestedQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) { alert('Please enter a valid serving quantity.'); return }
    const scaled = scaleNutrition(food, quantity)

    const draft = {
      type: 'food',
      name: food.name,
      ...scaled,
      quantity,
      timestamp: new Date().toISOString()
    }

    try {
      const newEntry = await createLogEntry(draft)
      setLogEntries(prev => [newEntry, ...prev])
      setActiveTab('tracker')
    } catch (error) {
      alert(error.message)
    }
  }

  const handleLogMeal = async (meal) => {
    const quantity = 1
    const scaled = scaleNutrition(meal, quantity)

    const draft = {
      type: 'meal',
      name: meal.name,
      ...scaled,
      quantity,
      timestamp: new Date().toISOString(),
      foods: Array.isArray(meal.foods) ? meal.foods : []
    }

    try {
      const newEntry = await createLogEntry(draft)
      setLogEntries(prev => [newEntry, ...prev])
      setActiveTab('tracker')
    } catch (error) {
      alert(error.message)
    }
  }

  const handleUpdateLogQuantity = async (entry, requestedQuantity, originalQuantity = entry.quantity) => {
    const quantity = Number(requestedQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) { alert('Please enter a valid serving quantity.'); return }
    const currentQuantity = Number(originalQuantity) > 0 ? Number(originalQuantity) : 1
    const scale = quantity / currentQuantity
    const updated = { ...entry, quantity, calories: Number((entry.calories * scale).toFixed(2)), protein: Number((entry.protein * scale).toFixed(2)), carbs: Number((entry.carbs * scale).toFixed(2)), fat: Number((entry.fat * scale).toFixed(2)), fiber: Number(((entry.fiber || 0) * scale).toFixed(2)) }
    try {
      const saved = user ? (await trackedLogWrite(() => api.logs.update(entry.id, updated))).item : null
      const next = saved ? { ...updated, id: saved.id, type: saved.entry_type, name: saved.name, calories: Number(saved.calories), protein: Number(saved.protein), carbs: Number(saved.carbs), fat: Number(saved.fat), fiber: Number(saved.fiber), quantity: Number(saved.quantity || quantity), foods: Array.isArray(saved.foods) ? saved.foods : updated.foods, timestamp: saved.consumed_at } : updated
      setLogEntries(prev => prev.map(item => item.id === entry.id ? next : item))
    } catch (error) { alert(error.message) }
  }

  const startEditingLogEntry = entry => {
    const date = new Date(entry.timestamp)
    const pad = n => String(n).padStart(2, '0')
    const localTime = Number.isNaN(date.getTime()) ? '' : [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-') + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
    setEditingLogEntry({ ...entry, localTime, quantity: String(entry.quantity || 1) })
  }

  const saveEditingLogEntry = async () => {
    if (!editingLogEntry) return
    const entry = editingLogEntry
    const quantity = Number(entry.quantity)
    const timestamp = new Date(entry.localTime)
    if (!entry.name.trim() || !Number.isFinite(quantity) || quantity <= 0 || Number.isNaN(timestamp.getTime())) {
      alert('Enter a name, valid serving quantity, and date/time.')
      return
    }
    const nutrition = {}
    for (const field of ['calories', 'protein', 'carbs', 'fat', 'fiber']) {
      const value = Number(entry[field])
      if (!Number.isFinite(value) || value < 0) { alert('Nutrition values must be valid nonnegative numbers.'); return }
      nutrition[field] = Number(value.toFixed(2))
    }
    const updated = { ...entry, ...nutrition, name: entry.name.trim(), quantity, timestamp: timestamp.toISOString() }
    try {
      const saved = user ? (await trackedLogWrite(() => api.logs.update(entry.id, updated))).item : null
      const next = saved ? { ...updated, name: saved.name, calories: Number(saved.calories), protein: Number(saved.protein), carbs: Number(saved.carbs), fat: Number(saved.fat), fiber: Number(saved.fiber), quantity: Number(saved.quantity), timestamp: saved.consumed_at } : updated
      setLogEntries(prev => prev.map(item => item.id === entry.id ? next : item))
      setEditingLogEntry(null)
    } catch (error) { alert(error.message) }
  }

  const logEntryEditor = editingLogEntry && (
    <div className="section" role="region" aria-label="Edit food log entry">
      <h3>Edit food log entry</h3>
      <div className="form-group"><label>Name<input value={editingLogEntry.name} onChange={e => setEditingLogEntry(prev => ({ ...prev, name: e.target.value }))} /></label></div>
      <div className="form-group"><label>Date and time<input type="datetime-local" value={editingLogEntry.localTime} onChange={e => setEditingLogEntry(prev => ({ ...prev, localTime: e.target.value }))} /></label></div>
      <div className="form-group"><label>Servings<input type="text" inputMode="decimal" value={editingLogEntry.quantity} onChange={e => {
        const value = e.target.value
        setEditingLogEntry(prev => {
          const oldQuantity = Number(prev.quantity) || 1
          const newQuantity = Number(value)
          if (!Number.isFinite(newQuantity) || newQuantity <= 0) return { ...prev, quantity: value }
          const scale = newQuantity / oldQuantity
          return { ...prev, quantity: value, ...Object.fromEntries(['calories', 'protein', 'carbs', 'fat', 'fiber'].map(key => [key, Number((Number(prev[key] || 0) * scale).toFixed(2))])) }
        })
      }} /></label></div>
      <div className="meal-totals-grid">
        {['calories', 'protein', 'carbs', 'fat', 'fiber'].map(field => <div className="form-group" key={field}>
          <label>{field.charAt(0).toUpperCase() + field.slice(1)}{field === 'calories' ? ' (kcal)' : ' (g)'}
            <input type="number" min="0" step="0.01" inputMode="decimal" value={editingLogEntry[field]} onChange={e => setEditingLogEntry(prev => ({ ...prev, [field]: e.target.value }))} />
          </label>
        </div>)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={saveEditingLogEntry}>Save Changes</button>
        <button type="button" className="btn btn-secondary" onClick={() => setEditingLogEntry(null)}>Cancel</button>
      </div>
    </div>
  )

  const handleToggleLogMeal = entry => {
    if (entry.type !== 'meal') return
    setExpandedLogEntryId(prev => prev === entry.id ? null : entry.id)
    if (expandedLogEntryId === entry.id) setEditingLogMeal(null)
  }

  const handleEditLoggedMeal = entry => {
    if (entry.type !== 'meal') return
    setExpandedLogEntryId(entry.id)
    setEditingLogEntry(null)
    setLoggedMealFoodSearch('')
    const date = new Date(entry.timestamp)
    const pad = n => String(n).padStart(2, '0')
    const localTime = Number.isNaN(date.getTime()) ? '' : [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-') + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
    setEditingLogMeal({
      ...entry,
      localTime,
      quantity: String(entry.quantity ?? 1),
      name: entry.name,
      foods: Array.isArray(entry.foods) ? entry.foods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 })) : []
    })
  }

  const handleLoggedMealFoodQuantityChange = (index, value) => {
    if (value !== "" && (!/^\d*(?:\.\d*)?$/.test(value) || (Number(value) < 0))) return
    setEditingLogMeal(prev => prev ? ({
      ...prev,
      foods: prev.foods.map((food, i) => i === index ? { ...food, quantity: value } : food)
    }) : prev)
  }

  const addFoodToLoggedMeal = food => {
    setEditingLogMeal(prev => prev ? { ...prev, foods: [...prev.foods, {
      name: food.name, calories: Number(food.calories || 0), protein: Number(food.protein || 0),
      carbs: Number(food.carbs || 0), fat: Number(food.fat || 0), fiber: Number(food.fiber || 0), quantity: 1
    }] } : prev)
    setLoggedMealFoodSearch('')
  }

  const removeFoodFromLoggedMeal = index => {
    setEditingLogMeal(prev => prev ? { ...prev, foods: prev.foods.filter((_, i) => i !== index) } : prev)
  }

  const loggedMealFoodPicker = editingLogMeal && (
    <div className="form-group" style={{ marginTop: 12 }}>
      <label>Add food from saved foods
        <input type="search" placeholder="Search saved foods…" value={loggedMealFoodSearch} onChange={e => setLoggedMealFoodSearch(e.target.value)} />
      </label>
      {loggedMealFoodSearch.trim() && <div style={{ maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 6 }}>
        {savedFoods.filter(food => food.name.toLowerCase().includes(loggedMealFoodSearch.trim().toLowerCase())).slice(0, 20).map(food =>
          <button type="button" key={food.id} className="btn btn-secondary" onClick={() => addFoodToLoggedMeal(food)}>
            + {food.name} ({Number(food.calories || 0).toFixed(2)} kcal)
          </button>
        )}
      </div>}
    </div>
  )

  const handleSaveLoggedMeal = async () => {
    if (!editingLogMeal) return
    if (!editingLogMeal.name.trim() || editingLogMeal.foods.length === 0) {
      alert('A meal name and at least one food are required.')
      return
    }

    if (editingLogMeal.foods.some(food => !Number.isFinite(Number(food.quantity)) || Number(food.quantity) <= 0)) {
      alert("Each food needs a serving quantity greater than zero. Decimals such as 0.5 are supported.")
      return
    }
    const foods = editingLogMeal.foods.map(food => ({
      ...food,
      quantity: Number(food.quantity)
    }))
    const mealQuantity = Number(editingLogMeal.quantity)
    const date = new Date(editingLogMeal.localTime)
    if (!Number.isFinite(mealQuantity) || mealQuantity <= 0 || Number.isNaN(date.getTime())) {
      alert('Enter a valid positive meal serving quantity and date/time.')
      return
    }
    const baseTotals = calculateMealTotals(foods)
    const updated = {
      ...editingLogMeal,
      name: editingLogMeal.name.trim(),
      timestamp: date.toISOString(),
      foods,
      calories: Number((baseTotals.calories * mealQuantity).toFixed(2)),
      protein: Number((baseTotals.protein * mealQuantity).toFixed(2)),
      carbs: Number((baseTotals.carbs * mealQuantity).toFixed(2)),
      fat: Number((baseTotals.fat * mealQuantity).toFixed(2)),
      fiber: Number((baseTotals.fiber * mealQuantity).toFixed(2)),
      quantity: mealQuantity
    }

    try {
      const saved = user ? (await trackedLogWrite(() => api.logs.update(editingLogMeal.id, updated))).item : null
      const next = saved ? {
        ...updated,
        id: saved.id,
        type: saved.entry_type,
        name: saved.name,
        calories: Number(saved.calories),
        protein: Number(saved.protein),
        carbs: Number(saved.carbs),
        fat: Number(saved.fat),
        fiber: Number(saved.fiber),
        quantity: Number(saved.quantity || mealQuantity),
        foods: Array.isArray(saved.foods) ? saved.foods : foods,
        timestamp: saved.consumed_at
      } : updated

      setLogEntries(prev => prev.map(item => item.id === editingLogMeal.id ? next : item))
      setEditingLogMeal(null)
      setExpandedLogEntryId(null)
    } catch (error) {
      alert(error.message)
    }
  }

  const handleDeleteLogEntry = async (id) => {
    try {
      if (user) await trackedLogWrite(() => api.logs.remove(id))
      setLogEntries(prev => prev.filter(entry => entry.id !== id))
      if (expandedLogEntryId === id) {
        setExpandedLogEntryId(null)
        setEditingLogMeal(null)
      }
    } catch (error) { alert(error.message) }
  }

  const handleSetGoal = async () => {
    if (goalInput > 0) {
      setDailyGoal(goalInput)
      if (user) {
        try { await api.goals.save({ ...macroGoals, calories: Number(goalInput) }) }
        catch (error) { alert(error.message) }
      }
    }
  }

  // Planner/Goals Handlers

  const handleMacroGoalsChange = (e) => {
    const { name, value } = e.target
    setMacroGoalsInput(prev => ({ ...prev, [name]: value }))
  }

  const handleSaveMacroGoals = async (e) => {
    e.preventDefault()
    const fields = ['calories', 'protein', 'carbs', 'fat', 'fiber']
    const hasInvalidGoal = fields.some(field => macroGoalsInput[field] === '' || !Number.isFinite(Number(macroGoalsInput[field])) || Number(macroGoalsInput[field]) < 0)
    if (hasInvalidGoal) {
      alert('Please enter a valid value for every goal.')
      return
    }

    const numericGoals = Object.fromEntries(fields.map(field => [field, Number(macroGoalsInput[field])]))
    try {
      if (user) await api.goals.save(numericGoals)
      setMacroGoals(numericGoals)
      setMacroGoalsInput(numericGoals)
      setDailyGoal(numericGoals.calories)
      setGoalInput(numericGoals.calories)
      alert('Goals saved successfully!')
    } catch (error) { alert(error.message) }
  }



  // Calculate totals from log entries
  const today = new Date()
  const todayKey = zonedToday()

  const todaysLogEntries = logEntries.filter(entry => {
    if (!entry.timestamp) return false
    return zonedDateKey(entry.timestamp) === todayKey
  })

  const totalCalories = todaysLogEntries.reduce((sum, entry) => sum + entry.calories, 0)
  const totalProtein = todaysLogEntries.reduce((sum, entry) => sum + entry.protein, 0)
  const totalCarbs = todaysLogEntries.reduce((sum, entry) => sum + entry.carbs, 0)
  const totalFat = todaysLogEntries.reduce((sum, entry) => sum + entry.fat, 0)
  const totalFiber = todaysLogEntries.reduce((sum, entry) => sum + (entry.fiber || 0), 0)
  const remaining = macroGoals.calories - totalCalories
  const progress = Math.min((totalCalories / macroGoals.calories) * 100, 100)

  // Calculate macro percentages
  const proteinProgress = macroGoals.protein > 0 ? Math.min((totalProtein / macroGoals.protein) * 100, 100) : 0
  const carbsProgress = macroGoals.carbs > 0 ? Math.min((totalCarbs / macroGoals.carbs) * 100, 100) : 0
  const fatProgress = macroGoals.fat > 0 ? Math.min((totalFat / macroGoals.fat) * 100, 100) : 0
  const fiberProgress = macroGoals.fiber > 0 ? Math.min((totalFiber / macroGoals.fiber) * 100, 100) : 0

  const selectedTrackerTotals = showTrackerHistory
    ? logEntries.filter(entry => {
        if (!entry.timestamp) return false
        const date = new Date(entry.timestamp)
        if (Number.isNaN(date.getTime())) return false
        return zonedDateKey(date) === trackerHistoryDate
      }).reduce((totals, entry) => ({
        calories: totals.calories + Number(entry.calories || 0),
        protein: totals.protein + Number(entry.protein || 0),
        carbs: totals.carbs + Number(entry.carbs || 0),
        fat: totals.fat + Number(entry.fat || 0),
        fiber: totals.fiber + Number(entry.fiber || 0)
      }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
    : {
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fat: totalFat,
        fiber: totalFiber
      }
  const selectedTrackerCalories = selectedTrackerTotals.calories
  const selectedTrackerProtein = selectedTrackerTotals.protein
  const selectedTrackerCarbs = selectedTrackerTotals.carbs
  const selectedTrackerFat = selectedTrackerTotals.fat
  const selectedTrackerFiber = selectedTrackerTotals.fiber
  const selectedTrackerRemaining = macroGoals.calories - selectedTrackerCalories
  const selectedTrackerProgress = Math.min((selectedTrackerCalories / macroGoals.calories) * 100, 100)
  const selectedTrackerProteinProgress = macroGoals.protein > 0 ? Math.min((selectedTrackerProtein / macroGoals.protein) * 100, 100) : 0
  const selectedTrackerCarbsProgress = macroGoals.carbs > 0 ? Math.min((selectedTrackerCarbs / macroGoals.carbs) * 100, 100) : 0
  const selectedTrackerFatProgress = macroGoals.fat > 0 ? Math.min((selectedTrackerFat / macroGoals.fat) * 100, 100) : 0
  const selectedTrackerFiberProgress = macroGoals.fiber > 0 ? Math.min((selectedTrackerFiber / macroGoals.fiber) * 100, 100) : 0
  const trackerCards = [
    { id: 'calories', label: showTrackerHistory ? 'Calories' : "Today's Calories", value: selectedTrackerCalories, subtext: `of ${macroGoals.calories} kcal`, progress: selectedTrackerProgress, className: 'primary' },
    { id: 'remaining', label: 'Remaining', value: selectedTrackerRemaining, subtext: `kcal ${selectedTrackerRemaining < 0 ? 'over' : 'left'}`, className: 'success' },
    { id: 'protein', label: 'Protein', value: `${selectedTrackerProtein}g`, subtext: `of ${macroGoals.protein}g`, progress: selectedTrackerProteinProgress },
    { id: 'carbs', label: 'Carbs', value: `${selectedTrackerCarbs}g`, subtext: `of ${macroGoals.carbs}g`, progress: selectedTrackerCarbsProgress },
    { id: 'fat', label: 'Fat', value: `${selectedTrackerFat}g`, subtext: `of ${macroGoals.fat}g`, progress: selectedTrackerFatProgress },
    { id: 'fiber', label: 'Fiber', value: `${selectedTrackerFiber}g`, subtext: `of ${macroGoals.fiber}g`, progress: selectedTrackerFiberProgress, className: 'warning' }
  ]

  const updateTrackerCard = (id, field, value) => {
    setTrackerLayout(prev => ({
      ...prev,
      template: 'custom',
      cards: { ...prev.cards, [id]: { ...(prev.cards[id] || {}), [field]: value } }
    }))
  }

  const resetTrackerCardColor = id => {
    setTrackerLayout(prev => {
      const cards = { ...prev.cards }
      const config = { ...(cards[id] || {}) }
      delete config.color
      if (Object.keys(config).length) cards[id] = config
      else delete cards[id]
      return { ...prev, template: 'custom', cards }
    })
  }

  const applyTrackerColorToAll = id => {
    setTrackerLayout(prev => {
      const color = prev.cards?.[id]?.color
      if (!color) return prev
      const cards = { ...prev.cards }
      trackerCards.forEach(card => {
        cards[card.id] = { ...(cards[card.id] || {}), color }
      })
      return { ...prev, template: 'custom', cards }
    })
  }

  const resetAllTrackerColors = () => {
    setTrackerLayout(prev => {
      const cards = {}
      Object.entries(prev.cards || {}).forEach(([id, config]) => {
        const next = { ...config }
        delete next.color
        if (Object.keys(next).length) cards[id] = next
      })
      return { ...prev, template: 'custom', cards }
    })
  }

  const moveTrackerCard = (id, direction) => {
    setTrackerLayout(prev => {
      const order = Array.isArray(prev.order) ? [...prev.order] : trackerCards.map(card => card.id)
      const index = order.indexOf(id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return prev
      ;[order[index], order[nextIndex]] = [order[nextIndex], order[index]]
      return { ...prev, template: 'custom', order }
    })
  }

  const dropTrackerCard = targetId => {
    setTrackerLayout(prev => {
      const order = Array.isArray(prev.order) ? [...prev.order] : trackerCards.map(card => card.id)
      const from = order.indexOf(draggingTrackerCard)
      const to = order.indexOf(targetId)
      if (from < 0 || to < 0 || from === to) return prev
      const [moved] = order.splice(from, 1)
      order.splice(to, 0, moved)
      return { ...prev, template: 'custom', order }
    })
    setDraggingTrackerCard(null)
  }

  const trackerSizeDimensions = size => ({
    normal: { columns: 1, rows: 1 },
    wide: { columns: 2, rows: 1 },
    tall: { columns: 1, rows: 2 },
    large: { columns: 2, rows: 2 }
  }[size] || { columns: 1, rows: 1 })

  const trackerSizeFromDimensions = (columns, rows) => {
    if (columns >= 2 && rows >= 2) return 'large'
    if (columns >= 2) return 'wide'
    if (rows >= 2) return 'tall'
    return 'normal'
  }

  const beginTrackerResize = (event, cardId) => {
    event.preventDefault()
    event.stopPropagation()
    const config = trackerLayout.cards[cardId] || {}
    if (event.currentTarget?.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId)
    setResizingTrackerCard({
      id: cardId,
      startX: event.clientX,
      startY: event.clientY,
      startSize: config.size || 'normal'
    })
  }
  useEffect(() => {
    if (!resizingTrackerCard) return

    const handlePointerMove = event => {
      const grid = document.querySelector('.tracker-stats-grid')
      if (!grid) return

      const gridStyle = getComputedStyle(grid)
      const gap = parseFloat(gridStyle.columnGap) || 0
      const gridWidth = grid.getBoundingClientRect().width
      const computedColumns = gridStyle.gridTemplateColumns.split(' ').filter(Boolean).length
      const columns = computedColumns || trackerLayout.columns || 3
      const cellWidth = (gridWidth - gap * (columns - 1)) / columns
      if (!Number.isFinite(cellWidth) || cellWidth <= 0) return

      const start = trackerSizeDimensions(resizingTrackerCard.startSize)
      const deltaColumns = Math.round((event.clientX - resizingTrackerCard.startX) / (cellWidth + gap))
      const rowHeight = parseFloat(gridStyle.gridAutoRows) || 100
      const deltaRows = Math.round((event.clientY - resizingTrackerCard.startY) / (rowHeight + gap))
      const nextColumns = Math.max(1, Math.min(2, start.columns + deltaColumns))
      const nextRows = Math.max(1, Math.min(2, start.rows + deltaRows))
      const size = trackerSizeFromDimensions(nextColumns, nextRows)

      setTrackerLayout(prev => ({
        ...prev,
        template: 'custom',
        cards: { ...prev.cards, [resizingTrackerCard.id]: { ...(prev.cards[resizingTrackerCard.id] || {}), size } }
      }))
    }

    const handlePointerUp = () => setResizingTrackerCard(null)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizingTrackerCard, trackerLayout.columns])

  const trackerDragRef = useRef(null)

  const beginTrackerDrag = (event, cardId) => {
    event.preventDefault()
    event.stopPropagation()

    const card = event.currentTarget?.closest('.stat-card')
    if (!card) return

    const rect = card.getBoundingClientRect()

    trackerDragRef.current = {
      cardId,
      card,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false
    }

    if (event.currentTarget?.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    setDraggingTrackerCard(cardId)

    card.style.zIndex = '100'
    card.style.transition = 'none'
    card.style.willChange = 'transform'
  }

  useEffect(() => {
    if (!draggingTrackerCard) return

    let animationFrame = null
    let latestEvent = null

    const handlePointerMove = event => {
      const drag = trackerDragRef.current
      if (!drag || drag.cardId !== draggingTrackerCard) return

      latestEvent = event

      if (animationFrame) return

      animationFrame = requestAnimationFrame(() => {
        animationFrame = null

        const current = trackerDragRef.current
        if (!current || !latestEvent) return

        const dx = latestEvent.clientX - current.startX
        const dy = latestEvent.clientY - current.startY

        if (Math.abs(dx) + Math.abs(dy) > 6) {
          current.moved = true
        }

        current.card.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.03)`
      })
    }

    const handlePointerUp = event => {
      const drag = trackerDragRef.current
      if (!drag || drag.cardId !== draggingTrackerCard) return

      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
        animationFrame = null
      }

      const cards = [...document.querySelectorAll('.tracker-stats-grid .stat-card[data-tracker-card-id]')]
        .filter(card => card.dataset.trackerCardId !== drag.cardId)

      let target = null
      let closestDistance = Infinity

      for (const card of cards) {
        const rect = card.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY)

        if (distance < closestDistance) {
          closestDistance = distance
          target = card
        }
      }

      const draggedRect = drag.card.getBoundingClientRect()
      const dragCenterX = draggedRect.left + draggedRect.width / 2
      const dragCenterY = draggedRect.top + draggedRect.height / 2

      if (target && closestDistance < Math.max(target.offsetWidth, target.offsetHeight) * 0.8) {
        const targetId = target.dataset.trackerCardId

        setTrackerLayout(prev => {
          const order = Array.isArray(prev.order)
            ? [...prev.order]
            : trackerCards.map(card => card.id)

          const from = order.indexOf(drag.cardId)
          const to = order.indexOf(targetId)

          if (from < 0 || to < 0 || from === to) return prev

          const [moved] = order.splice(from, 1)
          order.splice(to, 0, moved)

          return {
            ...prev,
            template: 'custom',
            order
          }
        })
      }

      drag.card.style.transition = 'transform 160ms ease'
      drag.card.style.transform = ''

      setTimeout(() => {
        if (drag.card) {
          drag.card.style.zIndex = ''
          drag.card.style.willChange = ''
          drag.card.style.transition = ''
        }
      }, 180)

      trackerDragRef.current = null
      setDraggingTrackerCard(null)
    }

    const handlePointerCancel = () => {
      const drag = trackerDragRef.current

      if (drag?.card) {
        drag.card.style.transition = 'transform 160ms ease'
        drag.card.style.transform = ''

        setTimeout(() => {
          if (drag.card) {
            drag.card.style.zIndex = ''
            drag.card.style.willChange = ''
            drag.card.style.transition = ''
          }
        }, 180)
      }

      trackerDragRef.current = null
      setDraggingTrackerCard(null)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [draggingTrackerCard])

  const orderedTrackerCards = (trackerLayout.order || trackerCards.map(card => card.id))
    .map(id => trackerCards.find(card => card.id === id))
    .filter(Boolean)

  // Consumed history is displayed separately from future planned meals.
  const plannerDays = (() => {
    const base = new Date(plannerAnchor + 'T12:00:00Z')
    if (Number.isNaN(base.getTime())) return []
    if (plannerView === 'week') base.setUTCDate(base.getUTCDate() - base.getUTCDay())
    if (plannerView === 'month') base.setUTCDate(1)
    const count = plannerView === 'day' ? 1 : plannerView === 'week' ? 7
      : new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(base)
      date.setUTCDate(base.getUTCDate() + index)
      const key = date.toISOString().slice(0, 10)
      const consumed = logEntries.filter(entry => zonedDateKey(entry.timestamp) === key)
      const scheduled = plannedMeals.filter(item => item.date === key)
      return { key, label: date.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }),
        count: consumed.length, calories: consumed.reduce((sum, entry) => sum + (Number(entry.calories) || 0), 0),
        plannedCount: scheduled.length, plannedCalories: scheduled.reduce((sum, item) => sum + (Number(item.calories) || 0), 0) }
    })
  })()

  const visibleMeals = savedMeals
    .filter(meal => String(meal.name || '').toLowerCase().includes(mealSearch.trim().toLowerCase()))
    .sort((a, b) => mealSort === 'za'
      ? String(b.name || '').localeCompare(String(a.name || ''))
      : String(a.name || '').localeCompare(String(b.name || '')))

  const visibleFoods = savedFoods
    .filter(food => String(food.name || '').toLowerCase().includes(foodSearch.trim().toLowerCase()))
    .sort((a, b) => {
      if (foodSort === 'az') return String(a.name || '').localeCompare(String(b.name || ''))
      if (foodSort === 'za') return String(b.name || '').localeCompare(String(a.name || ''))
      const getTime = food => {
        const value = food.created_at || food.createdAt
        const time = value ? new Date(value).getTime() : 0
        return Number.isFinite(time) ? time : 0
      }
      return foodSort === 'oldest' ? getTime(a) - getTime(b) : getTime(b) - getTime(a)
    })

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return zonedClock(timestamp)
  }

  const formatDate = timestamp => {
    const key = /^\\d{4}-\\d{2}-\\d{2}$/.test(timestamp) ? timestamp : zonedDateKey(timestamp)
    if (key === zonedToday()) return 'Today'
    const yesterday = new Date(zonedToday() + 'T12:00:00Z')
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    if (key === yesterday.toISOString().slice(0, 10)) return 'Yesterday'
    return new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Group log entries by date
  const groupEntriesByDate = () => {
    const grouped = {}
    logEntries.forEach(entry => {
      const dateKey = new Date(entry.timestamp).toDateString()
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          entries: [],
          totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
        }
      }
      grouped[dateKey].entries.push(entry)
      grouped[dateKey].totals.calories += entry.calories
      grouped[dateKey].totals.protein += entry.protein
      grouped[dateKey].totals.carbs += entry.carbs
      grouped[dateKey].totals.fat += entry.fat
      grouped[dateKey].totals.fiber += entry.fiber || 0
    })
    
    // Sort by date (most recent first)
    return Object.entries(grouped).sort((a, b) => {
      return new Date(b[0]) - new Date(a[0])
    })
  }

  const todayDateString = zonedToday()
  // Legacy log entries do not have a meal category. Group by local time of day.
  const mealPeriodForEntry = entry => {
    const date = new Date(entry.timestamp)
    if (Number.isNaN(date.getTime())) return 'Other'
    const hour = date.getHours()
    return hour >= 5 && hour < 11 ? 'Breakfast'
      : hour >= 11 && hour < 16 ? 'Lunch'
      : hour >= 16 && hour < 21 ? 'Dinner' : 'Snacks'
  }
  const groupLogEntries = entries => ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Other']
    .map(label => ({ label, entries: entries.filter(entry => mealPeriodForEntry(entry) === label) }))
    .filter(group => group.entries.length)

  const todayLogEntries = logEntries.filter(entry => {
    if (!entry.timestamp) return false
    const date = new Date(entry.timestamp)
    if (Number.isNaN(date.getTime())) return false
    return zonedDateKey(date) === todayDateString
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const todayLogTotals = todayLogEntries.reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
    carbs: totals.carbs + entry.carbs,
    fat: totals.fat + entry.fat,
    fiber: totals.fiber + (entry.fiber || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })

  const historyCalendarDays = (() => {
    const selected = new Date(trackerHistoryDate + 'T12:00:00Z')
    if (Number.isNaN(selected.getTime())) return []
    const year = selected.getUTCFullYear()
    const month = selected.getUTCMonth()
    const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const loggedDates = new Set(logEntries.filter(entry => entry.timestamp).map(entry => zonedDateKey(entry.timestamp)))
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(Date.UTC(year, month, index + 1, 12))
      const key = date.toISOString().slice(0, 10)
      return { key, day: index + 1, weekday: date.getUTCDay(), logged: loggedDates.has(key) }
    })
  })()

  const trackerHistoryEntries = logEntries.filter(entry => {
    if (!entry.timestamp) return false
    const date = new Date(entry.timestamp)
    if (Number.isNaN(date.getTime())) return false
    const localDate = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-')
    return zonedDateKey(date) === trackerHistoryDate
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const trackerHistoryTotals = trackerHistoryEntries.reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
    carbs: totals.carbs + entry.carbs,
    fat: totals.fat + entry.fat,
    fiber: totals.fiber + (entry.fiber || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })

  const mealHistoryEntries = logEntries.filter(entry => {
    if (entry.type !== 'meal' || !entry.timestamp) return false
    const date = new Date(entry.timestamp)
    if (Number.isNaN(date.getTime())) return false
    return zonedDateKey(date) === mealHistoryDate
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const formatHistoryDate = dateString => {
    const date = new Date(dateString + 'T12:00:00')
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const shiftTrackerHistoryDate = days => {
    const date = new Date(trackerHistoryDate + 'T12:00:00')
    date.setDate(date.getDate() + days)
    setTrackerHistoryDate(getLocalDateString(date))
  }

  // Import/Export Handlers
  const handleExportData = () => {
    const exportData = storage.exportData({
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: {
        savedFoods,
        savedMeals,
        logEntries,
        macroGoals,
        dailyGoal
      }
    })

    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `nutrilog-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleImportData = (event) => {
    const file = event.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result)
        if (!importedData.data) {
          alert('Invalid backup file format')
          return
        }

        const {
          savedFoods: importedFoods = [],
          savedMeals: importedMeals = [],
          logEntries: importedLogs = [],
          macroGoals: importedGoals = macroGoals,
          dailyGoal: importedDailyGoal = importedGoals?.calories || dailyGoal
        } = importedData.data

        const confirmMessage = `This will import:\n- ${importedFoods.length} foods\n- ${importedMeals.length} meals\n- ${importedLogs.length} log entries\n- Macro goals\n\nThis will replace your current data. Continue?`

        if (!confirm(confirmMessage)) return

        if (user) {
          await api.sync.replace({
            goals: importedGoals,
            foods: importedFoods,
            meals: importedMeals,
            logs: importedLogs,
          })
        }

        setSavedFoods(importedFoods)
        setSavedMeals(importedMeals)
        setLogEntries(importedLogs)
        setMacroGoals(importedGoals)
        setMacroGoalsInput(importedGoals)
        setDailyGoal(importedDailyGoal)
        setGoalInput(importedDailyGoal)
        alert('Data imported successfully!')
      } catch (error) {
        console.error('Import error:', error)
        alert(error.message || 'Failed to import data. Please check the file format.')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div className={`app theme-${theme}`}>
      <PullToRefresh
        onRefresh={handlePullRefresh}
        disabled={
          !user ||
          isOfflineMode() ||
          customizeTabs ||
          (activeTab === 'foods' && (
            Boolean(editingFoodId) ||
            Object.entries(foodFormData).some(([key, value]) =>
              value !== (key === 'servingAmount' ? '1' : key === 'servingUnit' ? 'serving' : '')
            )
          )) ||
          (activeTab === 'meals' && (
            Boolean(editingMealId) ||
            Boolean(mealFormData.name.trim() || mealFormData.selectedFoods.length)
          )) ||
          (activeTab === 'tracker' && (
            Boolean(editingLogMeal) ||
            Boolean(quickLogForm.selectedItem)
          )) ||
          (activeTab === 'goals' && (
            goalInput !== dailyGoal ||
            JSON.stringify(macroGoalsInput) !== JSON.stringify(macroGoals)
          ))
        }
      />
      <div className="header">
        <h1>🥗 NutriLog</h1>
        <p>Track your nutrition, macros, and daily goals</p>
        <div className="nutrilog-header-sync">
          <details className={'nutrilog-sync-compact is-' + visiblePlannerSyncStatus}>
            <summary aria-label={'Account sync: ' + (visiblePlannerSyncStatus === 'saved' ? 'Synced' : visiblePlannerSyncStatus === 'saving' ? 'Syncing…' : visiblePlannerSyncStatus === 'pending' ? 'Saved locally' : visiblePlannerSyncStatus === 'checking' ? 'Checking sync' : 'Not synced')}>
              <RefreshCw size={15} aria-hidden="true" className={visiblePlannerSyncStatus === 'saving' ? 'nutrilog-sync-spinning' : ''} />
              <span>{visiblePlannerSyncStatus === 'saved' ? 'Synced' : visiblePlannerSyncStatus === 'saving' ? 'Syncing' : visiblePlannerSyncStatus === 'pending' ? 'Syncing…' : 'Sync failed'}</span>
            </summary>
            <div className="nutrilog-sync-compact-details" role="status" aria-live="polite">
              <p>{visiblePlannerSyncStatus === 'saved' ? 'Planned meals confirmed with server' :
                visiblePlannerSyncStatus === 'conflict' ? 'Another device saved newer changes. Review before syncing.' :
                visiblePlannerSyncStatus === 'error' ? 'Changes are saved on this device only.' :
                visiblePlannerSyncStatus === 'saving' ? 'Synchronizing planned meals…' : visiblePlannerSyncStatus === 'checking' ? 'Checking account changes…' : 'Changes saved locally; awaiting sync.'}</p>
              {plannerSyncError && <p role="alert" className="nutrilog-sync-error-detail">Merge failed: {plannerSyncError}</p>}
              {(visiblePlannerSyncStatus === 'conflict' || visiblePlannerSyncStatus === 'error') && <button type="button" className="btn btn-secondary" onClick={recoverPlannedMeals}>Merge planned meals</button>}
              {visiblePlannerSyncStatus === 'error' && <button type="button" className="btn btn-secondary" onClick={() => setSyncRetry(value => value + 1)}>Retry sync</button>}
            </div>
          </details>
        </div>

        
        {/* Tab Navigation */}
        <div className={`tab-navigation ${customizeTabs ? 'tab-navigation-customizing' : ''}`}>
          {tabOrder.map(tabId => {
            const Icon = tabIcons[tabId]
            return (
              <button
                key={tabId}
                type="button"
                data-tab-id={tabId}
                className={`tab-btn ${activeTab === tabId ? 'active' : ''} ${['planner', 'tracker', 'foods', 'meals'].includes(tabId) ? 'mobile-primary-tab' : 'mobile-secondary-tab'} ${customizeTabs ? 'tab-customizing' : ''} ${draggingTab === tabId ? 'tab-dragging' : ''}`}
                onClick={() => !customizeTabs && setActiveTab(tabId)}
                onPointerDown={event => customizeTabs && beginTabDrag(event, tabId)}
                title={customizeTabs ? `Drag to move ${tabLabels[tabId]}` : tabLabels[tabId]}
              >
                {customizeTabs && <span className="tab-drag-grip" aria-hidden="true">⠿</span>}
                <Icon size={20} />
                {tabLabels[tabId]}
              </button>
            )
          })}
          <button
            type="button"
            className="tab-btn mobile-more-toggle"
            onClick={() => setShowMobileMore(prev => !prev)}
            aria-expanded={showMobileMore}
          >
            <span aria-hidden="true">☰</span>
            <span>More</span>
          </button>
          <div className="mobile-secondary-tabs" aria-hidden={!showMobileMore}>
            {tabOrder.filter(tabId => !['planner', 'tracker', 'foods', 'meals'].includes(tabId)).map(tabId => {
              const Icon = tabIcons[tabId]
              return (
                <button
                  key={tabId}
                  type="button"
                  className={`tab-btn mobile-secondary-menu-tab ${activeTab === tabId ? 'active' : ''}`}
                  onClick={() => { setActiveTab(tabId); setShowMobileMore(false) }}
                >
                  <Icon size={18} />
                  {tabLabels[tabId]}
                </button>
              )
            })}
            <button
              type="button"
              className="tab-btn mobile-secondary-menu-tab mobile-arrange-tabs"
              onClick={() => { setCustomizeTabs(true); setShowMobileMore(false) }}
            >
              <Settings size={18} />
              Arrange Tabs
            </button>
          </div>
          <button
            type="button"
            className={`tab-btn tab-customize-toggle ${customizeTabs ? 'active' : ''}`}
            onClick={() => setCustomizeTabs(prev => !prev)}
          >
            <Settings size={18} />
            {customizeTabs ? 'Done' : 'Arrange Tabs'}
          </button>
        </div>

        {customizeTabs && (
          <div className="tab-customizer-hint">
            <span>Drag tabs or use the controls below to change their order</span>
            <span>Your layout is saved for this account</span>
            <div className="tab-order-controls">
              {tabOrder.map((tabId, index) => <div className="tab-order-item" key={tabId}>
                <span>{tabLabels[tabId]}</span>
                <button type="button" disabled={index === 0} onClick={() => moveTab(tabId, -1)} aria-label={`Move ${tabLabels[tabId]} earlier`}>↑</button>
                <button type="button" disabled={index === tabOrder.length - 1} onClick={() => moveTab(tabId, 1)} aria-label={`Move ${tabLabels[tabId]} later`}>↓</button>
              </div>)}
            </div>
          </div>
        )}
      </div>

      <div className="main-content">
        {activeTab === 'admin' && user?.role === 'admin' && (
          <AdminPanel user={user} />
        )}

        {/* TRACKER TAB */}
        {activeTab === 'tracker' && (
          <>
            <div className="tracker-dashboard-header">
              <div>
                <h2>{showTrackerHistory && trackerHistoryDate !== zonedToday() ? 'Food Log History' : 'Today'}</h2>
                <p className="nutrilog-tracker-date">{formatHistoryDate(showTrackerHistory ? trackerHistoryDate : zonedToday())}</p>
                <button type="button" className="btn btn-secondary nutrilog-history-calendar-toggle"
                  aria-expanded={historyCalendarVisible} onClick={() => {
                    if (!historyCalendarVisible && !showTrackerHistory) setTrackerHistoryDate(zonedToday())
                    setHistoryCalendarVisible(!historyCalendarVisible)
                  }}>
                  <CalendarDays size={16} /> {historyCalendarVisible ? 'Hide calendar' : 'History calendar'}
                </button>
              </div>
  
            </div>

            {historyCalendarVisible && (
              <section className="section nutrilog-history-calendar" aria-label="Food log history calendar">
                <div className="nutrilog-history-calendar-nav">
                  <button type="button" className="btn btn-secondary" aria-label="Previous month" onClick={() => {
                    const date = new Date(trackerHistoryDate + 'T12:00:00Z')
                    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 1)
                    setTrackerHistoryDate(date.toISOString().slice(0, 10)); setShowTrackerHistory(true)
                  }}>←</button>
                  <strong>{new Date(trackerHistoryDate + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong>
                  <button type="button" className="btn btn-secondary" aria-label="Next month" onClick={() => {
                    const date = new Date(trackerHistoryDate + 'T12:00:00Z')
                    date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1)
                    setTrackerHistoryDate(date.toISOString().slice(0, 10)); setShowTrackerHistory(true)
                  }}>→</button>
                </div>
                <div className="nutrilog-history-calendar-grid">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day => <span className="nutrilog-history-weekday" key={day}>{day}</span>)}
                  {historyCalendarDays.map((day, index) => (
                    <Fragment key={day.key}>
                      {index === 0 && Array.from({ length: day.weekday }, (_, blank) => <span key={'blank-' + blank} />)}
                      <button type="button" className={'nutrilog-history-day' + (day.key === trackerHistoryDate ? ' selected' : '')}
                        aria-pressed={day.key === trackerHistoryDate}
                        aria-label={day.key + (day.logged ? ', food logged' : ', no food logged')}
                        onClick={() => { setTrackerHistoryDate(day.key); setShowTrackerHistory(day.key !== zonedToday()) }}>
                        {day.day}{day.logged && <span className="nutrilog-history-dot" aria-hidden="true" />}
                      </button>
                    </Fragment>
                  ))}
                </div>
                <p className="nutrilog-history-calendar-legend">Dots indicate dates with logged food, not completed days.</p>
              </section>
            )}
            <section className="nutrilog-daily-overview" aria-label="Daily nutrition overview">
                <div className="nutrilog-calorie-ring" role="img" aria-label={`Calories: ${Math.round(nutritionProgress(selectedTrackerCalories, macroGoals.calories).percent)}% of daily goal`} style={{ '--daily-progress': `${Math.min(100, nutritionProgress(selectedTrackerCalories, macroGoals.calories).percent)}%`, '--ring-color': nutritionProgress(selectedTrackerCalories, macroGoals.calories).color, '--overflow-progress': `${Math.min(100, Math.max(0, nutritionProgress(selectedTrackerCalories, macroGoals.calories).percent - 100))}%` }}>
                  <div className="nutrilog-calorie-ring-inner">
                    <Flame size={25} aria-hidden="true" />
                    <strong>{Math.round(selectedTrackerCalories).toLocaleString()}</strong>
                    <span>of {Math.round(Number(macroGoals.calories) || 0).toLocaleString()} kcal</span>
                    <small className="nutrilog-calorie-percent">{Math.round(nutritionProgress(selectedTrackerCalories, macroGoals.calories).percent)}%</small>
                    <span className="nutrilog-calorie-remaining">{Math.abs(Math.round(selectedTrackerRemaining)).toLocaleString()} kcal {selectedTrackerRemaining < 0 ? 'over' : 'left'}</span>
                  </div>
                </div>
                <div className="nutrilog-macro-overview">
                  {[
                    { label: 'Protein', icon: '💪', value: selectedTrackerProtein, goal: macroGoals.protein, color: '#49A5E8' },
                    { label: 'Carbs', icon: '🌾', value: selectedTrackerCarbs, goal: macroGoals.carbs, color: '#E8B83D' },
                    { label: 'Fat', icon: '🥑', value: selectedTrackerFat, goal: macroGoals.fat, color: '#7FCD57' },
                    { label: 'Fiber', icon: '🌿', value: selectedTrackerFiber, goal: macroGoals.fiber, color: '#32B58B' }
                  ].map(macro => (
                    <div className="nutrilog-macro-summary" key={macro.label}>
                      <div className="nutrilog-macro-circle" style={{ '--macro-progress': `${Math.min(100, nutritionProgress(macro.value, macro.goal).percent)}%`, '--macro-color': nutritionProgress(macro.value, macro.goal).color, '--overflow-progress': `${Math.min(100, Math.max(0, nutritionProgress(macro.value, macro.goal).percent - 100))}%` }}>
                        <span aria-hidden="true">{macro.icon}</span>
                      </div>
                      <span className="nutrilog-macro-percent">{Math.round(nutritionProgress(macro.value, macro.goal).percent)}%</span>
                      <strong>{macro.label}</strong>
                      <span>{Number(macro.value).toFixed(1)}g</span>
                      <small>of {Number(macro.goal || 0).toFixed(1)}g</small>
                    </div>
                  ))}
                </div>
              </section>

            {/* Quick Add uses the existing saved foods, meals and log API. */}
            <section className="section nutrilog-quick-add" aria-label="Quick Add Food">
              <div className="nutrilog-quick-add-heading">
                <div><h2>Quick Add Food</h2><p>Search your saved foods and meals, choose servings, and log in one step.</p></div>
              </div>
              <form onSubmit={handleQuickLog} className="nutrilog-quick-add-form">
                <div className="nutrilog-quick-search" ref={quickLogSearchRef}>
                  <label htmlFor="quick-add-search">Food or meal</label>
                  <input id="quick-add-search" type="search" value={quickLogForm.searchQuery}
                    onChange={handleQuickLogSearchChange}
                    onFocus={() => setQuickLogForm(prev => ({ ...prev, showSuggestions: true }))}
                    placeholder="Search saved foods and meals…" autoComplete="off" />
                  {quickLogForm.showSuggestions && (
                    <div className="nutrilog-quick-results" role="listbox" aria-label="Matching foods and meals">
                      {[
                        ...getFilteredSuggestions().foods.slice(0, 8).map(item => ({ item, type: 'food' })),
                        ...getFilteredSuggestions().meals.slice(0, 5).map(item => ({ item, type: 'meal' }))
                      ].length ? [
                        ...getFilteredSuggestions().foods.slice(0, 8).map(item => ({ item, type: 'food' })),
                        ...getFilteredSuggestions().meals.slice(0, 5).map(item => ({ item, type: 'meal' }))
                      ].map(({ item, type }) => (
                        <button type="button" key={type + '-' + item.id} className="nutrilog-quick-result"
                          onClick={() => handleSelectSuggestion(item, type)}>
                          <span><strong>{item.name}</strong><small>{type === 'meal' ? 'Saved meal' : 'Saved food'}</small></span>
                          <span>{Math.round(Number(item.calories || 0))} kcal</span>
                        </button>
                      )) : <p className="nutrilog-quick-empty">No matching saved foods or meals in this category.</p>}
                    </div>
                  )}
                </div>
                <div className="nutrilog-quick-filter-row" role="group" aria-label="Filter foods">
                  {[['all', 'All'], ['recent', 'Recent'], ['favorites', 'Favorites'], ['custom', 'Custom']].map(([id, label]) => (
                    <button key={id} type="button" className={'nutrilog-quick-filter ' + (quickFoodFilter === id ? 'is-active' : '')}
                      aria-pressed={quickFoodFilter === id}
                      onClick={() => {
                        setQuickFoodFilter(id)
                        setQuickLogForm(prev => ({ ...prev, showSuggestions: true, selectedItem: null, itemType: '' }))
                      }}>{label}</button>
                  ))}
                </div>
                <div className="nutrilog-quick-serving-control">
                  <label className="nutrilog-quick-field" htmlFor="quick-log-servings">Servings</label>
                  <div className="nutrilog-quick-serving-presets" aria-label="Quick serving sizes">
                    {['0.5', '1', '2'].map(amount => (
                      <button type="button" key={amount}
                        className={'btn ' + (Number(quickLogForm.quantity) === Number(amount) ? 'btn-primary' : 'btn-secondary')}
                        aria-pressed={Number(quickLogForm.quantity) === Number(amount)}
                        onClick={() => setQuickLogForm(prev => ({ ...prev, quantity: amount }))}>
                        {amount === '0.5' ? '½' : amount}
                      </button>
                    ))}
                    <input id="quick-log-servings" type="number" min="0.01" step="0.01" inputMode="decimal"
                      aria-label="Custom number of servings" value={quickLogForm.quantity}
                      onChange={e => setQuickLogForm(prev => ({ ...prev, quantity: e.target.value }))} />
                  </div>
                </div>
                <label className="nutrilog-quick-field">Date
                  <input type="date" value={quickLogForm.date} onChange={handleQuickLogDateChange} />
                </label>
                <button type="submit" className="btn btn-primary nutrilog-quick-submit" disabled={!quickLogForm.selectedItem}>
                  + Log Food
                </button>
              </form>
              {quickLogForm.selectedItem && (
                <p className="nutrilog-quick-selection">
                  Selected: <strong>{quickLogForm.selectedItem.name}</strong>
                  <span className="nutrilog-quick-nutrition-preview">
                    {(() => {
                      const totals = scaleNutrition(quickLogForm.selectedItem, Math.max(0, Number(quickLogForm.quantity) || 0))
                      return (
                        <>
                          <span>{Math.round(Number(totals.calories) || 0)} kcal</span>
                          <span>P: {Number(totals.protein || 0).toFixed(1)}g</span>
                          <span>C: {Number(totals.carbs || 0).toFixed(1)}g</span>
                          <span>F: {Number(totals.fat || 0).toFixed(1)}g</span>
                          <span>Fiber: {Number(totals.fiber || 0).toFixed(1)}g</span>
                        </>
                      )
                    })()}
                  </span>
                </p>
              )}
            </section>

            {/* Food Log / History */}
            <div className="section" style={{ margin: '0 auto' }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>Food Log</h2>
                <p className="food-log-timezone-note">Meal times shown in {selectedTimeZone.replaceAll('_', ' ')}.</p>
                <div className="food-log-day-navigation">
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    const key = showTrackerHistory ? trackerHistoryDate : zonedToday()
                    const date = new Date(key + 'T12:00:00Z')
                    date.setUTCDate(date.getUTCDate() - 1)
                    setTrackerHistoryDate(date.toISOString().slice(0, 10))
                    setShowTrackerHistory(true)
                  }} aria-label="Previous day">‹ Back</button>
                  <button type="button" className={'btn ' + (!showTrackerHistory ? 'food-log-accent-action' : 'btn-secondary')} onClick={() => {
                    setTrackerHistoryDate(zonedToday())
                    setShowTrackerHistory(false)
                  }}>Today</button>
                  <button type="button" className="btn btn-secondary" disabled={!showTrackerHistory || trackerHistoryDate >= zonedToday()} onClick={() => {
                    const date = new Date(trackerHistoryDate + 'T12:00:00Z')
                    date.setUTCDate(date.getUTCDate() + 1)
                    const next = date.toISOString().slice(0, 10)
                    setTrackerHistoryDate(next)
                    setShowTrackerHistory(next !== zonedToday())
                  }} aria-label="Next day">Forward ›</button>
                </div>
                <div className="food-log-history-search">
                  <label htmlFor="food-log-history-search-date" className="food-log-history-tile">
                    <span>Search History</span>
                    <CalendarDays size={19} aria-hidden="true" />
                  </label>
                  <input
                    id="food-log-history-search-date"
                    className="food-log-history-tile-date"
                    type="date"
                    max={zonedToday()}
                    value={showTrackerHistory ? trackerHistoryDate : ''}
                    onChange={e => {
                      if (!e.target.value || e.target.value > zonedToday()) return
                      setTrackerHistoryDate(e.target.value)
                      setShowTrackerHistory(e.target.value !== zonedToday())
                    }}
                    aria-label="Search food history by date"
                  />
                </div>
              </div>
              <FoodLogNutritionSummary totals={showTrackerHistory ? trackerHistoryTotals : todayLogTotals} goals={macroGoals} />

              {!showTrackerHistory ? (
                todayLogEntries.length === 0 ? (
                  <div className="empty-state">
                    <Flame size={48} />
                    <p>No entries logged today.</p>
                    <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>Start tracking your meals!</p>
                  </div>
                ) : (
                  <div className="log-by-date" style={{ marginTop: 18 }}>
                    {[[todayDateString, { entries: todayLogEntries, totals: todayLogTotals }]].map(([dateKey, dateData]) => (
                      <div key={dateKey} className="date-group">
                        <div className="date-header">
                          <h3>Today <span className="food-log-date-detail">{formatHistoryDate(todayDateString)}</span></h3>
                          <div className="date-totals">
                            <span className="total-calories">{dateData.totals.calories.toFixed(2)} kcal</span>
                            <span>P: {dateData.totals.protein.toFixed(2)}g</span>
                            <span>C: {dateData.totals.carbs.toFixed(2)}g</span>
                            <span>F: {dateData.totals.fat.toFixed(2)}g</span>
                            {dateData.totals.fiber > 0 && <span>Fiber: {dateData.totals.fiber.toFixed(2)}g</span>}
                          </div>
                        </div>
                        {editingLogEntry && dateData.entries.some(entry => entry.id === editingLogEntry.id) && logEntryEditor}
                        <div className="date-entries">
                          <table className="entries-table current-log">
                            <thead>
                              <tr><th>Time</th><th>Food</th><th>Qty</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th><th></th></tr>
                            </thead>
                            <tbody>
                              {groupLogEntries(dateData.entries).flatMap(group => [<tr key={'group-' + group.label} className="nutrilog-meal-group-row"><td colSpan="9"><strong>{group.label}</strong><span>{group.entries.length} entries · {Math.round(group.entries.reduce((sum, entry) => sum + Number(entry.calories || 0), 0))} kcal</span></td></tr>, ...group.entries.map(entry => (
                                <Fragment key={entry.id}>
                                  <tr>
                                  <td className="time-cell">{formatTime(entry.timestamp)}</td>
                                  <td className="name-cell">
                                    {entry.type === 'meal' && (
                                      <button
                                        type="button"
                                        className={'btn btn-secondary food-log-meal-toggle' + (expandedLogEntryId === entry.id ? ' is-expanded' : '')}
                                        style={{ padding: '2px 6px', minWidth: 28, fontSize: '0.8rem', lineHeight: 1, marginRight: 6 }}
                                        onClick={() => handleToggleLogMeal(entry)}
                                        title={expandedLogEntryId === entry.id ? 'Collapse meal' : 'Expand meal'}
                                        aria-expanded={expandedLogEntryId === entry.id}
                                        aria-label={expandedLogEntryId === entry.id ? 'Collapse meal' : 'Expand meal'}
                                      >
                                        <ChevronDown size={17} strokeWidth={2.5} />
                                      </button>
                                    )}
                                    {entry.name}{entry.type === 'meal' && <span className="badge-meal-small">Meal</span>}
                                  </td>
                                  <td><input className="quantity-input" type="text" inputMode="decimal" defaultValue={entry.quantity ?? 1} onFocus={e => { e.target.dataset.originalQuantity = String(entry.quantity ?? 1) }} onBlur={e => { const value = e.target.value.trim(); if (!Number.isFinite(Number(value)) || Number(value) <= 0) { e.target.value = String(entry.quantity ?? 1); return; } if (Number(value) !== Number(e.target.dataset.originalQuantity)) handleUpdateLogQuantity(entry, value, e.target.dataset.originalQuantity); }} aria-label={"Quantity for " + entry.name} /></td>
                                  <td className="log-macro-cell" data-macro="calories"><span className="log-macro-label"><span aria-hidden="true">🔥</span> Calories</span><strong>{Number(entry.calories || 0).toFixed(2)}kcal</strong></td>
                                  <td className="log-macro-cell" data-macro="protein"><span className="log-macro-label"><span aria-hidden="true">💪</span> Protein</span><strong>{Number(entry.protein || 0).toFixed(2)}g</strong></td>
                                  <td className="log-macro-cell" data-macro="carbs"><span className="log-macro-label"><span aria-hidden="true">🌾</span> Carbs</span><strong>{Number(entry.carbs || 0).toFixed(2)}g</strong></td>
                                  <td className="log-macro-cell" data-macro="fat"><span className="log-macro-label"><span aria-hidden="true">🥑</span> Fat</span><strong>{Number(entry.fat || 0).toFixed(2)}g</strong></td>
                                  <td className="log-macro-cell" data-macro="fiber"><span className="log-macro-label"><span aria-hidden="true">🌿</span> Fiber</span><strong>{Number(entry.fiber || 0).toFixed(2)}g</strong></td>
                                  <td><button type="button" className="btn btn-secondary" onClick={() => entry.type === 'meal' ? handleEditLoggedMeal(entry) : startEditingLogEntry(entry)} title={entry.type === 'meal' ? "Edit meal ingredients and details" : "Edit entry"}><Edit size={16} /> {entry.type === 'meal' ? 'Edit Meal' : 'Edit'}</button> <button className="btn-icon-delete" onClick={() => handleDeleteLogEntry(entry.id)} title="Delete entry"><Trash2 size={16} /></button></td>
                                </tr>
                                {expandedLogEntryId === entry.id && entry.type === 'meal' && (
                                  <tr className={editingLogMeal?.id === entry.id ? 'logged-meal-editor-row' : ''}>
                                    <td colSpan="9" style={{ padding: 0 }}>
                                      <div className={editingLogMeal?.id === entry.id ? 'logged-meal-editor-panel' : ''} style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.025)' }}>
                                        {editingLogMeal?.id === entry.id ? (
                                          <>
                                            <div className="logged-meal-editor-heading"><h3>Edit logged meal</h3><button type="button" className="btn btn-secondary" onClick={() => setEditingLogMeal(null)} aria-label="Close meal editor">Close</button></div>
                                            <div className="form-group" style={{ marginBottom: 10 }}>
                                              <label>Meal Name<input value={editingLogMeal.name} onChange={e => setEditingLogMeal(prev => ({ ...prev, name: e.target.value }))} /></label>
                                            </div>
<div className="logged-meal-properties">
                                               <label>Date and time<input type="datetime-local" value={editingLogMeal.localTime} onChange={e => setEditingLogMeal(prev => ({ ...prev, localTime: e.target.value }))} /></label>
                                               <label>Meal servings<input type="text" inputMode="decimal" value={editingLogMeal.quantity} onChange={e => setEditingLogMeal(prev => ({ ...prev, quantity: e.target.value }))} /></label>
                                             </div>
                                            {editingLogMeal.foods.map((food, index) => (
                                              <div key={index} className="meal-food-item">
                                                <div className="meal-food-info">
                                                  <span>{food.name}</span>
                                                  <span className="meal-food-macros">{Number(food.calories || 0) * (Number(food.quantity) || 1)} kcal</span>
                                                </div>
                                                <div className="meal-food-controls">
                                                  <LoggedMealServingInput quantity={food.quantity} foodName={food.name} onCommit={value => handleLoggedMealFoodQuantityChange(index, value)} />
                                                   <button type="button" className="btn btn-secondary" onClick={() => removeFoodFromLoggedMeal(index)} aria-label={'Remove ' + food.name}><Trash2 size={15} /> Remove</button>
                                                </div>
                                              </div>
                                            ))}
                                            {loggedMealFoodPicker}
                                             <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                              <button type="button" className="btn btn-primary" onClick={handleSaveLoggedMeal}>Save Changes</button>
                                              <button type="button" className="btn btn-secondary" onClick={() => setEditingLogMeal(null)}>Cancel</button>
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Foods in this meal</div>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                              {entry.foods.map((food, index) => (
                                                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                                                  <span>{food.name}</span>
                                                  <span>{food.quantity}x · {Number(food.calories || 0) * (Number(food.quantity) || 1)} kcal</span>
                                                </div>
                                              ))}
                                            </div>

                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                </Fragment>
                              ))])}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div style={{ marginTop: 18 }}>
                  <div className="section food-log-history-section" style={{ margin: 0, padding: 16 }}>
                    <div className="food-log-history-summary">
                    <h3>{formatHistoryDate(trackerHistoryDate)}</h3>
                    <div className="date-totals">
                      <span className="total-calories">{trackerHistoryTotals.calories.toFixed(2)} kcal</span>
                      <span>P: {trackerHistoryTotals.protein.toFixed(2)}g</span>
                      <span>C: {trackerHistoryTotals.carbs.toFixed(2)}g</span>
                      <span>F: {trackerHistoryTotals.fat.toFixed(2)}g</span>
                      <span>Fiber: {trackerHistoryTotals.fiber.toFixed(2)}g</span>
                    </div>
                    </div>

                    {trackerHistoryEntries.length === 0 ? (
                      <div className="empty-state">
                        <Flame size={42} />
                        <p>No food logged on this date.</p>
                      </div>
                    ) : (
                      <div className="date-entries">
                        {editingLogEntry && trackerHistoryEntries.some(entry => entry.id === editingLogEntry.id) && logEntryEditor}
                        <table className="entries-table history-log">
                          <thead>
                            <tr><th>Time</th><th>Food</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th><th></th></tr>
                          </thead>
                          <tbody>
                            {groupLogEntries(trackerHistoryEntries).flatMap(group => [<tr key={'history-group-' + group.label} className="nutrilog-meal-group-row"><td colSpan="8"><strong>{group.label}</strong><span>{group.entries.length} entries · {Math.round(group.entries.reduce((sum, entry) => sum + Number(entry.calories || 0), 0))} kcal</span></td></tr>, ...group.entries.map(entry => (
                              <Fragment key={entry.id}>
                                <tr>
                                  <td className="time-cell">{formatTime(entry.timestamp)}</td>
                                  <td className="name-cell">
                                    {entry.type === 'meal' && (
                                      <button
                                        type="button"
                                        className={'btn btn-secondary food-log-meal-toggle' + (expandedLogEntryId === entry.id ? ' is-expanded' : '')}
                                        style={{ padding: '2px 6px', minWidth: 28, fontSize: '0.8rem', lineHeight: 1, marginRight: 6 }}
                                        onClick={() => handleToggleLogMeal(entry)}
                                        title={expandedLogEntryId === entry.id ? 'Collapse meal' : 'Expand meal'}
                                        aria-expanded={expandedLogEntryId === entry.id}
                                        aria-label={expandedLogEntryId === entry.id ? 'Collapse meal' : 'Expand meal'}
                                      >
                                        <ChevronDown size={17} strokeWidth={2.5} />
                                      </button>
                                    )}
                                    {entry.name}{entry.type === 'meal' && <span className="badge-meal-small">Meal</span>}
                                  </td>
                                  <td className="log-macro-cell" data-macro="calories"><span className="log-macro-label"><span aria-hidden="true">🔥</span> Calories</span><strong>{Number(entry.calories || 0).toFixed(2)}kcal</strong></td>
                                  <td className="log-macro-cell" data-macro="protein"><span className="log-macro-label"><span aria-hidden="true">💪</span> Protein</span><strong>{Number(entry.protein || 0).toFixed(2)}g</strong></td>
                                  <td className="log-macro-cell" data-macro="carbs"><span className="log-macro-label"><span aria-hidden="true">🌾</span> Carbs</span><strong>{Number(entry.carbs || 0).toFixed(2)}g</strong></td>
                                  <td className="log-macro-cell" data-macro="fat"><span className="log-macro-label"><span aria-hidden="true">🥑</span> Fat</span><strong>{Number(entry.fat || 0).toFixed(2)}g</strong></td>
                                  <td className="log-macro-cell" data-macro="fiber"><span className="log-macro-label"><span aria-hidden="true">🌿</span> Fiber</span><strong>{Number(entry.fiber || 0).toFixed(2)}g</strong></td>
                                  <td><button type="button" className="btn btn-secondary" onClick={() => entry.type === 'meal' ? handleEditLoggedMeal(entry) : startEditingLogEntry(entry)} title={entry.type === 'meal' ? "Edit meal ingredients and details" : "Edit entry"}><Edit size={16} /> {entry.type === 'meal' ? 'Edit Meal' : 'Edit'}</button> <button className="btn-icon-delete" onClick={() => handleDeleteLogEntry(entry.id)} title="Delete entry"><Trash2 size={16} /></button></td>
                                </tr>
                                {expandedLogEntryId === entry.id && entry.type === 'meal' && (
                                  <tr className={editingLogMeal?.id === entry.id ? 'logged-meal-editor-row' : ''}>
                                    <td colSpan="8" style={{ padding: 0 }}>
                                      <div className={editingLogMeal?.id === entry.id ? 'logged-meal-editor-panel' : ''} style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.025)' }}>
                                        {editingLogMeal?.id === entry.id ? (
                                          <>
                                            <div className="logged-meal-editor-heading"><h3>Edit logged meal</h3><button type="button" className="btn btn-secondary" onClick={() => setEditingLogMeal(null)} aria-label="Close meal editor">Close</button></div>
                                            <div className="form-group" style={{ marginBottom: 10 }}>
                                              <label>Meal Name<input value={editingLogMeal.name} onChange={e => setEditingLogMeal(prev => ({ ...prev, name: e.target.value }))} /></label>
                                            </div>
<div className="logged-meal-properties">
                                               <label>Date and time<input type="datetime-local" value={editingLogMeal.localTime} onChange={e => setEditingLogMeal(prev => ({ ...prev, localTime: e.target.value }))} /></label>
                                               <label>Meal servings<input type="text" inputMode="decimal" value={editingLogMeal.quantity} onChange={e => setEditingLogMeal(prev => ({ ...prev, quantity: e.target.value }))} /></label>
                                             </div>
                                            {editingLogMeal.foods.map((food, index) => (
                                              <div key={index} className="meal-food-item">
                                                <div className="meal-food-info">
                                                  <span>{food.name}</span>
                                                  <span className="meal-food-macros">{Number(food.calories || 0) * (Number(food.quantity) || 1)} kcal</span>
                                                </div>
                                                <div className="meal-food-controls">
                                                  <LoggedMealServingInput quantity={food.quantity} foodName={food.name} onCommit={value => handleLoggedMealFoodQuantityChange(index, value)} />
                                                   <button type="button" className="btn btn-secondary" onClick={() => removeFoodFromLoggedMeal(index)} aria-label={'Remove ' + food.name}><Trash2 size={15} /> Remove</button>
                                                </div>
                                              </div>
                                            ))}
                                            {loggedMealFoodPicker}
                                             <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                              <button type="button" className="btn btn-primary" onClick={handleSaveLoggedMeal}>Save Changes</button>
                                              <button type="button" className="btn btn-secondary" onClick={() => setEditingLogMeal(null)}>Cancel</button>
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div style={{ fontWeight: 700, marginBottom: 8 }}>Foods in this meal</div>
                                            <div style={{ display: 'grid', gap: 6 }}>
                                              {entry.foods.map((food, index) => (
                                                <div key={index} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                                                  <span>{food.name}</span>
                                                  <span>{food.quantity}x · {Number(food.calories || 0) * (Number(food.quantity) || 1)} kcal</span>
                                                </div>
                                              ))}
                                            </div>

                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            ))])}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* PLANNER TAB */}
        {activeTab === 'planner' && (
          <div className="planner-container">
            <div className="planner-intro">
              <h2>Planner</h2>
              <p>Schedule saved meals and review logged nutrition by day, week, or month. Planned meals stay separate from consumed food.</p>
            </div>
            <section className="section nutrilog-planner-schedule" aria-label="Schedule saved meals">
              <h3>Schedule a saved meal</h3>
              <form className="nutrilog-planner-schedule-form" onSubmit={scheduleSavedMeal}>
                <label>Date <input type="date" value={plannerAnchor} onChange={event => setPlannerAnchor(event.target.value)} required /></label>
                <label>Meal <select value={plannedMealId} onChange={event => setPlannedMealId(event.target.value)} required>
                  <option value="">Choose a saved meal</option>
                  {savedMeals.map(meal => <option key={meal.id} value={String(meal.id)}>{meal.name}</option>)}
                </select></label>
                <label>Category <select value={plannedMealSlot} onChange={event => setPlannedMealSlot(event.target.value)}>
                  {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map(slot => <option key={slot} value={slot}>{slot}</option>)}
                </select></label>
                <button type="submit" className="btn btn-primary" disabled={!plannedMealId}>Plan meal</button>
              </form>
            </section>
            <section className="section nutrilog-planner-overview" aria-label="Consumed nutrition calendar">
              <div className="nutrilog-planner-toolbar">
                <div className="nutrilog-planner-view-switch" role="group" aria-label="Calendar view">
                  {['day', 'week', 'month'].map(view => (
                    <button key={view} type="button" className={'btn ' + (plannerView === view ? 'btn-primary' : 'btn-secondary')}
                      aria-pressed={plannerView === view} onClick={() => setPlannerView(view)}>
                      {view[0].toUpperCase() + view.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="nutrilog-planner-date-nav">
                  <button type="button" className="btn btn-secondary" aria-label="Previous period"
                    onClick={() => setPlannerAnchor(prev => {
                      const date = new Date(prev + 'T12:00:00Z')
                      if (plannerView === 'month') { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - 1) }
                      else date.setUTCDate(date.getUTCDate() - (plannerView === 'week' ? 7 : 1))
                      return date.toISOString().slice(0, 10)
                    })}>←</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setPlannerAnchor(zonedToday())}>Today</button>
                  <button type="button" className="btn btn-secondary" aria-label="Next period"
                    onClick={() => setPlannerAnchor(prev => {
                      const date = new Date(prev + 'T12:00:00Z')
                      if (plannerView === 'month') { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1) }
                      else date.setUTCDate(date.getUTCDate() + (plannerView === 'week' ? 7 : 1))
                      return date.toISOString().slice(0, 10)
                    })}>→</button>
                </div>
              </div>
              <p className="nutrilog-planner-caption">Consumed food only · {plannerDays[0]?.label || ''}{plannerDays.length > 1 ? ' – ' + plannerDays[plannerDays.length - 1].label : ''}</p>
              {plannerView !== 'day' ? (
                <div className="nutrilog-planner-month">
                  <div className="nutrilog-planner-month-grid" role="group" aria-label={plannerView === 'week' ? 'Weekly meal calendar' : 'Monthly meal calendar'}>
                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(name => (
                      <span className="nutrilog-planner-month-weekday" key={name}>{name}</span>
                    ))}
                    {plannerView === 'month' && plannerDays.length > 0 && Array.from({ length: new Date(plannerDays[0].key + 'T12:00:00Z').getUTCDay() }, (_, index) => (
                      <span key={'blank-' + index} aria-hidden="true" />
                    ))}
                    {plannerDays.map(day => (
                      <button type="button" key={day.key}
                        className={'nutrilog-planner-month-day' + (day.key === plannerAnchor ? ' is-selected' : '')}
                        aria-pressed={day.key === plannerAnchor}
                        onClick={() => setPlannerAnchor(day.key)}
                        aria-label={day.label + ', ' + day.plannedCount + ' planned meals and ' + day.count + ' consumed entries'}>
                        <span>{Number(day.key.slice(-2))}</span>
                        <span className="nutrilog-planner-month-markers" aria-hidden="true">
                          {day.count > 0 && <i className="is-consumed" />}
                          {day.plannedCount > 0 && <i className="is-planned" />}
                        </span>

                      </button>
                    ))}
                  </div>
                  <div className="nutrilog-planner-month-legend">
                    <span><i className="is-consumed" /> Consumed</span>
                    <span><i className="is-planned" /> Planned</span>
                  </div>
                </div>
              ) : (
                <div className="nutrilog-planner-day-grid">
                  {plannerDays.map(day => (
                    <button type="button" key={day.key}
                      className={'nutrilog-planner-day' + (day.key === plannerAnchor ? ' nutrilog-planner-day-selected' : '')}
                      aria-pressed={day.key === plannerAnchor}
                      onClick={() => setPlannerAnchor(day.key)}
                      aria-label={day.label + ', ' + day.plannedCount + ' planned meals, ' + day.count + ' consumed entries'}>
                      <strong>{day.label}</strong>
                      <span>{day.plannedCount ? day.plannedCount + ' planned · ' + Math.round(day.plannedCalories) + ' kcal' : 'No plans'}</span>
                      <small>{day.count ? day.count + ' consumed · ' + Math.round(day.calories) + ' kcal' : 'No food logged'}</small>
                    </button>
                  ))}
                </div>
              )}
              <div className="nutrilog-planner-day-detail">
                <h3>{formatHistoryDate(plannerAnchor)}</h3>
                {(() => {
                  const selectedPlans = plannedMeals.filter(item => item.date === plannerAnchor)
                  const selectedLogs = logEntries.filter(entry => zonedDateKey(entry.timestamp) === plannerAnchor)
                  const plannedCalories = selectedPlans.reduce((sum, item) => sum + (Number(item.calories) || 0), 0)
                  const consumedCalories = selectedLogs.reduce((sum, item) => sum + (Number(item.calories) || 0), 0)
                  const goalCalories = Number(macroGoals.calories) || 0
                  return <div className="nutrilog-planner-day-summary" aria-label="Selected day nutrition summary">
                    <div><small>Planned calories</small><strong>{Math.round(plannedCalories)} kcal</strong><span>{selectedPlans.length} planned meal(s)</span></div>
                    <div><small>Consumed calories</small><strong>{Math.round(consumedCalories)} kcal</strong><span>{selectedLogs.length} logged entry/entries</span></div>
                    <div><small>Daily calorie goal</small><strong>{goalCalories > 0 ? Math.round(goalCalories) + ' kcal' : 'Not set'}</strong><span>{goalCalories > 0 ? Math.round(consumedCalories / goalCalories * 100) + '% consumed' : 'Set a goal to track progress'}</span></div>
                  </div>
                })()}
                {plannedMeals.some(item => item.date === plannerAnchor) && <div className="nutrilog-planner-selected-meals">
                  {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map(slot => {
                      const items = plannedMeals.filter(item => item.date === plannerAnchor && item.slot === slot)
                      return items.length > 0 && <div className="nutrilog-planner-selected-slot" key={slot}>
                        <h5>{slot}</h5>
                        {items.map(item => <div className="nutrilog-planner-selected-item" key={item.id}>
                          <span><strong>{item.name}</strong> · {Math.round(Number(item.calories) || 0)} kcal planned</span>
                          <label>Move to
                            <select aria-label={'Change meal category for ' + item.name} value={item.slot}
                              onChange={event => savePlannedMeals(plannedMeals.map(row => row.id === item.id ? { ...row, slot: event.target.value } : row))}>
                              {['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map(category => <option key={category} value={category}>{category}</option>)}
                            </select>
                          </label>
                          <button type="button" className="btn btn-secondary"
                            onClick={() => savePlannedMeals(plannedMeals.filter(row => row.id !== item.id))}
                            aria-label={'Remove planned ' + item.name}>Remove</button>
                        </div>)}
                      </div>
                    })}
                </div>}

              </div>
            </section>
            <div className="planner-intro">
              <h2>Daily Goals</h2>
              <p>Customize your calorie and macro targets below.</p>
            </div>

            <div className="planner-grid">
              {/* Current Goals Overview */}
              <div className="section goals-overview">
                <h3>Current Goals</h3>
                <div className="goals-display">
                  <div className="goal-display-item primary">
                    <div className="goal-icon">🔥</div>
                    <div className="goal-info">
                      <span className="goal-label">Calories</span>
                      <span className="goal-value">{macroGoals.calories} kcal</span>
                    </div>
                  </div>
                  
                  <div className="goal-display-item">
                    <div className="goal-icon">🥩</div>
                    <div className="goal-info">
                      <span className="goal-label">Protein</span>
                      <span className="goal-value">{macroGoals.protein}g</span>
                    </div>
                  </div>
                  
                  <div className="goal-display-item">
                    <div className="goal-icon">🍞</div>
                    <div className="goal-info">
                      <span className="goal-label">Carbs</span>
                      <span className="goal-value">{macroGoals.carbs}g</span>
                    </div>
                  </div>
                  
                  <div className="goal-display-item">
                    <div className="goal-icon">🥑</div>
                    <div className="goal-info">
                      <span className="goal-label">Fat</span>
                      <span className="goal-value">{macroGoals.fat}g</span>
                    </div>
                  </div>
                  
                  <div className="goal-display-item">
                    <div className="goal-icon">🌾</div>
                    <div className="goal-info">
                      <span className="goal-label">Fiber</span>
                      <span className="goal-value">{macroGoals.fiber}g</span>
                    </div>
                  </div>
                </div>

                {/* Macro Breakdown */}
                <div className="macro-breakdown">
                  <h4>Calorie Breakdown</h4>
                  <div className="breakdown-bars">
                    <div className="breakdown-item">
                      <div className="breakdown-label">
                        <span>Protein ({macroGoals.protein}g)</span>
                        <span>{Math.round((macroGoals.protein * 4 / macroGoals.calories) * 100)}%</span>
                      </div>
                      <div className="breakdown-bar">
                        <div 
                          className="breakdown-fill protein"
                          style={{ width: `${(macroGoals.protein * 4 / macroGoals.calories) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className="breakdown-item">
                      <div className="breakdown-label">
                        <span>Carbs ({macroGoals.carbs}g)</span>
                        <span>{Math.round((macroGoals.carbs * 4 / macroGoals.calories) * 100)}%</span>
                      </div>
                      <div className="breakdown-bar">
                        <div 
                          className="breakdown-fill carbs"
                          style={{ width: `${(macroGoals.carbs * 4 / macroGoals.calories) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className="breakdown-item">
                      <div className="breakdown-label">
                        <span>Fat ({macroGoals.fat}g)</span>
                        <span>{Math.round((macroGoals.fat * 9 / macroGoals.calories) * 100)}%</span>
                      </div>
                      <div className="breakdown-bar">
                        <div 
                          className="breakdown-fill fat"
                          style={{ width: `${(macroGoals.fat * 9 / macroGoals.calories) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Edit Goals Form */}
              <div className="section">
                <h3>Edit Goals</h3>
                <form onSubmit={handleSaveMacroGoals}>
                  <div className="form-group">
                    <label>
                      <span className="label-icon">🔥</span>
                      Daily Calories (kcal) *
                    </label>
                    <input
                      type="number"
                      name="calories"
                      value={macroGoalsInput.calories}
                      onChange={handleMacroGoalsChange}
                      min="0"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <span className="label-icon">🥩</span>
                      Protein (g) *
                    </label>
                    <input
                      type="number"
                      name="protein"
                      value={macroGoalsInput.protein}
                      onChange={handleMacroGoalsChange}
                      min="0"
                      required
                    />
                    <span className="input-hint">{Math.round(macroGoalsInput.protein * 4)} calories from protein</span>
                  </div>

                  <div className="form-group">
                    <label>
                      <span className="label-icon">🍞</span>
                      Carbohydrates (g) *
                    </label>
                    <input
                      type="number"
                      name="carbs"
                      value={macroGoalsInput.carbs}
                      onChange={handleMacroGoalsChange}
                      min="0"
                      required
                    />
                    <span className="input-hint">{Math.round(macroGoalsInput.carbs * 4)} calories from carbs</span>
                  </div>

                  <div className="form-group">
                    <label>
                      <span className="label-icon">🥑</span>
                      Fat (g) *
                    </label>
                    <input
                      type="number"
                      name="fat"
                      value={macroGoalsInput.fat}
                      onChange={handleMacroGoalsChange}
                      min="0"
                      required
                    />
                    <span className="input-hint">{Math.round(macroGoalsInput.fat * 9)} calories from fat</span>
                  </div>

                  <div className="form-group">
                    <label>
                      <span className="label-icon">🌾</span>
                      Fiber (g) *
                    </label>
                    <input
                      type="number"
                      name="fiber"
                      value={macroGoalsInput.fiber}
                      onChange={handleMacroGoalsChange}
                      min="0"
                      required
                    />
                    <span className="input-hint">Recommended: 25-38g per day</span>
                  </div>

                  <button type="submit" className="btn btn-primary">
                    <Target size={20} />
                    Save Goals
                  </button>
                </form>

                {/* Quick Presets */}
                <div className="goal-presets">
                  <h4>Quick Presets</h4>
                  <div className="preset-buttons">
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => setMacroGoalsInput({ calories: 2000, protein: 150, carbs: 200, fat: 65, fiber: 28 })}
                    >
                      Balanced
                    </button>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => setMacroGoalsInput({ calories: 2200, protein: 180, carbs: 220, fat: 70, fiber: 30 })}
                    >
                      High Protein
                    </button>
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => setMacroGoalsInput({ calories: 1800, protein: 120, carbs: 150, fat: 80, fiber: 25 })}
                    >
                      Low Carb
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FOODS TAB */}
        {activeTab === 'foods' && (
          <>
            <div className="content-grid">
              {/* Create Food Form */}
              <div className="section">
                <h2>Create Food</h2>
                
                <form onSubmit={handleSaveFood}>
                <div className="form-group">
                  <label>Food Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={foodFormData.name}
                    onChange={handleFoodFormChange}
                    placeholder="e.g., Chicken breast"
                    required
                  />
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ flex: '1' }}>
                    <label>Serving Amount *</label>
                    <input type="number" name="servingAmount" value={foodFormData.servingAmount} onChange={handleFoodFormChange} min="0.01" step="0.01" placeholder="e.g., 100" required />
                  </div>
                  <div className="form-group" style={{ flex: '1' }}>
                    <label>Serving Unit *</label>
                    <select name="servingUnit" value={foodFormData.servingUnit} onChange={handleFoodFormChange} className="food-select" required>
                      <option value="serving">serving</option><option value="g">g</option><option value="oz">oz</option><option value="lb">lb</option><option value="ml">ml</option><option value="fl oz">fl oz</option><option value="cup">cup</option><option value="tbsp">tbsp</option><option value="tsp">tsp</option><option value="piece">piece</option><option value="slice">slice</option><option value="container">container</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Calories (kcal) *</label>
                  <input
                    type="number"
                    name="calories"
                    value={foodFormData.calories}
                    onChange={handleFoodFormChange}
                    placeholder="e.g., 165"
                    min="0"
                    required
                   step="0.01"/>
                </div>

                <div className="form-group">
                  <label>Protein (g)</label>
                  <input
                    type="number"
                    name="protein"
                    value={foodFormData.protein}
                    onChange={handleFoodFormChange}
                    placeholder="e.g., 31"
                    min="0"
                   step="0.01"/>
                </div>

                <div className="form-group">
                  <label>Carbs (g)</label>
                  <input
                    type="number"
                    name="carbs"
                    value={foodFormData.carbs}
                    onChange={handleFoodFormChange}
                    placeholder="e.g., 0"
                    min="0"                   step="0.01"/>
                </div>

                <div className="form-group">
                  <label>Fat (g)</label>
                  <input
                    type="number"
                    name="fat"
                    value={foodFormData.fat}
                    onChange={handleFoodFormChange}
                    placeholder="e.g., 3.6"
                    min="0"
                   step="0.01"/>
                </div>

                <div className="form-group">
                  <label>Fiber (g)</label>
                  <input type="number" name="fiber" value={foodFormData.fiber} onChange={handleFoodFormChange} placeholder="e.g., 2.4" min="0" step="0.01"/>
                </div>

                <button type="submit" className="btn btn-primary">
                  <Plus size={20} />
                  Save Food
                </button>
              </form>
            </div>

            {/* Saved Foods List */}
            <div className="section food-library-section">
              <h2>Your Foods ({savedFoods.length})</h2>
                          <div className="food-library-controls">
              <div className="food-search-wrap"><Search size={18} /><input type="search" value={foodSearch} onChange={e => setFoodSearch(e.target.value)} placeholder="Search your foods..." aria-label="Search your foods" /></div>
              <label className="food-sort-control">Sort
                <select value={foodSort} onChange={e => setFoodSort(e.target.value)}>
                  <option value="newest">Newest added</option><option value="oldest">Oldest added</option><option value="az">A to Z</option><option value="za">Z to A</option>
                </select>
              </label>
            </div>
            <div className="food-library-result-count">{visibleFoods.length} of {savedFoods.length} foods</div>
            <p className="food-library-help">Choose a serving, then log your food. Edit or delete your custom foods using the actions on each card.</p>
            <div className="food-list">
              {savedFoods.length === 0 ? (
                <div className="empty-state">
                  <Coffee size={48} />
                  <p>No foods saved yet.</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>Create your food database!</p>
                </div>
              ) : (
                visibleFoods.map(food => (
                  <div key={food.id} className="food-item">
                    <div className="food-info">
                      <h3>{food.name}</h3>
                      <div className="food-details">
                        <span className="serving-badge">{food.servingSize}</span>
                        <span><strong>{food.calories}</strong> kcal</span>
                        {food.protein > 0 && <span>P: {food.protein}g</span>}
                        {food.carbs > 0 && <span>C: {food.carbs}g</span>}
                        {food.fat > 0 && <span>F: {food.fat}g</span>}
                        {food.fiber > 0 && <span>Fiber: {food.fiber}g</span>}
                      </div>
                    </div>
                    <div className="food-actions">
                      <button type="button" className={'btn btn-secondary food-favorite-action' + (favoriteFoodIds.includes(String(food.id)) ? ' is-favorite' : '')}
                        onClick={() => toggleFavoriteFood(food.id)} aria-pressed={favoriteFoodIds.includes(String(food.id))}
                        aria-label={(favoriteFoodIds.includes(String(food.id)) ? 'Remove ' : 'Add ') + food.name + (favoriteFoodIds.includes(String(food.id)) ? ' from favorites' : ' to favorites')}
                        title={favoriteFoodIds.includes(String(food.id)) ? 'Remove favorite' : 'Add favorite'}>
                        {favoriteFoodIds.includes(String(food.id)) ? '★' : '☆'}
                      </button>
                      <div className="food-serving-actions"><button type="button" className="btn btn-secondary" onClick={() => setFoodLogQuantities(prev => ({ ...prev, [food.id]: '0.5' }))} aria-label={'Half serving of ' + food.name}>½</button><button type="button" className="btn btn-secondary" onClick={() => setFoodLogQuantities(prev => ({ ...prev, [food.id]: '1' }))} aria-label={'One serving of ' + food.name}>1</button><button type="button" className="btn btn-secondary" onClick={() => setFoodLogQuantities(prev => ({ ...prev, [food.id]: '2' }))} aria-label={'Two servings of ' + food.name}>2</button><input className="quantity-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={foodLogQuantities[food.id] ?? 1} onChange={e => setFoodLogQuantities(prev => ({ ...prev, [food.id]: e.target.value }))} aria-label={"Quantity for " + food.name} /><button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '0.9rem' }} onClick={() => handleLogSavedFood(food, foodLogQuantities[food.id] ?? 1)}><Plus size={16} />Log</button></div>
                      <button className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.9rem' }} onClick={() => startEditFood(food)}><Edit size={16} />Edit</button>
                      <button type="button" className="btn btn-danger food-library-delete" onClick={() => handleDeleteFood(food.id)} aria-label={"Delete " + food.name} title={"Delete " + food.name}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
            </div>
            </div>
          </>
        )}

        {editingFoodId !== null && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-food-title" onMouseDown={e => { if (e.target === e.currentTarget) cancelEditFood() }}>
            <form className="modal-content food-edit-modal" onSubmit={handleUpdateFood}>
              <div className="modal-header">
                <h2 id="edit-food-title">Edit Food</h2>
                <button type="button" className="modal-close" onClick={cancelEditFood} aria-label="Close">×</button>
              </div>
              <div className="modal-body">
                <div className="form-group"><label>Food Name *</label><input type="text" name="name" value={editingFoodForm.name} onChange={handleEditingFoodChange} required /></div>
                <div className="form-row">
                  <div className="form-group"><label>Serving Amount *</label><input type="number" name="servingAmount" value={editingFoodForm.servingAmount} onChange={handleEditingFoodChange} min="0.01" step="0.01" required /></div>
                  <div className="form-group"><label>Serving Unit *</label><select className="food-select" name="servingUnit" value={editingFoodForm.servingUnit} onChange={handleEditingFoodChange} required><option value="serving">serving</option><option value="g">g</option><option value="oz">oz</option><option value="lb">lb</option><option value="ml">ml</option><option value="fl oz">fl oz</option><option value="cup">cup</option><option value="tbsp">tbsp</option><option value="tsp">tsp</option><option value="piece">piece</option><option value="slice">slice</option><option value="container">container</option></select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Calories (kcal) *</label><input type="number" name="calories" value={editingFoodForm.calories} onChange={handleEditingFoodChange} min="0" step="0.01" required /></div>
                  <div className="form-group"><label>Protein (g)</label><input type="number" name="protein" value={editingFoodForm.protein} onChange={handleEditingFoodChange} min="0" step="0.01" /></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Carbs (g)</label><input type="number" name="carbs" value={editingFoodForm.carbs} onChange={handleEditingFoodChange} min="0" step="0.01" /></div>
                  <div className="form-group"><label>Fat (g)</label><input type="number" name="fat" value={editingFoodForm.fat} onChange={handleEditingFoodChange} min="0" step="0.01" /></div>
                </div>
                <div className="form-group"><label>Fiber (g)</label><input type="number" name="fiber" value={editingFoodForm.fiber} onChange={handleEditingFoodChange} min="0" step="0.01" /></div>
                <div className="food-edit-actions"><button type="submit" className="btn btn-primary">Save Changes</button><button type="button" className="btn btn-secondary" onClick={cancelEditFood}>Cancel</button></div>
              </div>
            </form>
          </div>        )}

        {/* MEALS TAB */}
        {activeTab === 'meals' && (
          <div className="content-grid meals-page">
            <div className="section nutrilog-meal-builder">
              <h2>Create Meal</h2>
              <form onSubmit={handleSaveMeal}>
                <div className="form-group">
                  <label>Meal Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={mealFormData.name}
                    onChange={handleMealFormChange}
                    placeholder="e.g., Breakfast, Lunch"
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Add Foods</label>
                  <input
                    type="text"
                    value={mealFoodSearch}
                    onChange={(e) => setMealFoodSearch(e.target.value)}
                    placeholder="Search foods..."
                    style={{ marginBottom: '8px' }}
                  />
                  <div className="nutrilog-meal-food-picker">
                    {savedFoods
                      .filter(food => food.name.toLowerCase().includes(mealFoodSearch.toLowerCase()))
                      .map(food => {
                        const selected = mealFormData.selectedFoods.some(
                          selectedFood => String(selectedFood.id) === String(food.id)
                        )
                        return (
                          <label
                            key={food.id}
                             className={`nutrilog-meal-food-choice ${selected ? "is-selected" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                if (selected) {
                                  const index = mealFormData.selectedFoods.findIndex(
                                    selectedFood => String(selectedFood.id) === String(food.id)
                                  )
                                  if (index !== -1) handleRemoveFoodFromMeal(index)
                                } else {
                                  handleAddFoodToMeal(food.id)
                                }
                              }}
                              style={{
                                appearance: 'auto',
                                WebkitAppearance: 'checkbox',
                                width: '20px',
                                height: '20px',
                                minWidth: '20px',
                                minHeight: '20px',
                                margin: 0,
                                opacity: 1,
                                display: 'inline-block'
                              }}
                            />
                            <span style={{ flex: 1 }}>{food.name}</span>
                            <span className="nutrilog-meal-food-calories">{food.calories} kcal</span>
                          </label>
                        )
                      })}
                    {savedFoods.filter(food => food.name.toLowerCase().includes(mealFoodSearch.toLowerCase())).length === 0 && (
                      <div className="nutrilog-meal-food-empty">
                        No matching foods found.
                      </div>
                    )}
                  </div>
                </div>

                {mealFormData.selectedFoods.length > 0 && (
                  <div className="meal-foods">
                    <div className="meal-totals" style={{ marginBottom: '12px' }}>
                      <h4>Meal Totals:</h4>
                      <div className="meal-totals-grid">
                        <span><strong>Calories:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).calories.toFixed(2)} kcal</span>
                        <span><strong>Protein:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).protein.toFixed(2)}g</span>
                        <span><strong>Carbs:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).carbs.toFixed(2)}g</span>
                        <span><strong>Fat:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).fat.toFixed(2)}g</span>
                        <span><strong>Fiber:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).fiber.toFixed(2)}g</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '1rem', margin: 0, color: '#555' }}>
                        Foods in this meal ({mealFormData.selectedFoods.length})
                      </h3>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                        onClick={() => setMealFoodsExpanded(prev => !prev)}
                      >
                        {mealFoodsExpanded ? 'Collapse' : 'Expand'}
                      </button>
                    </div>

                    {mealFoodsExpanded && (
                      <div>
                        <div className="meal-food-sort">
                          <label htmlFor="meal-food-sort">Sort foods</label>
                          <select id="meal-food-sort" value={mealFoodSort} onChange={e => setMealFoodSort(e.target.value)}>
                            <option value="name">Name</option>
                            <option value="calories">Calories</option>
                            <option value="protein">Protein</option>
                            <option value="carbs">Carbs</option>
                            <option value="fat">Fat</option>
                            <option value="quantity">Quantity</option>
                          </select>
                        </div>
                        {sortedMealFoods.map((food) => {
                          const index = mealFormData.selectedFoods.findIndex(item => item === food)
                          return (
                          <div key={index} className="meal-food-item">
                            <div className="meal-food-info">
                              <span>{food.name}</span>
                              <span className="meal-food-macros">
                                {food.calories * (Number(food.quantity) || 1)} kcal
                              </span>
                            </div>
                            <div className="meal-food-controls">
                              <input
                                type="text"
                                value={food.quantity ?? ''}
                                onChange={(e) => handleFoodQuantityChange(index, e.target.value)}
                                onBlur={() => handleFoodQuantityBlur(index)}
                                className="quantity-input"
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="1"
                              />
                              <button
                                type="button"
                                className="btn btn-danger"
                                style={{ padding: '4px 8px' }}
                                onClick={() => handleRemoveFoodFromMeal(index)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="meal-builder-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={mealFormData.selectedFoods.length === 0}
                  >
                    <Plus size={20} />
                    {editingMealId ? 'Update Meal' : 'Save Meal'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={mealFormData.selectedFoods.length === 0}
                    onClick={handleLogMealFromBuilder}
                  >
                    Log Meal
                  </button>
                </div>
              </form>
            </div>

            <div className="section">
              <div className="meal-history-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ marginBottom: 4 }}>Meal History</h2>
                  <p style={{ margin: 0, color: '#777' }}>Go back to any date to find meals you previously logged.</p>
                </div>
                <button
                  type="button"
                  className={showMealHistory ? 'btn btn-primary' : 'btn btn-secondary'}
                  onClick={() => setShowMealHistory(prev => !prev)}
                >
                  {showMealHistory ? 'Hide History' : 'View History'}
                </button>
              </div>

              {showMealHistory && (
                <div style={{ marginTop: 18 }}>
                  <div className="meal-history-controls" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      const date = new Date(mealHistoryDate + 'T12:00:00')
                      date.setDate(date.getDate() - 1)
                      setMealHistoryDate(getLocalDateString(date))
                    }}>‹ Previous</button>
                    <input
                      type="date"
                      value={mealHistoryDate}
                      onChange={e => setMealHistoryDate(e.target.value)}
                      aria-label="Select meal history date"
                    />
                    <button type="button" className="btn btn-secondary" onClick={() => {
                      const date = new Date(mealHistoryDate + 'T12:00:00')
                      date.setDate(date.getDate() + 1)
                      setMealHistoryDate(getLocalDateString(date))
                    }}>Next ›</button>
                    <button type="button" className="btn btn-secondary" onClick={() => setMealHistoryDate(getLocalDateString())}>Today</button>
                  </div>

                  <div style={{ textAlign: 'center', marginBottom: 14, color: '#666', fontWeight: 600 }}>
                    {formatHistoryDate(mealHistoryDate)}
                  </div>

                  {mealHistoryEntries.length === 0 ? (
                    <div className="empty-state">
                      <UtensilsCrossed size={42} />
                      <p>No meals were logged on this date.</p>
                    </div>
                  ) : (
                    <div className="food-list">
                      {mealHistoryEntries.map(entry => (
                        <div key={entry.id} className="food-item">
                          <div className="food-info">
                            <h3>{entry.name}</h3>
                            <div className="food-details">
                              <span>{formatTime(entry.timestamp)}</span>
                              <span><strong>{entry.calories}</strong> kcal</span>
                              <span>P: {entry.protein}g</span>
                              <span>C: {entry.carbs}g</span>
                              <span>F: {entry.fat}g</span>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#888', marginTop: 5 }}>
                              {entry.foods.map((food, i) => (
                                <span key={i}>{food.name} ({food.quantity}x){i < entry.foods.length - 1 ? ', ' : ''}</span>
                              ))}
                            </div>
                          </div>
                          <div className="food-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ padding: '5px 9px', fontSize: '0.82rem' }}
                              onClick={() => {
                                setMealFormData({ name: entry.name, selectedFoods: entry.foods.map(food => ({ ...food })) })
                                setActiveTab('meals')
                                window.scrollTo({ top: 0, behavior: 'smooth' })
                              }}
                            >
                              <Edit size={16} />
                              Use in Meal Builder
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="section">
              <h2>Your Meals ({savedMeals.length})</h2>
              <div className="nutrilog-meal-library-controls">
                <label className="nutrilog-meal-search">
                  <Search size={17} aria-hidden="true" />
                  <input type="search" value={mealSearch} onChange={e => setMealSearch(e.target.value)}
                    placeholder="Search saved meals" aria-label="Search saved meals" />
                </label>
                <label className="nutrilog-meal-sort">Sort
                  <select value={mealSort} onChange={e => setMealSort(e.target.value)}>
                    <option value="az">A to Z</option>
                    <option value="za">Z to A</option>
                  </select>
                </label>
              </div>
              <p className="nutrilog-meal-result-count">{visibleMeals.length} of {savedMeals.length} meals</p>
              <div className="food-list">
                {savedMeals.length === 0 ? (
                  <div className="empty-state">
                    <UtensilsCrossed size={48} />
                    <p>No meals saved yet.</p>
                    <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>Create meals from your foods!</p>
                  </div>
                ) : visibleMeals.length === 0 ? (
                  <div className="empty-state">
                    <Search size={32} aria-hidden="true" />
                    <p>No saved meals match your search.</p>
                    <button type="button" className="btn btn-secondary" onClick={() => setMealSearch('')}>Clear search</button>
                  </div>
                ) : (
                  visibleMeals.map(meal => (
                    <div key={meal.id} className="food-item">
                      <div className="food-info">
                        <h3>{meal.name}</h3>
                        <div className="food-details">
                          <span><strong>{meal.calories}</strong> kcal</span>
                          {meal.protein > 0 && <span>P: {meal.protein}g</span>}
                          {meal.carbs > 0 && <span>C: {meal.carbs}g</span>}
                          {meal.fat > 0 && <span>F: {meal.fat}g</span>}
                          {Number(meal.fiber || 0) > 0 && <span>Fiber: {meal.fiber}g</span>}
                          <span className="time-badge">{Array.isArray(meal.foods) ? meal.foods.length : 0} items</span>
                        </div>
                        <div className="nutrilog-meal-ingredients" aria-label="Meal ingredients">
                          {Array.isArray(meal.foods) && meal.foods.length ? meal.foods.map((food, index) => (
                            <span className="nutrilog-meal-ingredient" key={food.id || index}>
                              <span>{food.name}</span>
                              <strong>{Number(food.quantity || 1).toLocaleString()}×</strong>
                            </span>
                          )) : <span className="nutrilog-meal-no-ingredients">No ingredient details available</span>}
                        </div>
                      </div>
                      <div className="food-actions">
                        <button
                          className="btn btn-primary"
                          style={{ padding: '8px 12px', fontSize: '0.9rem' }}
                          onClick={() => handleLogMeal(meal)}
                        >
                          <Plus size={16} />
                          Log
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => handleEditMeal(meal)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          onClick={() => handleDeleteMeal(meal.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'goals' && <HealthGoals />}

        {activeTab === 'activity' && <ActivityBoard />}

        {activeTab === 'shared' && <SharedProgress />}

        {activeTab === 'graphs' && (
          <div className="graphs-page">
            <div className="planner-intro">
              <h2><BarChart3 size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />Progress & Analytics</h2>
              <p>Review daily nutrition trends and your progress toward your goals.</p>
            </div>
            <div className="section graph-controls">
              <div className="graph-control-row">
                <label>Metric<select value={graphMetric} onChange={event => setGraphMetric(event.target.value)}><option value="calories">Calories</option><option value="protein">Protein</option><option value="carbs">Carbs</option><option value="fat">Fat</option><option value="fiber">Fiber</option></select></label>
                <label>Graph type<select value={graphType} onChange={event => setGraphType(event.target.value)}><option value="bars">Bar</option><option value="line">Line</option><option value="area">Area</option><option value="dots">Dots</option></select></label>
              </div>
            </div>
            <div className="section">
              <h3>{graphMetric.charAt(0).toUpperCase() + graphMetric.slice(1)} — Last 14 Days</h3>
              {(() => {
                const days = Array.from({ length: 14 }, (_, offset) => {
                  const date = new Date()
                  date.setHours(12, 0, 0, 0)
                  date.setDate(date.getDate() - (13 - offset))
                  const key = getLocalDateString(date)
                  const entries = logEntries.filter(entry => entry.timestamp && getLocalDateString(new Date(entry.timestamp)) === key)
                  return { date, key, value: entries.reduce((sum, entry) => sum + Number(entry[graphMetric] || 0), 0) }
                })
                const max = Math.max(Number(macroGoals[graphMetric] || 0), ...days.map(day => day.value), 1)
                const points = days.map((day, index) => `${(index / 13) * 100},${100 - Math.min(96, (day.value / max) * 90)}`).join(" ")
                return graphType === "bars" ? (
                  <div className="nutrition-graph nutrition-graph-bars">
                    {days.map(day => <div className="nutrition-graph-day" key={day.key} title={`${day.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${Math.round(day.value)} ${graphMetric === "calories" ? "kcal" : "g"}`}><div className="nutrition-graph-value">{Math.round(day.value)}</div><div className="nutrition-graph-track"><div className="nutrition-graph-fill" style={{ height: `${Math.max(2, day.value / max * 100)}%` }} /></div><span>{day.date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span></div>)}
                  </div>
                ) : (
                  <div className={`nutrition-chart-${graphType}`}>
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${graphMetric} ${graphType} chart`}>
                      {graphType === "area" && <polygon points={`0,100 ${points} 100,100`} className="nutrition-chart-area" />}
                      {graphType !== "dots" && <polyline points={points} className="nutrition-chart-line" />}
                    </svg>
                    {graphType === "dots" && (
                      <div className="nutrition-chart-dot-layer">
                        {days.map((day, index) => (
                          <div
                            key={day.key}
                            className="nutrition-chart-dot"
                            style={{
                              left: `${((index + 0.5) / 14) * 100}%`,
                              bottom: `${5 + Math.min(90, (day.value / max) * 90)}%`
                            }}
                            title={`${day.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${Math.round(day.value)} ${graphMetric === "calories" ? "kcal" : "g"}`}
                          />
                        ))}
                      </div>
                    )}
                    <div className="nutrition-chart-labels">{days.map(day => <span key={day.key}>{day.date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>)}</div>
                  </div>
                )
              })()}            </div>
            <div className="content-grid graphs-macro-grid">
              {[
                ['Protein', 'protein', macroGoals.protein],
                ['Carbs', 'carbs', macroGoals.carbs],
                ['Fat', 'fat', macroGoals.fat]
              ].map(([label, key, goal]) => (
                <div className="section" key={key}>
                  <h3>{label}</h3>
                  {(() => {
                    const days = Array.from({ length: 7 }, (_, offset) => {
                      const date = new Date()
                      date.setHours(12, 0, 0, 0)
                      date.setDate(date.getDate() - (6 - offset))
                      const dayKey = getLocalDateString(date)
                      const value = logEntries.filter(entry => entry.timestamp && getLocalDateString(new Date(entry.timestamp)) === dayKey).reduce((sum, entry) => sum + Number(entry[key] || 0), 0)
                      return { date, dayKey, value }
                    })
                    const max = Math.max(goal || 0, ...days.map(day => day.value), 1)
                    const points = days.map((day, index) => `${(index / 6) * 100},${100 - Math.min(92, (day.value / max) * 82)}`).join(" ")
                    return (
                      <div className="macro-sparkline">
                        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={`${label} last 7 days`}>
                          <polyline points={points} className="macro-sparkline-line" />
                        </svg>
                        <div className="macro-sparkline-point-layer" aria-label={`${label} daily values`}>
                          {days.map((day, index) => {
                            const pointId = `${key}-${day.dayKey}`
                            const pointBottom = Math.min(92, (day.value / max) * 82)
                            return (
                              <button
                                key={day.dayKey}
                                type="button"
                                className={`macro-sparkline-point ${activeGraphPoint === pointId ? 'active' : ''}`}
                                style={{ left: `${(index / 6) * 100}%`, bottom: `${pointBottom}%` }}
                                aria-label={`${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${Math.round(day.value)}g`}
                                onMouseEnter={() => setActiveGraphPoint(pointId)}
                                onFocus={() => setActiveGraphPoint(pointId)}
                                onBlur={() => setActiveGraphPoint(null)}
                                onClick={() => setActiveGraphPoint(prev => prev === pointId ? null : pointId)}
                              >
                                <span className="macro-sparkline-tooltip">
                                  {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {Math.round(day.value)}g
                                </span>
                              </button>
                            )
                          })}
                        </div>
                        <div className="macro-sparkline-meta">
                          <span>{days[0].date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
                          <strong>{Math.round(days[6].value)}g today</strong>
                          <span>{days[6].date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

                {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="settings-container">
            <div className="planner-intro">
              <h2>Settings</h2>
              <p>Personalize NutriLog, manage account security, and review your data and connections.</p>
            </div>

            <div className="section nutrilog-account-settings">
              <h3>Account</h3>
              <p className="settings-description">Signed in as <strong>{user?.email || 'Offline user'}</strong></p>
              <button type="button" className="btn btn-secondary" onClick={onLogout}>Sign out</button>
            </div>

            {!isOfflineMode() && <div className="section">
              <h3>Profile Information</h3>
              <p className="settings-description">Your display name appears in connection requests and shared progress.</p>
              <form className="settings-form" onSubmit={async event => {
                event.preventDefault()
                setProfileSaving(true)
                try {
                  const result = await api.auth.updateProfile(profileName)
                  setProfileName(result.user.displayName || '')
                  alert('Display name saved.')
                } catch (err) { alert(err.message) }
                finally { setProfileSaving(false) }
              }}>
                <div className="form-group"><label>Display Name<input type="text" value={profileName} onChange={event => setProfileName(event.target.value)} maxLength={80} placeholder="Enter your name" /></label></div>
                <div className="form-group"><label>Email Address<input type="email" value={user.email} readOnly /></label></div>
                <button className="btn btn-primary" type="submit" disabled={profileSaving}><Save size={18} />{profileSaving ? 'Saving…' : 'Save Display Name'}</button>
              </form>
            </div>}

            <div className="section">
              <h3>Account Security</h3>
              <p className="settings-description">Manage your password and active NutriLog sessions.</p>
              <form onSubmit={async e => { e.preventDefault(); const form=e.currentTarget; const current=form.currentPassword.value; const next=form.newPassword.value; const confirm=form.confirmPassword.value; if(next!==confirm)return alert('New passwords do not match.'); try{await api.auth.changePassword(current,next); form.reset(); alert('Password changed. All other sessions were signed out.')}catch(err){alert(err.message)} }} className="settings-form">
                <div className="form-group"><label>Current Password<input name="currentPassword" type="password" required autoComplete="current-password" /></label></div>
                <div className="form-group"><label>New Password<input name="newPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label></div>
                <div className="form-group"><label>Confirm New Password<input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label></div>
                <button className="btn btn-primary" type="submit"><KeyRound size={18} />Change Password</button>
              </form>
              <div style={{marginTop:24}}>
                <h4>Other Devices</h4>
                <p className="settings-description">Sign out every other active session while keeping this device signed in.</p>
                <button className="btn btn-secondary" onClick={async()=>{if(!confirm('Sign out all other devices? You will stay signed in on this device.'))return;try{await api.auth.revokeOtherSessions();alert('All other sessions were revoked.')}catch(err){alert(err.message)}}}><RefreshCw size={18}/>Sign Out Other Devices</button>
              </div>
            </div>

            {!isOfflineMode() && <ConnectionsPanel
              refreshToken={connectionsRefreshToken}
              onRefreshComplete={handleConnectionsRefreshComplete}
            />}

            <div className="section">
              <h3>Time Zone</h3>
              <p className="settings-description">Choose your local time zone for Shared Progress and daily nutrition totals. Automatic uses this device's detected zone; select one manually if it reports UTC incorrectly.</p>
              <div className="form-group">
                <label htmlFor="nutrilog-time-zone">Time zone</label>
                <select id="nutrilog-time-zone" className="food-select" value={timeZoneOverride}
                  onChange={event => setTimeZoneOverride(event.target.value)}>
                  <option value="auto">Automatic (detected: {deviceTimeZone})</option>
                  {[
                    ['America/New_York', 'Eastern (New York)'],
                    ['America/Chicago', 'Central (Chicago / Texas)'],
                    ['America/Denver', 'Mountain (Denver)'],
                    ['America/Phoenix', 'Arizona (Phoenix, no DST)'],
                    ['America/Los_Angeles', 'Pacific (Los Angeles)'],
                    ['America/Anchorage', 'Alaska (Anchorage)'],
                    ['Pacific/Honolulu', 'Hawaii (Honolulu)'],
                    ['America/Puerto_Rico', 'Atlantic (Puerto Rico)'],
                    ['America/Mexico_City', 'Mexico City'],
                    ['America/Toronto', 'Toronto'],
                    ['Europe/London', 'London'],
                    ['Europe/Paris', 'Paris'],
                    ['Asia/Kolkata', 'India'],
                    ['Asia/Tokyo', 'Tokyo'],
                    ['Australia/Sydney', 'Sydney'],
                    ['UTC', 'UTC']
                  ].map(([zone, label]) => <option key={zone} value={zone}>{label}</option>)}
                </select>
              </div>
              <p className="settings-description">Active time zone: <strong>{selectedTimeZone}</strong>. Changes are saved for this account and synchronized to the server.</p>
            </div>

            <div className="section theme-settings">
              <h3>Appearance</h3>
              <p className="settings-description">Choose a color scheme for this browser. Your choice is saved locally on this device.</p>
              <div className="appearance-controls">
                <div className="appearance-group">
                  <span className="appearance-label">Mode</span>
                  <div className="mode-toggle" role="group" aria-label="Color mode">
                    <button type="button" aria-pressed={mode === 'light'} className={mode === 'light' ? 'selected' : ''} onClick={() => setMode('light')}>☀ Light</button>
                    <button type="button" aria-pressed={mode === 'dark'} className={mode === 'dark' ? 'selected' : ''} onClick={() => setMode('dark')}>☾ Dark</button>
                  </div>
                </div>
                <div className="appearance-group">
                  <span className="appearance-label">Accent color</span>
                  <div className="theme-options">
                    {[
                      { id: 'green', label: 'Sage' },
                      { id: 'blue', label: 'Ocean' },
                      { id: 'purple', label: 'Berry' },
                      { id: 'orange', label: 'Citrus' },
                      { id: 'teal', label: 'Teal' },
                      { id: 'red', label: 'Ruby' },
                      { id: 'pink', label: 'Rose' },
                      { id: 'indigo', label: 'Indigo' },
                      { id: 'yellow', label: 'Gold' },
                      { id: 'slate', label: 'Slate' }
                    ].map(option => (
                      <button key={option.id} type="button" className={`theme-option theme-option-${option.id} ${theme === option.id ? 'selected' : ''}`} onClick={() => setTheme(option.id)} aria-pressed={theme === option.id}>
                        <span className="theme-swatch" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                  <label className="custom-color-picker">
                    <span>Custom</span>
                    <input type="color" value={customAccent} onChange={e => { setCustomAccent(e.target.value); setTheme('custom') }} aria-label="Choose custom accent color" />
                    <span className="custom-color-value">{customAccent.toUpperCase()}</span>
                  </label>
                </div>
              </div>
            </div>

            {isNutriLogNative() && !isOfflineMode() && (
              <div className="section">
                <h3>Server Connection</h3>
                <p className="settings-description">This device is connected to:</p>
                <div className="food-item" style={{ marginTop: 10 }}>
                  <div className="food-info">
                    <h3 style={{ wordBreak: 'break-all' }}>{getConfiguredServerUrl()}</h3>
                    <div className="food-details"><span>Server address is stored on this device.</span></div>
                  </div>
                  <div className="food-actions">
                    <button className="btn btn-secondary" type="button" onClick={onChangeServer}>Change Server</button>
                  </div>
                </div>
              </div>
            )}

            <div className="settings-grid">
              {/* Data Overview */}
              <div className="section">
                <h3>Data Overview</h3>
                <div className="data-stats">
                  <div className="data-stat-item">
                    <div className="data-stat-icon">
                      <Coffee size={32} />
                    </div>
                    <div className="data-stat-info">
                      <span className="data-stat-value">{savedFoods.length}</span>
                      <span className="data-stat-label">Saved Foods</span>
                    </div>
                  </div>

                  <div className="data-stat-item">
                    <div className="data-stat-icon">
                      <UtensilsCrossed size={32} />
                    </div>
                    <div className="data-stat-info">
                      <span className="data-stat-value">{savedMeals.length}</span>
                      <span className="data-stat-label">Saved Meals</span>
                    </div>
                  </div>

                  <div className="data-stat-item">
                    <div className="data-stat-icon">
                      <Flame size={32} />
                    </div>
                    <div className="data-stat-info">
                      <span className="data-stat-value">{logEntries.length}</span>
                      <span className="data-stat-label">Log Entries</span>
                    </div>
                  </div>

                  <div className="data-stat-item">
                    <div className="data-stat-icon">
                      <Target size={32} />
                    </div>
                    <div className="data-stat-info">
                      <span className="data-stat-value">{macroGoals.calories}</span>
                      <span className="data-stat-label">Daily Goal (kcal)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Import/Export Section */}
              <div className="section">
                <h3>Backup & Restore</h3>
                <p style={{ color: '#666', marginBottom: '20px', fontSize: '0.95rem' }}>
                  Export your data to create a backup, or import a previously saved backup to restore your data.
                </p>

                <div className="import-export-actions">
                  <div className="action-card">
                    <div className="action-icon export">
                      <Download size={32} />
                    </div>
                    <h4>Export Data</h4>
                    <p>Download all your foods, meals, log entries, and goals as a JSON file.</p>
                    <button 
                      className="btn btn-primary"
                      onClick={handleExportData}
                      style={{ width: '100%', marginTop: '15px' }}
                    >
                      <Download size={20} />
                      Export to JSON
                    </button>
                  </div>

                  <div className="action-card">
                    <div className="action-icon import">
                      <Upload size={32} />
                    </div>
                    <h4>Import Data</h4>
                    <p>Restore your data from a previously exported JSON file. This will replace current data.</p>
                    <label className="btn btn-secondary" style={{ width: '100%', marginTop: '15px', cursor: 'pointer' }}>
                      <Upload size={20} />
                      Import from JSON
                      <input 
                        type="file" 
                        accept=".json"
                        onChange={handleImportData}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                </div>

                {/* Info Box */}
                <div className="info-box" style={{ marginTop: '25px' }}>
                  <h4>💡 Backup Tips</h4>
                  <ul style={{ marginTop: '10px', paddingLeft: '20px', lineHeight: '1.8' }}>
                    <li>Export your data regularly to prevent data loss</li>
                    <li>Keep backup files in a safe location (cloud storage, external drive)</li>
                    <li>Importing will replace all current data - make sure to export first if needed</li>
                    <li>You can transfer data between devices using export/import</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
