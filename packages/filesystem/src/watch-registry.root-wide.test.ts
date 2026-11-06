/**
 * `watchEventsOfChangeSetFor` against the authority itself (charter D14): a
 * client holding one root-wide event channel per connection reads each watch's
 * events off the root-wide change set. For any one committed changeset and any
 * watch, that gives exactly what the authority's own scoped change-set watch
 * gives, or a reset where the root-wide set could not say more. It never gives
 * less.
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ChangeEventBus, watchEventsOfChangeSet } from '#change-event-bus.js';
import type { ChangeSet } from '#change-event-bus.js';
import { WatchRegistry, watchEventsOfChangeSetFor } from '#watch-registry.js';
import type { PathChangeEvent, WatchEvent, WatchRequest } from '#types.js';

const backend = 'memory';
const paths = ['/a', '/a/x', '/a/y', '/a/x/q', '/b', '/b/z', '/c.ts'] as const;
const watched = ['/', '/a', '/a/x', '/b', '/c.ts'] as const;

const path = fc.constantFrom(...paths);

const fact: fc.Arbitrary<PathChangeEvent> = fc.oneof(
  path.map((at): PathChangeEvent => ({ type: 'fileWritten', path: at, backend })),
  path.map((at): PathChangeEvent => ({ type: 'fileDeleted', path: at, backend })),
  fc
    .tuple(path, path)
    .map(([oldPath, newPath]): PathChangeEvent => ({ type: 'fileRenamed', oldPath, newPath, backend })),
  fc
    .tuple(path, path)
    .map(([sourcePath, targetPath]): PathChangeEvent => ({ type: 'fileCopied', sourcePath, targetPath, backend })),
  path.map((at): PathChangeEvent => ({ type: 'directoryCreated', path: at, backend })),
  path.map((at): PathChangeEvent => ({ type: 'directoryDeleted', path: at, backend })),
  fc
    .tuple(path, path)
    .map(([oldPath, newPath]): PathChangeEvent => ({ type: 'directoryRenamed', oldPath, newPath, backend })),
  path.map((at): PathChangeEvent => ({ type: 'directoryChanged', path: at, backend })),
);

const request: fc.Arbitrary<WatchRequest> = fc.record({
  paths: fc.uniqueArray(fc.constantFrom(...watched), { minLength: 1, maxLength: 2 }),
  recursive: fc.boolean(),
});

/**
 * One changeset committed on a fresh bus, as a scoped watch and a root-wide watch receive it.
 *
 * @param facts - The changeset's facts.
 * @param scope - The scoped watch's request.
 * @returns What each watch received.
 */
const commit = (
  facts: readonly PathChangeEvent[],
  scope: WatchRequest,
): { scoped: ChangeSet | undefined; rootWide: ChangeSet | undefined } => {
  const bus = new ChangeEventBus();
  const registry = new WatchRegistry(bus);
  let scoped: ChangeSet | undefined;
  let rootWide: ChangeSet | undefined;
  registry.watchChangeSets(scope, (set) => {
    scoped = set;
  });
  registry.watchChangeSets({ paths: ['/'], recursive: true }, (set) => {
    rootWide = set;
  });
  bus.emit({ type: 'changeSet', entries: [...facts] });
  registry.dispose();
  return { scoped, rootWide };
};

const reset: WatchEvent[] = [{ type: 'reset' }];

describe('watchEventsOfChangeSetFor', () => {
  it('gives a watch what the authority would have scoped for it, or a reset, never less', () => {
    fc.assert(
      fc.property(fc.array(fact, { minLength: 1, maxLength: 6 }), request, (facts, scope) => {
        const { scoped, rootWide } = commit(facts, scope);
        const expected = scoped === undefined ? [] : watchEventsOfChangeSet(scoped);
        const actual = rootWide === undefined ? [] : watchEventsOfChangeSetFor(rootWide, scope);
        if (actual.length === 1 && actual[0]!.type === 'reset') {
          return;
        }
        expect(actual).toEqual(expected);
      }),
      { numRuns: 2000 },
    );
  });

  it('names the exact files a directory watch would hear, and nothing outside it', () => {
    const { rootWide } = commit(
      [
        { type: 'fileWritten', path: '/a/x', backend },
        { type: 'fileWritten', path: '/b/z', backend },
        { type: 'fileRenamed', oldPath: '/b/z', newPath: '/a/y', backend },
      ],
      { paths: ['/'], recursive: true },
    );
    expect(watchEventsOfChangeSetFor(rootWide!, { paths: ['/a'] })).toEqual([
      { type: 'change', path: '/a/x' },
      { type: 'rename', oldPath: '/b/z', newPath: '/a/y' },
    ]);
    expect(watchEventsOfChangeSetFor(rootWide!, { paths: ['/c.ts'] })).toEqual([]);
  });

  it('resets a watch whose ancestor directory was replaced', () => {
    const { rootWide } = commit([{ type: 'directoryDeleted', path: '/a', backend }], { paths: ['/'], recursive: true });
    expect(watchEventsOfChangeSetFor(rootWide!, { paths: ['/a/x/q'] })).toEqual(reset);
    expect(watchEventsOfChangeSetFor(rootWide!, { paths: ['/b'] })).toEqual([]);
  });

  it("keeps a root-wide reset to the watches under or above its prefix, and honours a watch's globs", () => {
    const set: ChangeSet = {
      generation: 1,
      entries: [],
      touchedDirectories: [],
      reset: { prefix: '/a', reason: 'overflow' },
    };
    expect(watchEventsOfChangeSetFor(set, { paths: ['/a/x'] })).toEqual(reset);
    expect(watchEventsOfChangeSetFor(set, { paths: ['/'], recursive: true })).toEqual(reset);
    expect(watchEventsOfChangeSetFor(set, { paths: ['/b'] })).toEqual([]);
    const written: ChangeSet = {
      generation: 2,
      entries: [
        { op: 'written', path: '/a/x.ts', kind: 'file' },
        { op: 'written', path: '/a/x.md', kind: 'file' },
      ],
      touchedDirectories: ['/a'],
    };
    expect(
      watchEventsOfChangeSetFor(written, { paths: ['/a'], recursive: true, includes: ['**/*.ts'], excludes: [] }),
    ).toEqual([{ type: 'change', path: '/a/x.ts' }]);
  });
});
