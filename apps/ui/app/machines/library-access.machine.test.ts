/**
 * `libraryAccess` against today's `getProjectRouteAccess` (`hooks/use-project-manager.tsx` 2419 to 2545) and rules 8
 * and 9 of the LibraryCatalog README: one row per answer, an epoch that moves during each of the three reads, a
 * recovery that starts during `ensureProjectLibraryState`, the `today-access-loop` fix (a recovery that starts during
 * the route-config read), two questions in flight answered to their own ids, and the generation rules. Every port is
 * held by the test, and the fence inputs are sent as the library service will relay them.
 */
import { describe, expect, it } from 'vitest';
import { pathTable, unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import type { AnyActorRef, AnyMachineSnapshot } from 'xstate';
import type { ProjectDiscoveryEntry, ProjectDiscoveryResult } from '@taucad/filesystem';
import type { Project } from '@taucad/types';
import {
  accessOutcomeOf,
  createLibraryAccess,
  libraryAccessEventTypes,
  libraryAccessIgnoredEvents,
  libraryAccessMachine,
  libraryAccessQueryEventTypes,
  libraryAccessQueryIgnoredEvents,
  libraryAccessQueryMachine,
  selectOpenQuestions,
} from '#machines/library-access.machine.js';
import type {
  AccessAnswer,
  AccessFactEvent,
  AccessPass,
  LibraryAccessEmitted,
  LibraryAccessEvent,
  RouteVerification,
} from '#machines/library-access.machine.js';
import type { PendingProjectRecovery } from '#types/pending-project-operation.types.js';

type Held<I, O> = Readonly<{ input: I; resolve: (output: O) => void; reject: (error: unknown) => void }>;

const heldPort = <I, O>() => {
  const calls: Array<Held<I, O>> = [];
  const port = async (input: I): Promise<O> =>
    new Promise<O>((resolve, reject) => {
      calls.push({ input, resolve, reject });
    });
  return { calls, port };
};

const project = (id: string): Project => ({ id, name: id }) as unknown as Project;

const valid = (projectId: string): ProjectDiscoveryEntry =>
  ({
    status: 'valid',
    projectId,
    manifest: { name: projectId },
    locator: { backend: 'indexeddb', storageRootKey: 'home', relativeDirectory: projectId },
  }) as unknown as ProjectDiscoveryEntry;

const entry = (status: 'route-blocked' | 'duplicate-id', projectId: string): ProjectDiscoveryEntry =>
  ({ status, projectId }) as unknown as ProjectDiscoveryEntry;

const pass = (epoch: number, entries: readonly ProjectDiscoveryEntry[] = [], cached = false): AccessPass => ({
  epoch,
  result: { entries, roots: [] } as unknown as ProjectDiscoveryResult,
  cached,
});

const recovery = (projectId: string, status: 'recovering' | 'failed', operationId = `o-${projectId}`) =>
  ({
    operationId,
    projectId,
    kind: 'create',
    storage: {},
    status,
    ...(status === 'failed' ? { reason: 'workspace-unavailable' } : {}),
  }) as unknown as PendingProjectRecovery;

const start = () => {
  const guard = guardActors();
  const verify = heldPort<{ projectId: string }, RouteVerification>();
  const ensure = heldPort<{ projectId: string }, { deletedAt?: number }>();
  const discovery = heldPort<{ requestId: string; gen: number }, AccessPass>();
  const config = heldPort<
    { projectId: string; discovery: ProjectDiscoveryResult },
    'unavailable' | 'conflict' | 'missing'
  >();
  const spans: Array<{ outcome: string; cacheHits: number }> = [];
  const actor = createLibraryAccess({
    clock: new StepClock(),
    inspect: guard.inspect,
    ports: {
      verifyProjectRoute: async ({ projectId }) => verify.port({ projectId }),
      ensureProjectLibraryState: async ({ projectId }) => ensure.port({ projectId }),
      discoveryPass: async ({ requestId, gen }) => discovery.port({ requestId, gen }),
      getProjectFileSystemConfig: async ({ projectId, discovery: result }) =>
        config.port({ projectId, discovery: result }),
      beginAccessSpan: () => ({
        finish: (outcome, fields) => {
          spans.push({ outcome, cacheHits: fields.cacheHits });
        },
      }),
    },
  });
  const emitted: LibraryAccessEmitted[] = [];
  actor.on('*', (event) => {
    emitted.push(event as LibraryAccessEmitted);
  });
  actor.start();
  const send = (event: LibraryAccessEvent) => {
    actor.send(event);
  };
  const answers = (requestId: string) =>
    emitted.flatMap((event) =>
      event.type === 'accessAnswered' && event.requestId === requestId ? [event.answer] : [],
    );
  const answered = () => emitted.filter((event) => event.type === 'accessAnswered');
  return { actor, verify, ensure, discovery, config, spans, emitted, send, answers, answered, guard };
};

type Harness = ReturnType<typeof start>;

/** The journal is read with nothing pending and the bootstrap pass has run. */
const settledLibrary = (harness: Harness, epoch = 1) => {
  harness.send({ type: 'journalReady', pending: 0 });
  harness.send({ type: 'discoveryReady' });
  harness.send({ type: 'epochMoved', epoch, current: false });
};

const ask = (harness: Harness, requestId = 'q1', projectId = 'p1') => {
  harness.send({ type: 'accessAsked', requestId, projectId });
};

const resolve = async <I, O>(port: Readonly<{ calls: Array<Held<I, O>> }>, output: O) => {
  port.calls.at(-1)?.resolve(output);
  await flush();
};

describe('libraryAccess', () => {
  describe('one row per answer', () => {
    it.each([
      ['ready', {}],
      ['trashed', { deletedAt: 5 }],
    ] as const)(
      'should answer %s through verifyProjectRoute and ensureProjectLibraryState',
      async (status, library) => {
        const harness = start();
        settledLibrary(harness);
        ask(harness);
        await resolve(harness.verify, { status: 'verified', project: project('p1') });
        await resolve(harness.ensure, library);
        expect(harness.answers('q1')).toEqual([{ status, project: project('p1') }]);
        expect(harness.discovery.calls).toHaveLength(0);
        expect(harness.spans).toEqual([{ outcome: 'ok', cacheHits: 0 }]);
      },
    );

    it('should answer unavailable when verifyProjectRoute does', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'unavailable' });
      expect(harness.answers('q1')).toEqual([{ status: 'unavailable' }]);
    });

    it('should answer ready from a pass that finds the project, counting a cached listing', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      await resolve(harness.discovery, pass(1, [valid('p1')], true));
      await resolve(harness.ensure, {});
      expect(harness.answers('q1')).toEqual([{ status: 'ready', project: { name: 'p1', id: 'p1' } }]);
      expect(harness.spans).toEqual([{ outcome: 'ok', cacheHits: 1 }]);
    });

    it.each([
      ['route-blocked', 'unavailable'],
      ['duplicate-id', 'conflict'],
    ] as const)('should answer a %s entry as %s without reading the route config', async (status, answer) => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      await resolve(harness.discovery, pass(1, [entry(status, 'p1')]));
      expect(harness.answers('q1')).toEqual([{ status: answer }]);
      expect(harness.config.calls).toHaveLength(0);
    });

    it.each(['unavailable', 'conflict', 'missing'] as const)(
      'should answer %s as the route config classifies it',
      async (status) => {
        const harness = start();
        settledLibrary(harness);
        ask(harness);
        await resolve(harness.verify, { status: 'discovery-required' });
        await resolve(harness.discovery, pass(1, [valid('p2')]));
        expect(harness.config.calls[0]?.input.discovery.entries).toEqual([valid('p2')]);
        await resolve(harness.config, status);
        expect(harness.answers('q1')).toEqual([{ status }]);
        expect(harness.spans).toEqual([{ outcome: status === 'missing' ? 'missing' : 'unavailable', cacheHits: 0 }]);
      },
    );

    it('should answer recovering while a row is held, preferring an active row to a failed one', async () => {
      const harness = start();
      settledLibrary(harness);
      harness.send({
        type: 'recoveriesChanged',
        recoveries: [recovery('p1', 'failed', 'o1'), recovery('p1', 'recovering', 'o2')],
      });
      ask(harness);
      expect(harness.answers('q1')).toEqual([{ status: 'recovering', recovery: recovery('p1', 'recovering', 'o2') }]);
      expect(harness.verify.calls).toHaveLength(0);
    });

    it('should answer recovery-failed for a failed row', () => {
      const harness = start();
      settledLibrary(harness);
      harness.send({ type: 'recoveriesChanged', recoveries: [recovery('p1', 'failed')] });
      ask(harness);
      expect(harness.answers('q1')).toEqual([{ status: 'recovery-failed', recovery: recovery('p1', 'failed') }]);
      expect(harness.spans).toEqual([{ outcome: 'unavailable', cacheHits: 0 }]);
    });

    it('should answer error when a read rejects, and when the journal could not be read', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      harness.verify.calls[0]?.reject(new Error('worker gone'));
      await flush();
      expect(harness.answers('q1')).toEqual([{ status: 'error', message: 'worker gone' }]);
      const other = start();
      ask(other);
      other.send({ type: 'journalFailed', message: 'idb closed' });
      expect(other.answers('q1')).toEqual([{ status: 'error', message: 'idb closed' }]);
      expect(other.spans).toEqual([{ outcome: 'error', cacheHits: 0 }]);
    });

    it('should map every answer to the span outcome today records', () => {
      const outcomes = (
        [
          { status: 'ready', project: project('p') },
          { status: 'trashed', project: project('p') },
          { status: 'recovering', recovery: recovery('p', 'recovering') },
          { status: 'recovery-failed', recovery: recovery('p', 'failed') },
          { status: 'unavailable' },
          { status: 'conflict' },
          { status: 'missing' },
          { status: 'error', message: 'x' },
        ] as AccessAnswer[]
      ).map((answer) => accessOutcomeOf(answer));
      expect(outcomes).toEqual([
        'ok',
        'ok',
        'unavailable',
        'unavailable',
        'unavailable',
        'unavailable',
        'missing',
        'error',
      ]);
    });
  });

  describe('the journal and the bootstrap pass', () => {
    it('should wait for the journal, and for the bootstrap pass when rows were pending', () => {
      const harness = start();
      ask(harness);
      expect(harness.verify.calls).toHaveLength(0);
      harness.send({ type: 'journalReady', pending: 1 });
      expect(harness.verify.calls).toHaveLength(0);
      expect(harness.discovery.calls).toHaveLength(0);
      harness.send({ type: 'discoveryReady' });
      // Rows were pending: discovery decides, so no verification is attempted.
      expect(harness.verify.calls).toHaveLength(0);
      expect(harness.discovery.calls).toEqual([expect.objectContaining({ input: { requestId: 'q1', gen: 0 } })]);
    });

    it('should wait for the bootstrap pass before asking discovery', async () => {
      const harness = start();
      harness.send({ type: 'journalReady', pending: 0 });
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      expect(harness.discovery.calls).toHaveLength(0);
      harness.send({ type: 'discoveryReady' });
      expect(harness.discovery.calls).toHaveLength(1);
    });

    it('should answer error when the bootstrap pass fails while rows were pending, as today', () => {
      const harness = start();
      ask(harness, 'q1');
      harness.send({ type: 'journalReady', pending: 1 });
      harness.send({ type: 'discoveryFailed', message: 'scan failed' });
      expect(harness.answers('q1')).toEqual([{ status: 'error', message: 'scan failed' }]);
      // A later question waits for the next bootstrap pass, which clears the failure.
      harness.send({ type: 'discoveryReady' });
      ask(harness, 'q2');
      expect(harness.discovery.calls).toHaveLength(1);
    });

    it('should answer error when the bootstrap pass fails before a pass the query waits for', async () => {
      const harness = start();
      harness.send({ type: 'journalReady', pending: 0 });
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      harness.send({ type: 'discoveryFailed', message: 'scan failed' });
      expect(harness.answers('q1')).toEqual([{ status: 'error', message: 'scan failed' }]);
      expect(harness.discovery.calls).toHaveLength(0);
    });

    it('should read the journal again for a question asked after it failed, and answer once it is read', async () => {
      const harness = start();
      harness.send({ type: 'journalFailed', message: 'idb closed' });
      ask(harness, 'q1');
      ask(harness, 'q2', 'p2');
      expect(harness.emitted.filter((event) => event.type === 'journalWanted')).toHaveLength(1);
      expect(harness.answered()).toEqual([]);
      harness.send({ type: 'journalReady', pending: 0 });
      harness.send({ type: 'discoveryReady' });
      await resolve(harness.verify, { status: 'unavailable' });
      expect(harness.answers('q2')).toEqual([{ status: 'unavailable' }]);
      harness.verify.calls[0]?.resolve({ status: 'unavailable' });
      await flush();
      expect(harness.answers('q1')).toEqual([{ status: 'unavailable' }]);
    });

    it('should run the bootstrap pass again for a question asked after it failed', () => {
      const harness = start();
      ask(harness, 'q1');
      harness.send({ type: 'journalReady', pending: 1 });
      harness.send({ type: 'discoveryFailed', message: 'scan failed' });
      expect(harness.answers('q1')).toEqual([{ status: 'error', message: 'scan failed' }]);
      ask(harness, 'q2');
      expect(harness.emitted.filter((event) => event.type === 'discoveryWanted')).toHaveLength(1);
      expect(harness.answers('q2')).toEqual([]);
      harness.send({ type: 'discoveryReady' });
      expect(harness.discovery.calls).toEqual([expect.objectContaining({ input: { requestId: 'q2', gen: 0 } })]);
    });

    it('should skip verification while a current listing exists', () => {
      const harness = start();
      harness.send({ type: 'journalReady', pending: 0 });
      harness.send({ type: 'discoveryReady' });
      harness.send({ type: 'epochMoved', epoch: 1, current: true });
      ask(harness);
      expect(harness.verify.calls).toHaveLength(0);
      expect(harness.discovery.calls).toHaveLength(1);
    });
  });

  describe('every answer is fenced (rule 8)', () => {
    it('should read again when the epoch moves during verifyProjectRoute', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      harness.send({ type: 'epochMoved', epoch: 2, current: false });
      await resolve(harness.verify, { status: 'unavailable' });
      expect(harness.answers('q1')).toEqual([]);
      expect(harness.verify.calls).toHaveLength(2);
      await resolve(harness.verify, { status: 'unavailable' });
      expect(harness.answers('q1')).toEqual([{ status: 'unavailable' }]);
    });

    it('should read again on superseded', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'superseded' });
      expect(harness.verify.calls).toHaveLength(2);
    });

    it('should read again when the pass answers from an epoch that has since moved', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      harness.send({ type: 'epochMoved', epoch: 2, current: false });
      await resolve(harness.discovery, pass(1, [entry('route-blocked', 'p1')]));
      expect(harness.answers('q1')).toEqual([]);
      expect(harness.verify.calls).toHaveLength(2);
    });

    it("should fence a pass's answer on the pass's own epoch, not on the epoch the turn began at", async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      // The pass the query waits for started after the top of the loop, at epoch 2, and nothing moved since.
      harness.send({ type: 'epochMoved', epoch: 2, current: false });
      await resolve(harness.discovery, pass(2, [entry('route-blocked', 'p1')]));
      expect(harness.answers('q1')).toEqual([{ status: 'unavailable' }]);
      expect(harness.verify.calls).toHaveLength(1);
    });

    it("should fence the found path's ensure on the pass's own epoch", async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      harness.send({ type: 'epochMoved', epoch: 2, current: false });
      await resolve(harness.discovery, pass(2, [valid('p1')]));
      await resolve(harness.ensure, {});
      expect(harness.answers('q1')).toEqual([{ status: 'ready', project: { name: 'p1', id: 'p1' } }]);
      expect(harness.verify.calls).toHaveLength(1);
    });

    it('should not read again for a recovery of another project', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'verified', project: project('p1') });
      harness.send({ type: 'recoveryStarted', projectId: 'p9' });
      await resolve(harness.ensure, {});
      expect(harness.answers('q1')).toEqual([{ status: 'ready', project: project('p1') }]);
      expect(harness.verify.calls).toHaveLength(1);
    });

    it.each(['verified', 'found'] as const)(
      'should read again when the epoch moves during ensureProjectLibraryState (%s path)',
      async (path) => {
        const harness = start();
        settledLibrary(harness);
        ask(harness);
        if (path === 'verified') {
          await resolve(harness.verify, { status: 'verified', project: project('p1') });
        } else {
          await resolve(harness.verify, { status: 'discovery-required' });
          await resolve(harness.discovery, pass(1, [valid('p1')]));
        }
        harness.send({ type: 'epochMoved', epoch: 2, current: false });
        await resolve(harness.ensure, {});
        expect(harness.answers('q1')).toEqual([]);
        expect(harness.verify.calls).toHaveLength(2);
      },
    );

    it('should read again when the epoch moves during the route-config read', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      await resolve(harness.discovery, pass(1));
      harness.send({ type: 'epochMoved', epoch: 2, current: false });
      await resolve(harness.config, 'missing');
      expect(harness.answers('q1')).toEqual([]);
      expect(harness.verify.calls).toHaveLength(2);
    });

    it('should answer recovering when a recovery starts during ensureProjectLibraryState', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'verified', project: project('p1') });
      harness.send({ type: 'recoveryStarted', projectId: 'p1' });
      harness.send({ type: 'recoveriesChanged', recoveries: [recovery('p1', 'recovering')] });
      await resolve(harness.ensure, {});
      expect(harness.answers('q1')).toEqual([{ status: 'recovering', recovery: recovery('p1', 'recovering') }]);
    });

    it('should read again for a recovery that started and settled during a read', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'verified', project: project('p1') });
      // Started and settled before the read returned: the set is empty again, but the start is remembered.
      harness.send({ type: 'recoveryStarted', projectId: 'p1' });
      harness.send({ type: 'recoveryStarted', projectId: 'p9' });
      await resolve(harness.ensure, {});
      expect(harness.answers('q1')).toEqual([]);
      expect(harness.verify.calls).toHaveLength(2);
      await resolve(harness.verify, { status: 'verified', project: project('p1') });
      await resolve(harness.ensure, { deletedAt: 1 });
      expect(harness.answers('q1')).toEqual([{ status: 'trashed', project: project('p1') }]);
    });

    it('today-access-loop: should not answer missing when a recovery starts during the route-config read', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      await resolve(harness.verify, { status: 'discovery-required' });
      await resolve(harness.discovery, pass(1));
      harness.send({ type: 'recoveryStarted', projectId: 'p1' });
      harness.send({ type: 'recoveriesChanged', recoveries: [recovery('p1', 'recovering')] });
      await resolve(harness.config, 'missing');
      expect(harness.answers('q1')).toEqual([{ status: 'recovering', recovery: recovery('p1', 'recovering') }]);
    });
  });

  describe('answers are matched by id and generation (rule 9)', () => {
    it('should answer two questions in flight to their own ids', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness, 'q1', 'p1');
      ask(harness, 'q2', 'p2');
      expect(harness.verify.calls.map((call) => call.input.projectId)).toEqual(['p1', 'p2']);
      harness.verify.calls[1]?.resolve({ status: 'unavailable' });
      await flush();
      harness.verify.calls[0]?.resolve({ status: 'verified', project: project('p1') });
      await flush();
      await resolve(harness.ensure, {});
      expect(harness.answers('q2')).toEqual([{ status: 'unavailable' }]);
      expect(harness.answers('q1')).toEqual([{ status: 'ready', project: project('p1') }]);
      expect(selectOpenQuestions(harness.actor.getSnapshot())).toEqual([]);
    });

    it('should drop the first query when the id is asked again, and answer only the second', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness, 'q1', 'p1');
      ask(harness, 'q1', 'p2');
      expect(harness.spans).toEqual([{ outcome: 'error', cacheHits: 0 }]);
      harness.verify.calls[0]?.resolve({ status: 'unavailable' });
      await flush();
      expect(harness.answers('q1')).toEqual([]);
      await resolve(harness.verify, { status: 'verified', project: project('p2') });
      await resolve(harness.ensure, {});
      expect(harness.answers('q1')).toEqual([{ status: 'ready', project: project('p2') }]);
      expect(harness.discovery.calls).toHaveLength(0);
    });

    it('should end the span of every open question when the machine stops', () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness, 'q1', 'p1');
      ask(harness, 'q2', 'p2');
      harness.actor.stop();
      expect(harness.spans).toEqual([
        { outcome: 'error', cacheHits: 0 },
        { outcome: 'error', cacheHits: 0 },
      ]);
    });

    it('should keep only the first fault the root onError catches, and keep answering', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      // A report that breaks the answer's contract: the transition that reads it throws, each time differently.
      for (const broken of [undefined, null]) {
        harness.send({
          type: 'queryAnswered',
          requestId: 'q1',
          gen: 0,
          epoch: 1,
          answer: broken as unknown as AccessAnswer,
          cacheHits: 0,
        });
      }
      expect(harness.actor.getSnapshot().context.fault).toMatch(/undefined/u);
      expect(harness.guard.take('fault').length).toBeGreaterThan(0);
      await resolve(harness.verify, { status: 'unavailable' });
      expect(harness.answers('q1')).toEqual([{ status: 'unavailable' }]);
    });

    it('should answer nothing for a cancelled question, and drop a stale report', async () => {
      const harness = start();
      settledLibrary(harness);
      ask(harness);
      harness.send({ type: 'accessCancelled', requestId: 'q1' });
      harness.send({ type: 'accessCancelled', requestId: 'q1' });
      harness.verify.calls[0]?.resolve({ status: 'unavailable' });
      await flush();
      harness.send({
        type: 'queryAnswered',
        requestId: 'q1',
        gen: 0,
        epoch: 1,
        answer: { status: 'missing' },
        cacheHits: 0,
      });
      expect(harness.answered()).toEqual([]);
      // Asked again after the cancel, the id is at a later generation and a report of the old one is still stale.
      ask(harness);
      harness.send({
        type: 'queryAnswered',
        requestId: 'q1',
        gen: 0,
        epoch: 1,
        answer: { status: 'missing' },
        cacheHits: 0,
      });
      expect(harness.answered()).toEqual([]);
      expect(harness.actor.getSnapshot().context.questions['q1']?.gen).toBe(2);
      // The cancelled query's span ended once, as an error.
      expect(harness.spans).toEqual([{ outcome: 'error', cacheHits: 0 }]);
    });
  });
});

/* Totality (MC-R17). */
const facts: Record<AccessFactEvent['type'], readonly AccessFactEvent[]> = {
  epochMoved: [{ type: 'epochMoved', epoch: 1, current: false }],
  discoveryReady: [{ type: 'discoveryReady' }],
  discoveryFailed: [{ type: 'discoveryFailed', message: 'x' }],
  discoveryRetrying: [{ type: 'discoveryRetrying' }],
  journalRetrying: [{ type: 'journalRetrying' }],
  journalReady: [{ type: 'journalReady', pending: 0 }],
  journalFailed: [{ type: 'journalFailed', message: 'x' }],
  recoveriesChanged: [
    { type: 'recoveriesChanged', recoveries: [recovery('p1', 'recovering')] },
    { type: 'recoveriesChanged', recoveries: [recovery('p2', 'recovering')] },
  ],
  recoveryStarted: [{ type: 'recoveryStarted', projectId: 'p1' }],
};

const samples: Record<LibraryAccessEvent['type'], readonly LibraryAccessEvent[]> = {
  ...facts,
  accessAsked: [{ type: 'accessAsked', requestId: 'q', projectId: 'p1' }],
  accessCancelled: [{ type: 'accessCancelled', requestId: 'q' }],
  queryAnswered: [
    { type: 'queryAnswered', requestId: 'q', gen: 0, epoch: 0, answer: { status: 'missing' }, cacheHits: 0 },
  ],
};

const serializeState = (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value);
const parentRef = { id: 'parent', send: () => undefined } as unknown as AnyActorRef;
const queryInput = {
  requestId: 'q',
  gen: 0,
  projectId: 'p1',
  parentRef,
  facts: {
    epoch: 0,
    current: false,
    discoveryReady: false,
    discoveryError: undefined,
    journal: { status: 'loading' },
    recoveries: [],
  },
};

describe('libraryAccess totality', () => {
  it('should sample exactly the exported alphabets', () => {
    expect(Object.keys(samples).toSorted()).toEqual([...libraryAccessEventTypes].toSorted());
    expect(Object.keys(facts).toSorted()).toEqual([...libraryAccessQueryEventTypes].toSorted());
  });

  it('should answer every sampled event in its one state', () => {
    const options = { events: Object.values(samples).flat(), limit: 50, serializeState };
    expect(pathTable(libraryAccessMachine, options).map((row) => row.state)).toEqual([{}]);
    expect(unansweredEvents(libraryAccessMachine, { ...options, ignore: libraryAccessIgnoredEvents })).toEqual([]);
  });

  it('should answer every fence input in every query state it reaches by its inputs', () => {
    // The facts are part of the vertex: a query waits on them, so two waiting snapshots with other facts differ.
    const options = {
      input: queryInput,
      events: Object.values(facts).flat(),
      limit: 5000,
      serializeState: (snapshot: AnyMachineSnapshot) =>
        JSON.stringify({
          value: snapshot.value as unknown,
          facts: (snapshot.context as Readonly<{ facts: unknown }>).facts,
        }),
    };
    // The rest are entered only from a read's answer, which pure traversal never delivers.
    expect(unreachedStates(libraryAccessQueryMachine, options)).toEqual([
      'library-access-query.ensuring',
      'library-access-query.classifying',
    ]);
    expect(
      unansweredEvents(libraryAccessQueryMachine, { ...options, ignore: libraryAccessQueryIgnoredEvents }),
    ).toEqual([]);
  });
});
