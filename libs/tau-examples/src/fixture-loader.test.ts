import { describe, expect, it } from 'vitest';

import { loadFixture } from '#fixture-loader.js';

describe('loadFixture', () => {
  it('selects an explicit nested entry without changing default callers', () => {
    const birdhouse = loadFixture('replicad', 'birdhouse');
    const v8 = loadFixture('replicad', 'v8-engine-rev2', 'test-exports/assembly.ts');

    expect(birdhouse.mainFile).toBe('main.ts');
    expect(v8.mainFile).toBe('test-exports/assembly.ts');
    expect(v8.files[v8.mainFile]).toContain('650');
  });

  it('rejects an explicit entry outside the loaded inventory', () => {
    expect(() => loadFixture('replicad', 'birdhouse', '../main.ts')).toThrow('has no entrypoint');
  });
});
