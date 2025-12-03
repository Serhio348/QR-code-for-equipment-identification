import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import App from './App'
import './index.css'
import { registerServiceWorker } from './utils/registerServiceWorker'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

// Регистрация Service Worker для PWA
// В Vite используется import.meta.env.MODE вместо process.env.NODE_ENV
if (import.meta.env.MODE === 'production' || import.meta.env.PROD) {
  registerServiceWorker();
} else {
  // В режиме разработки можно зарегистрировать для тестирования
  // registerServiceWorker();
}

