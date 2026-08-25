import { describe, expect, it } from 'vitest';
import {
  bundleOwnershipIssues,
  bundlePattern,
  bundledLibraries,
  projects,
  publishWaves,
  publishable,
  publishableClosure,
  validateTags,
  workspace,
} from '#resolver.js';
import type { Workspace, WorkspaceProject } from '#resolver.js';

const live = await workspace();

const project = (name: string, tags: readonly string[], manifest: WorkspaceProject['manifest']): WorkspaceProject => ({
  name,
  root: `fixture/${name}`,
  tags,
  targets: [],
  manifest,
  configured: true,
});

const library = (name: string): WorkspaceProject =>
  project(name, ['scope:shared', 'type:lib'], { name: `@taucad/${name}`, private: true });

/**
 * A miniature workspace for the cases the live one cannot produce: an untagged
 * project, a second bundle owner, a manifest-less project, a mis-ordered wave.
 */
const fixture: Workspace = {
  projects: [
    library('types'),
    library('units'),
    project('app-only', ['scope:ui', 'type:app'], undefined),
    project('base', ['scope:shared', 'type:package'], {
      name: '@taucad/base',
      devDependencies: { '@taucad/types': 'workspace:*', '@taucad/units': 'workspace:*', vitest: 'catalog:' },
      peerDependencies: { '@taucad/units': 'workspace:*' },
    }),
    project('leaf', ['scope:shared', 'type:package'], {
      name: '@taucad/leaf',
      dependencies: { '@taucad/base': '^0.1.0' },
    }),
    project('shipped', ['scope:shared', 'type:package'], { name: '@taucad/shipped', private: true }),
  ],
};

describe('workspace()', () => {
  it('reads the live project graph', () => {
    expect(live.projects.length).toBeGreaterThan(50);
    expect(live.projects.map((entry) => entry.name)).toContain('runtime');
  });

  it('is memoised', async () => {
    expect(await workspace()).toBe(live);
  });

  it('carries the target names the graph resolved for each project', () => {
    expect(live.projects.every((entry) => entry.targets.length > 0)).toBe(true);
    expect(live.projects.flatMap((entry) => entry.targets)).toContain('pkgcheck');
  });
});

describe('projects()', () => {
  it('resolves an Nx tag selector the same way `nx show projects --projects tag:…` does', () => {
    expect(projects(live, 'tag:type:package').map((entry) => entry.name)).toEqual(
      publishable(live).map((entry) => entry.name),
    );
    expect(projects(live, 'type:tool')).toEqual(projects(live, 'tag:type:tool'));
  });

  it('filters on all tags, excluded tags, privacy, and a predicate', () => {
    expect(projects(fixture, { tags: ['type:lib', 'scope:shared'] }).map((entry) => entry.name)).toEqual([
      'types',
      'units',
    ]);
    expect(projects(fixture, { not: ['type:lib', 'type:app'] }).map((entry) => entry.name)).toEqual([
      'base',
      'leaf',
      'shipped',
    ]);
    expect(projects(fixture, { private: true }).map((entry) => entry.name)).toEqual(['types', 'units', 'shipped']);
    expect(projects(fixture, { private: false }).map((entry) => entry.name)).toEqual(['app-only', 'base', 'leaf']);
    expect(projects(fixture, { predicate: (entry) => entry.name === 'leaf' }).map((entry) => entry.name)).toEqual([
      'leaf',
    ]);
    expect(projects(fixture)).toEqual(fixture.projects);
  });
});

describe('publishable()', () => {
  it('is every non-private type:package project, sorted — twenty-three today', () => {
    const names = publishable(live).map((entry) => entry.name);

    // The count is the tripwire; re-baselining it is the point at which a new
    // package is noticed. Pinning the whole list would only restate the rule.
    expect(names).toHaveLength(23);
    expect(names).toEqual([...names].sort());
    // Both ends of the train, and the two native packages added most recently.
    for (const name of ['runtime', 'runtime-testing', 'geospec-engine', 'opencascade-native', 'openrscad-native']) {
      expect(names).toContain(name);
    }

    // Dev-time tools and private libraries are outside the set by construction.
    for (const name of ['nx', 'scripts', 'oxlint', 'types', 'chat']) {
      expect(names).not.toContain(name);
    }
  });

  it('excludes a private type:package project', () => {
    expect(publishable(fixture).map((entry) => entry.name)).toEqual(['base', 'leaf']);
  });
});

describe('validateTags()', () => {
  it('accepts every project in the workspace, inferred ones included', () => {
    expect(validateTags(live)).toEqual([]);
  });

  it('rejects a project Nx inferred from a bare package.json that declares no tags', () => {
    expect(validateTags({ projects: [{ ...project('inferred', [], undefined), configured: false }] })).toEqual([
      'fixture/inferred: expected exactly one type: tag, found none; expected exactly one scope: tag, found none',
    ]);
  });

  it('rejects a missing dimension, a duplicated dimension, and an unknown value', () => {
    expect(
      validateTags({
        projects: [
          project('untagged', ['scope:shared'], undefined),
          project('two-types', ['scope:shared', 'type:lib', 'type:package'], undefined),
          project('legacy', ['scope:tooling', 'type:scripts'], undefined),
        ],
      }),
    ).toEqual([
      'fixture/untagged: expected exactly one type: tag, found none',
      'fixture/two-types: expected exactly one type: tag, found type:lib, type:package',
      'fixture/legacy: unknown tag "type:scripts" (type: must be one of app, app-lib, lib, package, tool, example, e2e); unknown tag "scope:tooling" (scope: must be one of shared, api, ui, example)',
    ]);
  });

  it('requires one valid layer for app libraries and validates optional layers elsewhere', () => {
    expect(
      validateTags({
        projects: [
          project('app-lib-without-layer', ['scope:ui', 'type:app-lib'], undefined),
          project('two-layers', ['scope:ui', 'type:app', 'layer:feature', 'layer:ui'], undefined),
          project('unknown-layer', ['scope:ui', 'type:app', 'layer:shell'], undefined),
          project('valid-app-lib', ['scope:ui', 'type:app-lib', 'layer:data-access'], undefined),
        ],
      }),
    ).toEqual([
      'fixture/app-lib-without-layer: expected exactly one layer: tag, found none',
      'fixture/two-layers: expected exactly one layer: tag, found layer:feature, layer:ui',
      'fixture/unknown-layer: unknown tag "layer:shell" (layer: must be one of feature, ui, data-access, util)',
    ]);
  });
});

describe('bundledLibraries()', () => {
  it("derives the runtime owner's eight direct bundle candidates", () => {
    expect(bundledLibraries(live, 'runtime')).toEqual([
      '@taucad/events',
      '@taucad/filesystem',
      '@taucad/fs-bridge',
      '@taucad/json-schema',
      '@taucad/memory',
      '@taucad/rpc',
      '@taucad/types',
      '@taucad/utils',
    ]);
  });

  it('over-approximates geospec-engine, whose one candidate is test-only', () => {
    // Known and accepted (research Finding 4): the manifest/tag rule states what
    // *may* bundle; the emitted `dist/libs/*` mirrors state what did. Pinned so a
    // change to the devDependency is noticed. `@taucad/tau-examples` left the set
    // when it was retagged `type:example` (correctness-review OQ5) — geospec-engine
    // reaches it by filesystem path from one test, never by import.
    expect(bundledLibraries(live, 'geospec-engine')).toEqual(['@taucad/chat']);
  });

  it('yields nothing for every other publishable, or for an unknown project', () => {
    const bundlers = publishable(live)
      .filter((entry) => bundledLibraries(live, entry.name).length > 0)
      .map((entry) => entry.name);

    expect(bundlers).toEqual(['geospec-engine', 'runtime']);
    expect(bundledLibraries(live, 'no-such-project')).toEqual([]);
  });

  it('drops peer dependencies, registry ranges, and non-library workspace packages', () => {
    expect(bundledLibraries(fixture, 'base')).toEqual(['@taucad/types']);
  });
});

describe('bundlePattern()', () => {
  it('matches a bundled library and its subpaths only', () => {
    const pattern = bundlePattern(live, 'runtime');

    expect(pattern.test('@taucad/events')).toBe(true);
    expect(pattern.test('@taucad/events/worker')).toBe(true);
    expect(pattern.test('@taucad/events-extra')).toBe(false);
    expect(pattern.test('@taucad/runtime')).toBe(false);
  });

  it('matches nothing when the package bundles nothing', () => {
    const pattern = bundlePattern(live, 'cli');

    expect(pattern.test('@taucad/events')).toBe(false);
    expect(pattern.test('')).toBe(false);
  });
});

describe('bundle ownership', () => {
  it('gives every bundled library exactly one owner', () => {
    expect(bundleOwnershipIssues(live)).toEqual([]);
  });

  it('reports a library claimed by two publishables', () => {
    const contested: Workspace = {
      projects: [
        ...fixture.projects,
        project('rival', ['scope:shared', 'type:package'], {
          name: '@taucad/rival',
          devDependencies: { '@taucad/types': 'workspace:*' },
        }),
      ],
    };

    expect(bundleOwnershipIssues(contested)).toEqual(['@taucad/types is bundled by base and rival']);
  });
});

describe('publishWaves()', () => {
  it('layers the publishables by longest dependency path', () => {
    const waves = publishWaves(live);

    // The rule, not a transcript of today's graph: the waves partition the
    // publishable set, and nothing may publish before what it depends on.
    expect(waves.flat().sort()).toEqual(publishable(live).map((entry) => entry.name));

    // Nothing publishes before what it depends on, read straight off the manifests.
    const waveOf = new Map(waves.flatMap((wave, index) => wave.map((name) => [name, index] as const)));
    const packageNames = new Map(live.projects.map((entry) => [entry.manifest?.name, entry.name] as const));
    for (const entry of publishable(live)) {
      const dependencies = { ...entry.manifest?.dependencies, ...entry.manifest?.peerDependencies };
      for (const dependency of Object.keys(dependencies)) {
        const dependencyWave = waveOf.get(packageNames.get(dependency) ?? '');
        if (dependencyWave !== undefined) {
          expect(dependencyWave, `${entry.name} depends on ${dependency}`).toBeLessThan(waveOf.get(entry.name) ?? 0);
        }
      }
    }
    // The longest publishable dependency chain is four packages deep.
    expect(waves).toHaveLength(4);
    expect(publishWaves(fixture)).toEqual([['base'], ['leaf']]);
  });
});

describe('publishableClosure()', () => {
  it('closes the runtime quick start over its publishable dependencies, in wave order', () => {
    expect(publishableClosure(live, ['esbuild', 'replicad'])).toEqual([
      'runtime',
      'esbuild',
      'geometry-core',
      'occt-core',
      'replicad',
    ]);
  });

  it('includes the requested project itself and is idempotent under duplicates', () => {
    expect(publishableClosure(fixture, ['leaf'])).toEqual(['base', 'leaf']);
    expect(publishableClosure(fixture, ['leaf', 'leaf', 'base'])).toEqual(['base', 'leaf']);
    // A name that is not publishable carries no edges and drops out of the result.
    expect(publishableClosure(fixture, ['not-publishable'])).toEqual([]);
  });
});
