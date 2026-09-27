import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cachesToDelete, precacheUrls, shouldBypassServiceWorker } from './swCachePolicy';

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

describe('cachesToDelete', () => {
  it('keeps the previous app cache and every foreign cache', () => {
    expect(cachesToDelete(
      ['equipment-app-1', 'equipment-app-2', 'other-origin-cache'],
      'equipment-app-2',
    )).toEqual([]);

    expect(cachesToDelete(
      ['equipment-app-1', 'equipment-app-2', 'equipment-app-3', 'maps-cache'],
      'equipment-app-3',
    )).toEqual(['equipment-app-1']);
  });
});

describe('service worker lifecycle', () => {
  it('waits for the user before replacing the open page', () => {
    const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
    const install = source.slice(
      source.indexOf("addEventListener('install'"),
      source.indexOf("addEventListener('activate'"),
    );
    expect(install).not.toContain('skipWaiting');
    expect(source).toContain("event.data.type === 'SKIP_WAITING'");
    expect(source).toContain('function cachesToDelete');
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
