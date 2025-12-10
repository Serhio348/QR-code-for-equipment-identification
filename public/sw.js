/**
 * Service Worker для PWA
 * Кэширует статические ресурсы для офлайн-работы
 */

const CACHE_NAME = 'equipment-app-v1';
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
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service Worker activated');
      return self.clients.claim(); // Взять контроль над всеми страницами
    })
  );
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  // Пропускаем запросы к API (они должны идти на сервер)
  if (event.request.url.includes('/exec') || 
      event.request.url.includes('script.google.com') ||
      event.request.url.includes('beliot.by')) {
    return; // Не кэшируем API запросы
  }
  
  // Не кэшируем POST, PUT, DELETE и другие не-GET запросы
  if (event.request.method !== 'GET') {
    return; // Пропускаем не-GET запросы без кэширования
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
            cache.put(event.request, responseToCache);
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

