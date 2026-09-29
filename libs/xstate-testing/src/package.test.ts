/**
 * Surface test: the harness ships four subpaths and no root barrel. Each subpath's
 * audience note is its module header.
 */
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const manifest = createRequire(import.meta.url)('../package.json') as {
  private: boolean;
  exports: Record<string, unknown>;
};

describe('@taucad/xstate-testing surface', () => {
  it('should export only the four harness subpaths from a private package', () => {
    expect(manifest.private).toBe(true);
    expect(Object.keys(manifest.exports)).toEqual(['./inspect', './clock', './paths', './fakes', './package.json']);
  });
});
