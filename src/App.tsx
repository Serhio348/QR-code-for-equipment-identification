import React, { useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import MainMenuPage from './pages/MainMenuPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import EquipmentPage from './pages/EquipmentPage';
import EquipmentFormPage from './pages/EquipmentFormPage';
import BeliotDevicesTest from './components/BeliotDevicesTest';
import AccessSettingsPage from './pages/AccessSettingsPage';
import NotFoundPage from './pages/NotFoundPage';
import ProtectedRoute from './components/ProtectedRoute';
import AppAccessGuard from './components/AppAccessGuard';
import InstallPWA from './components/InstallPWA';
import AppFooter from './components/AppFooter';
import { isEquipmentRoute, ROUTES } from './utils/routes';
import { saveLastPath, loadLastPath } from './utils/pathStorage';
import './App.css';

const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isEquipmentPage = isEquipmentRoute(location.pathname);
  const isWaterPage = location.pathname === ROUTES.WATER || location.pathname === ROUTES.BELIOT_TEST;
  const isMainMenuPage = location.pathname === ROUTES.HOME;
  const isAuthPage = location.pathname === ROUTES.LOGIN || location.pathname === ROUTES.REGISTER;
  const { isAuthenticated, user, logout, loading } = useAuth();

  // Восстанавливаем путь при загрузке приложения, если пользователь уже авторизован
  // НЕ восстанавливаем путь, если пользователь только что залогинился (путь будет очищен)
  // НЕ восстанавливаем путь при переходе назад из меню (путь будет очищен в MainMenuPage)
  useEffect(() => {
    // Ждем завершения проверки аутентификации
    if (loading) {
      return;
    }

    // Если пользователь авторизован и находится на главном меню, проверяем, есть ли сохраненный путь
    // Восстанавливаем путь только при первой загрузке страницы (не при программной навигации)
    // Проверяем, что путь не был очищен в MainMenuPage
    if (isAuthenticated && isMainMenuPage) {
      // Небольшая задержка, чтобы дать MainMenuPage время очистить путь при программной навигации
      const timeoutId = setTimeout(() => {
        const savedPath = loadLastPath();
        // Проверяем, что путь существует и это не главное меню
        // Если путь был очищен при логине или переходе назад, savedPath будет null
        if (savedPath && savedPath !== ROUTES.HOME) {
          // Восстанавливаем сохраненный путь только при перезагрузке страницы в рамках сессии
          navigate(savedPath, { replace: true });
        }
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isAuthenticated, loading, isMainMenuPage, navigate]);

  // Сохраняем текущий путь при навигации (только для авторизованных пользователей)
  useEffect(() => {
    if (isAuthenticated && !isAuthPage && !isMainMenuPage) {
      saveLastPath(location.pathname + location.search);
    }
  }, [location.pathname, location.search, isAuthenticated, isAuthPage, isMainMenuPage]);

  return (
    <div className="app">
      {!isMainMenuPage && (
      <header className="app-header">
        <div className="header-content">
          <Link to={ROUTES.HOME} className="header-title">
            <h1>Система идентификации оборудования</h1>
          </Link>
          <div className="header-right">
              {(isEquipmentPage || isWaterPage) && (
              <nav className="header-nav">
                <Link to={ROUTES.HOME} className="nav-link">
                    ← Главное меню
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
      )}

      <main className={`app-content ${isAuthPage ? 'auth-page' : ''}`}>
        {!isAuthPage && <InstallPWA />}
        <Routes>
          {/* Страницы аутентификации - доступны всем */}
          <Route path={ROUTES.LOGIN} element={<LoginPage />} />
          <Route path={ROUTES.REGISTER} element={<RegisterPage />} />
          
          {/* Главное меню - только для авторизованных */}
          <Route 
            path={ROUTES.HOME} 
            element={
              <ProtectedRoute>
                <MainMenuPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Страница списка оборудования - только для авторизованных с доступом */}
          <Route 
            path={ROUTES.EQUIPMENT} 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="equipment">
                <HomePage />
                </AppAccessGuard>
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
          
          {/* Страница счётчиков воды - для всех авторизованных с доступом */}
          <Route 
            path={ROUTES.WATER} 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                <BeliotDevicesTest />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Страница настроек доступа - только для администраторов */}
          <Route 
            path={ROUTES.ACCESS_SETTINGS} 
            element={
              <ProtectedRoute requireAdmin>
                <AccessSettingsPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Тестирование Beliot API (устаревший маршрут, редирект на WATER) */}
          <Route 
            path={ROUTES.BELIOT_TEST} 
            element={<Navigate to={ROUTES.WATER} replace />} 
          />
          
          {/* Страница 404 - должна быть последней */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      {/* Футер приложения */}
      {!isAuthPage && !isMainMenuPage && <AppFooter />}
    </div>
  );
};

export default App;

