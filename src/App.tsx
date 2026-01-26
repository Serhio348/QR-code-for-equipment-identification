import React, { useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuth } from './features/auth/contexts/AuthContext';
import MainMenuPage from './features/common/pages/MainMenuPage';
import EquipmentListPage from './features/equipment/pages/EquipmentListPage';
import LoginPage from './features/auth/pages/LoginPage';
import RegisterPage from './features/auth/pages/RegisterPage';
import ResetPasswordPage from './features/auth/pages/ResetPasswordPage';
import EquipmentPage from './features/equipment/pages/EquipmentPage';
import EquipmentFormPage from './features/equipment/pages/EquipmentFormPage';
import WaterPage from './features/water-monitoring/pages/WaterPage';
import AccessSettingsPage from './features/access-management/pages/AccessSettingsPage';
import ErrorLogsPage from './features/error-logging/pages/ErrorLogsPage';
import WorkshopSettingsPage from './features/workshops/pages/WorkshopSettingsPage';
import WaterAnalysisFormPage from './features/water-quality/pages/WaterAnalysisFormPage';
import WaterAnalysisViewPage from './features/water-quality/pages/WaterAnalysisViewPage';
import WaterQualityAlertsPage from './features/water-quality/pages/WaterQualityAlertsPage';
import WaterQualityNormsPage from './features/water-quality/pages/WaterQualityNormsPage';
import WaterQualityNormFormPage from './features/water-quality/pages/WaterQualityNormFormPage';
import WaterQualityNormViewPage from './features/water-quality/pages/WaterQualityNormViewPage';
import SamplingPointsPage from './features/water-quality/pages/SamplingPointsPage';
import SamplingPointFormPage from './features/water-quality/pages/SamplingPointFormPage';
import SamplingPointViewPage from './features/water-quality/pages/SamplingPointViewPage';
import NotFoundPage from './features/common/pages/NotFoundPage';
import ProtectedRoute from './features/common/components/ProtectedRoute';
import AppAccessGuard from './features/access-management/components/AppAccessGuard';
import InstallPWA from './features/common/components/InstallPWA';
import AppFooter from './features/common/components/AppFooter';
import { isEquipmentRoute, ROUTES } from './utils/routes';
import { saveLastPath, loadLastPath } from './utils/pathStorage';
import './styles/colors.css';
import './App.css';

const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isEquipmentPage = isEquipmentRoute(location.pathname);
  const isWaterPage = location.pathname === ROUTES.WATER || location.pathname === ROUTES.BELIOT_TEST;
  const isMainMenuPage = location.pathname === ROUTES.HOME;
  const isAuthPage = location.pathname === ROUTES.LOGIN || location.pathname === ROUTES.REGISTER || location.pathname === ROUTES.RESET_PASSWORD;
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
    <div className="app" data-theme="modern-minimal">
      {!isMainMenuPage && (
      <header className="app-header">
        <div className="header-content">
          {/* Левая часть: Логотип и заголовок */}
          <div className="header-left">
            <Link to={ROUTES.HOME} className="header-logo" title="Главное меню">
              {/* Можно заменить на <img src="/logo.svg" alt="Logo" /> когда будет логотип */}
              <span>EQ</span>
            </Link>
            <Link to={ROUTES.HOME} className="header-title">
              <h1>
                {isWaterPage ? 'Вода' : isEquipmentPage ? 'Оборудование' : 'Система идентификации оборудования'}
              </h1>
              {isEquipmentPage && <p>Управление оборудованием</p>}
              {isWaterPage && <p>Мониторинг счетчиков воды</p>}
            </Link>
          </div>

          {/* Центральная часть: Навигация (если нужно) */}
          <div className="header-center">
            {(isEquipmentPage || isWaterPage) && (
              <nav className="header-nav">
                <Link to={ROUTES.HOME} className="nav-link">
                  Главное меню
                </Link>
              </nav>
            )}
          </div>

          {/* Правая часть: Информация о пользователе */}
          <div className="header-right">
            {isAuthenticated && user && (
              <div className="user-info">
                <span className="user-email" title={user.email}>{user.email}</span>
                {user.role === 'admin' && (
                  <span className="user-role">Админ</span>
                )}
                <button 
                  onClick={logout} 
                  className="logout-button"
                  disabled={loading}
                  title="Выйти из системы"
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
          <Route path={ROUTES.RESET_PASSWORD} element={<ResetPasswordPage />} />
          
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
                <EquipmentListPage />
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
          
          {/* Страница приложения "Вода" - для всех авторизованных с доступом */}
          <Route 
            path={ROUTES.WATER} 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <WaterPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Страница журнала анализов качества воды */}
          <Route 
            path={ROUTES.WATER_QUALITY_JOURNAL} 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <WaterPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Страница оповещений о превышении нормативов */}
          <Route 
            path={ROUTES.WATER_QUALITY_ALERTS} 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <WaterQualityAlertsPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Страница управления нормативами качества воды */}
          <Route 
            path={ROUTES.WATER_QUALITY_NORMS} 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <WaterQualityNormsPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Просмотр норматива качества воды */}
          <Route 
            path="/water-quality/norm/:id" 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <WaterQualityNormViewPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Создание нового норматива качества воды */}
          <Route 
            path="/water-quality/norm/new" 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <WaterQualityNormFormPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Редактирование норматива качества воды */}
          <Route 
            path="/water-quality/norm/:id/edit" 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <WaterQualityNormFormPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Страница управления точками отбора проб */}
          <Route 
            path={ROUTES.WATER_QUALITY_SAMPLING_POINTS} 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <SamplingPointsPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Просмотр точки отбора проб */}
          <Route 
            path="/water-quality/sampling-point/:id" 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <SamplingPointViewPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Создание новой точки отбора проб */}
          <Route 
            path="/water-quality/sampling-point/new" 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <SamplingPointFormPage />
                </AppAccessGuard>
              </ProtectedRoute>
            } 
          />
          
          {/* Редактирование точки отбора проб */}
          <Route 
            path="/water-quality/sampling-point/:id/edit" 
            element={
              <ProtectedRoute>
                <AppAccessGuard appId="water">
                  <SamplingPointFormPage />
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
          
          {/* Страница логов ошибок - только для администраторов */}
          <Route 
            path={ROUTES.ERROR_LOGS} 
            element={
              <ProtectedRoute requireAdmin>
                <ErrorLogsPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Страница управления участками - только для администраторов */}
          <Route 
            path={ROUTES.WORKSHOP_SETTINGS} 
            element={
              <ProtectedRoute requireAdmin>
                <WorkshopSettingsPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Создание нового анализа качества воды */}
          <Route 
            path="/water-quality/analysis/new" 
            element={
              <ProtectedRoute>
                <WaterAnalysisFormPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Просмотр анализа качества воды */}
          <Route 
            path="/water-quality/analysis/:id" 
            element={
              <ProtectedRoute>
                <WaterAnalysisViewPage />
              </ProtectedRoute>
            } 
          />
          
          {/* Форма редактирования анализа качества воды */}
          <Route 
            path="/water-quality/analysis/:id/edit" 
            element={
              <ProtectedRoute>
                <WaterAnalysisFormPage />
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

      {/* Toast уведомления */}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
    </div>
  );
};

export default App;

