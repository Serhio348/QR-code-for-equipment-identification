import { describe, expect, it } from 'vitest';
import { jsonBodyLimit } from './jsonBodyLimit.js';

describe('jsonBodyLimit', () => {
  it('gives the chat enough room for one encoded 10 MB photo', () => {
    expect(jsonBodyLimit('POST', '/api/chat')).toBe('16mb');
    expect(jsonBodyLimit('POST', '/api/chat/stream')).toBe('16mb');
  });

  it('keeps the maintenance upload limit and the default for other routes', () => {
    expect(jsonBodyLimit('POST', '/api/equipment/upload-file')).toBe('40mb');
    expect(jsonBodyLimit('POST', '/api/invoices/sync')).toBe('5mb');
    expect(jsonBodyLimit('GET', '/api/chat')).toBe('5mb');
  });
});
