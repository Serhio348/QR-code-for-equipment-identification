/**
 * Регистрация Service Worker для PWA
 */

import { showInfo } from './toast';

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
  window.location.hostname === '[::1]' ||
  window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

// Флаг для отслеживания, показывалось ли уже уведомление об обновлении
let updateNotificationShown = false;

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
              
              // Показываем уведомление только один раз
              if (!updateNotificationShown) {
                updateNotificationShown = true;
                
                // Показываем Toast уведомление с кнопкой действия
                showInfo('Доступна новая версия приложения', {
                  autoClose: false, // Не закрывать автоматически
                  closeOnClick: false, // Не закрывать при клике на само уведомление
                  draggable: true,
                  closeButton: true,
                });
                
                // Добавляем кнопку "Обновить" к Toast уведомлению через DOM
                setTimeout(() => {
                  const toastElement = document.querySelector('.Toastify__toast--info:last-child');
                  if (toastElement) {
                    const toastBody = toastElement.querySelector('.Toastify__toast-body');
                    if (toastBody && !toastBody.querySelector('.sw-update-button')) {
                      // Создаем контейнер для текста и кнопки
                      const container = document.createElement('div');
                      container.style.display = 'flex';
                      container.style.alignItems = 'center';
                      container.style.justifyContent = 'space-between';
                      container.style.gap = '12px';
                      container.style.width = '100%';
                      
                      // Перемещаем текст в контейнер
                      const textNode = toastBody.firstChild;
                      if (textNode) {
                        container.appendChild(textNode.cloneNode(true));
                        toastBody.innerHTML = '';
                      }
                      
                      // Создаем кнопку обновления
                      const button = document.createElement('button');
                      button.className = 'sw-update-button';
                      button.textContent = 'Обновить';
                      button.style.cssText = 'padding: 6px 16px; background: rgba(255, 255, 255, 0.3); color: white; border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 4px; cursor: pointer; font-weight: 500; white-space: nowrap; transition: background 0.2s;';
                      button.onmouseover = () => {
                        button.style.background = 'rgba(255, 255, 255, 0.4)';
                      };
                      button.onmouseout = () => {
                        button.style.background = 'rgba(255, 255, 255, 0.3)';
                      };
                      button.onclick = (e) => {
                        e.stopPropagation();
                        installingWorker.postMessage({ type: 'SKIP_WAITING' });
                        window.location.reload();
                      };
                      
                      container.appendChild(button);
                      toastBody.appendChild(container);
                    }
                  }
                }, 50);
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

