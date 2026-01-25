/**
 * Компонент для установки PWA приложения
 * Показывает кнопку установки, когда приложение можно установить
 */

import React, { useState, useEffect } from 'react';
import './InstallPWA.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallPWA: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Проверяем, установлено ли приложение
    const checkIfInstalled = (): boolean => {
      // Проверка для standalone режима (iOS и Android)
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      
      setIsInstalled(isStandalone);
      return isStandalone;
    };

    const installed = checkIfInstalled();
    
    // Проверяем, мобильное ли это устройство
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // Обработчик события beforeinstallprompt (для Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      
      // Показываем баннер всегда, если приложение не установлено
      if (!installed) {
        setShowInstallButton(true);
      }
    };

    // Обработчик успешной установки
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallButton(false);
      setDeferredPrompt(null);
    };
    
    // Проверяем, зарегистрирован ли Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        if (registrations.length === 0) {
          console.warn('[PWA] Service Worker не зарегистрирован! Это может препятствовать установке PWA.');
        }
      });
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Для мобильных устройств показываем баннер автоматически, если приложение не установлено
    let showBannerTimeout: ReturnType<typeof setTimeout> | null = null;
    if (!installed && isMobile) {
      // Показываем баннер через небольшую задержку для всех мобильных
      showBannerTimeout = setTimeout(() => {
        const stillNotInstalled = !checkIfInstalled();
        if (stillNotInstalled) {
          setShowInstallButton(true);
        }
      }, 2000); // Задержка 2 секунды
    }

    return () => {
      if (showBannerTimeout) {
        clearTimeout(showBannerTimeout);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // Проверяем, iOS ли это
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);
    const isChrome = /Chrome/.test(navigator.userAgent);
    
    // Для iOS Safari всегда показываем инструкции
    if (isIOS && isSafari) {
      alert('Для установки приложения на iOS:\n\n1. Нажмите кнопку "Поделиться" (квадрат со стрелкой вверх внизу экрана)\n2. Прокрутите вниз и выберите "На экран «Домой»"\n3. Нажмите "Добавить"');
      setShowInstallButton(false);
      localStorage.setItem('pwa-install-banner-dismissed', 'true');
      return;
    }

    // Если есть deferredPrompt, используем его
    if (deferredPrompt) {
      try {
        // Показываем prompt установки
        await deferredPrompt.prompt();

        // Ждем выбора пользователя
        await deferredPrompt.userChoice;
      } catch (error) {
        console.error('[PWA] Ошибка при показе prompt:', error);
        // Если произошла ошибка, показываем инструкции
        showManualInstallInstructions(isAndroid, isChrome);
      } finally {
        setDeferredPrompt(null);
        setShowInstallButton(false);
      }
    } else {
      // Если нет deferredPrompt, показываем инструкции по ручной установке
      showManualInstallInstructions(isAndroid, isChrome);
    }
  };

  const showManualInstallInstructions = (isAndroid: boolean, isChrome: boolean) => {
    let instructions = '';
    
    if (isAndroid && isChrome) {
      instructions = 'Для установки приложения на Android:\n\n1. Нажмите на меню браузера (три точки в правом верхнем углу)\n2. Выберите "Установить приложение" или "Добавить на главный экран"\n3. Подтвердите установку';
    } else if (isAndroid) {
      instructions = 'Для установки приложения на Android:\n\n1. Откройте меню браузера\n2. Найдите опцию "Добавить на главный экран" или "Установить приложение"\n3. Подтвердите установку';
    } else {
      instructions = 'Для установки приложения:\n\n1. Найдите в меню браузера опцию "Установить приложение" или "Добавить на главный экран"\n2. Следуйте инструкциям на экране';
    }
    
    alert(instructions);
    setShowInstallButton(false);
    // Не сохраняем в localStorage - баннер будет показываться снова при следующем посещении
  };

  // Не показываем кнопку, если приложение уже установлено
  if (isInstalled || !showInstallButton) {
    return null;
  }

  return (
    <div className="install-pwa-banner">
      <div className="install-pwa-content">
        <div className="install-pwa-text">
          <strong>Установите приложение</strong>
          <span>Для быстрого доступа установите приложение на ваш телефон</span>
        </div>
        <button
          className="install-pwa-button"
          onClick={handleInstallClick}
          type="button"
        >
          Установить
        </button>
        <button
          className="install-pwa-close"
          onClick={() => {
            setShowInstallButton(false);
            // Не сохраняем в localStorage - баннер будет показываться снова при следующем посещении
          }}
          type="button"
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default InstallPWA;

