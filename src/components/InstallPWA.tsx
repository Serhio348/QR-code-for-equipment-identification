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
    const checkIfInstalled = () => {
      // Проверка для standalone режима (iOS и Android)
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      
      setIsInstalled(isStandalone);
    };

    checkIfInstalled();

    // Обработчик события beforeinstallprompt (для Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    // Обработчик успешной установки
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallButton(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    // Показываем prompt установки
    deferredPrompt.prompt();

    // Ждем выбора пользователя
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('Пользователь принял установку');
    } else {
      console.log('Пользователь отклонил установку');
    }

    setDeferredPrompt(null);
    setShowInstallButton(false);
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
          onClick={() => setShowInstallButton(false)}
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

