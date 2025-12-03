import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoadingSpinner from './components/LoadingSpinner';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import EquipmentPage from './pages/EquipmentPage';
import EquipmentFormPage from './pages/EquipmentFormPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import { isEquipmentRoute, ROUTES } from './utils/routes';
import './App.css';

const App: React.FC = () => {
  const location = useLocation();
  const isEquipmentPage = isEquipmentRoute(location.pathname);
  const { isAuthenticated, user, logout, loading } = useAuth();

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to={ROUTES.HOME} className="header-title">
            <h1>Система идентификации оборудования</h1>
          </Link>
          <div className="header-right">
            {isEquipmentPage && (
              <nav className="header-nav">
                <Link to={ROUTES.HOME} className="nav-link">
                  ← Назад к списку
                </Link>
              </nav>
            )}
            {isAuthenticated && user && (
              <div className="user-info">
                <span className="user-email">{user.email}</span>
                {user.role === 'admin' && (
                  <span className="user-role">Администратор</span>
                )}
                <button 
                  onClick={logout} 
                  className="logout-button"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="button-spinner-small"></span>
                      Выход...
                    </>
                  ) : (
                    'Выйти'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="app-content">
        <Routes>
          {/* Страницы аутентификации - доступны всем */}
          <Route path={ROUTES.LOGIN} element={<LoginPage />} />
          <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
          
          {/* Главная страница - только для авторизованных, список оборудования - только для админов */}
          <Route 
            path={ROUTES.HOME} 
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            } 
          />
          
          {/* Создание нового оборудования - только для администраторов */}
          <Route 
            path={ROUTES.EQUIPMENT_NEW} 
            element={
              <ProtectedRoute requireAdmin>
                <EquipmentFormPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Редактирование оборудования - только для администраторов */}
          <Route 
            path="/equipment/:id/edit" 
            element={
              <ProtectedRoute requireAdmin>
                <EquipmentFormPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Просмотр конкретного оборудования - для всех авторизованных */}
          <Route 
            path="/equipment/:id" 
            element={
              <ProtectedRoute>
                <EquipmentPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Обработка неверных путей */}
          <Route path="/equipment" element={<Navigate to={ROUTES.HOME} replace />} />
          
          {/* Страница 404 - должна быть последней */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;

