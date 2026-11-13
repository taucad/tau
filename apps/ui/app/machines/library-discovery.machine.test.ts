/**
 * `libraryDiscovery` against the A0.4 discovery rows (`hooks/use-project-manager.discovery.test.ts`), written against
 * the machine: I7 (a pass an invalidation overtook writes and publishes nothing), I9 (a pass skipped during a write
 * stop is redone once the stop ends) and the single-flight and cache rules of rules 1 to 3 of the LibraryCatalog
 * README. Every port is held by the test, so each row decides exactly when a read returns.
 *
 * Path table (the shortest path to each state value), kept current with `pathTable` in the totality rows:
 *
 * 1. `pass.idle`, `stop.running`: initial
 * 2. `pass.idle`, `stop.stopped`: `writeStopBegan`
 * 3. `pass.passing`, `stop.running`: `passRequested`
 * 4. `pass.passing`, `stop.stopped`: `passRequested`, `writeStopBegan`
 */
import { describe, expect, it } from 'vitest';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { createCallbackLogic, matchesState } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import type { ProjectDiscoveryResult } from '@taucad/filesystem';
import {
  createLibraryDiscovery,
  libraryDiscoveryEventTypes,
  libraryDiscoveryIgnoredEvents,
  libraryDiscoveryMachine,
  selectCatalogCurrent,
  selectCurrentListing,
} from '#machines/library-discovery.machine.js';
import type {
  DiscoveryPlan,
  DiscoveryWrites,
  LibraryDiscoveryEmitted,
  LibraryDiscoveryEvent,
} from '#machines/library-discovery.machine.js';

type Held<I, O> = Readonly<{ input: I; resolve: (output: O) => void; reject: (error: unknown) => void }>;

/** A port the test answers by hand: every call waits until the test resolves it. */
const heldPort = <I, O>() => {
  const calls: Array<Held<I, O>> = [];
  const port = async (input: I): Promise<O> =>
    new Promise<O>((resolve, reject) => {
      calls.push({ input, resolve, reject });
    });
  return { calls, port };
};

const listing = (...projectIds: string[]): ProjectDiscoveryResult => ({
  entries: projectIds.map((projectId) => ({
    status: 'valid',
    projectId,
    manifest: { name: projectId },
    locator: { backend: 'indexeddb', storageRootKey: 'home', relativeDirectory: projectId },
  })) as unknown as ProjectDiscoveryResult['entries'],
  roots: [],
});

const writes = (upserts: number, deletes: readonly string[] = []): DiscoveryWrites => ({
  upserts: Array.from({ length: upserts }, (_, index) => ({ projectId: `p${String(index)}` })),
  deletes,
});

const start = () => {
  const guard = guardActors({ ignore: { 'library-discovery': libraryDiscoveryIgnoredEvents } });
  const scan = heldPort<{ epoch: number }, ProjectDiscoveryResult>();
  const plan = heldPort<{ epoch: number; result: ProjectDiscoveryResult }, DiscoveryPlan>();
  const apply = heldPort<{ epoch: number; writes: DiscoveryWrites }, void>();
  const actor = createLibraryDiscovery({
    clock: new StepClock(),
    inspect: guard.inspect,
    ports: { scan: scan.port, plan: plan.port, apply: apply.port },
  });
  const emitted: LibraryDiscoveryEmitted[] = [];
  actor.on('*', (event) => {
    emitted.push(event as LibraryDiscoveryEmitted);
  });
  actor.start();
  const send = (event: LibraryDiscoveryEvent) => {
    actor.send(event);
  };
  const answers = (requestId: string) =>
    emitted.filter(
      (event): event is Extract<LibraryDiscoveryEmitted, { requestId: string }> =>
        'requestId' in event && event.requestId === requestId,
    );
  return {
    actor,
    scan,
    plan,
    apply,
    emitted,
    send,
    answers,
    guard,
    ports: { scan: scan.port, plan: plan.port, apply: apply.port },
  };
};

/** Settle the pass in flight through all three steps. */
const settlePass = async (
  harness: ReturnType<typeof start>,
  result: ProjectDiscoveryResult,
  planned: DiscoveryWrites = writes(0),
) => {
  harness.scan.calls.at(-1)?.resolve(result);
  await flush();
  harness.plan.calls.at(-1)?.resolve({ result, writes: planned });
  await flush();
  if (planned.upserts.length > 0 || planned.deletes.length > 0) {
    harness.apply.calls.at(-1)?.resolve();
    await flush();
  }
};

describe('libraryDiscovery', () => {
  describe('a pass superseded by a newer epoch (I7)', () => {
    it.each(['scans', 'plans its writes'] as const)(
      'I7: should not write route configs from a pass whose epoch moved while it %s',
      async (step) => {
        const harness = start();
        harness.send({ type: 'passRequested', requestId: 'r1', reuse: false });
        if (step === 'scans') {
          harness.send({ type: 'invalidated' });
          harness.scan.calls[0]?.resolve(listing('a'));
          await flush();
        } else {
          harness.scan.calls[0]?.resolve(listing('a'));
          await flush();
          harness.send({ type: 'invalidated' });
          harness.plan.calls[0]?.resolve({ result: listing('a'), writes: writes(1, ['orphan']) });
          await flush();
        }
        // The stale pass wrote nothing and answered nobody; a fresh pass started for the requester.
        expect(harness.apply.calls).toHaveLength(0);
        expect(harness.answers('r1')).toEqual([]);
        expect(harness.scan.calls).toHaveLength(2);
        await settlePass(harness, listing('b'));
        expect(harness.answers('r1')).toEqual([
          {
            type: 'passSettled',
            requestId: 'r1',
            epoch: harness.actor.getSnapshot().context.epoch,
            result: listing('b'),
          },
        ]);
      },
    );

    it('I7: should not prune orphans from a pass whose epoch moved while it readied the worker', async () => {
      const harness = start();
      harness.send({ type: 'poll' });
      harness.scan.calls[0]?.resolve(listing('a'));
      await flush();
      // The plan port readies the worker; the epoch moves meanwhile.
      harness.send({ type: 'invalidated' });
      harness.plan.calls[0]?.resolve({ result: listing('a'), writes: writes(0, ['orphan']) });
      await flush();
      expect(harness.apply.calls).toHaveLength(0);
    });

    it('I7: should not publish a listing from a pass whose epoch moved while it wrote', async () => {
      const harness = start();
      harness.send({ type: 'passRequested', requestId: 'r1', reuse: false });
      harness.scan.calls[0]?.resolve(listing('a'));
      await flush();
      harness.plan.calls[0]?.resolve({ result: listing('a'), writes: writes(1) });
      await flush();
      harness.send({ type: 'invalidated' });
      harness.apply.calls[0]?.resolve();
      await flush();
      expect(selectCurrentListing(harness.actor.getSnapshot())).toBeUndefined();
      expect(harness.answers('r1')).toEqual([]);
      await settlePass(harness, listing('b'));
      expect(selectCurrentListing(harness.actor.getSnapshot())).toEqual(listing('b'));
    });

    it('I7: should drop the listing on an invalidation, so a reuse request reads again', async () => {
      const harness = start();
      harness.send({ type: 'poll' });
      await settlePass(harness, listing('a'));
      harness.send({ type: 'passRequested', requestId: 'cached', reuse: true });
      expect(harness.answers('cached')).toEqual([
        { type: 'passSettled', requestId: 'cached', epoch: 1, result: listing('a') },
      ]);
      expect(harness.scan.calls).toHaveLength(1);
      harness.send({ type: 'invalidated' });
      expect(selectCurrentListing(harness.actor.getSnapshot())).toBeUndefined();
      harness.send({ type: 'passRequested', requestId: 'fresh', reuse: true });
      expect(harness.scan.calls).toHaveLength(2);
    });

    it('I7: should serve every requester of the pass in flight from that one pass', async () => {
      const harness = start();
      harness.send({ type: 'passRequested', requestId: 'r1', reuse: false });
      harness.send({ type: 'passRequested', requestId: 'r2', reuse: true });
      harness.send({ type: 'poll' });
      await settlePass(harness, listing('a'));
      expect(harness.scan.calls).toHaveLength(1);
      expect(harness.answers('r1')).toHaveLength(1);
      expect(harness.answers('r2')).toHaveLength(1);
    });

    it('should announce every epoch move and listing change for the route-access fence', async () => {
      const harness = start();
      harness.send({ type: 'poll' });
      await settlePass(harness, listing('a'));
      harness.send({ type: 'invalidated' });
      expect(harness.emitted.filter((event) => event.type === 'epochMoved')).toEqual([
        { type: 'epochMoved', epoch: 1, current: false },
        { type: 'epochMoved', epoch: 1, current: true },
        { type: 'epochMoved', epoch: 2, current: false },
      ]);
    });

    it('should answer a failed pass with its error and keep a pass owed', async () => {
      const harness = start();
      harness.send({ type: 'passRequested', requestId: 'r1', reuse: false });
      harness.scan.calls[0]?.reject(new Error('worker gone'));
      await flush();
      expect(harness.answers('r1')).toEqual([
        { type: 'passFailed', requestId: 'r1', epoch: 1, message: 'worker gone' },
      ]);
      expect(selectCatalogCurrent(harness.actor.getSnapshot())).toBe(false);
    });
  });

  describe('a pass skipped during a write stop (I9)', () => {
    it('I9: should publish what it read, write nothing, and redo the pass once when the stop ends', async () => {
      const harness = start();
      harness.send({ type: 'writeStopBegan' });
      harness.send({ type: 'passRequested', requestId: 'r1', reuse: false });
      harness.scan.calls[0]?.resolve(listing('a'));
      await flush();
      expect(harness.plan.calls).toHaveLength(0);
      expect(harness.answers('r1')).toHaveLength(1);
      expect(selectCatalogCurrent(harness.actor.getSnapshot())).toBe(false);
      harness.send({ type: 'writeStopEnded' });
      // The redo starts without a requester, and the catalog is not current until it settles.
      expect(harness.scan.calls).toHaveLength(2);
      expect(selectCatalogCurrent(harness.actor.getSnapshot())).toBe(false);
      await settlePass(harness, listing('a'), writes(1));
      expect(harness.apply.calls).toHaveLength(1);
      expect(selectCatalogCurrent(harness.actor.getSnapshot())).toBe(true);
      // A later notice that the build is live owes nothing.
      harness.send({ type: 'writeStopBegan' });
      harness.send({ type: 'writeStopEnded' });
      expect(harness.scan.calls).toHaveLength(2);
    });

    it('I9: should skip the writes of a pass that meets a stop at its last read before writing', async () => {
      const harness = start();
      harness.send({ type: 'poll' });
      harness.scan.calls[0]?.resolve(listing('a'));
      await flush();
      harness.send({ type: 'writeStopBegan' });
      harness.plan.calls[0]?.resolve({ result: listing('a'), writes: writes(1) });
      await flush();
      expect(harness.apply.calls).toHaveLength(0);
      expect(harness.actor.getSnapshot().context.skipped).toBe(true);
    });

    it('I9: should let a pass still in flight end before the redo, and redo once', async () => {
      const harness = start();
      harness.send({ type: 'writeStopBegan' });
      harness.send({ type: 'poll' });
      harness.scan.calls[0]?.resolve(listing('a'));
      await flush();
      // A second pass starts during the stop and is still scanning when the stop ends.
      harness.send({ type: 'poll' });
      harness.send({ type: 'writeStopEnded' });
      expect(harness.scan.calls).toHaveLength(2);
      harness.scan.calls[1]?.resolve(listing('a'));
      await flush();
      // It was overtaken by the redo's invalidation, so a fresh pass reads and writes.
      expect(harness.plan.calls).toHaveLength(0);
      expect(harness.scan.calls).toHaveLength(3);
      await settlePass(harness, listing('a'), writes(1));
      expect(harness.apply.calls).toHaveLength(1);
      expect(harness.scan.calls).toHaveLength(3);
    });

    it('I9: should owe nothing when a stop ends that no pass ran into', () => {
      const harness = start();
      harness.send({ type: 'writeStopBegan' });
      harness.send({ type: 'writeStopEnded' });
      expect(harness.scan.calls).toHaveLength(0);
    });
  });

  describe('the observations', () => {
    it('should keep each observation error until it clears, and forward a refresh to both watches', () => {
      const received: Array<{ watch: string; event: LibraryDiscoveryEvent }> = [];
      const watch = (name: string) =>
        createCallbackLogic<LibraryDiscoveryEvent>(({ receive }) => {
          receive((event) => {
            received.push({ watch: name, event });
          });
        });
      const actor = createLibraryDiscovery({
        clock: new StepClock(),
        ports: {
          ...start().ports,
          discoveryObservation: watch('discovery'),
          metadataObservation: watch('metadata'),
        },
      });
      actor.start();
      actor.send({ type: 'observationChanged', observation: 'metadata', error: 'watch lost' });
      expect(actor.getSnapshot().context.observationErrors).toEqual({ metadata: 'watch lost' });
      actor.send({ type: 'observationChanged', observation: 'metadata' });
      expect(actor.getSnapshot().context.observationErrors).toEqual({});
      actor.send({ type: 'refreshObservations', resourceId: 'p1' });
      expect(received).toEqual([
        { watch: 'discovery', event: { type: 'refreshObservations', resourceId: 'p1' } },
        { watch: 'metadata', event: { type: 'refreshObservations', resourceId: 'p1' } },
      ]);
    });
  });
});

/* Totality (MC-R17): every public event is sampled in every reachable state. */
type Samples = { [T in LibraryDiscoveryEvent['type']]: ReadonlyArray<Extract<LibraryDiscoveryEvent, { type: T }>> };

const samples: Samples = {
  passRequested: [
    { type: 'passRequested', requestId: 'r', reuse: true },
    { type: 'passRequested', requestId: 'r', reuse: false },
  ],
  poll: [{ type: 'poll' }],
  invalidated: [{ type: 'invalidated' }],
  writeStopBegan: [{ type: 'writeStopBegan' }],
  writeStopEnded: [{ type: 'writeStopEnded' }],
  observationChanged: [{ type: 'observationChanged', observation: 'discovery', error: 'x' }],
  refreshObservations: [{ type: 'refreshObservations' }],
};

const options = {
  events: Object.values(samples).flat(),
  limit: 200,
  serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
};

describe('libraryDiscovery totality', () => {
  it('should sample exactly the exported alphabet', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...libraryDiscoveryEventTypes].toSorted());
  });

  it('should reach every state along the documented path table', () => {
    expect(
      pathTable(libraryDiscoveryMachine, options).map((row) => ({
        state: row.state,
        events: row.events.map((event) => event.type),
      })),
    ).toEqual([
      { state: { pass: 'idle', stop: 'running' }, events: [] },
      { state: { pass: 'passing', stop: 'running' }, events: ['passRequested'] },
      { state: { pass: 'idle', stop: 'stopped' }, events: ['writeStopBegan'] },
      { state: { pass: 'passing', stop: 'stopped' }, events: ['passRequested', 'writeStopBegan'] },
    ]);
    // `reconciling` is entered only from a scan's answer, which pure traversal never delivers.
    expect(unreachedStates(libraryDiscoveryMachine, options)).toEqual([
      'library-discovery.pass.reconciling',
      'library-discovery.pass.reconciling.planning',
      'library-discovery.pass.reconciling.writing',
    ]);
  });

  it('should answer every sampled event in every reachable state except the declared pairs', () => {
    expect(unansweredEvents(libraryDiscoveryMachine, { ...options, ignore: libraryDiscoveryIgnoredEvents })).toEqual(
      [],
    );
  });

  it('should declare no pair that the machine answers', () => {
    const gaps = unansweredEvents(libraryDiscoveryMachine, options);
    expect(
      libraryDiscoveryIgnoredEvents.filter(
        ([state, eventType]) => !gaps.some((gap) => gap.eventType === eventType && matchesState(state, gap.state)),
      ),
    ).toEqual([]);
  });
});
