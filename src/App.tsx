import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import HomePage from './pages/HomePage';
import EquipmentPage from './pages/EquipmentPage';
import EquipmentFormPage from './pages/EquipmentFormPage';
import NotFoundPage from './pages/NotFoundPage';
import { isEquipmentRoute, ROUTES } from './utils/routes';
import './App.css';

const App: React.FC = () => {
  const location = useLocation();
  const isEquipmentPage = isEquipmentRoute(location.pathname);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to={ROUTES.HOME} className="header-title">
            <h1>Система идентификации оборудования</h1>
          </Link>
          {isEquipmentPage && (
            <nav className="header-nav">
              <Link to={ROUTES.HOME} className="nav-link">
                ← Назад к списку
              </Link>
            </nav>
          )}
        </div>
      </header>

      <main className="app-content">
        <Routes>
          {/* Главная страница - список оборудования */}
          <Route path={ROUTES.HOME} element={<HomePage />} />
          
          {/* Создание нового оборудования */}
          <Route path={ROUTES.EQUIPMENT_NEW} element={<EquipmentFormPage />} />
          
          {/* Редактирование оборудования (должен быть выше /equipment/:id) */}
          <Route path="/equipment/:id/edit" element={<EquipmentFormPage />} />
          
          {/* Просмотр конкретного оборудования */}
          <Route path="/equipment/:id" element={<EquipmentPage />} />
          
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

