import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeEventBus } from '#change-event-bus.js';
import type { ChangeSet, ChangeSetReset } from '#change-event-bus.js';
import { WatchRegistry, watchEventsOfChangeSetFor } from '#watch-registry.js';
import type { ChangeSetWatchRequest } from '#watch-registry.js';
import type { WatchEvent, WatchRequest } from '#types.js';
import { workerTimings } from '#worker-timings.js';

/**
 * Scoped topology resets (project-library fast-path FW5): `emitReset(prefixes)` reaches exactly the watches a changed
 * mount can be seen by, and each one with a prefix that covers everything the change made unreliable for it. A changed
 * mount at `P` changes what resolves at or below `P` and the listing of `P`'s parent, which names `P`; nothing else.
 */
describe('WatchRegistry.emitReset', () => {
  let bus: ChangeEventBus;
  let registry: WatchRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new ChangeEventBus();
    registry = new WatchRegistry(bus);
  });

  afterEach(() => {
    registry.dispose();
    vi.useRealTimers();
  });

  /** One change-set watch, returning the resets it heard. */
  const resetsOf = (request: ChangeSetWatchRequest): ChangeSetReset[] => {
    const heard: ChangeSetReset[] = [];
    registry.watchChangeSets(request, (set) => {
      if (set.reset !== undefined) {
        heard.push(set.reset);
      }
    });
    return heard;
  };

  /* What the watch can see of a changed mount at `/projects/x`, and the prefix it must re-read. */
  const reach: ReadonlyArray<{ name: string; request: WatchRequest; prefix: string | undefined }> = [
    { name: 'the root, recursive', request: { paths: ['/'], recursive: true }, prefix: '/projects' },
    { name: 'the root, direct', request: { paths: ['/'] }, prefix: undefined },
    { name: 'the parent, recursive', request: { paths: ['/projects'], recursive: true }, prefix: '/projects' },
    {
      name: 'the parent, direct (its listing names the mount)',
      request: { paths: ['/projects'] },
      prefix: '/projects',
    },
    {
      name: 'the prefix itself, recursive',
      request: { paths: ['/projects/x'], recursive: true },
      prefix: '/projects/x',
    },
    { name: 'the prefix itself, direct', request: { paths: ['/projects/x'] }, prefix: '/projects/x' },
    { name: 'a path below the prefix', request: { paths: ['/projects/x/src/a.ts'] }, prefix: '/projects/x' },
    { name: 'a sibling project', request: { paths: ['/projects/y'], recursive: true }, prefix: undefined },
    {
      name: 'a sibling that shares the name as a string prefix',
      request: { paths: ['/projects/xy'], recursive: true },
      prefix: undefined,
    },
    { name: 'another route kind', request: { paths: ['/checkouts/c'], recursive: true }, prefix: undefined },
    {
      name: 'a watch of both a sibling and the prefix',
      request: { paths: ['/projects/y', '/projects/x/a'], recursive: true },
      prefix: '/projects/x',
    },
    {
      name: 'a direct watch below the prefix and of a sibling',
      request: { paths: ['/projects/x/a', '/projects/y'] },
      prefix: '/projects/x',
    },
    {
      name: 'a direct watch below the prefix and of its parent: the parent covers both',
      request: { paths: ['/projects/x/a', '/projects'] },
      prefix: '/projects',
    },
    {
      name: 'a watch whose globs would admit nothing under the prefix: still reset, as emitResetAll would',
      request: { paths: ['/'], recursive: true, includes: ['nothing/**'] },
      prefix: '/projects',
    },
  ];

  it.each(reach)('should reset $name as far as the change reaches it', ({ request, prefix }) => {
    const heard = resetsOf(request);

    registry.emitReset(['/projects/x']);

    expect(heard).toEqual(prefix === undefined ? [] : [{ prefix, reason: 'topology' }]);
  });

  it('should reset every watch with a root reset when a prefix is the root, as emitResetAll does', () => {
    const scoped = [resetsOf({ paths: ['/projects/y'], recursive: true }), resetsOf({ paths: ['/'] })];

    registry.emitReset(['/projects/x', '/']);

    expect(scoped).toEqual([[{ prefix: '/', reason: 'topology' }], [{ prefix: '/', reason: 'topology' }]]);
  });

  it('should reset each watch once, covering every changed prefix it can see (a route move between projects)', () => {
    const root = resetsOf({ paths: ['/'], recursive: true });
    const from = resetsOf({ paths: ['/projects/x'], recursive: true });
    const to = resetsOf({ paths: ['/projects/y'], recursive: true });
    const both = resetsOf({ paths: ['/projects/x', '/projects/y'], recursive: true });
    const other = resetsOf({ paths: ['/projects/z'], recursive: true });

    registry.emitReset(['/projects/x', '/projects/y']);

    expect(root).toEqual([{ prefix: '/projects', reason: 'topology' }]);
    expect(from).toEqual([{ prefix: '/projects/x', reason: 'topology' }]);
    expect(to).toEqual([{ prefix: '/projects/y', reason: 'topology' }]);
    expect(both).toEqual([{ prefix: '/projects', reason: 'topology' }]);
    expect(other).toEqual([]);
  });

  it('should reset a watch inside a mount nested in another mount, and the outer mount watch, but not a sibling', () => {
    const outer = resetsOf({ paths: ['/a'], recursive: true });
    const inner = resetsOf({ paths: ['/a/b/c'], recursive: true });
    const sibling = resetsOf({ paths: ['/a/c'], recursive: true });

    registry.emitReset(['/a/b']);

    expect(outer).toEqual([{ prefix: '/a', reason: 'topology' }]);
    expect(inner).toEqual([{ prefix: '/a/b', reason: 'topology' }]);
    expect(sibling).toEqual([]);
  });

  it('should reset a per-path watch exactly when the change reaches it, flushing what it held first', () => {
    const reached: WatchEvent[] = [];
    const unreached: WatchEvent[] = [];
    registry.watch({ paths: ['/projects/x'], recursive: true }, (event) => reached.push(event));
    registry.watch({ paths: ['/projects/y'], recursive: true }, (event) => unreached.push(event));
    bus.emit({ type: 'fileWritten', path: '/projects/x/a.ts', backend: 'memory' });

    registry.emitReset(['/projects/x']);

    expect(reached).toEqual([{ type: 'change', path: '/projects/x/a.ts' }, { type: 'reset' }]);
    expect(unreached).toEqual([]);
  });

  it('should flush a frame watch before its scoped reset, and leave an unreached frame watch pending', () => {
    let tick: (() => void) | undefined;
    registry.dispose();
    registry = new WatchRegistry(bus, {
      frameScheduler: (callback) => {
        tick = callback;
        return () => undefined;
      },
    });
    const reached: ChangeSet[] = [];
    const unreached: ChangeSet[] = [];
    registry.watchChangeSets({ paths: ['/projects/x'], recursive: true, coalesce: 'frame' }, (set) =>
      reached.push(set),
    );
    registry.watchChangeSets({ paths: ['/projects/y'], recursive: true, coalesce: 'frame' }, (set) =>
      unreached.push(set),
    );
    bus.emit({ type: 'fileWritten', path: '/projects/x/a.ts', backend: 'memory' });
    bus.emit({ type: 'fileWritten', path: '/projects/y/b.ts', backend: 'memory' });

    registry.emitReset(['/projects/x']);

    expect(reached.map((set) => set.reset ?? set.entries.map((entry) => entry.path))).toEqual([
      ['/projects/x/a.ts'],
      { prefix: '/projects/x', reason: 'topology' },
    ]);
    expect(unreached).toEqual([]);
    tick?.();
    expect(unreached.flatMap((set) => set.entries.map((entry) => entry.path))).toEqual(['/projects/y/b.ts']);
  });

  it('should reset watches registered under a captured authority as well, by path alone', () => {
    const authority = {};
    const heard: ChangeSet[] = [];
    registry.watchChangeSets({ paths: ['/projects/x'], recursive: true }, (set) => heard.push(set), { authority });

    registry.emitReset(['/projects/x']);

    expect(heard.map((set) => set.reset)).toEqual([{ prefix: '/projects/x', reason: 'topology' }]);
  });

  it('should count one delivery per handler it resets, and none for a watch it leaves alone', () => {
    const before = workerTimings.summarize(0).counters;
    for (let index = 0; index < 50; index++) {
      registry.watchChangeSets({ paths: [`/projects/p${index}`], recursive: true }, () => undefined);
      registry.watch({ paths: [`/projects/p${index}`], recursive: true }, () => undefined);
    }

    registry.emitReset(['/projects/p7']);

    const after = workerTimings.summarize(0).counters;
    const moved = (name: 'watch.changeSets' | 'watch.pathEvents'): number =>
      (after[name]?.total ?? 0) - (before[name]?.total ?? 0);
    expect(moved('watch.changeSets')).toBe(1);
    expect(moved('watch.pathEvents')).toBe(1);
  });

  /*
   * The equivalence the scoping rests on: for every watch, the scoped reset says "re-read" wherever the global one
   * would have and the change could be seen. A client that reads per-path events off a change set
   * (`watchEventsOfChangeSetFor`) hears a reset from the scoped set exactly when the changed mount is within its sight,
   * and from the global one always: the two differ only for watches that cannot see the change.
   */
  it('should give a per-path reader of the scoped set a reset whenever the change is within its sight', () => {
    const prefix = '/projects/x';
    const requests: WatchRequest[] = reach.map(({ request }) => request);
    for (const request of requests) {
      const heard: ChangeSet[] = [];
      const stop = registry.watchChangeSets(request, (set) => heard.push(set));
      registry.emitReset([prefix]);
      stop();
      const scoped = heard.flatMap((set) => watchEventsOfChangeSetFor(set, request));
      const global = watchEventsOfChangeSetFor(
        { generation: 0, entries: [], touchedDirectories: [], reset: { prefix: '/', reason: 'topology' } },
        request,
      );
      /* The change at `prefix` as a summary fact: what a watch could have heard of it. */
      const sight = watchEventsOfChangeSetFor(
        { generation: 0, entries: [], touchedDirectories: [], reset: { prefix, reason: 'topology' } },
        request,
      );
      expect(global).toEqual([{ type: 'reset' }]);
      expect(scoped).toEqual(sight);
    }
  });
});
