import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AuthGate from './AuthGate'
import './index.css'
import './nutrilog-overrides.css'
import './quantity-input-fixes'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate App={App} />
  </React.StrictMode>,
)

