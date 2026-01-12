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
                
                // Функция для обновления приложения
                const performUpdate = () => {
                  installingWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                };
                
                // Показываем Toast уведомление
                const toastId = showInfo('Доступна новая версия приложения. Нажмите для обновления', {
                  autoClose: false, // Не закрывать автоматически
                  closeOnClick: false, // Не закрывать при клике на само уведомление
                  draggable: true,
                  closeButton: true,
                  onClick: performUpdate, // При клике на уведомление обновляем
                });
                
                // Добавляем кнопку "Обновить" к Toast уведомлению через DOM
                // Используем несколько попыток с увеличивающейся задержкой
                const addUpdateButton = (attempt = 0) => {
                  const maxAttempts = 5;
                  const delays = [100, 200, 300, 500, 1000];
                  const delay = delays[attempt] ?? 1000;
                  
                  setTimeout(() => {
                    // Ищем toast элемент по ID или по классу
                    let toastElement: Element | null = null;
                    
                    // Пытаемся найти по toastId (если react-toastify поддерживает)
                    if (toastId !== null && toastId !== undefined) {
                      const toastIdStr = String(toastId);
                      toastElement = document.querySelector(`[data-toast-id="${toastIdStr}"]`);
                    }
                    
                    // Если не нашли по ID, ищем последний info toast
                    if (!toastElement) {
                      toastElement = document.querySelector('.Toastify__toast--info:last-child');
                    }
                    
                    if (toastElement) {
                      const toastBody = toastElement.querySelector('.Toastify__toast-body');
                      if (toastBody) {
                        // Проверяем, не добавлена ли уже кнопка
                        if (!toastBody.querySelector('.sw-update-button')) {
                          // Создаем контейнер для текста и кнопки
                          const container = document.createElement('div');
                          container.style.display = 'flex';
                          container.style.alignItems = 'center';
                          container.style.justifyContent = 'space-between';
                          container.style.gap = '12px';
                          container.style.width = '100%';
                          container.style.flexWrap = 'wrap';
                          
                          // Добавляем текст
                          const textSpan = document.createElement('span');
                          textSpan.textContent = 'Доступна новая версия приложения';
                          textSpan.style.flex = '1';
                          textSpan.style.minWidth = '200px';
                          container.appendChild(textSpan);
                          
                          // Создаем кнопку обновления
                          const button = document.createElement('button');
                          button.className = 'sw-update-button';
                          button.textContent = 'Обновить';
                          button.style.cssText = 'padding: 6px 16px; background: rgba(255, 255, 255, 0.3); color: white; border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 4px; cursor: pointer; font-weight: 500; white-space: nowrap; transition: background 0.2s; flex-shrink: 0;';
                          button.onmouseover = () => {
                            button.style.background = 'rgba(255, 255, 255, 0.5)';
                          };
                          button.onmouseout = () => {
                            button.style.background = 'rgba(255, 255, 255, 0.3)';
                          };
                          button.onclick = (e) => {
                            e.stopPropagation();
                            performUpdate();
                          };
                          
                          container.appendChild(button);
                          toastBody.innerHTML = '';
                          toastBody.appendChild(container);
                          
                          // Также добавляем обработчик клика на весь toast элемент
                          toastElement.addEventListener('click', (e) => {
                            // Если клик не на кнопке и не на кнопке закрытия
                            const target = e.target as HTMLElement;
                            if (!target.closest('.sw-update-button') && !target.closest('.Toastify__close-button')) {
                              performUpdate();
                            }
                          });
                          
                          console.log('[SW] Update button added to toast notification');
                          return; // Успешно добавили кнопку
                        }
                      }
                      
                      // Если не удалось добавить кнопку, пробуем еще раз
                      if (attempt < maxAttempts - 1) {
                        addUpdateButton(attempt + 1);
                      } else {
                        console.warn('[SW] Failed to add update button after', maxAttempts, 'attempts');
                      }
                    } else {
                      // Toast еще не появился, пробуем еще раз
                      if (attempt < maxAttempts - 1) {
                        addUpdateButton(attempt + 1);
                      } else {
                        console.warn('[SW] Toast element not found after', maxAttempts, 'attempts');
                      }
                    }
                  }, delay);
                };
                
                // Начинаем попытки добавления кнопки
                addUpdateButton(0);
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

