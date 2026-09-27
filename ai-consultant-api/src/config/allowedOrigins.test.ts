import { describe, expect, it } from 'vitest';
import { parseAllowedOrigins } from './allowedOrigins.js';

describe('parseAllowedOrigins', () => {
  it('defaults to the Vite port and rejects a wildcard', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
    expect(parseAllowedOrigins(' http://localhost:3000/ , https://app.example ')).toEqual([
      'http://localhost:3000',
      'https://app.example',
    ]);
    expect(() => parseAllowedOrigins('*')).toThrow(/\*/);
  });
});
