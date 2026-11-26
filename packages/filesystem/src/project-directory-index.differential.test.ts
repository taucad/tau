// oxlint-disable-next-line import/no-unassigned-import -- Side-effect import to polyfill IndexedDB for tests
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fc from 'fast-check';
import { projectIdentityPath, serializeProjectIdentity } from '@taucad/project-core/identity';
import { projectToManifest } from '@taucad/types';
import { ProjectDirectoryIndex } from '#project-directory-index.js';
import type { IndexVersion, ProjectDirectoryReading } from '#project-directory-index.js';
import { createDiscoveryProfile, discoveryProfileWorkspaceId } from '#testing/discovery-profile.js';

/**
 * The differential test of the discovery index: the conformance adapter of `specs/discovery-index/DiscoveryIndex.tla`
 * (formal verification policy rule 1; index-contract review A2, A3, A4; S12).
 *
 * The first suite replays generated evidence schedules against `ProjectDirectoryIndex` beside a model of the disk:
 * facts sent, dropped, delivered in any order and twice, reads that overlap them, this authority's own writes through
 * the tap, and the audit. After every step it checks the module's `CleanIsCurrent`: a directory that is not dirty, not
 * being read, has no fact in transit and whose last change was not lost holds what the disk holds. At the end it
 * drains the schedule as the fair actions would and checks `EventuallyCurrent`: the audit repairs every lost fact.
 *
 * The second runs the authority itself on a 2 s timestamp granularity, where a same-size rewrite of an identity
 * record in one granule leaves an equal snapshot row: after every poll and pass the listing equals the disk.
 */

const directories = ['d0', 'd1', 'd2'] as const;
type Directory = (typeof directories)[number];
const pool = ['proj_m00000000000000000000', 'proj_m00000000000000000001', 'proj_m00000000000000000002'];

const readingOf = (value: number): ProjectDirectoryReading => ({
  kind: 'identified',
  projectId: pool[value]!,
  manifest: projectToManifest({ name: 'model', description: '', tags: [], assets: { main: { entryPath: 'main.ts' } } }),
});

type Step =
  | { readonly kind: 'change' | 'lose' | 'issue'; readonly directory: Directory; readonly value: number }
  | {
      readonly kind: 'deliver' | 'repeat' | 'read' | 'audit' | 'end' | 'land' | 'settle';
      readonly directory: Directory;
    };

const writeKinds = ['change', 'lose', 'issue'] as const;
const otherKinds = ['deliver', 'repeat', 'read', 'audit', 'end', 'land', 'settle'] as const;
const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  fc.record({
    kind: fc.constantFrom(...writeKinds),
    directory: fc.constantFrom(...directories),
    value: fc.nat({ max: pool.length - 1 }),
  }),
  fc.record({ kind: fc.constantFrom(...otherKinds), directory: fc.constantFrom(...directories) }),
);

/** The model beside the index, as `DiscoveryIndex.tla` names its variables. */
type Model = {
  readonly disk: Map<Directory, number>;
  readonly transit: Set<Directory>;
  readonly lost: Set<Directory>;
  readonly reading: Map<Directory, Readonly<{ version: IndexVersion; value: number }>>;
  readonly writing: Map<Directory, { readonly settle: () => void; readonly value: number; landed: boolean }>;
};

const factOf = (directory: Directory): string => `${directory}/${projectIdentityPath}`;

/** Apply one step to the model and the index; a step that is not enabled is a stutter, as in the module. */
const apply = (index: ProjectDirectoryIndex, model: Model, step: Step): void => {
  const { directory } = step;
  const dirty = new Set(index.view('root')?.dirty);
  switch (step.kind) {
    case 'change': {
      model.disk.set(directory, step.value);
      model.transit.add(directory);
      return;
    }
    case 'lose': {
      model.disk.set(directory, step.value);
      model.lost.add(directory);
      return;
    }
    case 'deliver':
    case 'repeat': {
      if (model.transit.has(directory)) {
        index.note('root', [factOf(directory)]);
        if (step.kind === 'deliver') {
          model.transit.delete(directory);
        }
      }
      return;
    }
    case 'read':
    case 'audit': {
      if (!model.reading.has(directory) && dirty.has(directory) === (step.kind === 'read')) {
        model.reading.set(directory, {
          version: index.version('root', directory),
          value: model.disk.get(directory)!,
        });
      }
      return;
    }
    case 'end': {
      const read = model.reading.get(directory);
      if (read !== undefined) {
        const outcome = index.install('root', directory, {
          version: read.version,
          reading: readingOf(read.value),
          determined: true,
        });
        if (outcome.status === 'installed' && read.value === model.disk.get(directory)) {
          model.lost.delete(directory);
        }
        model.reading.delete(directory);
      }
      return;
    }
    case 'issue': {
      if (!model.writing.has(directory)) {
        model.writing.set(directory, {
          settle: index.beginWrite('root', [factOf(directory)]),
          value: step.value,
          landed: false,
        });
      }
      return;
    }
    case 'land': {
      const write = model.writing.get(directory);
      if (write !== undefined && !write.landed) {
        model.disk.set(directory, write.value);
        write.landed = true;
      }
      return;
    }
    case 'settle': {
      const write = model.writing.get(directory);
      if (write?.landed === true) {
        write.settle();
        model.writing.delete(directory);
      }
    }
  }
};

/** `CleanIsCurrent` of `DiscoveryIndex.tla`, checked against the index. */
const expectCleanIsCurrent = (index: ProjectDirectoryIndex, model: Model, schedule: string): void => {
  const dirty = new Set(index.view('root')?.dirty);
  for (const directory of directories) {
    if (
      !dirty.has(directory) &&
      !model.reading.has(directory) &&
      !model.transit.has(directory) &&
      !model.lost.has(directory)
    ) {
      expect(index.entry('root', directory)?.reading, `${directory} after ${schedule}`).toEqual(
        readingOf(model.disk.get(directory)!),
      );
    }
  }
};

describe('the discovery index against DiscoveryIndex.tla (S12)', () => {
  it('should keep every clean directory current under dropped, delayed, reordered and repeated facts', () => {
    fc.assert(
      fc.property(fc.array(stepArbitrary, { minLength: 20, maxLength: 80, size: 'max' }), (steps) => {
        const index = new ProjectDirectoryIndex();
        const model: Model = {
          disk: new Map(directories.map((directory) => [directory, 0])),
          transit: new Set(),
          lost: new Set(),
          reading: new Map(),
          writing: new Map(),
        };
        /* Arm first, then the cold read (A2 e): every directory is dirty until it is read. */
        index.beginColdRead('root');
        index.installNames('root', index.namesVersion('root'), directories);
        for (const [at, step] of steps.entries()) {
          apply(index, model, step);
          expectCleanIsCurrent(index, model, JSON.stringify(steps.slice(0, at + 1)));
        }

        /* `EventuallyCurrent`: the fair actions drain the schedule, and the audit reads every clean directory. */
        for (const directory of directories) {
          apply(index, model, { kind: 'land', directory });
          apply(index, model, { kind: 'settle', directory });
          apply(index, model, { kind: 'end', directory });
          apply(index, model, { kind: 'deliver', directory });
        }
        for (const kind of ['read', 'end', 'audit', 'end'] as const) {
          for (const directory of directories) {
            apply(index, model, { kind, directory });
          }
        }
        expect(index.view('root')?.dirty).toEqual([]);
        expect(model.lost.size).toBe(0);
        for (const directory of directories) {
          expect(index.entry('root', directory)?.reading).toEqual(readingOf(model.disk.get(directory)!));
        }
      }),
      { numRuns: 400, seed: 726_905_399 },
    );
  });
});

describe('the authority on a 2 s timestamp granularity (A3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should list every same-size identity rewrite after the next poll and pass', async () => {
    const folder = ['folder-000', 'folder-001'] as const;
    const rewriteKinds = ['rewrite'] as const;
    const pollKinds = ['poll', 'pass'] as const;
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            fc.record({
              kind: fc.constantFrom(...rewriteKinds),
              directory: fc.constantFrom(...folder),
              value: fc.nat({ max: 2 }),
            }),
            fc.record({ kind: fc.constantFrom(...pollKinds) }),
          ),
          { minLength: 4, maxLength: 12, size: 'max' },
        ),
        async (steps) => {
          const profile = await createDiscoveryProfile({
            home: 1,
            workspace: 2,
            duplicates: 0,
            timestampGranularity: 2000,
          });
          try {
            const disk = new Map<string, string>(
              folder.map((directory, at) => [directory, discoveryProfileWorkspaceId(at)]),
            );
            const check = async (): Promise<void> => {
              await profile.service.pollExternalChanges();
              const { entries } = await profile.service.listProjectManifests();
              for (const directory of folder) {
                const entry = entries.find((candidate) => candidate.locator.relativeDirectory === directory);
                expect(entry !== undefined && 'projectId' in entry ? entry.projectId : undefined, directory).toBe(
                  disk.get(directory),
                );
              }
            };
            await check();
            for (const step of steps) {
              if (step.kind === 'rewrite') {
                const projectId = discoveryProfileWorkspaceId(50 + step.value);
                disk.set(step.directory, projectId);
                // oxlint-disable-next-line no-await-in-loop -- One step at a time, as the schedule orders them.
                await profile.writeBehind(
                  'workspace',
                  `${step.directory}/${projectIdentityPath}`,
                  serializeProjectIdentity({ version: 1, projectId }),
                );
              } else if (step.kind === 'poll') {
                // oxlint-disable-next-line no-await-in-loop -- One step at a time.
                await profile.service.pollExternalChanges();
              } else {
                // oxlint-disable-next-line no-await-in-loop -- One step at a time.
                await profile.service.listProjectManifests();
              }
            }
            await check();
          } finally {
            profile.dispose();
          }
        },
      ),
      { numRuns: 30, seed: 726_905_399 },
    );
  }, 120_000);
});
