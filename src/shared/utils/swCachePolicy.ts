/**
 * Какие запросы service worker не перехватывает.
 * Свой origin кэшируется, включая приложение на домене railway.app.
 * Чужой хост и /api/ остаются сетью.
 */

export interface CacheRequest {
  origin: string;
  hostname: string;
  pathname: string;
}

const API_HOST_SUFFIXES = ['script.google.com', 'beliot.by', 'supabase.co'];

export function shouldBypassServiceWorker(request: CacheRequest, pageOrigin: string): boolean {
  if (request.origin !== pageOrigin) return true;
  if (request.pathname.startsWith('/api/')) return true;
  return API_HOST_SUFFIXES.some(
    (suffix) => request.hostname === suffix || request.hostname.endsWith(`.${suffix}`),
  );
}

/** Имена файлов из dist/assets, которые попадают в precache вместе с оболочкой. */
export function precacheUrls(assetFileNames: readonly string[]): string[] {
  const assets = assetFileNames
    .filter((name) => /\.(js|css)$/.test(name))
    .map((name) => `/assets/${name}`);
  return ['/', '/index.html', '/manifest.json', ...assets];
}
