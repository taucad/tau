import { describe, expect, it } from 'vitest';
import { unexpectedWorkspaceRootEntries } from '#validate-workspace-root.js';

describe('workspace-root validation', () => {
  it('allows authored roots and stable machine boundaries while rejecting transient siblings', () => {
    expect(
      unexpectedWorkspaceRootEntries({
        actualEntries: ['.git', '.nx', 'apps', 'node_modules', 'out', 'repos', '.pkgcheck-consumer-a1', 'coverage'],
        trackedPaths: ['apps/ui/package.json', 'package.json'],
      }),
    ).toEqual(['.pkgcheck-consumer-a1', 'coverage']);
  });
});
