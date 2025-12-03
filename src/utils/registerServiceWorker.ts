/**
 * Регистрация Service Worker для PWA
 */

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    // Для production используем /sw.js, для dev можно использовать другой путь
    // В Vite используется import.meta.env.MODE вместо process.env.NODE_ENV
    const swUrl = '/sw.js';

    if (isLocalhost) {
      // Для localhost проверяем, что Service Worker существует
      checkValidServiceWorker(swUrl);
    } else {
      // Для production просто регистрируем
      registerValidSW(swUrl);
    }
  }
}

function registerValidSW(swUrl: string): void {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      console.log('[SW] Service Worker registered:', registration);

      // Проверка обновлений каждые 60 секунд
      setInterval(() => {
        registration.update();
      }, 60000);

      // Обработка обновления Service Worker
      registration.addEventListener('updatefound', () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // Новый Service Worker доступен, показываем уведомление
              console.log('[SW] New content available; please refresh.');
              
              // Можно показать уведомление пользователю
              if (window.confirm('Доступна новая версия приложения. Обновить?')) {
                // Отправляем сообщение новому Service Worker для активации
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              }
            } else {
              // Service Worker установлен впервые
              console.log('[SW] Content cached for offline use.');
            }
          }
        });
      });
    })
    .catch((error) => {
      console.error('[SW] Error during service worker registration:', error);
    });
}

function checkValidServiceWorker(swUrl: string): void {
  // Проверяем, что Service Worker существует
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      // Проверяем, что ответ валидный
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // Service Worker не найден или неверный тип
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // Service Worker найден, регистрируем
        registerValidSW(swUrl);
      }
    })
    .catch(() => {
      console.log('[SW] No internet connection found. App is running in offline mode.');
    });
}

export function unregisterServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}

