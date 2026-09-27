import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Target, TrendingUp, Flame, Coffee, UtensilsCrossed, BookOpen, Edit, Search, Loader, ClipboardList, Settings, Download, Upload, Users, Shield, UserCheck, UserX, KeyRound, RefreshCw } from 'lucide-react'
import { storage, api, normalizeServerData, searchUsdaFoods as searchUsdaFoodsApi, mapUsdaFood, calculateMealTotals } from './services'

function AdminPanel({ user }) {
  const [users, setUsers] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'user' })

  const loadUsers = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await api.admin.users()
      setUsers(result.users)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const createUser = async event => {
    event.preventDefault()
    try {
      await api.admin.createUser(newUser.email, newUser.password, newUser.role)
      setNewUser({ email: '', password: '', role: 'user' })
      await loadUsers()
    } catch (err) { alert(err.message) }
  }

  const toggleUser = async account => {
    try {
      await api.admin.updateUser(account.id, { is_active: !account.is_active })
      await loadUsers()
    } catch (err) { alert(err.message) }
  }

  const changeRole = async account => {
    const role = account.role === 'admin' ? 'user' : 'admin'
    if (!confirm('Change ' + account.email + ' to ' + role + '?')) return
    try {
      await api.admin.updateUser(account.id, { role })
      await loadUsers()
    } catch (err) { alert(err.message) }
  }

  const resetPassword = async account => {
    const password = prompt('Enter a new password for ' + account.email + ' (8-128 characters):')
    if (password === null) return
    try {
      await api.admin.resetPassword(account.id, password)
      alert('Password reset. All existing sessions for this user were revoked.')
    } catch (err) { alert(err.message) }
  }

  const revokeSessions = async account => {
    try {
      await api.admin.revokeSessions(account.id)
      alert('Sessions revoked for ' + account.email)
    } catch (err) { alert(err.message) }
  }

  const deleteUser = async account => {
    if (!confirm('Delete ' + account.email + '? This permanently deletes their nutrition data.')) return
    try {
      await api.admin.deleteUser(account.id)
      await loadUsers()
    } catch (err) { alert(err.message) }
  }

  return (
    <div className="settings-container">
      <div className="planner-intro">
        <h2><Shield size={28} style={{ verticalAlign: 'middle', marginRight: 8 }} />Administrator</h2>
        <p>Manage NutriLog accounts and access.</p>
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

function App({ user, initialServerData, onLogout }) {
  // Navigation
  const [activeTab, setActiveTab] = useState('tracker')
  
  // Ref for click outside detection
  const quickLogSearchRef = useRef(null)
  
  // Track if initial load is complete
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false)
  
  // Food Database
  const [savedFoods, setSavedFoods] = useState([])
  
  // Meals Database
  const [savedMeals, setSavedMeals] = useState([])
  
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
  
  // USDA API Search
  const [usdaSearchQuery, setUsdaSearchQuery] = useState('')
  const [usdaSearchResults, setUsdaSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [showUsdaSearch, setShowUsdaSearch] = useState(false)
  
  // Form states
  const [foodFormData, setFoodFormData] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    fiber: '',
    servingSize: ''
  })
  
  const [mealFormData, setMealFormData] = useState({
    name: '',
    selectedFoods: []
  })
  
  const [quickLogForm, setQuickLogForm] = useState({
    selectedItem: null,
    itemType: '', // 'food' or 'meal'
    date: new Date().toISOString().split('T')[0], // Default to today
    searchQuery: '',
    showSuggestions: false
  })

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

  // USDA API Search Handlers
  const searchUsdaFoods = async () => {
    if (!usdaSearchQuery.trim()) {
      alert('Please enter a search term')
      return
    }

    setIsSearching(true)
    setUsdaSearchResults([])
    try {
      const results = await searchUsdaFoodsApi(usdaSearchQuery)
      setUsdaSearchResults(results)
    } catch (error) {
      console.error('USDA API Error:', error)
      alert('Failed to search foods. Please try again.')
    } finally {
      setIsSearching(false)
    }
  }

  const selectUsdaFood = (food) => {
    const mapped = mapUsdaFood(food)
    setFoodFormData(mapped)
    setShowUsdaSearch(false)
    setUsdaSearchQuery('')
    setUsdaSearchResults([])
  }

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
      calories: parseInt(foodFormData.calories) || 0,
      protein: parseInt(foodFormData.protein) || 0,
      carbs: parseInt(foodFormData.carbs) || 0,
      fat: parseInt(foodFormData.fat) || 0,
      fiber: parseInt(foodFormData.fiber) || 0,
      servingSize: foodFormData.servingSize || '1 serving'
    }
    try {
      const serverFood = user ? (await api.foods.create(draft)).item : null
      const newFood = serverFood ? { ...draft, ...serverFood, id: serverFood.id, servingSize: serverFood.serving_size || draft.servingSize, calories: Number(serverFood.calories), protein: Number(serverFood.protein), carbs: Number(serverFood.carbs), fat: Number(serverFood.fat), fiber: Number(serverFood.fiber) } : { ...draft, id: Date.now() }
      setSavedFoods(prev => [newFood, ...prev])
      setFoodFormData({ name: '', calories: '', protein: '', carbs: '', fat: '', fiber: '', servingSize: '' })
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
        i === index ? { ...food, quantity: parseInt(quantity) || 1 } : food
      )
    }))
  }

  const handleSaveMeal = async (e) => {
    e.preventDefault()
    if (!mealFormData.name || mealFormData.selectedFoods.length === 0) {
      alert('Please enter a meal name and add at least one food')
      return
    }
    const totals = calculateMealTotals(mealFormData.selectedFoods)
    const draft = { name: mealFormData.name, foods: mealFormData.selectedFoods, ...totals }
    try {
      const newMeal = user ? (await api.meals.create(draft)).item : { ...draft, id: Date.now() }
      setSavedMeals(prev => [newMeal, ...prev])
      setMealFormData({ name: '', selectedFoods: [] })
    } catch (error) {
      alert(error.message)
    }
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
      showSuggestions: false
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
    const draft = {
      type: quickLogForm.itemType,
      name: quickLogForm.selectedItem.name,
      calories: quickLogForm.selectedItem.calories,
      protein: quickLogForm.selectedItem.protein,
      carbs: quickLogForm.selectedItem.carbs,
      fat: quickLogForm.selectedItem.fat,
      fiber: quickLogForm.selectedItem.fiber || 0,
      timestamp: selectedDate.toISOString(),
      ...(quickLogForm.itemType === 'meal' ? { foods: quickLogForm.selectedItem.foods } : {})
    }
    try {
      const newEntry = await createLogEntry(draft)
      setLogEntries(prev => [newEntry, ...prev])
      setQuickLogForm({ selectedItem: null, itemType: '', date: new Date().toISOString().split('T')[0], searchQuery: '', showSuggestions: false })
    } catch (error) {
      alert(error.message)
    }
  }

  const handleLogSavedFood = async (food) => {
    try {
      const newEntry = await createLogEntry({
        type: 'food', name: food.name, calories: food.calories, protein: food.protein,
        carbs: food.carbs, fat: food.fat, fiber: food.fiber || 0, timestamp: new Date().toISOString()
      })
      setLogEntries(prev => [newEntry, ...prev])
    } catch (error) { alert(error.message) }
  }

  const handleLogMeal = async (meal) => {
    try {
      const newEntry = await createLogEntry({
        type: 'meal', name: meal.name, calories: meal.calories, protein: meal.protein,
        carbs: meal.carbs, fat: meal.fat, fiber: meal.fiber || 0, foods: meal.foods, timestamp: new Date().toISOString()
      })
      setLogEntries(prev => [newEntry, ...prev])
    } catch (error) { alert(error.message) }
  }

  const handleDeleteLogEntry = async (id) => {
    try {
      if (user) await api.logs.remove(id)
      setLogEntries(prev => prev.filter(entry => entry.id !== id))
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
    setMacroGoalsInput(prev => ({ ...prev, [name]: parseInt(value) || 0 }))
  }

  const handleSaveMacroGoals = async (e) => {
    e.preventDefault()
    try {
      if (user) await api.goals.save(macroGoalsInput)
      setMacroGoals(macroGoalsInput)
      setDailyGoal(macroGoalsInput.calories)
      setGoalInput(macroGoalsInput.calories)
      alert('Goals saved successfully!')
    } catch (error) { alert(error.message) }
  }



  // Calculate totals from log entries
  const totalCalories = logEntries.reduce((sum, entry) => sum + entry.calories, 0)
  const totalProtein = logEntries.reduce((sum, entry) => sum + entry.protein, 0)
  const totalCarbs = logEntries.reduce((sum, entry) => sum + entry.carbs, 0)
  const totalFat = logEntries.reduce((sum, entry) => sum + entry.fat, 0)
  const totalFiber = logEntries.reduce((sum, entry) => sum + (entry.fiber || 0), 0)
  const remaining = macroGoals.calories - totalCalories
  const progress = Math.min((totalCalories / macroGoals.calories) * 100, 100)

  // Calculate macro percentages
  const proteinProgress = macroGoals.protein > 0 ? Math.min((totalProtein / macroGoals.protein) * 100, 100) : 0
  const carbsProgress = macroGoals.carbs > 0 ? Math.min((totalCarbs / macroGoals.carbs) * 100, 100) : 0
  const fatProgress = macroGoals.fat > 0 ? Math.min((totalFat / macroGoals.fat) * 100, 100) : 0
  const fiberProgress = macroGoals.fiber > 0 ? Math.min((totalFiber / macroGoals.fiber) * 100, 100) : 0

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
    <div className="app">
      <div className="header">
        <h1>🥗 NutriLog</h1>
        <p>Track your nutrition, macros, and daily goals</p>
        <div className="account-bar">
          <span>Signed in as <strong>{user?.email}</strong></span>
          <button className="account-logout" onClick={onLogout}>Sign out</button>
        </div>
        
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button 
            className={`tab-btn ${activeTab === 'tracker' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracker')}
          >
            <Flame size={20} />
            Tracker
          </button>
          <button 
            className={`tab-btn ${activeTab === 'planner' ? 'active' : ''}`}
            onClick={() => setActiveTab('planner')}
          >
            <ClipboardList size={20} />
            Planner
          </button>
          <button 
            className={`tab-btn ${activeTab === 'foods' ? 'active' : ''}`}
            onClick={() => setActiveTab('foods')}
          >
            <Coffee size={20} />
            Foods
          </button>
          <button 
            className={`tab-btn ${activeTab === 'meals' ? 'active' : ''}`}
            onClick={() => setActiveTab('meals')}
          >
            <UtensilsCrossed size={20} />
            Meals
          </button>
          <button 
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={20} />
            Settings
          </button>
          {user?.role === 'admin' && (
            <button
              className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <Shield size={20} />
              Admin
            </button>
          )}
        </div>
      </div>

      <div className="main-content">
        {activeTab === 'admin' && user?.role === 'admin' && (
          <AdminPanel user={user} />
        )}

        {/* TRACKER TAB */}
        {activeTab === 'tracker' && (
          <>
            {/* Stats Grid */}
            <div className="stats-grid">
            <div className="stat-card primary">
            <div className="stat-label">Today's Calories</div>
            <div className="stat-value">{totalCalories}</div>
            <div className="stat-subtext">of {macroGoals.calories} kcal</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="stat-card success">
            <div className="stat-label">Remaining</div>
            <div className="stat-value" style={{ color: remaining < 0 ? '#D86C70' : 'inherit' }}>
              {remaining}
            </div>
            <div className="stat-subtext">kcal {remaining < 0 ? 'over' : 'left'}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Protein</div>
            <div className="stat-value" style={{ fontSize: '2rem' }}>{totalProtein}g</div>
            <div className="stat-subtext">of {macroGoals.protein}g</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${proteinProgress}%`, background: '#6B9080' }}></div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Carbs</div>
            <div className="stat-value" style={{ fontSize: '2rem' }}>{totalCarbs}g</div>
            <div className="stat-subtext">of {macroGoals.carbs}g</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${carbsProgress}%`, background: '#A4C3B2' }}></div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Fat</div>
            <div className="stat-value" style={{ fontSize: '2rem' }}>{totalFat}g</div>
            <div className="stat-subtext">of {macroGoals.fat}g</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${fatProgress}%`, background: '#8B6F47' }}></div>
            </div>
          </div>

          <div className="stat-card warning">
            <div className="stat-label">Fiber</div>
            <div className="stat-value" style={{ fontSize: '2rem' }}>{totalFiber}g</div>
            <div className="stat-subtext">of {macroGoals.fiber}g</div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${fiberProgress}%`, background: '#5a7a6d' }}></div>
            </div>
          </div>
            </div>

            {/* Quick Add with Date */}
            <div className="section" style={{ margin: '0 auto 30px' }}>
              <h2>Quick Add</h2>
              <form onSubmit={handleQuickLog}>
                <div className="form-row">
                  <div className="form-group" style={{ flex: '2', position: 'relative' }} ref={quickLogSearchRef}>
                    <label>Search Food or Meal *</label>
                    <input
                      type="text"
                      value={quickLogForm.searchQuery}
                      onChange={handleQuickLogSearchChange}
                      placeholder="Start typing to search..."
                      autoComplete="off"
                    />
                    
                    {/* Suggestions Dropdown */}
                    {quickLogForm.showSuggestions && (
                      <div className="suggestions-dropdown">
                        {(() => {
                          const { foods, meals } = getFilteredSuggestions()
                          const hasResults = foods.length > 0 || meals.length > 0

                          if (!hasResults) {
                            return (
                              <div className="suggestion-empty">
                                No foods or meals found
                              </div>
                            )
                          }

                          return (
                            <>
                              {foods.length > 0 && (
                                <div className="suggestion-group">
                                  <div className="suggestion-group-label">Foods</div>
                                  {foods.map(food => (
                                    <div
                                      key={`food-${food.id}`}
                                      className="suggestion-item"
                                      onClick={() => handleSelectSuggestion(food, 'food')}
                                    >
                                      <span className="suggestion-name">{food.name}</span>
                                      <span className="suggestion-calories">{food.calories} kcal</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {meals.length > 0 && (
                                <div className="suggestion-group">
                                  <div className="suggestion-group-label">Meals</div>
                                  {meals.map(meal => (
                                    <div
                                      key={`meal-${meal.id}`}
                                      className="suggestion-item"
                                      onClick={() => handleSelectSuggestion(meal, 'meal')}
                                    >
                                      <span className="suggestion-name">
                                        {meal.name}
                                        <span className="badge-meal-small" style={{ marginLeft: '8px' }}>Meal</span>
                                      </span>
                                      <span className="suggestion-calories">{meal.calories} kcal</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="form-group" style={{ flex: '1' }}>
                    <label>Date *</label>
                    <input
                      type="date"
                      name="date"
                      value={quickLogForm.date}
                      onChange={handleQuickLogDateChange}
                      required
                    />
                  </div>
                </div>

                {/* Preview selected item */}
                {quickLogForm.selectedItem && (
                  <div className="selected-item-preview">
                    <h4>{quickLogForm.selectedItem.name}</h4>
                    <div className="preview-macros">
                      <span className="preview-macro"><strong>{quickLogForm.selectedItem.calories}</strong> kcal</span>
                      <span className="preview-macro">P: {quickLogForm.selectedItem.protein}g</span>
                      <span className="preview-macro">C: {quickLogForm.selectedItem.carbs}g</span>
                      <span className="preview-macro">F: {quickLogForm.selectedItem.fat}g</span>
                      {quickLogForm.selectedItem.fiber > 0 && (
                        <span className="preview-macro">Fiber: {quickLogForm.selectedItem.fiber}g</span>
                      )}
                    </div>
                    {quickLogForm.itemType === 'meal' && quickLogForm.selectedItem.foods && (
                      <div className="preview-meal-items">
                        <small>Includes: {quickLogForm.selectedItem.foods.map(f => `${f.name} (${f.quantity}x)`).join(', ')}</small>
                      </div>
                    )}
                  </div>
                )}

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={!quickLogForm.selectedItem}
                >
                  <Plus size={20} />
                  Add to Log
                </button>

                {savedFoods.length === 0 && savedMeals.length === 0 && (
                  <p style={{ marginTop: '15px', color: '#999', fontSize: '0.9rem', textAlign: 'center' }}>
                    No saved foods or meals yet. Create some in the Foods or Meals tabs first.
                  </p>
                )}
              </form>
            </div>

            {/* Food Log by Date */}
            <div className="section" style={{ margin: '0 auto' }}>
              <h2>Food Log</h2>
              {logEntries.length === 0 ? (
                <div className="empty-state">
                  <Flame size={48} />
                  <p>No entries yet.</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>Start tracking your meals!</p>
                </div>
              ) : (
                <div className="log-by-date">
                  {groupEntriesByDate().map(([dateKey, dateData]) => (
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
                            <tr>
                              <th>Time</th>
                              <th>Food</th>
                              <th>Calories</th>
                              <th>Protein</th>
                              <th>Carbs</th>
                              <th>Fat</th>
                              <th>Fiber</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {dateData.entries.map(entry => (
                              <tr key={entry.id}>
                                <td className="time-cell">{formatTime(entry.timestamp)}</td>
                                <td className="name-cell">
                                  {entry.name}
                                  {entry.type === 'meal' && <span className="badge-meal-small">Meal</span>}
                                </td>
                                <td><strong>{entry.calories}</strong></td>
                                <td>{entry.protein}g</td>
                                <td>{entry.carbs}g</td>
                                <td>{entry.fat}g</td>
                                <td>{entry.fiber || 0}g</td>
                                <td>
                                  <button 
                                    className="btn-icon-delete"
                                    onClick={() => handleDeleteLogEntry(entry.id)}
                                    title="Delete entry"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
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
            {/* USDA Search Modal */}
            {showUsdaSearch && (
              <div className="modal-overlay" onClick={() => setShowUsdaSearch(false)}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header">
                    <h2>Search USDA Food Database</h2>
                    <button 
                      className="modal-close"
                      onClick={() => setShowUsdaSearch(false)}
                    >
                      ×
                    </button>
                  </div>
                  
                  <div className="modal-body">
                    <div className="usda-search-box">
                      <input
                        type="text"
                        value={usdaSearchQuery}
                        onChange={(e) => setUsdaSearchQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && searchUsdaFoods()}
                        placeholder="Search for foods... (e.g., chicken breast, apple)"
                        className="usda-search-input"
                      />
                      <button
                        onClick={searchUsdaFoods}
                        disabled={isSearching}
                        className="btn btn-primary"
                        style={{ width: 'auto' }}
                      >
                        {isSearching ? <Loader size={20} className="spinner" /> : <Search size={20} />}
                        Search
                      </button>
                    </div>

                    {isSearching && (
                      <div className="usda-loading">
                        <Loader size={32} className="spinner" />
                        <p>Searching USDA database...</p>
                      </div>
                    )}

                    {!isSearching && usdaSearchResults.length > 0 && (
                      <div className="usda-results">
                        <p className="usda-results-count">{usdaSearchResults.length} results found</p>
                        {usdaSearchResults.map((food, index) => {
                          const nutrients = food.foodNutrients || []
                          const calories = nutrients.find(n => n.nutrientId === 1008)?.value || 0
                          const protein = nutrients.find(n => n.nutrientId === 1003)?.value || 0
                          
                          return (
                            <div 
                              key={index} 
                              className="usda-result-item"
                              onClick={() => selectUsdaFood(food)}
                            >
                              <div className="usda-result-info">
                                <h3>{food.description}</h3>
                                <div className="usda-result-details">
                                  <span className="usda-brand">{food.brandOwner || food.dataType}</span>
                                  <span><strong>{Math.round(calories)}</strong> kcal</span>
                                  {protein > 0 && <span>P: {Math.round(protein)}g</span>}
                                </div>
                              </div>
                              <div className="usda-select-btn">
                                <Plus size={20} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {!isSearching && usdaSearchResults.length === 0 && usdaSearchQuery && (
                      <div className="empty-state">
                        <Search size={48} />
                        <p>No results found. Try a different search term.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="content-grid">
              {/* Create Food Form */}
              <div className="section">
                <h2>Create Food</h2>
                
                {/* USDA Search Button */}
                <button 
                  type="button"
                  className="btn-usda-search"
                  onClick={() => setShowUsdaSearch(true)}
                >
                  <Search size={18} />
                  Search USDA Food Database
                </button>

                <div className="form-divider">
                  <span>or enter manually</span>
                </div>

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

                <div className="form-group">
                  <label>Serving Size</label>
                  <input
                    type="text"
                    name="servingSize"
                    value={foodFormData.servingSize}
                    onChange={handleFoodFormChange}
                    placeholder="e.g., 100g, 1 cup"
                  />
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
                  />
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
                  />
                </div>

                <div className="form-group">
                  <label>Carbs (g)</label>
                  <input
                    type="number"
                    name="carbs"
                    value={foodFormData.carbs}
                    onChange={handleFoodFormChange}
                    placeholder="e.g., 0"
                    min="0"
                  />
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
                  />
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
              <div className="food-list">
                {savedFoods.length === 0 ? (
                  <div className="empty-state">
                    <Coffee size={48} />
                    <p>No foods saved yet.</p>
                    <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>Create your food database!</p>
                  </div>
                ) : (
                  savedFoods.map(food => (
                    <div key={food.id} className="food-item">
                      <div className="food-info">
                        <h3>{food.name}</h3>
                        <div className="food-details">
                          <span className="serving-badge">{food.servingSize}</span>
                          <span><strong>{food.calories}</strong> kcal</span>
                          {food.protein > 0 && <span>P: {food.protein}g</span>}
                          {food.carbs > 0 && <span>C: {food.carbs}g</span>}
                          {food.fat > 0 && <span>F: {food.fat}g</span>}
                        </div>
                      </div>
                      <div className="food-actions">
                        <button 
                          className="btn btn-primary"
                          style={{ padding: '8px 12px', fontSize: '0.9rem' }}
                          onClick={() => handleLogSavedFood(food)}
                        >
                          <Plus size={16} />
                          Log
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={() => handleDeleteFood(food.id)}
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
          </>
        )}

        {/* MEALS TAB */}
        {activeTab === 'meals' && (
          <div className="content-grid">
            {/* Create Meal Form */}
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
                  <select 
                    onChange={(e) => {
                      handleAddFoodToMeal(e.target.value)
                      e.target.value = ''
                    }}
                    className="food-select"
                  >
                    <option value="">Select a food...</option>
                    {savedFoods.map(food => (
                      <option key={food.id} value={food.id}>
                        {food.name} ({food.calories} kcal)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Foods for Meal */}
                {mealFormData.selectedFoods.length > 0 && (
                  <div className="meal-foods">
                    <h3 style={{ fontSize: '1rem', marginBottom: '10px', color: '#555' }}>Foods in this meal:</h3>
                    {mealFormData.selectedFoods.map((food, index) => (
                      <div key={index} className="meal-food-item">
                        <div className="meal-food-info">
                          <span>{food.name}</span>
                          <span className="meal-food-macros">
                            {food.calories * food.quantity} kcal
                          </span>
                        </div>
                        <div className="meal-food-controls">
                          <input
                            type="number"
                            value={food.quantity}
                            onChange={(e) => handleFoodQuantityChange(index, e.target.value)}
                            min="1"
                            className="quantity-input"
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
                    ))}
                    
                    {/* Meal Totals */}
                    <div className="meal-totals">
                      <h4>Meal Totals:</h4>
                      <div className="meal-totals-grid">
                        <span><strong>Calories:</strong> {calculateMealTotals(mealFormData.selectedFoods).calories} kcal</span>
                        <span><strong>Protein:</strong> {calculateMealTotals(mealFormData.selectedFoods).protein}g</span>
                        <span><strong>Carbs:</strong> {calculateMealTotals(mealFormData.selectedFoods).carbs}g</span>
                        <span><strong>Fat:</strong> {calculateMealTotals(mealFormData.selectedFoods).fat}g</span>
                      </div>
                    </div>
                  </div>
                )}

                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={mealFormData.selectedFoods.length === 0}
                >
                  <Plus size={20} />
                  Save Meal
                </button>
              </form>
            </div>

            {/* Saved Meals List */}
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
                            <span key={i}>
                              {f.name} ({f.quantity}x){i < meal.foods.length - 1 ? ', ' : ''}
                            </span>
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

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="settings-container">
            <div className="planner-intro">
              <h2>Settings</h2>
              <p>Manage your data with import and export options</p>
            </div>

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

