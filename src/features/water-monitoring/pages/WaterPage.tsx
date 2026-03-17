/**
 * Страница приложения "Вода"
 * Содержит навигацию между разделами:
 * - Дашборд (сводка по потреблению и качеству)
 * - Счётчики воды
 * - Анализы качества воды
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import WaterDashboard from '../components/WaterDashboard';
import BeliotCountersSupabase from '../components/BeliotCountersSupabase';
import WaterQualityJournalPage from '../../water-quality/pages/WaterQualityJournalPage';
import { ROUTES } from '@/shared/utils/routes';
import { useWaterNotifications } from '../hooks/useWaterNotifications';
import { usePushSubscription } from '../hooks/usePushSubscription';
import './WaterPage.css';

type WaterTab = 'dashboard' | 'counters' | 'quality';

const WaterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<WaterTab>('dashboard');

  useWaterNotifications();
  usePushSubscription();

  // Определяем активную вкладку на основе маршрута и search-параметра ?tab=
  useEffect(() => {
    if (location.pathname.startsWith('/water-quality')) {
      setActiveTab('quality');
    } else if (location.pathname === ROUTES.WATER) {
      const params = new URLSearchParams(location.search);
      setActiveTab(params.get('tab') === 'counters' ? 'counters' : 'dashboard');
    }
  }, [location.pathname, location.search]);

  const handleTabChange = (tab: WaterTab) => {
    if (tab === 'counters') {
      navigate(`${ROUTES.WATER}?tab=counters`);
    } else if (tab === 'dashboard') {
      navigate(ROUTES.WATER);
    } else {
      navigate(ROUTES.WATER_QUALITY_JOURNAL);
    }
  };

  return (
    <div className="water-page">
      <div className="water-page-header">
        <div className="water-page-tabs">
          <button
            className={`water-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleTabChange('dashboard')}
            type="button"
            aria-label="Dashboard"
          >
            <span className="water-tab-icon">📊</span>
            <span className="water-tab-text">Dashboard</span>
          </button>
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
        {activeTab === 'dashboard' && <WaterDashboard />}
        {activeTab === 'counters' && <BeliotCountersSupabase />}
        {activeTab === 'quality' && <WaterQualityJournalPage />}
      </div>
    </div>
  );
};

export default WaterPage;
