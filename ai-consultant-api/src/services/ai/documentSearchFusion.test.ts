import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './documentSearchFusion.js';

describe('reciprocalRankFusion', () => {
  it('ranks a fragment found by both searches above a single-search fragment', () => {
    const fused = reciprocalRankFusion([
      { source: 'lexical', ids: ['exact-model', 'shared'] },
      { source: 'vector', ids: ['shared', 'semantic-only'] },
    ]);

    expect(fused[0]?.id).toBe('shared');
    expect(fused[0]?.sources).toEqual(['lexical', 'vector']);
    expect(fused.map((hit) => hit.id)).toContain('exact-model');
  });
});
