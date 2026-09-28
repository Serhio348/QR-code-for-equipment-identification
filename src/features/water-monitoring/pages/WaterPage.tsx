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
import NotificationInbox from '../components/NotificationInbox';
import { invoiceRequestFromSearch } from '../services/invoiceDeepLink';
import { downloadInvoicePdf } from '../services/notificationsApi';
import { toast } from 'react-toastify';
import { usePushSubscription } from '../hooks/usePushSubscription';
import PushSubscriptionControl from '../components/PushSubscriptionControl';
import { logUserActivity } from '@/features/user-activity/services/activityLogsApi';
import './WaterPage.css';

type WaterTab = 'dashboard' | 'counters' | 'quality';

function tabFromLocation(pathname: string, search: string): WaterTab {
  if (pathname.startsWith('/water-quality')) return 'quality';
  if (pathname === ROUTES.WATER) {
    return new URLSearchParams(search).get('tab') === 'counters' ? 'counters' : 'dashboard';
  }
  return 'dashboard';
}

const WaterPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const initialTab = tabFromLocation(location.pathname, location.search);
  const [activeTab, setActiveTab] = useState<WaterTab>(initialTab);
  const [openedTabs, setOpenedTabs] = useState<Partial<Record<WaterTab, true>>>({
    [initialTab]: true,
  });
  const loggedWaterViewRef = useRef(false);

  const notificationInbox = useWaterNotifications();
  const pushSubscription = usePushSubscription();

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
    setOpenedTabs((current) => (
      current[nextTab] ? current : { ...current, [nextTab]: true }
    ));
  }, [location.pathname, location.search]);

  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
  }, [activeTab]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.get('invoice')) return;
    const request = invoiceRequestFromSearch(location.search);
    if (!request) {
      toast.error('Счёт нужно открыть по идентификатору или по периоду вместе с лицевым счётом.');
      return;
    }
    let cancelled = false;
    downloadInvoicePdf(request).then(blob => {
      if (cancelled) return;
      if (!blob) {
        toast.error('Не удалось открыть счёт из уведомления.');
        return;
      }
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }).catch(() => {
      if (!cancelled) toast.error('Не удалось открыть счёт из уведомления.');
    });
    return () => {
      cancelled = true;
    };
  }, [location.search]);

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
        <div className="water-page-tools">
          <NotificationInbox inbox={notificationInbox} />
          <PushSubscriptionControl push={pushSubscription} />
        </div>
      </div>

      <div className="water-page-content">
        {openedTabs.dashboard && (
          <div hidden={activeTab !== 'dashboard'}>
            <WaterDashboard />
          </div>
        )}
        {openedTabs.counters && (
          <div hidden={activeTab !== 'counters'}>
            <BeliotDevicesTest />
          </div>
        )}
        {openedTabs.quality && (
          <div hidden={activeTab !== 'quality'}>
            <WaterQualityJournalPage />
          </div>
        )}
      </div>
    </div>
  );
};

export default WaterPage;
