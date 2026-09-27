import { describe, expect, it } from 'vitest';
import { precacheUrls, shouldBypassServiceWorker } from './swCachePolicy';

const page = 'https://app.railway.app';

describe('shouldBypassServiceWorker', () => {
  it('caches the app shell on a railway.app origin and skips APIs', () => {
    expect(shouldBypassServiceWorker({
      origin: page,
      hostname: 'app.railway.app',
      pathname: '/assets/index-abc.js',
    }, page)).toBe(false);

    expect(shouldBypassServiceWorker({
      origin: 'https://ai-consultant-api-production.up.railway.app',
      hostname: 'ai-consultant-api-production.up.railway.app',
      pathname: '/api/chat',
    }, page)).toBe(true);

    expect(shouldBypassServiceWorker({
      origin: page,
      hostname: 'app.railway.app',
      pathname: '/api/notifications',
    }, page)).toBe(true);

    expect(shouldBypassServiceWorker({
      origin: 'https://wslcojroanewczgqtfuk.supabase.co',
      hostname: 'wslcojroanewczgqtfuk.supabase.co',
      pathname: '/rest/v1/profiles',
    }, page)).toBe(true);
  });
});

describe('precacheUrls', () => {
  it('includes the shell and built js/css, not source maps', () => {
    expect(precacheUrls(['index-a.js', 'index-a.css', 'index-a.js.map'])).toEqual([
      '/',
      '/index.html',
      '/manifest.json',
      '/assets/index-a.js',
      '/assets/index-a.css',
    ]);
  });
});
