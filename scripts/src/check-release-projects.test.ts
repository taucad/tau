import { describe, expect, it } from 'vitest';
import type { ReleaseScope } from '#check-release-projects.js';
import { findReleaseScopeMismatches, findVersionPlanScopeMismatches } from '#check-release-projects.js';

const scope: ReleaseScope = {
  selectors: [
    { value: 'packages/*', source: 'nx.json release.projects', release: true, matches: ['runtime', 'react'] },
    { value: 'tag:type:lib', source: 'nx.json release.projects', release: true, matches: ['rpc'] },
    { value: 'tag:type:package', source: 'publish.yml', release: false, matches: ['runtime', 'react'] },
  ],
  publishable: ['react', 'runtime'],
  releaseTrain: ['react', 'rpc', 'runtime'],
  publishesWholeGroup: true,
};

describe('findReleaseScopeMismatches', () => {
  it('accepts a release scope whose selectors and train bounds line up', () => {
    expect(findReleaseScopeMismatches(scope)).toEqual([]);
  });

  it('reports a selector that resolves to nothing, naming its source', () => {
    const mismatches = findReleaseScopeMismatches({
      ...scope,
      selectors: [...scope.selectors, { value: 'openrscd', source: 'publish.yml', release: false, matches: [] }],
    });

    expect(mismatches).toEqual([expect.stringContaining('openrscd')]);
    expect(mismatches[0]).toContain('publish.yml');
  });

  it('reports a publishable package no release selector reaches', () => {
    const mismatches = findReleaseScopeMismatches({ ...scope, publishable: ['react', 'runtime', 'cli'] });

    expect(mismatches).toEqual([expect.stringContaining('cli')]);
    expect(mismatches[0]).toContain('nx.json');
  });

  it('reports a release selector resolution that reaches outside the release train', () => {
    const mismatches = findReleaseScopeMismatches({ ...scope, releaseTrain: ['react', 'runtime'] });

    expect(mismatches).toEqual([expect.stringContaining('rpc')]);
    expect(mismatches[0]).toContain('nx.json');
  });

  it('reports a workflow that publishes a hand-picked subset instead of the fixed group', () => {
    const mismatches = findReleaseScopeMismatches({ ...scope, publishesWholeGroup: false });

    expect(mismatches).toEqual([expect.stringContaining('whole fixed group')]);
    expect(mismatches[0]).toContain('publish.yml');
  });

  it('reports an empty release scope, the widest fail-open of all', () => {
    expect(findReleaseScopeMismatches({ ...scope, selectors: [] })).toEqual(
      expect.arrayContaining([expect.stringContaining('no release project selectors')]),
    );
  });
});

describe('findVersionPlanScopeMismatches', () => {
  it('accepts projects in the release scope', () => {
    expect(
      findVersionPlanScopeMismatches(
        [{ path: '.nx/version-plans/runtime.md', text: '---\nruntime: minor\n---\n\nShip runtime work.\n' }],
        scope.releaseTrain,
      ),
    ).toEqual([]);
  });

  it('rejects projects outside the release scope', () => {
    expect(
      findVersionPlanScopeMismatches(
        [{ path: '.nx/version-plans/filesystem.md', text: '---\nfilesystem: minor\n---\n' }],
        scope.releaseTrain,
      ),
    ).toEqual(['.nx/version-plans/filesystem.md: project "filesystem" is outside the release scope']);
  });

  it('rejects a file without version-plan frontmatter', () => {
    expect(
      findVersionPlanScopeMismatches(
        [{ path: '.nx/version-plans/broken.md', text: 'runtime: minor\n' }],
        scope.releaseTrain,
      ),
    ).toEqual(['.nx/version-plans/broken.md: missing YAML frontmatter']);
  });
});
