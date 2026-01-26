/**
 * Хук для определения типа устройства и режима приложения
 */

import { useState, useEffect } from 'react';
import { isMobileDevice, isPWA, getDeviceInfo } from '../shared/utils/deviceDetection';

interface DeviceInfo {
  isMobile: boolean;
  isPWA: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  canInstall: boolean;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
}

export function useDeviceDetection() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(() => getDeviceInfo());
  const [isMobile, setIsMobile] = useState(() => isMobileDevice());
  const [isStandalone, setIsStandalone] = useState(() => isPWA());

  useEffect(() => {
    // Обновляем информацию при изменении размера окна
    const handleResize = () => {
      const info = getDeviceInfo();
      setDeviceInfo(info);
      setIsMobile(info.isMobile);
      setIsStandalone(info.isPWA);
    };

    // Обновляем при монтировании
    handleResize();

    // Слушаем изменения размера окна
    window.addEventListener('resize', handleResize);
    
    // Слушаем изменения ориентации (для мобильных устройств)
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return {
    ...deviceInfo,
    isMobile,
    isStandalone,
  };
}

