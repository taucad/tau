import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- this test pins the package's executable-source coverage configuration itself.
import { engineCoverageSourcePolicy } from '../vitest.config.ts';

describe('engine coverage source policy', () => {
  it('keeps a broad executable-source include with only audited exclusion classes', () => {
    expect(engineCoverageSourcePolicy).toEqual({
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec,test-d}.ts',
        'src/**/__evidence-snapshots__/**',
        'src/**/__fixtures__/**',
        'src/**/testing/**',
        'src/**/types.ts',
        'src/cli/main.ts',
      ],
    });
  });
});
