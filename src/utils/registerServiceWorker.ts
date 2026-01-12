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

      // Проверяем, есть ли уже ожидающий обновления Service Worker
      if (registration.waiting) {
        console.log('[SW] Waiting worker found, showing update notification');
        showUpdateNotification(registration);
      }

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
              showUpdateNotification(registration);
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

// Функция для показа уведомления об обновлении
function showUpdateNotification(registration: ServiceWorkerRegistration): void {
  // Показываем уведомление только один раз
  if (updateNotificationShown) {
    return;
  }
  updateNotificationShown = true;
  
  // Функция для обновления приложения
  const performUpdate = () => {
    // Используем registration.waiting, если он есть
    const waitingWorker = registration.waiting;
    
    if (waitingWorker) {
      console.log('[SW] Sending SKIP_WAITING message to worker');
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      
      // Ждем активации нового Service Worker перед перезагрузкой
      const handleControllerChange = () => {
        console.log('[SW] Controller changed, reloading page');
        window.location.reload();
      };
      
      // Слушаем изменение контроллера
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange, { once: true });
      
      // Fallback: если controllerchange не сработает, перезагружаем через небольшую задержку
      setTimeout(() => {
        console.log('[SW] Fallback: reloading page after timeout');
        window.location.reload();
      }, 1000);
    } else {
      // Если нет waiting worker, просто перезагружаем
      console.log('[SW] No waiting worker, reloading page');
      window.location.reload();
    }
  };
  
  // Показываем Toast уведомление
  // ВАЖНО: Не используем onClick здесь, так как добавляем кастомный обработчик через DOM
  // Это предотвращает двойное выполнение performUpdate()
  const toastId = showInfo('Доступна новая версия приложения. Нажмите для обновления', {
    autoClose: false, // Не закрывать автоматически
    closeOnClick: false, // Не закрывать при клике на само уведомление
    draggable: true,
    closeButton: true,
    // onClick удален - используем кастомный обработчик через DOM (см. ниже)
  });
  
  // Добавляем кнопку "Обновить" к Toast уведомлению через DOM
  // Используем MutationObserver для надежного отслеживания появления toast
  const addUpdateButton = () => {
    // Функция для поиска и модификации toast
    const findAndModifyToast = (): boolean => {
      // Ищем toast элемент по ID (наиболее надежный способ)
      let toastElement: Element | null = null;
      
      if (toastId !== null && toastId !== undefined) {
        const toastIdStr = String(toastId);
        // Пробуем разные варианты поиска по ID
        toastElement = document.querySelector(`[data-toast-id="${toastIdStr}"]`) ||
                      document.querySelector(`#${toastIdStr}`) ||
                      document.querySelector(`[id*="${toastIdStr}"]`);
      }
      
      // Если не нашли по ID, ищем все info toast и берем тот, который содержит наш текст
      if (!toastElement) {
        const allInfoToasts = document.querySelectorAll('.Toastify__toast--info');
        for (const toast of Array.from(allInfoToasts)) {
          const body = toast.querySelector('.Toastify__toast-body');
          if (body && body.textContent?.includes('Доступна новая версия приложения')) {
            toastElement = toast;
            break;
          }
        }
      }
      
      if (!toastElement) {
        return false; // Toast еще не появился
      }
      
      const toastBody = toastElement.querySelector('.Toastify__toast-body');
      if (!toastBody) {
        return false; // Структура toast неполная
      }
      
      // Проверяем, не добавлена ли уже кнопка
      if (toastBody.querySelector('.sw-update-button')) {
        return true; // Кнопка уже добавлена
      }
      
      // Сохраняем оригинальный текст сообщения
      // В react-toastify v11 структура: .Toastify__toast-body содержит иконку (firstChild) и текст
      // Находим текстовый контент, исключая иконку
      let originalText = 'Доступна новая версия приложения';
      
      // Пробуем найти текстовый элемент (не иконку)
      const textElements = toastBody.querySelectorAll('div, span, p');
      for (const elem of Array.from(textElements)) {
        const text = elem.textContent?.trim();
        // Игнорируем пустые элементы и иконки (обычно иконки не содержат длинный текст)
        if (text && text.length > 10 && !elem.querySelector('svg, img')) {
          originalText = text;
          break;
        }
      }
      
      // Если не нашли в элементах, используем весь textContent и очищаем от иконок
      if (originalText === 'Доступна новая версия приложения') {
        const fullText = toastBody.textContent || '';
        // Удаляем возможные символы иконок и лишние пробелы
        originalText = fullText.replace(/[\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F]/g, '').trim();
        if (!originalText || originalText.length < 10) {
          originalText = 'Доступна новая версия приложения';
        }
      }
      
      // Очищаем текст от лишних фраз
      originalText = originalText.replace('Нажмите для обновления', '').trim() || 'Доступна новая версия приложения';
      
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
      textSpan.textContent = originalText;
      textSpan.style.flex = '1';
      textSpan.style.minWidth = '200px';
      container.appendChild(textSpan);
      
      // Создаем кнопку обновления
      const button = document.createElement('button');
      button.className = 'sw-update-button';
      button.textContent = 'Обновить';
      button.setAttribute('aria-label', 'Обновить приложение');
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
      const clickHandler = (e: Event) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.sw-update-button') && !target.closest('.Toastify__close-button')) {
          performUpdate();
        }
      };
      toastElement.addEventListener('click', clickHandler);
      
      console.log('[SW] Update button added to toast notification');
      return true; // Успешно добавили кнопку
    };
    
    // Пытаемся найти toast сразу
    if (findAndModifyToast()) {
      return; // Успешно
    }
    
    // Если не нашли, используем MutationObserver для отслеживания появления
    const toastContainer = document.querySelector('.Toastify__toast-container');
    if (!toastContainer) {
      console.warn('[SW] Toast container not found, using fallback timeout');
      // Fallback: используем таймаут как последний вариант
      setTimeout(() => {
        if (!findAndModifyToast()) {
          console.warn('[SW] Failed to add update button after timeout');
        }
      }, 500);
      return;
    }
    
    // Используем MutationObserver для отслеживания добавления toast
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          if (findAndModifyToast()) {
            observer.disconnect(); // Успешно добавили, отключаем observer
            return;
          }
        }
      }
    });
    
    observer.observe(toastContainer, {
      childList: true,
      subtree: true
    });
    
    // Отключаем observer через 5 секунд, чтобы не висеть вечно
    setTimeout(() => {
      observer.disconnect();
      // Последняя попытка
      if (!findAndModifyToast()) {
        console.warn('[SW] Failed to add update button after MutationObserver timeout');
      }
    }, 5000);
  };
  
  // Начинаем добавление кнопки
  addUpdateButton();
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

