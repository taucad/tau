import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { run } from './commands.ts';
import {
  findRoot,
  forkRepo,
  mutateCatalog,
  readManifest,
  removeRepo,
  repoPath,
  resolveGroups,
  resolveRepos,
  setRepoDescription,
  unforkRepo,
  type PrivateCatalog,
  type PublicCatalog,
} from './lib.ts';

vi.mock('node:child_process', () => ({ execSync: vi.fn(() => '') }));

const roots: string[] = [];

const publicCatalog = (): PublicCatalog => ({
  version: 1,
  repos_dir: 'repos',
  owner: 'taucad',
  groups: {
    'public-maintenance': { description: 'Public sources', repos: ['public-source', 'shared-source'] },
  },
  repos: {
    'public-source': { upstream: 'example/public-source', description: 'Public' },
    'shared-source': { upstream: 'example/shared-source', path: 'shared/source' },
  },
});

const privateCatalog = (): PrivateCatalog => ({
  version: 1,
  groups: {
    research: { description: 'Private research', repos: ['shared-source', 'private-source'] },
  },
  repos: {
    'private-source': { upstream: 'example/private-source', description: 'Private' },
  },
});

const writeYaml = (path: string, value: unknown): void => {
  writeFileSync(path, yamlDump(value, { lineWidth: -1, noRefs: true }), 'utf8');
};

const makeRoot = (options: { private?: unknown; public?: unknown } = {}): string => {
  const root = mkdtempSync(join(tmpdir(), 'tau-repos-test-'));
  roots.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@taucad/tau-source' }), 'utf8');
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n', 'utf8');
  writeYaml(join(root, 'repos.yaml'), options.public ?? publicCatalog());
  if (options.private !== undefined) {
    mkdirSync(join(root, 'repos', 'tau-brain'), { recursive: true });
    writeYaml(join(root, 'repos', 'tau-brain', 'repos.yaml'), options.private);
  }

  return root;
};

const readYaml = <T>(path: string): T => yamlLoad(readFileSync(path, 'utf8')) as T;

afterEach(() => {
  delete process.env['TAU_ROOT'];
  vi.restoreAllMocks();
  while (roots.length > 0) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

describe('workspace root discovery', () => {
  it('finds Tau from packages, dependency clones, and the nested Brain checkout', () => {
    const root = makeRoot({ private: privateCatalog() });
    const nested = [
      join(root, 'packages', 'runtime'),
      join(root, 'repos', 'dependency', 'src'),
      join(root, 'repos', 'tau-brain', 'research'),
    ];
    for (const directory of nested) {
      mkdirSync(directory, { recursive: true });
      expect(findRoot(directory)).toBe(root);
    }
  });

  it('validates TAU_ROOT instead of falling back to a nearby repos.yaml', () => {
    const root = makeRoot();
    const invalid = mkdtempSync(join(tmpdir(), 'not-tau-'));
    roots.push(invalid);
    writeFileSync(join(invalid, 'repos.yaml'), 'version: 1\n', 'utf8');
    process.env['TAU_ROOT'] = invalid;
    expect(() => findRoot(join(root, 'packages'))).toThrow(/TAU_ROOT does not identify/);
  });
});

describe('catalog loading and provenance', () => {
  it('uses public-only mode without Brain and requires Brain for private mode', () => {
    const root = makeRoot();
    const state = readManifest(root);
    expect(Object.keys(state.manifest.repos)).toEqual(['public-source', 'shared-source']);
    expect(state.repoCatalogs).toEqual({ 'public-source': 'public', 'shared-source': 'public' });
    expect(() => readManifest(root, 'private')).toThrow(/Authorized setup/);
  });

  it('merges catalogs, resolves private groups through public repos, and retains ownership', () => {
    const root = makeRoot({ private: privateCatalog() });
    const state = readManifest(root);
    expect(Object.keys(state.manifest.repos)).toEqual(['public-source', 'shared-source', 'private-source']);
    expect(state.repoCatalogs['private-source']).toBe('private');
    expect(state.groupCatalogs['research']).toBe('private');
    expect(
      repoPath({
        name: 'shared-source',
        repo: state.manifest.repos['shared-source']!,
        manifest: state.manifest,
        root,
      }),
    ).toBe(join(root, 'repos', 'shared', 'source'));
    expect(resolveRepos(state, { filter: { group: 'research' }, catalog: 'private' }).map(([name]) => name)).toEqual([
      'private-source',
    ]);
    expect(resolveRepos(state, { filter: { group: 'research' }, catalog: 'all' }).map(([name]) => name)).toEqual([
      'shared-source',
      'private-source',
    ]);
    expect(resolveGroups(state, 'private').map(([name]) => name)).toEqual(['research']);
  });

  it('keeps public recovery available when a present private catalog is malformed', () => {
    const root = makeRoot({ private: { version: 1, groups: [], repos: {} } });
    expect(Object.keys(readManifest(root, 'public').manifest.repos)).toEqual(['public-source', 'shared-source']);
    expect(() => readManifest(root)).toThrow(/private catalog.groups must be a mapping/);
  });
});

describe('strict validation', () => {
  it.each([
    ['unsupported version', { ...publicCatalog(), version: 2 }, undefined, /version must be 1/],
    ['unknown public field', { ...publicCatalog(), surprise: true }, undefined, /unsupported field/],
    [
      'unknown repo field',
      { ...publicCatalog(), repos: { bad: { upstream: 'example/bad', surprise: true } } },
      undefined,
      /unsupported field/,
    ],
    [
      'path escape',
      { ...publicCatalog(), groups: {}, repos: { bad: { upstream: 'example/bad', path: '../outside' } } },
      undefined,
      /escapes repos/,
    ],
    [
      'path collision',
      {
        ...publicCatalog(),
        groups: {},
        repos: { one: { upstream: 'example/one', path: 'same' }, two: { upstream: 'example/two', path: 'same' } },
      },
      undefined,
      /same clone path/,
    ],
    [
      'public dangling reference',
      { ...publicCatalog(), groups: { public: { repos: ['missing'] } } },
      undefined,
      /references non-public repos/,
    ],
    ['private root settings', publicCatalog(), { ...privateCatalog(), owner: 'private' }, /unsupported field/],
    [
      'duplicate repo across catalogs',
      publicCatalog(),
      { ...privateCatalog(), repos: { 'public-source': { upstream: 'other/source' } } },
      /Repo definitions collide/,
    ],
    [
      'duplicate group across catalogs',
      publicCatalog(),
      { ...privateCatalog(), groups: { 'public-maintenance': { repos: ['private-source'] } } },
      /Group definitions collide/,
    ],
    [
      'private dangling reference',
      publicCatalog(),
      { ...privateCatalog(), groups: { research: { repos: ['missing'] } } },
      /references missing repos/,
    ],
    [
      'forbidden self definition',
      { ...publicCatalog(), repos: { ...publicCatalog().repos, 'tau-brain': { upstream: 'taucad/tau-brain' } } },
      undefined,
      /cannot manage itself/,
    ],
    [
      'forbidden brain group',
      { ...publicCatalog(), groups: { brain: { repos: [] } } },
      undefined,
      /Group "brain" is forbidden/,
    ],
  ])('rejects %s', (_name, publicValue, privateValue, expected) => {
    const root = makeRoot({ public: publicValue, ...(privateValue && { private: privateValue }) });
    expect(() => readManifest(root)).toThrow(expected as RegExp);
  });
});

describe('owner-routed atomic mutations', () => {
  it('changes only the selected catalog and validates before writing', () => {
    const root = makeRoot({ private: privateCatalog() });
    const publicPath = join(root, 'repos.yaml');
    const privatePath = join(root, 'repos', 'tau-brain', 'repos.yaml');
    const publicBefore = readFileSync(publicPath, 'utf8');
    const privateBefore = readFileSync(privatePath, 'utf8');
    const state = readManifest(root);

    mutateCatalog(state, 'private', (catalog) => {
      catalog.repos['new-private'] = { upstream: 'example/new-private' };
    });
    expect(readFileSync(publicPath, 'utf8')).toBe(publicBefore);
    expect(readFileSync(privatePath, 'utf8')).not.toBe(privateBefore);

    const beforeFailure = readFileSync(privatePath, 'utf8');
    expect(() =>
      mutateCatalog(readManifest(root), 'private', (catalog) => {
        catalog.repos['bad-path'] = { upstream: 'example/bad', path: '../bad' };
      }),
    ).toThrow(/escapes repos/);
    expect(readFileSync(privatePath, 'utf8')).toBe(beforeFailure);
  });

  it('rejects removal while another catalog owns a referencing group', () => {
    const root = makeRoot({ private: privateCatalog() });
    const publicPath = join(root, 'repos.yaml');
    const privatePath = join(root, 'repos', 'tau-brain', 'repos.yaml');
    const before = [readFileSync(publicPath, 'utf8'), readFileSync(privatePath, 'utf8')];
    expect(() => removeRepo(readManifest(root), 'shared-source')).toThrow(/private group references remain: research/);
    expect([readFileSync(publicPath, 'utf8'), readFileSync(privatePath, 'utf8')]).toEqual(before);
  });

  it('routes description, fork, unfork, and same-owner removal writes to the definition owner', () => {
    const root = makeRoot({ private: privateCatalog() });
    const publicPath = join(root, 'repos.yaml');
    const privatePath = join(root, 'repos', 'tau-brain', 'repos.yaml');
    const publicBefore = readFileSync(publicPath, 'utf8');

    setRepoDescription(readManifest(root), 'private-source', 'Hydrated');
    expect(readYaml<PrivateCatalog>(privatePath).repos['private-source']?.description).toBe('Hydrated');
    expect(readFileSync(publicPath, 'utf8')).toBe(publicBefore);

    expect(forkRepo(readManifest(root), 'private-source').ok).toBe(true);
    expect(readYaml<PrivateCatalog>(privatePath).repos['private-source']?.fork).toBe('taucad/private-source');
    expect(unforkRepo(readManifest(root), 'private-source').ok).toBe(true);
    expect(readYaml<PrivateCatalog>(privatePath).repos['private-source']?.fork).toBeUndefined();
    expect(readFileSync(publicPath, 'utf8')).toBe(publicBefore);

    removeRepo(readManifest(root), 'private-source');
    const privateAfter = readYaml<PrivateCatalog>(privatePath);
    expect(privateAfter.repos['private-source']).toBeUndefined();
    expect(privateAfter.groups['research']?.repos).toEqual(['shared-source']);
    expect(readFileSync(publicPath, 'utf8')).toBe(publicBefore);
  });
});

describe('catalog-aware commands', () => {
  it('defaults add to private and requires an explicit public publication target', () => {
    const root = makeRoot({ private: privateCatalog() });
    process.env['TAU_ROOT'] = root;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const publicPath = join(root, 'repos.yaml');
    const privatePath = join(root, 'repos', 'tau-brain', 'repos.yaml');
    const publicBefore = readFileSync(publicPath, 'utf8');

    run(['add', 'example/private-added', '-g', 'research', '-d', 'Private added']);
    expect(readFileSync(publicPath, 'utf8')).toBe(publicBefore);
    expect(readYaml<PrivateCatalog>(privatePath).repos['private-added']?.upstream).toBe('example/private-added');

    const privateBefore = readFileSync(privatePath, 'utf8');
    run(['add', 'example/public-added', '--catalog', 'public', '-g', 'public-maintenance', '-d', 'Public added']);
    expect(readFileSync(privatePath, 'utf8')).toBe(privateBefore);
    expect(readYaml<PublicCatalog>(publicPath).repos['public-added']?.upstream).toBe('example/public-added');
  });

  it('labels repo and group ownership in JSON and filters private members after group resolution', () => {
    const root = makeRoot({ private: privateCatalog() });
    process.env['TAU_ROOT'] = root;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    run(['list', '--catalog', 'private', '--json']);
    const privateRows = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as Array<{ name: string; catalog: string }>;
    expect(privateRows).toEqual([expect.objectContaining({ name: 'private-source', catalog: 'private' })]);

    run(['list', '--groups', '--json']);
    const groups = JSON.parse(String(log.mock.calls.at(-1)?.[0])) as Array<{
      name: string;
      catalog: string;
      repos: Array<{ name: string; catalog: string }>;
    }>;
    expect(groups.find((group) => group.name === 'research')).toEqual(
      expect.objectContaining({
        catalog: 'private',
        repos: [
          { name: 'shared-source', catalog: 'public' },
          { name: 'private-source', catalog: 'private' },
        ],
      }),
    );
  });

  it('rejects ambiguous mutation targets and missing private setup without writing public', () => {
    const root = makeRoot();
    process.env['TAU_ROOT'] = root;
    const before = readFileSync(join(root, 'repos.yaml'), 'utf8');
    expect(() => run(['add', 'example/new', '--catalog', 'all', '-d', 'No'])).toThrow(/cannot target all/);
    expect(() => run(['remove', 'public-source', '--catalog', 'public'])).toThrow(/infers the owning catalog/);
    expect(() => run(['add', 'example/new', '-d', 'No'])).toThrow(/Authorized setup/);
    expect(readFileSync(join(root, 'repos.yaml'), 'utf8')).toBe(before);
  });
});
