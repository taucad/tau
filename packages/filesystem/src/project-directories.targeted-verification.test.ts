// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import { createDiscoveryProfile, discoveryProfileHomeId } from '#testing/discovery-profile.js';
import type { DiscoveryProfile, DiscoveryProfileShape } from '#testing/discovery-profile.js';
import { ExternalChangeIngest } from '#external-change-ingest.js';
import type { ProjectDirectoryReading } from '#project-directories.js';
import type { PermanentDeleteProjectDirectoryResult, ProjectLocator } from '#mount-table.js';
import type { FileSystemProvider } from '#types.js';
import { isNotFoundError } from '#workspace-errors.js';
import { randomUuid } from '@taucad/utils/id';
import { ChangeEventBus } from '#change-event-bus.js';
import { MountTable } from '#mount-table.js';
import { ProviderRegistry } from '#provider-registry.js';
import { ResourceQueue } from '#resource-queue.js';
import { WorkspaceFileService } from '#workspace-file-service.js';
import { ProjectDirectoryIndex } from '#project-directory-index.js';
import { createMockRootHandle } from '#testing/mock-handle-factory.js';

/**
 * Targeted verification (project-library fast-path blueprint FW3) on one authority: `probe` reads known locations
 * under the id's locks and decides nothing from the index; the permanent delete answers what remains of the id under
 * the same hold of `project:<id>` as the removal, proves a surviving copy again before it removes anything when the
 * journal waived the Trash, removes the manifest before the identity and finishes a removal it finds interrupted.
 * Invariants S1, S2, S6 and S11 of the blueprint. Each test builds its own profile.
 */

const small: DiscoveryProfileShape = { home: 4, workspace: 4, duplicates: 1 };

const profiles: DiscoveryProfile[] = [];
const profileOf = async (shape: DiscoveryProfileShape = small): Promise<DiscoveryProfile> => {
  const profile = await createDiscoveryProfile(shape);
  profiles.push(profile);
  return profile;
};

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const profile of profiles.splice(0)) {
    profile.dispose();
  }
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const identity = (projectId: string): Uint8Array<ArrayBuffer> => serializeProjectIdentity({ version: 1, projectId });
const manifest = (name: string): Uint8Array<ArrayBuffer> =>
  serializeProjectManifest(
    projectToManifest({ name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } }),
  );
const unreadable = (): Error => Object.assign(new Error('The file could not be read.'), { name: 'NotReadableError' });

type Roots = Readonly<{ home: string; workspace: string; workspaceId: string }>;
const rootsOf = async (profile: DiscoveryProfile): Promise<Roots> => {
  const [home, workspace] = await profile.service.getRootStatuses();
  const scope = profile.workspaceScope;
  return {
    home: home!.storageRootKey,
    workspace: workspace!.storageRootKey,
    workspaceId: scope.backend === 'webaccess' ? scope.workspaceId : '',
  };
};
const homeAt = (roots: Roots, relativeDirectory: string): ProjectLocator => ({
  backend: 'opfs',
  storageRootKey: roots.home,
  relativeDirectory,
});
const workspaceAt = (roots: Roots, relativeDirectory: string): ProjectLocator => ({
  backend: 'webaccess',
  storageRootKey: roots.workspace,
  relativeDirectory,
  workspaceId: roots.workspaceId,
});

/** Make one root read as not available, as a lost folder does. */
const loseRoot = (storageRootKey: string): void => {
  const { rootState } = ExternalChangeIngest.prototype;
  vi.spyOn(ExternalChangeIngest.prototype, 'rootState').mockImplementation(function (
    this: ExternalChangeIngest,
    key: string,
  ) {
    return key === storageRootKey ? 'notFound' : rootState.call(this, key);
  });
};

/**
 * What a from-scratch read of a root says each child directory carries, read straight from its provider: the identity
 * record's id, or undefined. The authority's index and caches play no part.
 */
const carriedIds = async (provider: FileSystemProvider): Promise<Map<string, string | undefined>> => {
  await provider.refresh?.();
  const carried = new Map<string, string | undefined>();
  for (const name of await provider.readdir('')) {
    if (name.startsWith('.')) {
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- A from-scratch read, one directory at a time.
      const bytes = await provider.readFile(`${name}/${projectIdentityPath}`);
      carried.set(name, (JSON.parse(new TextDecoder().decode(bytes)) as { projectId: string }).projectId);
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
      carried.set(name, undefined);
    }
  }
  return carried;
};
const directoriesCarrying = async (profile: DiscoveryProfile, projectId: string): Promise<string[]> => {
  const found: string[] = [];
  for (const [root, provider] of [
    ['home', profile.providers.home],
    ['workspace', profile.providers.workspace],
  ] as const) {
    // oxlint-disable-next-line no-await-in-loop -- Roots read one after another.
    for (const [name, id] of await carriedIds(provider)) {
      if (id === projectId) {
        found.push(`${root}:${name}`);
      }
    }
  }
  return found.toSorted();
};
const keyOfLocator = (roots: Roots, locator: ProjectLocator): string =>
  `${locator.storageRootKey === roots.home ? 'home' : 'workspace'}:${locator.relativeDirectory}`;

describe('probe: storage answers, the index only nominates (FW3, S11)', () => {
  it('should answer held, vacant or unknown for each location from the bytes read now', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const roots = await rootsOf(profile);
    const projectId = discoveryProfileHomeId(0);
    await profile.writeBehind('home', 'home-003/tau.json', new TextEncoder().encode('not json'));
    const { readFile } = profile.providers.workspace;
    vi.spyOn(profile.providers.workspace, 'readFile').mockImplementation(async function (
      this: unknown,
      path: string,
      ...rest: unknown[]
    ) {
      if (path.startsWith('folder-000/')) {
        throw unreadable();
      }
      return Reflect.apply(readFile, this, [path, ...rest]) as Promise<Uint8Array<ArrayBuffer>>;
    } as typeof readFile);

    const { locations } = await profile.service.probeProjectDirectories({
      projectId,
      locators: [
        homeAt(roots, 'home-000'),
        workspaceAt(roots, 'copy-000'),
        homeAt(roots, 'home-001'),
        homeAt(roots, 'never-was'),
        homeAt(roots, 'home-003'),
        workspaceAt(roots, 'folder-000'),
      ],
    });

    expect(locations.map(({ locator, status }) => [locator.relativeDirectory, status])).toEqual([
      ['home-000', 'held'],
      ['copy-000', 'held'],
      ['home-001', 'vacant'],
      ['never-was', 'vacant'],
      ['home-003', 'vacant'],
      ['folder-000', 'unknown'],
    ]);
  });

  it('should answer unknown for a location in a root that is not available, and read nothing there', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const roots = await rootsOf(profile);
    loseRoot(roots.workspace);

    const { result, cost } = await profile.measure(async () =>
      profile.service.probeProjectDirectories({
        projectId: discoveryProfileHomeId(0),
        locators: [workspaceAt(roots, 'copy-000')],
      }),
    );

    expect(result.locations).toEqual([{ locator: workspaceAt(roots, 'copy-000'), status: 'unknown' }]);
    expect(cost.providers.workspace.total).toBe(0);
  });

  it('should nominate what the index lists, read it, and correct the index from what it read', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const roots = await rootsOf(profile);
    const projectId = discoveryProfileHomeId(0);
    /* The index lies: it says home-002 carries the id. The disk says home-002 carries its own. */
    const lie: ProjectDirectoryReading = {
      kind: 'identified',
      projectId,
      manifest: projectToManifest({ name: 'lie', description: '', tags: [], assets: { main: { entryPath: 'm.ts' } } }),
    };
    profile.index.install(roots.home, 'home-002', {
      version: profile.index.version(roots.home, 'home-002'),
      reading: lie,
      determined: true,
    });
    /* And the copy it lists is gone, with no evidence. */
    await profile.removeBehind('workspace', 'copy-000');

    const { locations } = await profile.service.probeProjectDirectories({ projectId, known: true });

    expect(Object.fromEntries(locations.map(({ locator, status }) => [locator.relativeDirectory, status]))).toEqual({
      'home-000': 'held',
      'home-002': 'vacant',
      'copy-000': 'vacant',
    });
    /* What it read is evidence: both contradicted entries are read again by the next pass. */
    expect(profile.index.view(roots.home)?.dirty).toContain('home-002');
    expect(profile.index.view(roots.workspace)?.dirty).toContain('copy-000');
    const { entries } = await profile.service.listProjectManifests();
    expect(
      entries
        .filter((entry) => 'projectId' in entry && entry.projectId === projectId)
        .map((entry) => entry.locator.relativeDirectory),
    ).toEqual(['home-000']);
  });

  it("should list a root's child names afresh, plain folders and files included, and none for a root away", async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const roots = await rootsOf(profile);
    await profile.writeBehind('home', 'plain-folder/notes.txt', new TextEncoder().encode('x'));
    await profile.writeBehind('home', 'loose-file.txt', new TextEncoder().encode('x'));

    const { names } = await profile.service.probeProjectDirectories({ root: roots.home });
    loseRoot(roots.workspace);
    const away = await profile.service.probeProjectDirectories({ root: roots.workspace });

    expect(names).toEqual(['home-000', 'home-001', 'home-002', 'home-003', 'loose-file.txt', 'plain-folder']);
    expect(away).toEqual({ locations: [] });
  });
});

describe('the permanent delete answers what remains under its lock (FW3, step 5)', () => {
  /* S1: identity is re-read under the locks; the index plays no part. */
  it('should remove nothing when the index says the id is at the target and the disk says another', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const roots = await rootsOf(profile);
    const projectId = discoveryProfileHomeId(0);
    const lie: ProjectDirectoryReading = {
      kind: 'identified',
      projectId,
      manifest: projectToManifest({ name: 'x', description: '', tags: [], assets: { main: { entryPath: 'm.ts' } } }),
    };
    profile.index.install(roots.home, 'home-001', {
      version: profile.index.version(roots.home, 'home-001'),
      reading: lie,
      determined: true,
    });

    await expect(
      profile.service.permanentlyDeleteProjectDirectory({
        projectId,
        providerBasePath: 'home-001',
        scope: { backend: 'opfs' },
        copy: true,
      }),
    ).resolves.toEqual({ status: 'identity-mismatch', actualProjectId: discoveryProfileHomeId(1) });
    expect(await directoriesCarrying(profile, discoveryProfileHomeId(1))).toEqual(['home:home-001']);
  });

  it('should refuse a copy delete, removing nothing, when the copy that waived the Trash is gone', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    /* Another tab deleted the Home copy after this tab's proof; the index has not heard. */
    await profile.removeBehind('home', 'home-000');

    await expect(
      profile.service.permanentlyDeleteProjectDirectory({
        projectId: discoveryProfileHomeId(0),
        providerBasePath: 'copy-000',
        scope: profile.workspaceScope,
        copy: true,
      }),
    ).resolves.toEqual({ status: 'copy-unproven', reason: 'absent' });
    expect(await directoriesCarrying(profile, discoveryProfileHomeId(0))).toEqual(['workspace:copy-000']);
  });

  it('should refuse a copy delete as unknown when the other copy is in a root that is away', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const roots = await rootsOf(profile);
    loseRoot(roots.home);

    await expect(
      profile.service.permanentlyDeleteProjectDirectory({
        projectId: discoveryProfileHomeId(0),
        providerBasePath: 'copy-000',
        scope: profile.workspaceScope,
        copy: true,
      }),
    ).resolves.toEqual({ status: 'copy-unproven', reason: 'unknown' });
    expect(await directoriesCarrying(profile, discoveryProfileHomeId(0))).toEqual([
      'home:home-000',
      'workspace:copy-000',
    ]);
  });

  /* After a reload the index is empty: the sweep finds the copy, and a probe proves it, so a replay needs available
   * roots and not a warm index (blueprint, step 5). */
  it('should prove the surviving copy from storage when the index knows none, as after a reload', async () => {
    const profile = await profileOf();
    const roots = await rootsOf(profile);

    const { result, cost } = await profile.measure(async () =>
      profile.service.permanentlyDeleteProjectDirectory({
        projectId: discoveryProfileHomeId(0),
        providerBasePath: 'copy-000',
        scope: profile.workspaceScope,
        copy: true,
      }),
    );

    expect(result).toEqual({ status: 'deleted', remaining: [homeAt(roots, 'home-000')] });
    expect(cost.counters).toMatchObject({ 'discovery.identitySweep': 1, 'discovery.probe': 1 });
  });

  it('should answer remaining from the probes, or the sweep when none holds the id, and unknown when one could not be read', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const roots = await rootsOf(profile);

    /* A sole copy: no known location, the sweep says absent. */
    await expect(
      profile.service.permanentlyDeleteProjectDirectory({
        projectId: discoveryProfileHomeId(2),
        providerBasePath: 'home-002',
        scope: { backend: 'opfs' },
      }),
    ).resolves.toEqual({ status: 'deleted', remaining: [], absence: 'absent' });

    /* A copy the index does not list, found by the sweep. */
    await profile.writeBehind('workspace', 'stray/tau.json', manifest('Stray'));
    await profile.writeBehind('workspace', `stray/${projectIdentityPath}`, identity(discoveryProfileHomeId(3)));
    await expect(
      profile.service.permanentlyDeleteProjectDirectory({
        projectId: discoveryProfileHomeId(3),
        providerBasePath: 'home-003',
        scope: { backend: 'opfs' },
      }),
    ).resolves.toEqual({ status: 'deleted', remaining: [workspaceAt(roots, 'stray')] });

    /* The known copy cannot be read: proof of nothing either way. */
    const { readFile } = profile.providers.workspace;
    vi.spyOn(profile.providers.workspace, 'readFile').mockImplementation(async function (
      this: unknown,
      path: string,
      ...rest: unknown[]
    ) {
      if (path.startsWith('copy-000/')) {
        throw unreadable();
      }
      return Reflect.apply(readFile, this, [path, ...rest]) as Promise<Uint8Array<ArrayBuffer>>;
    } as typeof readFile);
    await expect(
      profile.service.permanentlyDeleteProjectDirectory({
        projectId: discoveryProfileHomeId(0),
        providerBasePath: 'home-000',
        scope: { backend: 'opfs' },
      }),
    ).resolves.toEqual({ status: 'deleted', remaining: [], absence: 'unknown' });
  });

  it('should take the manifest before the identity record, and the identity record last of the two', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const unlinked: string[] = [];
    const { unlink } = profile.providers.home;
    vi.spyOn(profile.providers.home, 'unlink').mockImplementation(async function (this: unknown, path: string) {
      unlinked.push(path);
      return Reflect.apply(unlink, this, [path]);
    } as typeof unlink);
    await profile.writeBehind('home', 'home-002/main.ts', new TextEncoder().encode('export {};'));

    await profile.service.permanentlyDeleteProjectDirectory({
      projectId: discoveryProfileHomeId(2),
      providerBasePath: 'home-002',
      scope: { backend: 'opfs' },
    });

    expect(unlinked.slice(-2)).toEqual(['home-002/tau.json', `home-002/${projectIdentityPath}`]);
  });
});

/* S4, the interrupted removal: every state a removal can be cut short in, and the replay that finishes it. */
describe('the replay of an interrupted removal (FW3)', () => {
  const projectId = discoveryProfileHomeId(2);
  const states = [
    {
      name: 'part of the contents removed, both markers left',
      write: async (profile: DiscoveryProfile) => {
        await profile.writeBehind('home', 'home-002/src/kept.ts', new TextEncoder().encode('x'));
      },
      remove: [] as string[],
      status: 'deleted',
    },
    {
      name: 'the manifest removed, the identity record left',
      write: async () => undefined,
      remove: ['home-002/tau.json'],
      status: 'deleted',
    },
    {
      name: 'both markers removed, the state directory left',
      write: async () => undefined,
      remove: ['home-002/tau.json', `home-002/${projectIdentityPath}`],
      status: 'deleted',
    },
    {
      name: 'everything removed but the directory',
      write: async () => undefined,
      remove: ['home-002/tau.json', 'home-002/.tau'],
      status: 'deleted',
    },
    { name: 'the directory removed', write: async () => undefined, remove: ['home-002'], status: 'absent' },
  ] as const;

  it.each(states)('should finish a removal cut short with $name', async ({ write, remove, status }) => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    await write(profile);
    for (const path of remove) {
      // oxlint-disable-next-line no-await-in-loop -- The interrupted state, one entry at a time.
      await profile.removeBehind('home', path);
    }

    await expect(
      profile.service.permanentlyDeleteProjectDirectory({
        projectId,
        providerBasePath: 'home-002',
        scope: { backend: 'opfs' },
      }),
    ).resolves.toEqual({ status, remaining: [], absence: 'absent' });
    expect(await profile.providers.home.exists('home-002')).toBe(false);
  });

  it.each([
    {
      name: 'a file beside the identity record',
      write: async (profile: DiscoveryProfile) => {
        await profile.writeBehind('home', 'home-002/notes.txt', new TextEncoder().encode('keep'));
      },
    },
    {
      name: 'an identity record naming another id',
      write: async (profile: DiscoveryProfile) => {
        await profile.writeBehind('home', `home-002/${projectIdentityPath}`, identity(discoveryProfileHomeId(3)));
      },
    },
  ])('should leave a manifest-less directory holding $name alone', async ({ write }) => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    await profile.removeBehind('home', 'home-002/tau.json');
    await write(profile);

    await expect(
      profile.service.permanentlyDeleteProjectDirectory({
        projectId,
        providerBasePath: 'home-002',
        scope: { backend: 'opfs' },
      }),
    ).resolves.toEqual({ status: 'unidentifiable' });
    expect(await profile.providers.home.exists('home-002/.tau')).toBe(true);
  });
});

/** The provider calls a fault is injected at. */
const faultedMethods = ['readFile', 'readdir', 'readdirEntries', 'exists', 'unlink', 'rmdir', 'refresh'] as const;

/**
 * Make the `fault`-th provider call across both roots throw, counting from the next call (0: count only), until
 * `restore` puts the providers' own methods back.
 */
const injectFault = (
  profile: DiscoveryProfile,
  fault: number,
): Readonly<{ calls: () => number; restore: () => void }> => {
  const counter = { calls: 0 };
  const wrap = (method: (...arguments_: unknown[]) => Promise<unknown>) =>
    async function (this: unknown, ...arguments_: unknown[]): Promise<unknown> {
      counter.calls += 1;
      if (counter.calls === fault) {
        throw unreadable();
      }
      return Reflect.apply(method, this, arguments_);
    };
  const wrapped: Array<Readonly<{ provider: FileSystemProvider; name: string }>> = [];
  for (const provider of [profile.providers.home, profile.providers.workspace]) {
    for (const name of faultedMethods) {
      const method: unknown = Reflect.get(provider, name);
      if (typeof method === 'function') {
        Object.defineProperty(provider, name, {
          configurable: true,
          writable: true,
          value: wrap(method as (...arguments_: unknown[]) => Promise<unknown>),
        });
        wrapped.push({ provider, name });
      }
    }
  }
  return {
    calls: () => counter.calls,
    restore: () => {
      for (const { provider, name } of wrapped.splice(0)) {
        Reflect.deleteProperty(provider, name);
      }
    },
  };
};

/* S6: a fault at any provider call of the delete. Whatever fails, no directory is removed unless it held the id, no
 * answer claims absence or a remaining copy that a from-scratch read contradicts, and a replay finishes the delete. */
describe('a fault at each provider call of a delete (FW3, S6)', () => {
  const runs = [
    { name: 'a copy, the other copy proven', target: 'copy-000', copy: true, others: ['home:home-000'] },
    { name: 'a sole copy', target: 'home-002', copy: false, others: [] },
  ] as const;

  it.each(runs)(
    'should stay safe and replay to the end for $name',
    async ({ target, copy, others }) => {
      const scopeOf = (profile: DiscoveryProfile) =>
        target.startsWith('copy-') ? profile.workspaceScope : ({ backend: 'opfs' } as const);
      const projectId = target === 'copy-000' ? discoveryProfileHomeId(0) : discoveryProfileHomeId(2);
      const targetKey = `${target.startsWith('copy-') ? 'workspace' : 'home'}:${target}`;
      /* How many provider calls a delete makes with no fault. */
      const baseline = await profileOf();
      await baseline.service.listProjectManifests();
      const counted = injectFault(baseline, 0);
      await baseline.service.permanentlyDeleteProjectDirectory({
        projectId,
        providerBasePath: target,
        scope: scopeOf(baseline),
        copy,
      });
      const total = counted.calls();
      counted.restore();
      expect(total).toBeGreaterThan(5);

      for (let fault = 1; fault <= total; fault += 1) {
        // oxlint-disable-next-line no-await-in-loop -- One fresh profile per injected fault.
        const profile = await createDiscoveryProfile(small);
        let injected: ReturnType<typeof injectFault> | undefined;
        try {
          // oxlint-disable-next-line no-await-in-loop -- Setup.
          await profile.service.listProjectManifests();
          // oxlint-disable-next-line no-await-in-loop -- Setup.
          const roots = await rootsOf(profile);
          injected = injectFault(profile, fault);
          let result: PermanentDeleteProjectDirectoryResult | undefined;
          try {
            // oxlint-disable-next-line no-await-in-loop -- The faulted delete.
            result = await profile.service.permanentlyDeleteProjectDirectory({
              projectId,
              providerBasePath: target,
              scope: scopeOf(profile),
              copy,
            });
          } catch {
            result = undefined;
          }
          injected.restore();
          // oxlint-disable-next-line no-await-in-loop -- A from-scratch read.
          const carrying = await directoriesCarrying(profile, projectId);
          const report = `fault ${fault} of ${total}: ${JSON.stringify(result)}; carrying ${JSON.stringify(carrying)}`;
          /* Nothing but the target is ever removed. */
          expect(
            carrying.filter((key) => key !== targetKey),
            report,
          ).toEqual([...others]);
          if (result?.status === 'deleted' || result?.status === 'absent') {
            for (const locator of result.remaining ?? []) {
              expect(carrying, report).toContain(keyOfLocator(roots, locator));
            }
            if (result.absence === 'absent') {
              expect(carrying, report).toEqual([]);
            }
            expect(result.remaining?.length !== 0 || result.absence !== undefined, report).toBe(true);
          }
          if (result?.status === 'copy-unproven') {
            expect(carrying, report).toContain(targetKey);
          }
          /* The replay, healthy, finishes it. */
          // oxlint-disable-next-line no-await-in-loop -- The replay.
          const replay = await profile.service.permanentlyDeleteProjectDirectory({
            projectId,
            providerBasePath: target,
            scope: scopeOf(profile),
            copy,
          });
          // oxlint-disable-next-line no-await-in-loop -- A from-scratch read.
          expect(await directoriesCarrying(profile, projectId), report).toEqual([...others]);
          expect(['deleted', 'absent'], report).toContain(replay.status);
          expect(
            replay.status === 'deleted' || replay.status === 'absent'
              ? (replay.remaining ?? []).map((locator) => keyOfLocator(roots, locator))
              : undefined,
            report,
          ).toEqual([...others]);
        } finally {
          injected?.restore();
          profile.dispose();
        }
      }
    },
    120_000,
  );
});

/*
 * S2 and S11 as a property: for generated folder states (which directories carry the id, across both roots, with
 * copies the index has not heard of) and arbitrary index contents, a delete drops the id's device state (`absent`) only
 * when a from-scratch read finds no directory carrying it, names as remaining only directories that hold it, removes the
 * target only when it held the id, and with `copy` removes nothing unless another copy holds the id afterwards.
 */
describe('what remains, whatever the index holds (FW3, S2 property)', () => {
  it('should answer from storage for any folder state and any index', async () => {
    const projectId = discoveryProfileHomeId(0);
    const other = discoveryProfileHomeId(1);
    const homeDirectories = ['home-000', 'home-001', 'home-002'];
    const workspaceDirectories = ['copy-000', 'folder-000', 'folder-001'];
    const carrier = fc.constantFrom<'id' | 'other' | 'none'>('id', 'other', 'none');
    const reading = fc.oneof(
      fc.constant<ProjectDirectoryReading | undefined>(undefined),
      fc.constant<ProjectDirectoryReading>({ kind: 'not-a-project' }),
      fc.constantFrom(projectId, other).map(
        (id): ProjectDirectoryReading => ({
          kind: 'identified',
          projectId: id,
          manifest: projectToManifest({
            name: 'x',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'm.ts' } },
          }),
        }),
      ),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          home: fc.array(carrier, { minLength: 3, maxLength: 3 }),
          workspace: fc.array(carrier, { minLength: 3, maxLength: 3 }),
          indexedHome: fc.array(reading, { minLength: 3, maxLength: 3 }),
          indexedWorkspace: fc.array(reading, { minLength: 3, maxLength: 3 }),
          target: fc.nat({ max: 5 }),
          copy: fc.boolean(),
          route: fc.option(fc.nat({ max: 5 }), { nil: undefined }),
        }),
        async ({ home, workspace, indexedHome, indexedWorkspace, target, copy, route }) => {
          const profile = await createDiscoveryProfile({ home: 3, workspace: 3, duplicates: 1 });
          try {
            await profile.service.listProjectManifests();
            const roots = await rootsOf(profile);
            type Place = Readonly<{ root: 'home' | 'workspace'; name: string; locator: ProjectLocator }>;
            const all: Place[] = [
              ...homeDirectories.map((name): Place => ({ root: 'home', name, locator: homeAt(roots, name) })),
              ...workspaceDirectories.map(
                (name): Place => ({ root: 'workspace', name, locator: workspaceAt(roots, name) }),
              ),
            ];
            const carriers = [...home, ...workspace];
            for (const [index, { root, name }] of all.entries()) {
              const carried = carriers[index];
              // oxlint-disable-next-line no-await-in-loop -- Fixture setup, one directory at a time.
              await (carried === 'none'
                ? profile.removeBehind(root, `${name}/.tau`)
                : profile.writeBehind(
                    root,
                    `${name}/${projectIdentityPath}`,
                    identity(carried === 'id' ? projectId : other),
                  ));
            }
            for (const [index, { root, name }] of all.entries()) {
              const indexed = [...indexedHome, ...indexedWorkspace][index];
              const key = root === 'home' ? roots.home : roots.workspace;
              if (indexed !== undefined) {
                profile.index.install(key, name, {
                  version: profile.index.version(key, name),
                  reading: indexed,
                  determined: true,
                });
              }
            }
            const chosen = all[target]!;
            const before = await directoriesCarrying(profile, projectId);

            const result = await profile.service.permanentlyDeleteProjectDirectory({
              projectId,
              providerBasePath: chosen.name,
              scope: chosen.root === 'home' ? { backend: 'opfs' } : profile.workspaceScope,
              ...(copy ? { copy: true } : {}),
              ...(route === undefined ? {} : { locations: [all[route]!.locator] }),
            });

            const after = await directoriesCarrying(profile, projectId);
            const chosenKey = `${chosen.root}:${chosen.name}`;
            const report = `${JSON.stringify(result)} before ${JSON.stringify(before)} after ${JSON.stringify(after)}`;
            /* No directory but the target is removed, and the target only while it held the id. */
            expect(after, report).toEqual(
              carriers[target] === 'id' && result.status === 'deleted'
                ? before.filter((key) => key !== chosenKey)
                : before,
            );
            if (result.status === 'deleted' || result.status === 'absent') {
              /* Device state is dropped only when a from-scratch read finds no copy. */
              if (result.absence === 'absent') {
                expect(after, report).toEqual([]);
              }
              /* Every remaining copy holds the id. */
              for (const locator of result.remaining ?? []) {
                expect(after, report).toContain(keyOfLocator(roots, locator));
              }
              /* An empty answer is never silent: it says absent or unknown. */
              expect((result.remaining ?? []).length > 0 || result.absence !== undefined, report).toBe(true);
              /* With the Trash waived, a copy survives any delete that removed something. */
              if (copy && result.status === 'deleted') {
                expect(after.length, report).toBeGreaterThan(0);
              }
            }
            if (result.status === 'copy-unproven') {
              expect(before, report).toEqual([chosenKey]);
            }
          } finally {
            profile.dispose();
          }
        },
      ),
      { numRuns: 30, seed: 726_905_399 },
    );
  }, 180_000);
});

/**
 * Two tabs, each its own authority, over one Home in OPFS with a project id in two directories and nowhere else, and
 * Web Locks that exclude across them as the browser's do. Each tab deletes one of the two copies as the library does:
 * probe the other copy, then delete with `copy` only when the probe proved it (without `copy` the journal asks for the
 * Trash, and this project is not in it, so the delete never reaches the authority).
 */
describe('two tabs deleting the last two copies at once (FW3, copy proof held through the journal)', () => {
  const projectId = discoveryProfileHomeId(7);
  type Step = 'aProbe' | 'aDelete' | 'bProbe' | 'bDelete';
  const orders: ReadonlyArray<readonly Step[]> = [
    ['aProbe', 'aDelete', 'bProbe', 'bDelete'],
    ['aProbe', 'bProbe', 'aDelete', 'bDelete'],
    ['aProbe', 'bProbe', 'bDelete', 'aDelete'],
    ['bProbe', 'aProbe', 'aDelete', 'bDelete'],
    ['bProbe', 'aProbe', 'bDelete', 'aDelete'],
    ['bProbe', 'bDelete', 'aProbe', 'aDelete'],
  ];

  /** Exclusive Web Locks shared by both tabs, granted in request order per name. */
  const sharedLocks = (): Readonly<{
    request: (name: string, options: unknown, grant: () => Promise<unknown>) => Promise<unknown>;
    query: () => Promise<unknown>;
  }> => {
    const tails = new Map<string, Promise<void>>();
    return {
      request: async (name, _options, grant) => {
        const previous = tails.get(name) ?? Promise.resolve();
        const released = Promise.withResolvers<void>();
        const tail = (async (): Promise<void> => {
          await previous;
          await released.promise;
        })();
        tails.set(name, tail);
        await previous;
        try {
          return await grant();
        } finally {
          released.resolve();
          if (tails.get(name) === tail) {
            tails.delete(name);
          }
        }
      },
      query: async () => ({ held: [], pending: [] }),
    };
  };

  type Tab = Readonly<{ service: WorkspaceFileService; own: string; other: string }> & {
    copy: boolean;
    outcome: string;
  };

  const twoTabs = async (): Promise<Readonly<{ a: Tab; b: Tab; home: ReturnType<typeof createMockRootHandle> }>> => {
    const home = createMockRootHandle();
    for (const name of ['copy-a', 'copy-b', 'other']) {
      const id = name === 'other' ? discoveryProfileHomeId(8) : projectId;
      // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
      const directory = await home.getDirectoryHandle(name, { create: true });
      for (const [path, bytes] of [
        ['tau.json', manifest(name)],
        [projectIdentityPath, identity(id)],
      ] as const) {
        const slash = path.indexOf('/');
        const holder =
          slash === -1
            ? directory
            : // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
              await directory.getDirectoryHandle(path.slice(0, slash), { create: true });
        // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
        const handle = await holder.getFileHandle(path.slice(slash + 1), { create: true });
        // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
        const writable = await handle.createWritable();
        // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
        await writable.write(bytes);
        // oxlint-disable-next-line no-await-in-loop -- Fixture setup.
        await writable.close();
      }
    }
    vi.stubGlobal('FileSystemObserver', undefined);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => home }, locks: sharedLocks() });
    const databasePrefix = `tau-two-tab-delete-${randomUuid()}`;
    const tab = async (own: string, other: string): Promise<Tab> => {
      const registry = new ProviderRegistry({ databasePrefix });
      const rootKey = `memory:two-tab-${randomUuid()}`;
      const mountTable = new MountTable();
      mountTable.mount('/', await registry.getProvider({ backend: 'memory', storageRootKey: rootKey }), {
        class: 'authored',
        backend: 'memory',
        storageRootKey: rootKey,
      });
      const service = new WorkspaceFileService({
        providerRegistry: registry,
        resourceQueue: new ResourceQueue(),
        eventBus: new ChangeEventBus(),
        mountTable,
        discoveryIndex: new ProjectDirectoryIndex<ProjectDirectoryReading>(),
      });
      await service.configureProjectRoots({
        projects: [{ backend: 'opfs', projectId, providerBasePath: 'copy-a' }],
        roots: [{ backend: 'opfs' }],
      });
      await service.listProjectManifests();
      disposers.push(() => {
        service.dispose();
      });
      return { service, own, other, copy: false, outcome: 'not-run' };
    };
    return { a: await tab('copy-a', 'copy-b'), b: await tab('copy-b', 'copy-a'), home };
  };

  it.each([
    ...orders.map((order) => ({ order: order.join(' → '), steps: order })),
    { order: 'all at once', steps: [] },
  ])('should leave one copy, or ask for the Trash, when they interleave as $order', async ({ steps }) => {
    const { a, b, home } = await twoTabs();
    const [root] = await a.service.getRootStatuses();
    const homeKey = root!.storageRootKey;
    const probe = async (tab: Tab): Promise<void> => {
      const { locations } = await tab.service.probeProjectDirectories({
        projectId,
        locators: [{ backend: 'opfs', storageRootKey: homeKey, relativeDirectory: tab.other }],
        known: true,
        except: { storageRootKey: homeKey, relativeDirectory: tab.own },
      });
      tab.copy = locations.some((location) => location.status === 'held');
    };
    const remove = async (tab: Tab): Promise<void> => {
      if (!tab.copy) {
        tab.outcome = 'trash-required';
        return;
      }
      const result = await tab.service.permanentlyDeleteProjectDirectory({
        projectId,
        providerBasePath: tab.own,
        scope: { backend: 'opfs' },
        copy: true,
      });
      tab.outcome = result.status;
    };
    if (steps.length === 0) {
      await Promise.all(
        [a, b].map(async (tab) => {
          await probe(tab);
          await remove(tab);
        }),
      );
    } else {
      for (const step of steps) {
        const tab = step.startsWith('a') ? a : b;
        // oxlint-disable-next-line no-await-in-loop -- The interleaving is the test.
        await (step.endsWith('Probe') ? probe(tab) : remove(tab));
      }
    }

    const left: string[] = [];
    for await (const [name] of home.entries()) {
      left.push(name);
    }
    const survivor = left.find((name) => name === 'copy-a' || name === 'copy-b');
    expect(left.filter((name) => name.startsWith('copy-'))).toHaveLength(1);
    const [kept, deleted] = survivor === 'copy-a' ? [a, b] : [b, a];
    expect(deleted.outcome).toBe('deleted');
    expect(['copy-unproven', 'trash-required']).toContain(kept.outcome);
    expect(left).toContain('other');
  });
});
