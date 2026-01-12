/**
 * Service Worker для PWA
 * Кэширует статические ресурсы для офлайн-работы
 * 
 * ВАЖНО: CACHE_VERSION будет автоматически заменен на timestamp при сборке
 * Это обеспечивает автоматическое обновление кэша при каждом деплое
 */

const CACHE_VERSION = '__CACHE_VERSION__'; // Заменяется при сборке на timestamp
const CACHE_NAME = `equipment-app-${CACHE_VERSION}`;
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  // CSS и JS файлы будут добавлены автоматически при сборке
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Service Worker installed');
        return self.skipWaiting(); // Активировать сразу
      })
      .catch((error) => {
        console.error('[SW] Error caching static assets:', error);
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Удаляем все старые кэши, которые начинаются с 'equipment-app-'
          // но не соответствуют текущей версии
          if (cacheName.startsWith('equipment-app-') && cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
          // Также удаляем любые другие старые кэши
          if (!cacheName.startsWith('equipment-app-')) {
            console.log('[SW] Deleting unrelated cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service Worker activated with cache:', CACHE_NAME);
      return self.clients.claim(); // Взять контроль над всеми страницами
    })
  );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Игнорируем запросы от расширений браузера (chrome-extension://, moz-extension:// и т.д.)
  // Cache API не поддерживает кэширование таких запросов
  if (requestUrl.protocol === 'chrome-extension:' || 
      requestUrl.protocol === 'moz-extension:' ||
      requestUrl.protocol === 'safari-extension:' ||
      requestUrl.protocol === 'ms-browser-extension:') {
    return; // Пропускаем запросы от расширений без обработки
  }
  
  // Пропускаем запросы к API (они должны идти на сервер)
  if (event.request.url.includes('/exec') || 
      event.request.url.includes('script.google.com') ||
      event.request.url.includes('beliot.by') ||
      event.request.url.includes('supabase.co')) {
    return; // Не кэшируем API запросы
  }
  
  // Не кэшируем POST, PUT, DELETE и другие не-GET запросы
  if (event.request.method !== 'GET') {
    return; // Пропускаем не-GET запросы без кэширования
  }
  
  // Кэшируем только http:// и https:// запросы
  if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') {
    return; // Пропускаем другие протоколы
  }
  
  // Для остальных GET запросов используем стратегию "Network First, Cache Fallback"
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Клонируем ответ для кэширования
        const responseToCache = response.clone();
        
        // Кэшируем только успешные GET ответы
        if (response.status === 200 && event.request.method === 'GET') {
          caches.open(CACHE_NAME).then((cache) => {
            // Дополнительная проверка перед кэшированием
            try {
              cache.put(event.request, responseToCache).catch((error) => {
                // Игнорируем ошибки кэширования (например, для неподдерживаемых схем)
                console.warn('[SW] Failed to cache request:', event.request.url, error);
              });
            } catch (error) {
              // Игнорируем ошибки кэширования
              console.warn('[SW] Failed to cache request:', event.request.url, error);
            }
          });
        }
        
        return response;
      })
      .catch(() => {
        // Если сеть недоступна, пытаемся получить из кэша
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Если в кэше нет, возвращаем офлайн-страницу для навигационных запросов
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    const urls = event.data.urls;
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urls);
    });
  }
});

