/**
 * Страница приложения "Вода"
 * Содержит навигацию между разделами:
 * - Счётчики воды
 * - Анализы качества воды
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import BeliotDevicesTest from '../components/BeliotDevicesTest';
import WaterQualityJournalPage from './WaterQualityJournalPage';
import { ROUTES } from '../utils/routes';
import './WaterPage.css';

type WaterTab = 'counters' | 'quality';

const WaterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<WaterTab>('counters');

  // Определяем активную вкладку на основе текущего маршрута
  useEffect(() => {
    if (location.pathname.startsWith('/water-quality')) {
      setActiveTab('quality');
    } else if (location.pathname === ROUTES.WATER) {
      setActiveTab('counters');
    }
  }, [location.pathname]);

  const handleTabChange = (tab: WaterTab) => {
    setActiveTab(tab);
    if (tab === 'counters') {
      navigate(ROUTES.WATER);
    } else if (tab === 'quality') {
      navigate(ROUTES.WATER_QUALITY_JOURNAL);
    }
  };

  return (
    <div className="water-page">
      <div className="water-page-header">
        <h1 className="water-page-title">Вода</h1>
        <div className="water-page-tabs">
          <button
            className={`water-tab ${activeTab === 'counters' ? 'active' : ''}`}
            onClick={() => handleTabChange('counters')}
            type="button"
            aria-label="Счётчики воды"
          >
            <span className="water-tab-icon">💧</span>
            <span className="water-tab-text">Счётчики воды</span>
          </button>
          <button
            className={`water-tab ${activeTab === 'quality' ? 'active' : ''}`}
            onClick={() => handleTabChange('quality')}
            type="button"
            aria-label="Анализы качества воды"
          >
            <span className="water-tab-icon">🔬</span>
            <span className="water-tab-text">Анализы качества воды</span>
          </button>
        </div>
      </div>

      <div className="water-page-content">
        {activeTab === 'counters' && <BeliotDevicesTest />}
        {activeTab === 'quality' && <WaterQualityJournalPage />}
      </div>
    </div>
  );
};

export default WaterPage;
