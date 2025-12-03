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
    console.log('[PWA] InstallPWA компонент инициализирован');
    
    // Проверяем, установлено ли приложение
    const checkIfInstalled = () => {
      // Проверка для standalone режима (iOS и Android)
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      
      console.log('[PWA] Проверка установки:', {
        standalone: window.matchMedia('(display-mode: standalone)').matches,
        navigatorStandalone: (window.navigator as any).standalone,
        referrer: document.referrer,
        isInstalled: isStandalone
      });
      
      setIsInstalled(isStandalone);
      
      // Если уже установлено, не показываем кнопку
      if (isStandalone) {
        console.log('[PWA] Приложение уже установлено, скрываем кнопку');
        setShowInstallButton(false);
      }
    };

    checkIfInstalled();

    // Обработчик события beforeinstallprompt (для Android/Chrome)
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('[PWA] beforeinstallprompt event fired', e);
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setShowInstallButton(true);
      console.log('[PWA] Кнопка установки показана');
    };

    // Обработчик успешной установки
    const handleAppInstalled = () => {
      console.log('[PWA] App installed event fired');
      setIsInstalled(true);
      setShowInstallButton(false);
      setDeferredPrompt(null);
    };

    // Проверяем поддержку PWA
    console.log('[PWA] Проверка поддержки:', {
      serviceWorker: 'serviceWorker' in navigator,
      userAgent: navigator.userAgent,
      isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
      isAndroid: /Android/.test(navigator.userAgent)
    });

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Для iOS Safari - показываем инструкции по установке
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    console.log('[PWA] iOS/Safari проверка:', { isIOS, isSafari, isInstalled });
    
    if (isIOS && isSafari) {
      // Показываем кнопку с инструкциями для iOS через небольшую задержку
      setTimeout(() => {
        checkIfInstalled();
        if (!isInstalled) {
          console.log('[PWA] Показываем кнопку для iOS');
          setShowInstallButton(true);
        }
      }, 2000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    // Проверяем, iOS ли это
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    if (isIOS && isSafari) {
      // Для iOS показываем инструкции
      alert('Для установки приложения на iOS:\n1. Нажмите кнопку "Поделиться" (квадрат со стрелкой вверх)\n2. Выберите "На экран «Домой»"\n3. Нажмите "Добавить"');
      setShowInstallButton(false);
      return;
    }

    if (!deferredPrompt) {
      console.warn('[PWA] No deferred prompt available');
      return;
    }

    try {
      // Показываем prompt установки
      await deferredPrompt.prompt();

      // Ждем выбора пользователя
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] Пользователь принял установку');
      } else {
        console.log('[PWA] Пользователь отклонил установку');
      }
    } catch (error) {
      console.error('[PWA] Ошибка при показе prompt:', error);
    } finally {
      setDeferredPrompt(null);
      setShowInstallButton(false);
    }
  };

  // Логируем состояние для отладки
  console.log('[PWA] Render состояние:', { isInstalled, showInstallButton, hasDeferredPrompt: !!deferredPrompt });

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

