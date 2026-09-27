import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production TypeScript build', () => {
  it('excludes tests so the image does not compile Vitest', () => {
    const build = JSON.parse(readFileSync(new URL('../../tsconfig.build.json', import.meta.url), 'utf8')) as {
      exclude: string[];
    };
    expect(build.exclude).toContain('src/**/*.test.ts');
    const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
    expect(dockerfile).toContain('tsconfig.build.json');
  });
});
