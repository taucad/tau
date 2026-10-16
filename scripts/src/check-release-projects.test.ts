import { describe, expect, it } from 'vitest';
import type { ReleaseScope } from '#check-release-projects.js';
import {
  findGroupVersionMismatches,
  findPreStableBumpMismatches,
  findReleaseScopeMismatches,
  findVersionPlanScopeMismatches,
  parseProjectList,
  selectorsIn,
} from '#check-release-projects.js';

const scope: ReleaseScope = {
  selectors: [
    { value: 'packages/*', source: 'nx.json release.projects', release: true, matches: ['runtime', 'react'] },
    { value: 'tag:type:lib', source: 'nx.json release.projects', release: true, matches: ['rpc'] },
    { value: 'tag:type:package', source: 'publish.yml', release: false, matches: ['runtime', 'react'] },
  ],
  publishable: ['react', 'runtime'],
  releaseTrain: ['react', 'rpc', 'runtime'],
  versions: { react: '0.1.0-beta.5', runtime: '0.1.0-beta.5' },
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

  it('accepts the default release group of a fixed train', () => {
    expect(
      findVersionPlanScopeMismatches(
        [{ path: '.nx/version-plans/train.md', text: '---\n__default__: minor\n---\n' }],
        scope.releaseTrain,
      ),
    ).toEqual([]);
  });

  it('rejects the default group when nx.json declares named groups', () => {
    expect(
      findVersionPlanScopeMismatches(
        [{ path: '.nx/version-plans/train.md', text: '---\n__default__: minor\n---\n' }],
        scope.releaseTrain,
        ['packages'],
      ),
    ).toEqual(['.nx/version-plans/train.md: project "__default__" is outside the release scope']);
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

describe('findGroupVersionMismatches', () => {
  it('accepts a fixed group on one version', () => {
    expect(findGroupVersionMismatches({ react: '0.1.0-beta.5', runtime: '0.1.0-beta.5' })).toEqual([]);
  });

  it('reports every version of a split group with the projects carrying it', () => {
    const mismatches = findGroupVersionMismatches({
      react: '0.1.0-beta.5',
      runtime: '0.1.0-beta.5',
      viewer: '0.0.1',
      ui: undefined,
    });

    expect(mismatches).toEqual([
      'the fixed release group carries 3 versions, not one: 0.1.0-beta.5 (react, runtime); 0.0.1 (viewer); (none) (ui)',
    ]);
  });
});

describe('findPreStableBumpMismatches', () => {
  const plan = (body: string) => ({ path: '.nx/version-plans/a.md', text: `---\n${body}\n---\n\nChange.\n` });

  it('accepts minor and patch plans below 1.0.0', () => {
    expect(findPreStableBumpMismatches([plan('runtime: minor\nhost: patch')], '0.1.0-beta.5')).toEqual([]);
  });

  it('rejects a major or premajor plan below 1.0.0, naming the plan and project', () => {
    const mismatches = findPreStableBumpMismatches([plan('runtime: major\nhost: premajor')], '0.1.0-beta.5');

    expect(mismatches).toHaveLength(2);
    expect(mismatches[0]).toContain('.nx/version-plans/a.md: "runtime: major"');
    expect(mismatches[1]).toContain('"host: premajor"');
  });

  it('accepts a major plan once the group has reached 1.0.0', () => {
    expect(findPreStableBumpMismatches([plan('runtime: major')], '1.0.0')).toEqual([]);
  });

  it('leaves unreadable frontmatter to the scope check', () => {
    expect(findPreStableBumpMismatches([{ path: 'b.md', text: 'no frontmatter' }], '0.1.0')).toEqual([]);
  });
});

describe('parseProjectList', () => {
  it('reads the list past a banner that starts with a bracket', () => {
    const stdout =
      '◇ injected env (0) from apps/api/.env // tip: ◈ [www.vestauth.com]\n[www.vestauth.com]\n["cli","runtime"]\n';

    expect(parseProjectList(stdout)).toEqual(['cli', 'runtime']);
  });

  it('fails when no line is a project list', () => {
    expect(() => parseProjectList('[www.example.com]\n')).toThrow('printed no project list');
  });
});

describe('selectorsIn', () => {
  it('reads project lists from Nx commands only', () => {
    const workflow = [
      '          mkdir -p out/artifacts/geospec-native-engine/plan',
      '          pnpm nx run-many -t pkgcheck --projects=tag:type:package,cli',
      '          pnpm nx run-many -t build -p runtime',
      '          # pnpm nx run-many -t build -p commented',
    ].join('\n');

    expect(selectorsIn(workflow, 'publish.yml').map(({ value }) => value)).toEqual([
      'tag:type:package',
      'cli',
      'runtime',
    ]);
  });
});
