// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import * as fc from 'fast-check';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';
import { projectToManifest, serializeProjectManifest } from '@taucad/types';
import {
  createDiscoveryProfile,
  discoveryProfileHomeId,
  discoveryProfileWorkspaceId,
} from '#testing/discovery-profile.js';
import type { DiscoveryProfile, DiscoveryProfileShape } from '#testing/discovery-profile.js';
import { ProjectDirectoryIndex } from '#project-directory-index.js';
import { ExternalChangeIngest, racyTimestampMilliseconds } from '#external-change-ingest.js';
import { ProjectDirectories, discoveryAuditIntervalMilliseconds } from '#project-directories.js';
import type { ProjectDirectoryReading, ProjectDiscoveryEntry } from '#project-directories.js';
import { workerTimings } from '#worker-timings.js';
import type { WorkerTimingCounter } from '#worker-timings.js';
import type { FileSystemProvider } from '#types.js';

/**
 * Acceptance tests of the discovery index (project-library fast-path blueprint FW2) against the amendments of the
 * index-contract review: A1 (the index nominates, storage decides), A2 (evidence at the source, armed first, applied
 * under a version), A3 (freshness bounded by the authority), A4 (the audit) and A5 (bounds). Each test builds its own
 * profile, so no state is shared between tests in any order.
 */

const small: DiscoveryProfileShape = { home: 6, workspace: 6, duplicates: 1 };

const profiles: DiscoveryProfile[] = [];
const profileOf = async (shape: DiscoveryProfileShape = small): Promise<DiscoveryProfile> => {
  const profile = await createDiscoveryProfile(shape);
  profiles.push(profile);
  return profile;
};

afterEach(() => {
  for (const profile of profiles.splice(0)) {
    profile.dispose();
  }
  vi.restoreAllMocks();
});

const identity = (projectId: string): Uint8Array<ArrayBuffer> => serializeProjectIdentity({ version: 1, projectId });
const manifest = (name: string): Uint8Array<ArrayBuffer> =>
  serializeProjectManifest(
    projectToManifest({ name, description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } }),
  );

/** The id each listed directory carries, keyed `<backend>:<directory>`. */
const listedIds = (entries: readonly ProjectDiscoveryEntry[]): Map<string, string | undefined> =>
  new Map(
    entries.map((entry) => [
      `${entry.locator.backend}:${entry.locator.relativeDirectory}`,
      'projectId' in entry ? entry.projectId : undefined,
    ]),
  );

/** What a pass lists. */
const listedEntries = async (profile: DiscoveryProfile): Promise<readonly ProjectDiscoveryEntry[]> => {
  const { entries } = await profile.service.listProjectManifests();
  return entries;
};

const counter = (name: WorkerTimingCounter): number => workerTimings.summarize(0).counters[name]?.total ?? 0;

const homeKeyOf = async (profile: DiscoveryProfile): Promise<string> => {
  const [home] = await profile.service.getRootStatuses();
  return home!.storageRootKey;
};

/** Fire the audit timer tick by tick for `intervals` audit intervals, and report the whole cycles it ran per interval. */
const fullCyclesPerInterval = async (
  audit: MockInstance<ProjectDirectories['auditDiscovery']>,
  intervals: number,
  lateness: (tick: number) => number = () => 0,
): Promise<number[]> => {
  const perInterval: number[] = [];
  let tick = 0;
  for (let round = 0; round < intervals; round += 1) {
    const before = audit.mock.calls.filter(([share]) => share === undefined).length;
    for (let elapsed = 0; elapsed < discoveryAuditIntervalMilliseconds; elapsed += 15_000) {
      vi.setSystemTime(Date.now() + lateness(tick));
      tick += 1;
      // oxlint-disable-next-line no-await-in-loop -- One audit tick at a time, as the timer fires them.
      await vi.advanceTimersByTimeAsync(15_000);
      // oxlint-disable-next-line no-await-in-loop -- The tick's audit settles before the next.
      await vi.waitFor(() => {
        expect(audit.mock.results.every((result) => result.type !== 'incomplete')).toBe(true);
      });
    }
    perInterval.push(audit.mock.calls.filter(([share]) => share === undefined).length - before);
  }
  return perInterval;
};

describe('A1: the index nominates and storage decides', () => {
  /*
   * The property test: whatever the index holds, absence, a delete and an adopt are decided by what storage holds.
   * The folder state is generated (which directory carries which id), and the index is then replaced by arbitrary
   * contents, installed through its own API, before each decider runs.
   */
  it('should decide absence, deletes and adopt identities from storage whatever the index holds', async () => {
    const pool = [discoveryProfileHomeId(0), discoveryProfileHomeId(1), discoveryProfileHomeId(90)];
    const directories = ['home-000', 'home-001', 'home-002'];
    const readingArbitrary = fc.oneof(
      fc.constant<ProjectDirectoryReading | undefined>(undefined),
      fc.constant<ProjectDirectoryReading>({ kind: 'not-a-project' }),
      fc.constantFrom(...pool).map(
        (projectId): ProjectDirectoryReading => ({
          kind: 'identified',
          projectId,
          manifest: projectToManifest({
            name: 'x',
            description: '',
            tags: [],
            assets: { main: { entryPath: 'main.ts' } },
          }),
        }),
      ),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          onDisk: fc.array(fc.option(fc.constantFrom(...pool), { nil: undefined }), {
            minLength: directories.length,
            maxLength: directories.length,
          }),
          indexed: fc.array(readingArbitrary, { minLength: directories.length, maxLength: directories.length }),
          asked: fc.constantFrom(...pool),
          target: fc.nat({ max: directories.length - 1 }),
        }),
        async ({ onDisk, indexed, asked, target }) => {
          const profile = await createDiscoveryProfile({ home: 3, workspace: 1, duplicates: 0 });
          /* Adopt's checked identity write needs Web Locks; one tab, so a lock is granted at once. */
          vi.stubGlobal('navigator', {
            ...navigator,
            locks: {
              request: async (_name: string, _options: unknown, grant: () => Promise<unknown>) => grant(),
              query: async () => ({ held: [], pending: [] }),
            },
          });
          try {
            await profile.service.listProjectManifests();
            /* The folder state: each directory carries the generated id, or none (its identity record removed). */
            for (const [index, directory] of directories.entries()) {
              const id = onDisk[index];
              // oxlint-disable-next-line no-await-in-loop -- Fixture setup, one directory at a time.
              await (id === undefined
                ? profile.removeBehind('home', `${directory}/.tau`)
                : profile.writeBehind('home', `${directory}/${projectIdentityPath}`, identity(id)));
            }
            /* The index, replaced by arbitrary contents. */
            const homeKey = await homeKeyOf(profile);
            for (const [index, directory] of directories.entries()) {
              const reading = indexed[index];
              if (reading !== undefined) {
                const version = profile.index.version(homeKey, directory);
                profile.index.install(homeKey, directory, { version, reading, determined: true });
              }
            }
            const carrying = directories.filter((_, index) => onDisk[index] === asked);

            const absence = await profile.service.verifyAbsent(asked);
            expect(absence.status).toBe(carrying.length === 0 ? 'absent' : 'present');
            if (absence.status === 'present') {
              expect(absence.locators.map((locator) => locator.relativeDirectory).toSorted()).toEqual(carrying);
            }

            const targetDirectory = directories[target]!;
            const deleted = await profile.service.permanentlyDeleteProjectDirectory({
              projectId: asked,
              providerBasePath: targetDirectory,
              scope: { backend: 'opfs' },
            });
            /* No directory is removed unless it holds the id. */
            expect(deleted.status === 'deleted').toBe(onDisk[target] === asked);
            const remaining = onDisk.map((id, index) => (index === target && id === asked ? undefined : id));
            const stillThere = directories.filter((_, index) => !(index === target && onDisk[target] === asked));

            /* Adopt never writes an id another directory holds. */
            await profile.writeBehind('home', 'adopt-me/.tau/chats/keep.json', new TextEncoder().encode('{}'));
            const adopted = await profile.service.adoptProjectDirectory(
              { backend: 'opfs', storageRootKey: homeKey, relativeDirectory: 'adopt-me' },
              { id: asked },
            );
            const heldElsewhere = stillThere.some((directory) => remaining[directories.indexOf(directory)] === asked);
            expect(adopted.projectId === asked).toBe(!heldElsewhere);
          } finally {
            profile.dispose();
          }
        },
      ),
      { numRuns: 25, seed: 726_905_399 },
    );
  }, 120_000);

  /* Review M4: every root's state is checked before any read, so a lost folder costs the sweep no I/O. */
  it('should answer unknown before reading any root when a later root is not available', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const [, workspace] = await profile.service.getRootStatuses();
    const { rootState } = ExternalChangeIngest.prototype;
    vi.spyOn(ExternalChangeIngest.prototype, 'rootState').mockImplementation(function (
      this: ExternalChangeIngest,
      storageRootKey: string,
    ) {
      return storageRootKey === workspace!.storageRootKey ? 'notFound' : rootState.call(this, storageRootKey);
    });

    const { result, cost } = await profile.measure(async () =>
      profile.service.verifyAbsent(discoveryProfileHomeId(90)),
    );

    expect(result).toMatchObject({ status: 'unknown' });
    expect(cost.providers.home.total + cost.providers.workspace.total).toBe(0);
  });

  /* Review M4: a refresh that fails is uncertainty, not a rejection. */
  it('should answer unknown when a root refuses to refresh the handles of its sweep', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    vi.spyOn(profile.providers.workspace, 'refresh').mockRejectedValue(new Error('The folder went away.'));

    await expect(profile.service.verifyAbsent(discoveryProfileHomeId(90))).resolves.toMatchObject({
      status: 'unknown',
    });
  });

  it('should answer unknown, never absent, when a root is not available or a read fails', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const { readFile } = profile.providers.workspace;
    vi.spyOn(profile.providers.workspace, 'readFile').mockImplementation(async function (
      this: unknown,
      path: string,
      ...rest: unknown[]
    ) {
      if (path.startsWith('folder-001/')) {
        throw Object.assign(new Error('The file could not be read.'), { name: 'NotReadableError' });
      }
      return Reflect.apply(readFile, this, [path, ...rest]) as Promise<Uint8Array<ArrayBuffer>>;
    } as typeof readFile);

    await expect(profile.service.verifyAbsent(discoveryProfileHomeId(90))).resolves.toMatchObject({
      status: 'unknown',
    });
  });
});

describe('A2: evidence at the source, armed first, applied under a version', () => {
  it('should list a directory this authority wrote, from the provider tap, with no event or observer', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const homeKey = await homeKeyOf(profile);
    /* A write through the provider the registry hands out: no bus event, no notice. */
    await profile.providers.home.writeFile('home-002/tau.json', manifest('Renamed by the provider'));

    const { result, cost } = await profile.measure(async () => profile.service.listProjectManifests());

    const renamed = result.entries.find((entry) => entry.locator.relativeDirectory === 'home-002');
    expect(renamed?.status === 'valid' ? renamed.manifest.name : undefined).toBe('Renamed by the provider');
    expect(cost.providers.home.fileReads).toBe(2);
    expect(profile.index.view(homeKey)?.dirty).toEqual([]);
  });

  /* Review N5: a file at the top of a root is not a directory, so it enters neither the names nor the dirty set. */
  it('should not take a top-level file this authority writes for a directory', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const homeKey = await homeKeyOf(profile);

    await profile.providers.home.writeFile('notes.txt', new TextEncoder().encode('a file, not a project'));

    expect(profile.index.view(homeKey)).toMatchObject({ dirty: [] });
    expect(profile.index.view(homeKey)?.names).not.toContain('notes.txt');
  });

  it('should keep a directory dirty when a fact arrives while its read runs', () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['a']);
    const version = index.version('root', 'a');
    index.note('root', ['a/tau.json']);

    const outcome = index.install('root', 'a', { version, reading: { kind: 'not-a-project' }, determined: true });

    expect(outcome.status).toBe('dirty');
    expect(index.view('root')?.dirty).toEqual(['a']);
  });

  /* Review M1: an install never lowers a counter, so a slower reader of older bytes cannot install after a faster one. */
  it('should refuse a slower reader of older bytes after a faster reader installed newer ones', () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['d']);
    const old: ProjectDirectoryReading = { kind: 'not-a-project' };
    index.install('root', 'd', { version: index.version('root', 'd'), reading: old, determined: true });
    const slow = index.version('root', 'd');
    index.note('root', ['d/tau.json']);
    const fresh: ProjectDirectoryReading = { kind: 'invalid', issue: { code: 'manifest-missing' } };

    expect(
      index.install('root', 'd', { version: index.version('root', 'd'), reading: fresh, determined: true }),
    ).toMatchObject({ status: 'installed' });
    expect(index.install('root', 'd', { version: slow, reading: old, determined: true }).status).toBe('dirty');
    expect(index.entry('root', 'd')?.reading).toEqual(fresh);
  });

  /* Review M2: an own write that creates a top-level directory moves the names counter, so an older listing is refused. */
  it('should refuse a listing taken before this authority created a directory', () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['a']);
    const listing = index.namesVersion('root');

    index.beginWrite('root', ['b'])();
    index.beginWrite('root', ['b/tau.json'])();
    index.install('root', 'b', {
      version: index.version('root', 'b'),
      reading: { kind: 'not-a-project' },
      determined: true,
    });

    expect(index.installNames('root', listing, ['a'])).toBe(false);
    expect(index.view('root')).toMatchObject({ names: ['a', 'b'], namesListed: true });
  });

  /* Review m1: the provider tap opens a root it has not seen, so a cold read that starts during a write cannot install. */
  it('should mark a write on a root the index has not opened yet', () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    const settle = index.beginWrite('root', ['d/tau.json']);
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['d']);

    const outcome = index.install('root', 'd', {
      version: index.version('root', 'd'),
      reading: { kind: 'not-a-project' },
      determined: true,
    });
    settle();

    expect(outcome.status).toBe('dirty');
    expect(index.view('root')?.dirty).toEqual(['d']);
  });

  it('should refuse an install on a directory while this authority writes it', () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['a']);
    const settle = index.beginWrite('root', ['a/tau.json']);
    const version = index.version('root', 'a');

    expect(index.install('root', 'a', { version, reading: { kind: 'not-a-project' }, determined: true }).status).toBe(
      'dirty',
    );
    settle();
    expect(index.version('root', 'a').directory).toBeGreaterThan(version.directory);
  });

  it('should retry, on the next pass, a directory whose read failed with an I/O error', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const homeKey = await homeKeyOf(profile);
    await profile.providers.home.writeFile('home-003/tau.json', manifest('Changed'));
    const { readFile } = profile.providers.home;
    const failing = vi.spyOn(profile.providers.home, 'readFile').mockImplementationOnce(async () => {
      throw Object.assign(new Error('The file could not be read.'), { name: 'NotReadableError' });
    });

    const first = await profile.service.listProjectManifests();
    expect(first.entries.find((entry) => entry.locator.relativeDirectory === 'home-003')?.status).toBe('invalid');
    expect(profile.index.view(homeKey)?.dirty).toEqual(['home-003']);
    failing.mockImplementation(readFile);

    const { result, cost } = await profile.measure(async () => profile.service.listProjectManifests());
    const retried = result.entries.find((entry) => entry.locator.relativeDirectory === 'home-003');
    expect(retried?.status === 'valid' ? retried.manifest.name : undefined).toBe('Changed');
    expect(cost.providers.home.fileReads).toBe(2);
  });

  it('should re-read a directory after a route verification its bytes contradicted', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    /* Another program gives home-004 another identity; no evidence reaches the index. */
    await profile.writeBehind('home', `home-004/${projectIdentityPath}`, identity(discoveryProfileHomeId(77)));
    const stale = await profile.service.listProjectManifests();
    expect(listedIds(stale.entries).get('opfs:home-004')).toBe(discoveryProfileHomeId(4));

    await expect(profile.service.verifyProjectRoute({ projectId: discoveryProfileHomeId(4) })).resolves.toEqual({
      status: 'discovery-required',
    });
    const { result, cost } = await profile.measure(async () => profile.service.listProjectManifests());

    expect(listedIds(result.entries).get('opfs:home-004')).toBe(discoveryProfileHomeId(77));
    expect(cost.counters['discovery.directoryRead']).toBe(1);
  });

  it('should make every root cold on a reset, so the next pass reads them in full', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const before = counter('discovery.rootCold.gap');

    profile.index.cold(undefined, 'gap');
    const { cost } = await profile.measure(async () => profile.service.listProjectManifests());

    expect(counter('discovery.rootCold.gap') - before).toBe(2);
    expect(cost.counters['discovery.fullRead']).toBe(2);
  });

  it.each([
    { paths: ['home-001/tau.json'], dirty: ['home-001'], namesListed: true },
    { paths: ['home-001/.tau/project.json'], dirty: ['home-001'], namesListed: true },
    { paths: ['home-001/src/main.ts'], dirty: [], namesListed: true },
    { paths: ['.tau/library.json'], dirty: [], namesListed: true },
    { paths: ['home-009'], dirty: ['home-009'], namesListed: false },
    { paths: ['', 'home-001/tau.json'], dirty: ['home-001'], namesListed: false },
  ])('should apply the evidence rule for $paths', ({ paths, dirty, namesListed }) => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['home-001', 'home-002']);
    for (const name of ['home-001', 'home-002']) {
      index.install('root', name, {
        version: index.version('root', name),
        reading: { kind: 'not-a-project' },
        determined: true,
      });
    }

    index.note('root', paths);

    expect(index.view('root')).toMatchObject({ currency: 'warm', dirty, namesListed });
  });

  it('should make a root cold on a fact about the root that names no directory', () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['a']);

    index.note('root', ['']);

    expect(index.view('root')?.currency).toBe('cold');
  });
});

/* A sibling tab's create, adopt, rename and delete, over the real cross-tab channel: project-directory-index.cross-tab.test.ts. */

describe('A3: freshness is bounded by the authority', () => {
  it('should validate a polled root past its window with one head walk before it publishes it', async () => {
    const profile = await profileOf();
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    /* The setup's rows settle: past the racy window, a poll captures them as they are, and the pass reads them. */
    now += 2 * racyTimestampMilliseconds;
    await profile.service.pollExternalChanges();
    await profile.service.listProjectManifests();
    /* Another program renames a folder project; nothing observes the folder, and no poll runs. */
    await profile.writeBehind('workspace', 'folder-001/tau.json', manifest('Renamed elsewhere'));
    now += 60_000;

    const { result, cost } = await profile.measure(async () => profile.service.listProjectManifests());

    const renamed = result.entries.find((entry) => entry.locator.relativeDirectory === 'folder-001');
    expect(renamed?.status === 'valid' ? renamed.manifest.name : undefined).toBe('Renamed elsewhere');
    /* The head walk: every directory's declarations, by handle, with no file content read but the renamed one's. */
    expect(cost.browser.workspace['getFile']).toBeGreaterThanOrEqual(2 * small.workspace);
    expect(cost.providers.workspace.fileReads).toBe(2);
    const again = await profile.measure(async () => profile.service.listProjectManifests());
    expect(again.cost.browserCalls).toBe(0);
  });

  /* Review m2: a root other programs write with no live channel at all is read in full on every pass. */
  it('should read a shared root in full when neither a snapshot nor an observer reports it', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const [, workspace] = await profile.service.getRootStatuses();
    const { channels } = ExternalChangeIngest.prototype;
    vi.spyOn(ExternalChangeIngest.prototype, 'channels').mockImplementation(function (
      this: ExternalChangeIngest,
      storageRootKey: string,
    ) {
      return storageRootKey === workspace!.storageRootKey
        ? { snapshot: false, native: false }
        : channels.call(this, storageRootKey);
    });

    const { cost } = await profile.measure(async () => profile.service.listProjectManifests());

    expect(cost.providers.workspace.fileReads).toBe(2 * small.workspace);
  });

  /* Review m3: a long gap between polls never stretches the freshness window past the cadence the page polls at. */
  it('should validate a polled root past three blurred walk periods even when its polls were an hour apart', async () => {
    const profile = await profileOf();
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    now += 2 * racyTimestampMilliseconds;
    await profile.service.pollExternalChanges();
    now += 60 * 60_000;
    await profile.service.pollExternalChanges();
    await profile.service.listProjectManifests();
    const validate = vi.spyOn(ExternalChangeIngest.prototype, 'validate');

    /* Past 3 × 50 s, the most the window grows to. */
    now += 151_000;
    await profile.service.listProjectManifests();

    expect(validate).toHaveBeenCalledOnce();
  });

  /* Review N2: the racy window follows each file's read, not the walk's start, so a long walk misses no rewrite. */
  it('should report a same-size rewrite of a file the walk captured 3 s after it began', async () => {
    const profile = await profileOf({ ...small, timestampGranularity: 2000 });
    let now = Math.ceil((Date.now() + 10_000) / 2000) * 2000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    await profile.service.pollExternalChanges();
    await profile.service.listProjectManifests();
    const walkStartedAt = now + 10_000;
    const identityPath = `folder-001/${projectIdentityPath}`;
    /* Written 3 s into a 6 s walk, which reads the folder then: its 2 s granule began 1 s before the read. */
    now = walkStartedAt + 3000;
    await profile.writeBehind('workspace', identityPath, identity(discoveryProfileWorkspaceId(70)));
    /* The walk takes its start before its first await, then reads the folder 3 s in. */
    const prototype = ExternalChangeIngest.prototype as unknown as Record<string, (...rest: unknown[]) => unknown>;
    const snapshot = prototype['_createExternalSnapshot']!;
    const walk = vi.spyOn(prototype, '_createExternalSnapshot').mockImplementation(function (
      this: unknown,
      ...rest: unknown[]
    ) {
      const reading = now;
      now = walkStartedAt;
      const walked = snapshot.apply(this, rest);
      now = reading;
      return walked;
    });
    await profile.service.pollExternalChanges();
    walk.mockRestore();
    expect(listedIds(await listedEntries(profile)).get('webaccess:folder-001')).toBe(discoveryProfileWorkspaceId(70));

    /* The same size, in the same granule; the next poll runs once that granule has passed, so its own row is settled. */
    now = walkStartedAt + 3500;
    await profile.writeBehind('workspace', identityPath, identity(discoveryProfileWorkspaceId(71)));
    now = walkStartedAt + 6000;
    await profile.service.pollExternalChanges();

    expect(listedIds(await listedEntries(profile)).get('webaccess:folder-001')).toBe(discoveryProfileWorkspaceId(71));
  });

  /* Review N4: the window follows the discovery-wide walk's cadence, so a pass inside it walks nothing first. */
  it('should not validate a polled root again inside three walk periods of 40 s', async () => {
    const profile = await profileOf();
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    now += 2 * racyTimestampMilliseconds;
    await profile.service.pollExternalChanges();
    now += 40_000;
    await profile.service.pollExternalChanges();
    await profile.service.listProjectManifests();
    const validate = vi.spyOn(ExternalChangeIngest.prototype, 'validate');

    now += 60_000;
    await profile.service.listProjectManifests();

    expect(validate).not.toHaveBeenCalled();
  });

  /* Review m4: a file dated in the future is not inside the racy window of every poll. */
  it('should report a future-dated declaration once, not on every poll', async () => {
    const profile = await profileOf();
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    now += 60 * 60_000;
    await profile.writeBehind('workspace', 'folder-001/tau.json', manifest('From the future'));
    now -= 60 * 60_000 - 2 * racyTimestampMilliseconds;
    await profile.service.pollExternalChanges();
    await profile.service.listProjectManifests();
    now += 2 * racyTimestampMilliseconds;
    await profile.service.pollExternalChanges();
    await profile.service.listProjectManifests();
    now += 2 * racyTimestampMilliseconds;
    await profile.service.pollExternalChanges();

    const { cost } = await profile.measure(async () => profile.service.listProjectManifests());

    expect(cost.providers.workspace.fileReads).toBe(0);
  });

  it('should list a same-size rewrite inside the racy window after the next poll', async () => {
    const profile = await profileOf({ ...small, timestampGranularity: 2000 });
    const directory = `folder-002/${projectIdentityPath}`;
    await profile.writeBehind('workspace', directory, identity(discoveryProfileWorkspaceId(60)));
    await profile.service.pollExternalChanges();
    expect(listedIds(await listedEntries(profile)).get('webaccess:folder-002')).toBe(discoveryProfileWorkspaceId(60));

    /* The same size, in the same 2 s granule as the poll that captured the first: the row is equal. */
    await profile.writeBehind('workspace', directory, identity(discoveryProfileWorkspaceId(61)));
    await profile.service.pollExternalChanges();

    expect(listedIds(await listedEntries(profile)).get('webaccess:folder-002')).toBe(discoveryProfileWorkspaceId(61));
    expect(racyTimestampMilliseconds).toBe(2000);
  });
});

describe('A4: the audit', () => {
  it('should list a change whose fact was dropped within one audit interval, and count it once', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const homeKey = await homeKeyOf(profile);
    const before = { all: counter('discovery.auditMismatch'), exclusive: counter('discovery.auditMismatch.exclusive') };
    /* The harness drops the fact: the identity changes behind the authority's back on Home, which only Tau writes. */
    await profile.writeBehind('home', `home-005/${projectIdentityPath}`, identity(discoveryProfileHomeId(66)));
    expect(listedIds(await listedEntries(profile)).get('opfs:home-005')).toBe(discoveryProfileHomeId(5));

    /* One interval of the rolling audit, tick by tick; no whole overdue cycle is needed. */
    const audit = vi.spyOn(ProjectDirectories.prototype, 'auditDiscovery');
    expect(await fullCyclesPerInterval(audit, 1)).toEqual([0]);
    expect(counter('discovery.auditMismatch') - before.all).toBe(1);

    expect(counter('discovery.auditMismatch.exclusive') - before.exclusive).toBe(1);
    expect(profile.index.entry(homeKey, 'home-005')?.reading).toMatchObject({ projectId: discoveryProfileHomeId(66) });
    expect(listedIds(await listedEntries(profile)).get('opfs:home-005')).toBe(discoveryProfileHomeId(66));
  });
});

describe('the audit names count (FW4 review m9)', () => {
  it('should count no names mismatch for a listing that evidence overtook, which it does not install', async () => {
    const profile = await profileOf();
    await profile.service.listProjectManifests();
    const homeKey = await homeKeyOf(profile);
    const before = counter('discovery.auditMismatch');
    /* A directory appears behind the authority's back, and evidence of it arrives while the audit lists the root. */
    await profile.writeBehind('home', 'home-new/tau.json', new TextEncoder().encode('{}'));
    const listing = Promise.withResolvers<void>();
    const listed = Promise.withResolvers<void>();
    const reader = profile.providers.home as FileSystemProvider & {
      readdirEntries: NonNullable<FileSystemProvider['readdirEntries']>;
    };
    const readdirEntries = reader.readdirEntries.bind(profile.providers.home);
    vi.spyOn(reader, 'readdirEntries').mockImplementation(async (path) => {
      const entries = await readdirEntries(path);
      if (path === '') {
        listed.resolve();
        await listing.promise;
      }
      return entries;
    });
    const directories = (profile.service as unknown as { _projectDirectories: ProjectDirectories })._projectDirectories;

    const audit = directories.auditDiscovery(0);
    await listed.promise;
    profile.index.note(homeKey, ['', 'home-new']);
    listing.resolve();
    await audit;

    expect(counter('discovery.auditMismatch') - before).toBe(0);
  });
});

describe('the audit schedule (review M3)', () => {
  it('should run no overdue full cycle while the rolling audit completes every cycle in time', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const profile = await profileOf();
      const audit = vi.spyOn(ProjectDirectories.prototype, 'auditDiscovery');
      await profile.service.listProjectManifests();

      for (let elapsed = 0; elapsed < 2 * discoveryAuditIntervalMilliseconds; elapsed += 15_000) {
        // oxlint-disable-next-line no-await-in-loop -- One audit tick at a time, as the timer fires them.
        await vi.advanceTimersByTimeAsync(15_000);
        // oxlint-disable-next-line no-await-in-loop -- The tick's audit settles before the next.
        await vi.waitFor(() => {
          expect(audit.mock.results.every((result) => result.type !== 'incomplete')).toBe(true);
        });
      }

      expect(audit.mock.calls.length).toBeGreaterThan(0);
      expect(audit.mock.calls.filter(([share]) => share === undefined)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the audit schedule (review N1, N3)', () => {
  /* N1: a root whose audit cannot start a cycle must not make every tick a whole cycle of the healthy roots. */
  it('should run at most one whole cycle per interval while one root keeps failing to list', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const profile = await profileOf();
      await profile.service.listProjectManifests();
      const { workspace } = profile.providers;
      const listing = workspace.readdirEntries!.bind(workspace);
      vi.spyOn(workspace, 'readdirEntries').mockImplementation(async (path: string) => {
        if (path === '') {
          throw new Error('The folder could not be listed.');
        }
        return listing(path);
      });
      const audit = vi.spyOn(ProjectDirectories.prototype, 'auditDiscovery');

      const perInterval = await fullCyclesPerInterval(audit, 3);

      expect(Math.max(...perInterval)).toBeLessThanOrEqual(1);
    } finally {
      vi.useRealTimers();
    }
  });

  /* N3: the rolling audit's wrap and the overdue threshold never coincide, at a size whose cycle takes the interval. */
  it('should run no whole cycle at 40 directories over three intervals', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const profile = await profileOf({ home: 40, workspace: 1, duplicates: 0 });
      await profile.service.listProjectManifests();
      const audit = vi.spyOn(ProjectDirectories.prototype, 'auditDiscovery');

      /* The cycle takes the whole interval (40 directories, one a tick); the tick that ends it fires a millisecond late,
       * as a real interval does. */
      const perInterval = await fullCyclesPerInterval(audit, 3, (tick) => (tick === 39 ? 1 : 0));

      expect(perInterval).toEqual([0, 0, 0]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('A5: bounds', () => {
  it('should not retain a reading past the retained-manifest budget, and read it again on the next pass', () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>({ budgetBytes: 1 });
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['a']);
    const before = counter('discovery.unretained');
    const reading: ProjectDirectoryReading = {
      kind: 'identified',
      projectId: discoveryProfileHomeId(1),
      manifest: projectToManifest({ name: 'a', description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } }),
    };

    const outcome = index.install('root', 'a', { version: index.version('root', 'a'), reading, determined: true });

    expect(outcome.status).toBe('dirty');
    expect(index.retainedBytes).toBe(0);
    expect(counter('discovery.unretained') - before).toBe(1);
  });

  it('should make a root cold when its dirty set outgrows its entries', () => {
    const index = new ProjectDirectoryIndex<ProjectDirectoryReading>();
    index.beginColdRead('root');
    index.installNames('root', index.namesVersion('root'), ['a']);

    index.note('root', ['b/tau.json', 'c/tau.json']);

    expect(index.view('root')?.currency).toBe('cold');
  });
});
