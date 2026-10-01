import { Fragment, useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Target, TrendingUp, Flame, Coffee, UtensilsCrossed, BookOpen, Edit, Search, Loader, ClipboardList, Settings, Download, Upload, Users, Shield, UserCheck, UserX, KeyRound, RefreshCw } from 'lucide-react'
import HealthGoals from './HealthGoals'
import ActivityBoard from './ActivityBoard'

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return year + '-' + month + '-' + day
}
import { storage, api, normalizeServerData, calculateMealTotals, scaleNutrition, getConfiguredServerUrl, isNutriLogNative } from './services'

function AdminPanel({ user }) {
  const [users, setUsers] = useState([])
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
            <div className="food-list">
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
                  <div className="food-actions">
                    <button className="btn btn-secondary" title="Reset password" onClick={() => resetPassword(account)}><KeyRound size={16} /></button>
                    <button className="btn btn-secondary" title="Revoke sessions" onClick={() => revokeSessions(account)}><RefreshCw size={16} /></button>
                    <button className="btn btn-secondary" title="Change role" onClick={() => changeRole(account)} disabled={account.id === user.id}><Shield size={16} /></button>
                    <button className={account.is_active ? 'btn btn-danger' : 'btn btn-primary'} title={account.is_active ? 'Disable account' : 'Enable account'} onClick={() => toggleUser(account)} disabled={account.id === user.id}>{account.is_active ? <UserX size={16} /> : <UserCheck size={16} />}</button>
                    <button className="btn btn-danger" title="Delete account" onClick={() => deleteUser(account)} disabled={account.id === user.id}><Trash2 size={16} /></button>
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
function App({ user, initialServerData, onLogout, onChangeServer }) {
  // Navigation
  const [activeTab, setActiveTab] = useState('tracker')
  const tabDefaults = ['tracker', 'planner', 'foods', 'meals', 'goals', 'activity', 'settings']
  const tabLabels = {
    tracker: 'Tracker',
    planner: 'Planner',
    foods: 'Foods',
    meals: 'Meals',
    goals: 'Goals',
    activity: 'Activity',
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
  const tabDragRef = useRef(null)
  const [draggingTab, setDraggingTab] = useState(null)
  const [theme, setTheme] = useState(() => initialServerData?.preferences?.theme || localStorage.getItem('nutrilog-theme') || 'green')
  const [mode, setMode] = useState(() => initialServerData?.preferences?.mode || localStorage.getItem('nutrilog-mode') || 'light')
  const [customAccent, setCustomAccent] = useState(() => initialServerData?.preferences?.customAccent || localStorage.getItem('nutrilog-custom-accent') || '#6B9080')
  const [trackerLayout, setTrackerLayout] = useState(() => {
    try {
      const serverLayout = initialServerData?.preferences?.trackerLayout
      if (serverLayout && typeof serverLayout === 'object' && Object.keys(serverLayout).length) return { ...serverLayout, customize: false }
      const saved = JSON.parse(localStorage.getItem('nutrilog-tracker-layout'))
      return {
        template: saved?.template || 'balanced',
        columns: Number(saved?.columns) || 3,
        customize: Boolean(saved?.customize),
        cards: saved?.cards || {},
        order: Array.isArray(saved?.order) ? saved.order : ['calories', 'remaining', 'protein', 'carbs', 'fat', 'fiber']
      }
    } catch {
      return { template: 'custom', columns: 3, customize: false, cards: {}, order: ['calories', 'remaining', 'protein', 'carbs', 'fat', 'fiber'] }
    }
  })
  const [draggingTrackerCard, setDraggingTrackerCard] = useState(null)
  const [resizingTrackerCard, setResizingTrackerCard] = useState(null)
  const [foodSearch, setFoodSearch] = useState('')
  const [foodSort, setFoodSort] = useState('newest')
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
  const [mealHistoryDate, setMealHistoryDate] = useState(() => getLocalDateString())
  const [showMealHistory, setShowMealHistory] = useState(false)
  const [expandedLogEntryId, setExpandedLogEntryId] = useState(null)
  const [editingLogMeal, setEditingLogMeal] = useState(null)
  
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
    localStorage.setItem('nutrilog-tracker-layout', JSON.stringify(trackerLayout))
  }, [trackerLayout])

  useEffect(() => {
    if (!isInitialLoadComplete) return
    const preferences = {
      theme,
      mode,
      customAccent,
      trackerLayout: { template: trackerLayout.template, columns: trackerLayout.columns, cards: trackerLayout.cards, order: trackerLayout.order },
      tabOrder
    }
    const timer = setTimeout(() => { api.preferences.save(preferences).catch(() => {}) }, 600)
    return () => clearTimeout(timer)
  }, [theme, mode, customAccent, trackerLayout.template, trackerLayout.columns, trackerLayout.cards, trackerLayout.order, tabOrder, isInitialLoadComplete])

  useEffect(() => {
    const available = user?.role === 'admin' ? [...tabDefaults, 'admin'] : tabDefaults
    const normalized = [...tabOrder.filter(tab => available.includes(tab)), ...available.filter(tab => !tabOrder.includes(tab))]
    if (normalized.join('|') !== tabOrder.join('|')) setTabOrder(normalized)
    localStorage.setItem('nutrilog-tab-order-' + (user?.id || 'default'), JSON.stringify(normalized))
  }, [tabOrder, user?.id, user?.role])

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

  // Load data through the application storage service.
  useEffect(() => {
    const local = storage.load()
    const data = initialServerData ? normalizeServerData(initialServerData) : local
    setSavedFoods(data.savedFoods)
    setSavedMeals(data.savedMeals)
    setLogEntries(data.logEntries)
    const goals = data.macroGoals || local.macroGoals
    const calories = Number(goals?.calories || local.dailyGoal || 2000)
    setDailyGoal(calories)
    setGoalInput(calories)
    setMacroGoals(goals)
    setMacroGoalsInput(goals)
    setIsInitialLoadComplete(true)
  }, [initialServerData])

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
    try {
      const serverFood = user ? (await api.foods.create(draft)).item : null
      const newFood = serverFood ? { ...draft, ...serverFood, id: serverFood.id, servingSize: serverFood.serving_size || draft.servingSize, calories: Number(serverFood.calories), protein: Number(serverFood.protein), carbs: Number(serverFood.carbs), fat: Number(serverFood.fat), fiber: Number(serverFood.fiber) } : { ...draft, id: Date.now() }
      setSavedFoods(prev => [newFood, ...prev])
      setFoodFormData({ name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '', servingAmount: '1', servingUnit: 'serving' })
    } catch (error) {
      alert(error.message)
    }
  }

  const handleDeleteFood = async (id) => {
    try {
      if (user) await api.foods.remove(id)
      setSavedFoods(prev => prev.filter(food => food.id !== id))
    } catch (error) {
      alert(error.message)
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
    try {
      const result = user ? (await api.foods.update(editingFoodId, draft)).item : { ...draft, id: editingFoodId }
      const updatedFood = {
        ...draft, ...result, id: editingFoodId,
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
    } catch (error) { alert(error.message) }
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
    try {
      const newMeal = user
        ? (editingMealId
            ? (await api.meals.update(editingMealId, draft)).item
            : (await api.meals.create(draft)).item)
        : { ...draft, id: editingMealId || Date.now() }

      setSavedMeals(prev => editingMealId
        ? prev.map(meal => meal.id === editingMealId ? newMeal : meal)
        : [newMeal, ...prev]
      )
      setMealFormData({ name: '', selectedFoods: [] })
      setEditingMealId(null)
    } catch (error) {
      alert(error.message)
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
    try {
      if (user) await api.meals.remove(id)
      setSavedMeals(prev => prev.filter(meal => meal.id !== id))
    } catch (error) {
      alert(error.message)
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
  // Filter foods and meals based on search query
  const getFilteredSuggestions = () => {
    const query = quickLogForm.searchQuery.toLowerCase()
    if (!query) return { foods: [], meals: [] }

    const filteredFoods = savedFoods.filter(food => 
      food.name.toLowerCase().includes(query)
    )
    const filteredMeals = savedMeals.filter(meal => 
      meal.name.toLowerCase().includes(query)
    )

    return { foods: filteredFoods, meals: filteredMeals }
  }

  const createLogEntry = async (entry) => {
    const saved = user ? (await api.logs.create(entry)).item : null
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

  const handleUpdateLogQuantity = async (entry, requestedQuantity) => {
    const quantity = Number(requestedQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0) { alert('Please enter a valid serving quantity.'); return }
    const currentQuantity = Number(entry.quantity) > 0 ? Number(entry.quantity) : 1
    const scale = quantity / currentQuantity
    const updated = { ...entry, quantity, calories: Number((entry.calories * scale).toFixed(2)), protein: Number((entry.protein * scale).toFixed(2)), carbs: Number((entry.carbs * scale).toFixed(2)), fat: Number((entry.fat * scale).toFixed(2)), fiber: Number(((entry.fiber || 0) * scale).toFixed(2)) }
    try {
      const saved = user ? (await api.logs.update(entry.id, updated)).item : null
      const next = saved ? { ...updated, id: saved.id, type: saved.entry_type, name: saved.name, calories: Number(saved.calories), protein: Number(saved.protein), carbs: Number(saved.carbs), fat: Number(saved.fat), fiber: Number(saved.fiber), quantity: Number(saved.quantity || quantity), foods: Array.isArray(saved.foods) ? saved.foods : updated.foods, timestamp: saved.consumed_at } : updated
      setLogEntries(prev => prev.map(item => item.id === entry.id ? next : item))
    } catch (error) { alert(error.message) }
  }

  const handleToggleLogMeal = entry => {
    if (entry.type !== 'meal') return
    setExpandedLogEntryId(prev => prev === entry.id ? null : entry.id)
    if (expandedLogEntryId === entry.id) setEditingLogMeal(null)
  }

  const handleEditLoggedMeal = entry => {
    if (entry.type !== 'meal') return
    setExpandedLogEntryId(entry.id)
    setEditingLogMeal({
      ...entry,
      name: entry.name,
      foods: Array.isArray(entry.foods) ? entry.foods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 })) : []
    })
  }

  const handleLoggedMealFoodQuantityChange = (index, value) => {
    setEditingLogMeal(prev => prev ? ({
      ...prev,
      foods: prev.foods.map((food, i) => i === index ? { ...food, quantity: value } : food)
    }) : prev)
  }

  const handleSaveLoggedMeal = async () => {
    if (!editingLogMeal) return
    if (!editingLogMeal.name.trim() || editingLogMeal.foods.length === 0) {
      alert('A meal name and at least one food are required.')
      return
    }

    const foods = editingLogMeal.foods.map(food => ({
      ...food,
      quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1
    }))
    const mealQuantity = Number(editingLogMeal.quantity) > 0 ? Number(editingLogMeal.quantity) : 1
    const baseTotals = calculateMealTotals(foods)
    const updated = {
      ...editingLogMeal,
      name: editingLogMeal.name.trim(),
      foods,
      calories: Number((baseTotals.calories * mealQuantity).toFixed(2)),
      protein: Number((baseTotals.protein * mealQuantity).toFixed(2)),
      carbs: Number((baseTotals.carbs * mealQuantity).toFixed(2)),
      fat: Number((baseTotals.fat * mealQuantity).toFixed(2)),
      fiber: Number((baseTotals.fiber * mealQuantity).toFixed(2)),
      quantity: mealQuantity
    }

    try {
      const saved = user ? (await api.logs.update(editingLogMeal.id, updated)).item : null
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
      if (user) await api.logs.remove(id)
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
  const todayKey = today.toLocaleDateString('en-US')

  const todaysLogEntries = logEntries.filter(entry => {
    if (!entry.timestamp) return false
    return new Date(entry.timestamp).toLocaleDateString('en-US') === todayKey
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

  const trackerCards = [
    { id: 'calories', label: "Today's Calories", value: totalCalories, subtext: `of ${macroGoals.calories} kcal`, progress, className: 'primary' },
    { id: 'remaining', label: 'Remaining', value: remaining, subtext: `kcal ${remaining < 0 ? 'over' : 'left'}`, className: 'success' },
    { id: 'protein', label: 'Protein', value: `${totalProtein}g`, subtext: `of ${macroGoals.protein}g`, progress: proteinProgress },
    { id: 'carbs', label: 'Carbs', value: `${totalCarbs}g`, subtext: `of ${macroGoals.carbs}g`, progress: carbsProgress },
    { id: 'fat', label: 'Fat', value: `${totalFat}g`, subtext: `of ${macroGoals.fat}g`, progress: fatProgress },
    { id: 'fiber', label: 'Fiber', value: `${totalFiber}g`, subtext: `of ${macroGoals.fiber}g`, progress: fiberProgress, className: 'warning' }
  ]

  const updateTrackerCard = (id, field, value) => {
    setTrackerLayout(prev => ({
      ...prev,
      template: 'custom',
      cards: { ...prev.cards, [id]: { ...(prev.cards[id] || {}), [field]: value } }
    }))
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
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Check if it's today
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    }
    // Check if it's yesterday
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    }
    // Otherwise return formatted date
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
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

  const todayDateString = getLocalDateString()
  const todayLogEntries = logEntries.filter(entry => {
    if (!entry.timestamp) return false
    const date = new Date(entry.timestamp)
    if (Number.isNaN(date.getTime())) return false
    return getLocalDateString(date) === todayDateString
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const todayLogTotals = todayLogEntries.reduce((totals, entry) => ({
    calories: totals.calories + entry.calories,
    protein: totals.protein + entry.protein,
    carbs: totals.carbs + entry.carbs,
    fat: totals.fat + entry.fat,
    fiber: totals.fiber + (entry.fiber || 0)
  }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })

  const trackerHistoryEntries = logEntries.filter(entry => {
    if (!entry.timestamp) return false
    const date = new Date(entry.timestamp)
    if (Number.isNaN(date.getTime())) return false
    const localDate = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-')
    return localDate === trackerHistoryDate
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
    return getLocalDateString(date) === mealHistoryDate
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
      <div className="header">
        <h1>🥗 NutriLog</h1>
        <p>Track your nutrition, macros, and daily goals</p>
        <div className="account-bar">
          <span>Signed in as <strong>{user?.email}</strong></span>
          <button className="account-logout" onClick={onLogout}>Sign out</button>
        </div>
        
        {/* Tab Navigation */}
        <div className="tab-navigation">
          {tabOrder.map(tabId => {
            const Icon = tabIcons[tabId]
            return (
              <button
                key={tabId}
                type="button"
                data-tab-id={tabId}
                className={`tab-btn ${activeTab === tabId ? 'active' : ''} ${customizeTabs ? 'tab-customizing' : ''} ${draggingTab === tabId ? 'tab-dragging' : ''}`}
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
            className={`tab-btn tab-customize-toggle ${customizeTabs ? 'active' : ''}`}
            onClick={() => setCustomizeTabs(prev => !prev)}
          >
            <Settings size={18} />
            {customizeTabs ? 'Done' : 'Arrange Tabs'}
          </button>
        </div>

        {customizeTabs && (
          <div className="tab-customizer-hint">
            <span>↔ Drag the tabs into any order</span>
            <span>Your layout is saved for this account</span>
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
                <h2>Daily Dashboard</h2>
                <p>Arrange your nutrition cards to fit the way you track.</p>
              </div>
              <div className="tracker-layout-actions">
                <button type="button" className={trackerLayout.customize ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTrackerLayout(prev => ({ ...prev, customize: !prev.customize }))}>
                  <Settings size={16} /> {trackerLayout.customize ? 'Done Customizing' : 'Customize Cards'}
                </button>
              </div>
            </div>

            {trackerLayout.customize && (
              <div className="tracker-customizer-inline">
                <span>↔ Drag the grip on a card to move it</span>
                <span>↘ Drag the corner to resize it</span>
              </div>
            )}
            <div className="stats-grid tracker-stats-grid" style={{ '--tracker-columns': trackerLayout.columns || 3 }}>
              {orderedTrackerCards.map(card => {
                const config = trackerLayout.cards[card.id] || {}
                return (
                  <div key={card.id} data-tracker-card-id={card.id} className={`stat-card ${card.className || ''} tracker-card-size-${config.size || 'normal'} tracker-card-orientation-${config.orientation || 'vertical'} ${draggingTrackerCard === card.id ? 'tracker-card-dragging' : ''}`}>
                    <div className="stat-label">{trackerLayout.customize && <button type="button" className="tracker-card-drag-dot" aria-label={`Move ${card.label} card`} onPointerDown={event => beginTrackerDrag(event, card.id)}>⠿</button>}{card.label}</div>
                    <div className="stat-value" style={{ fontSize: card.id === 'calories' || card.id === 'remaining' ? undefined : '2rem', color: card.id === 'remaining' && remaining < 0 ? '#D86C70' : undefined }}>{card.value}</div>
                    <div className="stat-subtext">{card.subtext}</div>
                    {card.progress !== undefined && <div className="progress-bar"><div className="progress-fill" style={{ width: `${card.progress}%` }}></div></div>}
                    {trackerLayout.customize && <button type="button" className="tracker-card-resize-handle" aria-label={`Resize ${card.label} card`} onPointerDown={event => beginTrackerResize(event, card.id)} title="Drag to resize">↘</button>}
                  </div>
                )
              })}
            </div>

            {/* Food Log / History */}
            <div className="section" style={{ margin: '0 auto' }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>Food Log</h2>
                <p style={{ margin: 0, color: '#777' }}>
                  {showTrackerHistory ? 'View your nutrition log for any date.' : 'Today’s entries.'}
                </p>
                <button
                  type="button"
                  className={showTrackerHistory ? 'btn btn-primary' : 'btn btn-secondary'}
                  style={{ padding: '5px 10px', fontSize: '0.82rem', marginTop: 8 }}
                  onClick={() => setShowTrackerHistory(prev => !prev)}
                >
                  {showTrackerHistory ? 'Show Today' : 'View History'}
                </button>
              </div>

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
                          <h3>{formatDate(dateKey)}</h3>
                          <div className="date-totals">
                            <span className="total-calories">{dateData.totals.calories} kcal</span>
                            <span>P: {dateData.totals.protein}g</span>
                            <span>C: {dateData.totals.carbs}g</span>
                            <span>F: {dateData.totals.fat}g</span>
                            {dateData.totals.fiber > 0 && <span>Fiber: {dateData.totals.fiber}g</span>}
                          </div>
                        </div>
                        <div className="date-entries">
                          <table className="entries-table">
                            <thead>
                              <tr><th>Time</th><th>Food</th><th>Qty</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th><th></th></tr>
                            </thead>
                            <tbody>
                              {dateData.entries.map(entry => (
                                <Fragment key={entry.id}>
                                  <tr>
                                  <td className="time-cell">{formatTime(entry.timestamp)}</td>
                                  <td className="name-cell">
                                    {entry.type === 'meal' && (
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '2px 6px', minWidth: 28, fontSize: '0.8rem', lineHeight: 1, marginRight: 6 }}
                                        onClick={() => handleToggleLogMeal(entry)}
                                        title={expandedLogEntryId === entry.id ? 'Collapse meal' : 'Expand meal'}
                                      >
                                        {expandedLogEntryId === entry.id ? '−' : '+'}
                                      </button>
                                    )}
                                    {entry.name}{entry.type === 'meal' && <span className="badge-meal-small">Meal</span>}
                                  </td>
                                  <td><input className="quantity-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={entry.quantity ?? 1} onChange={e => setLogEntries(prev => prev.map(item => item.id === entry.id ? { ...item, quantity: e.target.value } : item))} onBlur={e => handleUpdateLogQuantity(entry, e.target.value)} aria-label={"Quantity for " + entry.name} /></td>
                                  <td><strong>{entry.calories}</strong></td>
                                  <td>{entry.protein}g</td>
                                  <td>{entry.carbs}g</td>
                                  <td>{entry.fat}g</td>
                                  <td>{entry.fiber || 0}g</td>
                                  <td><button className="btn-icon-delete" onClick={() => handleDeleteLogEntry(entry.id)} title="Delete entry"><Trash2 size={16} /></button></td>
                                </tr>
                                {expandedLogEntryId === entry.id && entry.type === 'meal' && (
                                  <tr>
                                    <td colSpan="9" style={{ padding: 0 }}>
                                      <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.025)' }}>
                                        {editingLogMeal?.id === entry.id ? (
                                          <>
                                            <div className="form-group" style={{ marginBottom: 10 }}>
                                              <label>Meal Name<input value={editingLogMeal.name} onChange={e => setEditingLogMeal(prev => ({ ...prev, name: e.target.value }))} /></label>
                                            </div>
                                            {editingLogMeal.foods.map((food, index) => (
                                              <div key={index} className="meal-food-item">
                                                <div className="meal-food-info">
                                                  <span>{food.name}</span>
                                                  <span className="meal-food-macros">{Number(food.calories || 0) * (Number(food.quantity) || 1)} kcal</span>
                                                </div>
                                                <div className="meal-food-controls">
                                                  <input className="quantity-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={food.quantity ?? 1} onChange={e => handleLoggedMealFoodQuantityChange(index, e.target.value)} />
                                                </div>
                                              </div>
                                            ))}
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
                                            <button type="button" className="btn btn-primary" style={{ marginTop: 10, padding: '5px 9px', fontSize: '0.82rem' }} onClick={() => handleEditLoggedMeal(entry)}>
                                              <Edit size={16} /> Edit Meal
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div style={{ marginTop: 18 }}>
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                      <input
                        type="date"
                        value={trackerHistoryDate}
                        onChange={e => setTrackerHistoryDate(e.target.value)}
                        aria-label="Select history date"
                        style={{ minWidth: 150 }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                      <button type="button" className="btn btn-secondary" onClick={() => shiftTrackerHistoryDate(-1)} aria-label="Previous day" style={{ padding: '6px 12px', fontSize: '0.9rem' }}>‹ Previous</button>
                      <button type="button" className="btn btn-secondary" onClick={() => shiftTrackerHistoryDate(1)} aria-label="Next day" style={{ padding: '6px 12px', fontSize: '0.9rem' }}>Next ›</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setTrackerHistoryDate(getLocalDateString())} style={{ padding: '6px 12px', fontSize: '0.9rem' }}>Today</button>
                    </div>
                  </div>

                  <div className="section" style={{ margin: 0, padding: 16 }}>
                    <h3 style={{ marginTop: 0, textAlign: 'center' }}>{formatHistoryDate(trackerHistoryDate)}</h3>
                    <div className="date-totals" style={{ justifyContent: 'center', marginBottom: 16 }}>
                      <span className="total-calories">{trackerHistoryTotals.calories} kcal</span>
                      <span>P: {trackerHistoryTotals.protein}g</span>
                      <span>C: {trackerHistoryTotals.carbs}g</span>
                      <span>F: {trackerHistoryTotals.fat}g</span>
                      <span>Fiber: {trackerHistoryTotals.fiber}g</span>
                    </div>

                    {trackerHistoryEntries.length === 0 ? (
                      <div className="empty-state">
                        <Flame size={42} />
                        <p>No food logged on this date.</p>
                      </div>
                    ) : (
                      <div className="date-entries">
                        <table className="entries-table">
                          <thead>
                            <tr><th>Time</th><th>Food</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th><th></th></tr>
                          </thead>
                          <tbody>
                            {trackerHistoryEntries.map(entry => (
                              <Fragment key={entry.id}>
                                <tr>
                                  <td className="time-cell">{formatTime(entry.timestamp)}</td>
                                  <td className="name-cell">
                                    {entry.type === 'meal' && (
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ padding: '2px 6px', minWidth: 28, fontSize: '0.8rem', lineHeight: 1, marginRight: 6 }}
                                        onClick={() => handleToggleLogMeal(entry)}
                                        title={expandedLogEntryId === entry.id ? 'Collapse meal' : 'Expand meal'}
                                      >
                                        {expandedLogEntryId === entry.id ? '−' : '+'}
                                      </button>
                                    )}
                                    {entry.name}{entry.type === 'meal' && <span className="badge-meal-small">Meal</span>}
                                  </td>
                                  <td><strong>{entry.calories}</strong></td>
                                  <td>{entry.protein}g</td>
                                  <td>{entry.carbs}g</td>
                                  <td>{entry.fat}g</td>
                                  <td>{entry.fiber || 0}g</td>
                                  <td><button className="btn-icon-delete" onClick={() => handleDeleteLogEntry(entry.id)} title="Delete entry"><Trash2 size={16} /></button></td>
                                </tr>
                                {expandedLogEntryId === entry.id && entry.type === 'meal' && (
                                  <tr>
                                    <td colSpan="8" style={{ padding: 0 }}>
                                      <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.025)' }}>
                                        {editingLogMeal?.id === entry.id ? (
                                          <>
                                            <div className="form-group" style={{ marginBottom: 10 }}>
                                              <label>Meal Name<input value={editingLogMeal.name} onChange={e => setEditingLogMeal(prev => ({ ...prev, name: e.target.value }))} /></label>
                                            </div>
                                            {editingLogMeal.foods.map((food, index) => (
                                              <div key={index} className="meal-food-item">
                                                <div className="meal-food-info">
                                                  <span>{food.name}</span>
                                                  <span className="meal-food-macros">{Number(food.calories || 0) * (Number(food.quantity) || 1)} kcal</span>
                                                </div>
                                                <div className="meal-food-controls">
                                                  <input className="quantity-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={food.quantity ?? 1} onChange={e => handleLoggedMealFoodQuantityChange(index, e.target.value)} />
                                                </div>
                                              </div>
                                            ))}
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
                                            <button type="button" className="btn btn-primary" style={{ marginTop: 10, padding: '5px 9px', fontSize: '0.82rem' }} onClick={() => handleEditLoggedMeal(entry)}>
                                              <Edit size={16} /> Edit Meal
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            ))}
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
              <h2>Set Your Daily Goals</h2>
              <p>Customize your daily calorie and macro targets to match your nutrition goals.</p>
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
            <div className="section">
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input className="quantity-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={foodLogQuantities[food.id] ?? 1} onChange={e => setFoodLogQuantities(prev => ({ ...prev, [food.id]: e.target.value }))} aria-label={"Quantity for " + food.name} /><button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '0.9rem' }} onClick={() => handleLogSavedFood(food, foodLogQuantities[food.id] ?? 1)}><Plus size={16} />Log</button></div>
                      <button className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.9rem' }} onClick={() => startEditFood(food)}><Edit size={16} />Edit</button>
                      <button className="btn btn-danger" onClick={() => handleDeleteFood(food.id)}><Trash2 size={16} /></button>
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
          <div className="content-grid">
            <div className="section">
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
                  <div
                    style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      padding: '6px',
                      background: '#fff'
                    }}
                  >
                    {savedFoods
                      .filter(food => food.name.toLowerCase().includes(mealFoodSearch.toLowerCase()))
                      .map(food => {
                        const selected = mealFormData.selectedFoods.some(
                          selectedFood => String(selectedFood.id) === String(food.id)
                        )
                        return (
                          <label
                            key={food.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px',
                              cursor: 'pointer',
                              borderRadius: '6px'
                            }}
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
                            <span style={{ fontSize: '0.85rem', color: '#888' }}>{food.calories} kcal</span>
                          </label>
                        )
                      })}
                    {savedFoods.filter(food => food.name.toLowerCase().includes(mealFoodSearch.toLowerCase())).length === 0 && (
                      <div style={{ padding: '12px', color: '#888', textAlign: 'center' }}>
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
                        <span><strong>Calories:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).calories} kcal</span>
                        <span><strong>Protein:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).protein}g</span>
                        <span><strong>Carbs:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).carbs}g</span>
                        <span><strong>Fat:</strong> {calculateMealTotals(mealFormData.selectedFoods.map(food => ({ ...food, quantity: Number(food.quantity) > 0 ? Number(food.quantity) : 1 }))).fat}g</span>
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

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
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
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
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
              <div className="food-list">
                {savedMeals.length === 0 ? (
                  <div className="empty-state">
                    <UtensilsCrossed size={48} />
                    <p>No meals saved yet.</p>
                    <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>Create meals from your foods!</p>
                  </div>
                ) : (
                  savedMeals.map(meal => (
                    <div key={meal.id} className="food-item">
                      <div className="food-info">
                        <h3>{meal.name}</h3>
                        <div className="food-details">
                          <span><strong>{meal.calories}</strong> kcal</span>
                          {meal.protein > 0 && <span>P: {meal.protein}g</span>}
                          {meal.carbs > 0 && <span>C: {meal.carbs}g</span>}
                          {meal.fat > 0 && <span>F: {meal.fat}g</span>}
                          <span className="time-badge">{meal.foods.length} items</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '5px' }}>
                          {meal.foods.map((f, i) => (
                            <span key={i}>{f.name} ({f.quantity}x){i < meal.foods.length - 1 ? ', ' : ''}</span>
                          ))}
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

                {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="settings-container">
            <div className="planner-intro">
              <h2>Settings</h2>
              <p>Manage your data with import and export options</p>
            </div>

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
                <p style={{color:'#666',marginBottom:12}}>Sign out every other active session while keeping this device signed in.</p>
                <button className="btn btn-secondary" onClick={async()=>{try{await api.auth.revokeOtherSessions();alert('All other sessions were revoked.')}catch(err){alert(err.message)}}}><RefreshCw size={18}/>Sign Out Other Devices</button>
              </div>
            </div>

            <div className="section theme-settings">
              <h3>Appearance</h3>
              <p className="settings-description">Choose a color scheme for this browser. Your choice is saved locally on this device.</p>
              <div className="appearance-controls">
                <div className="appearance-group">
                  <span className="appearance-label">Mode</span>
                  <div className="mode-toggle" role="group" aria-label="Color mode">
                    <button type="button" className={mode === 'light' ? 'selected' : ''} onClick={() => setMode('light')}>☀ Light</button>
                    <button type="button" className={mode === 'dark' ? 'selected' : ''} onClick={() => setMode('dark')}>☾ Dark</button>
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

            {isNutriLogNative() && (
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
