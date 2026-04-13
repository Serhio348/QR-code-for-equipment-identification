/**
 * Страница приложения "Вода"
 * Содержит навигацию между разделами:
 * - Дашборд (сводка по потреблению и качеству)
 * - Счётчики воды
 * - Анализы качества воды
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import WaterDashboard from '../components/WaterDashboard';
import BeliotDevicesTest from '../components/BeliotDevicesTest';
import WaterQualityJournalPage from '../../water-quality/pages/WaterQualityJournalPage';
import { ROUTES } from '@/shared/utils/routes';
import { useWaterNotifications } from '../hooks/useWaterNotifications';
import { usePushSubscription } from '../hooks/usePushSubscription';
import { logUserActivity } from '@/features/user-activity/services/activityLogsApi';
import './WaterPage.css';

type WaterTab = 'dashboard' | 'counters' | 'quality';

const WaterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<WaterTab>('dashboard');
  const loggedWaterViewRef = useRef(false);

  useWaterNotifications();
  usePushSubscription();

  // Определяем активную вкладку на основе маршрута и search-параметра ?tab=
  useEffect(() => {
    if (!loggedWaterViewRef.current) {
      loggedWaterViewRef.current = true;
      logUserActivity('water_view', 'Открытие вкладки «Вода»', {
        entityType: 'other',
        metadata: {
          pathname: location.pathname,
          search: location.search,
        },
      }).catch(() => {});
    }

    let nextTab: WaterTab;
    if (location.pathname.startsWith('/water-quality')) {
      nextTab = 'quality';
    } else if (location.pathname === ROUTES.WATER) {
      const params = new URLSearchParams(location.search);
      nextTab = params.get('tab') === 'counters' ? 'counters' : 'dashboard';
    } else {
      nextTab = 'dashboard';
    }

    setActiveTab(nextTab);
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
        {activeTab === 'counters' && <BeliotDevicesTest />}
        {activeTab === 'quality' && <WaterQualityJournalPage />}
      </div>
    </div>
  );
};

export default WaterPage;
