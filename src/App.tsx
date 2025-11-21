import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import EquipmentPage from './pages/EquipmentPage';
import './App.css';

const App: React.FC = () => {
  const location = useLocation();
  const isEquipmentPage = location.pathname.startsWith('/equipment');

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to="/" className="header-title">
            <h1>Система идентификации оборудования</h1>
          </Link>
          {isEquipmentPage && (
            <nav className="header-nav">
              <Link to="/" className="nav-link">
                ← Назад к списку
              </Link>
            </nav>
          )}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/equipment/:id" element={<EquipmentPage />} />
        <Route path="/equipment/new" element={<EquipmentPage />} />
      </Routes>
    </div>
  );
};

export default App;

