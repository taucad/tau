import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { NodeFsAuthorityHost, serveNodeFsProvider, toNodeFsPort } from '@taucad/filesystem/backend/node';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { fileParameterEntrySchema } from '@taucad/types';
import type { FileParameterEntry } from '@taucad/types';
import { createActor, fromCallback, fromPromise, SimulatedClock, waitFor } from 'xstate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as machineModule from '#parameter-set.machine.js';
import { parameterSetMachine } from '#parameter-set.machine.js';
import type {
  ParameterSetApplyInput,
  ParameterSetApplyResult,
  ParameterSetAuthoritySnapshot,
  ParameterSetFlushInput,
  ParameterSetIdentity,
  ParameterSetMachineEvent,
  ParameterSetObserveInput,
  ParameterSetOutcome,
  ParameterSetPlanInput,
  ParameterSetPlanResult,
  ParameterSetReconcileInput,
  ParameterSetRequest,
  ParameterSetResolveInput,
} from '#parameter-set.machine.js';

const target = { authority: 'node:project', root: '/project', checkout: 'main', entry: 'main.ts' } as const;
const initialIdentity: ParameterSetIdentity = {
  sourceRevision: 'source:1',
  manifestRevision: 'manifest:1',
  valueRevision: 'value:1',
  dependencyRevision: 'dependency:1',
};
const initialEntry = fileParameterEntrySchema.parse({
  activeGroup: 'default',
  order: ['default', 'alternate'],
  groups: {
    default: { values: { width: 10 } },
    alternate: { values: { width: 20 } },
  },
  identity: initialIdentity,
});
const initialSnapshot: ParameterSetAuthoritySnapshot = { entry: initialEntry, identity: initialIdentity };

const nativeRequest = (requestId = 'request-1', value = 25): ParameterSetRequest => ({
  requestId,
  draftGeneration: 1,
  fingerprint: `fingerprint:${requestId}`,
  expected: initialIdentity,
  pressure: 'final',
  operation: {
    kind: 'native-value',
    group: 'default',
    parameterId: 'width',
    resource: 'urn:test:schema',
    pointer: '/width',
    value,
  },
});

const committedSnapshot = (request: ParameterSetRequest, value = 25): ParameterSetAuthoritySnapshot => {
  const identity = { ...initialIdentity, valueRevision: `value:${request.requestId}` };
  const entry = fileParameterEntrySchema.parse({
    ...initialEntry,
    groups: {
      ...initialEntry.groups,
      default: {
        values: { ...initialEntry.groups['default']!.values, width: value },
        bindings: {
          '/width': {
            parameter: { value: 'width', stability: 'stable' },
            schema: { resource: 'urn:test:schema', pointer: '/properties/width' },
            unit: 'mm',
            provenance: {
              unit: {
                origin: 'inferred',
                producer: 'tau-defaults',
                sourceRevision: identity.sourceRevision,
                profile: 'tau-defaults-v1',
                rule: 'length-name',
                evidence: 'width',
              },
            },
          },
        },
      },
    },
    identity,
    lastOperation: {
      requestId: request.requestId,
      fingerprint: request.fingerprint,
      outcome: 'committed',
      ...identity,
    },
  });
  return { entry, identity };
};

const committedRecordSnapshot = (request: ParameterSetRequest, record: unknown): ParameterSetAuthoritySnapshot => {
  const identity = { ...initialIdentity, valueRevision: `value:${request.requestId}` };
  const entry = fileParameterEntrySchema.parse({
    ...(record as Readonly<Record<string, unknown>>),
    identity,
    lastOperation: {
      requestId: request.requestId,
      fingerprint: request.fingerprint,
      outcome: 'committed',
      ...identity,
    },
  });
  return { entry, identity };
};

type CheckedGroupOperation = Extract<
  ParameterSetRequest['operation'],
  Readonly<{ kind: 'select-group' | 'rename-group' | 'reset-group' }>
>;

type ParameterSetObserveActor = ReturnType<typeof fromCallback<ParameterSetMachineEvent, ParameterSetObserveInput>>;

const applyCheckedGroupPlan = (entry: FileParameterEntry, operation: CheckedGroupOperation): FileParameterEntry => {
  const record = structuredClone(entry);
  switch (operation.kind) {
    case 'select-group': {
      record.activeGroup = operation.group;
      break;
    }
    case 'rename-group': {
      const { group, nextGroup } = operation;
      const renamed = record.groups[group]!;
      record.groups = {
        ...Object.fromEntries(Object.entries(record.groups).filter(([name]) => name !== group)),
        [nextGroup]: renamed,
      };
      record.order = record.order?.map((name) => (name === group ? nextGroup : name));
      break;
    }
    case 'reset-group': {
      record.groups[operation.group] = { values: {} };
      break;
    }
  }
  return record;
};

type HarnessOptions = Readonly<{
  clock?: SimulatedClock;
  resolve?: (input: ParameterSetResolveInput) => Promise<ParameterSetAuthoritySnapshot>;
  plan?: (input: ParameterSetPlanInput) => Promise<ParameterSetPlanResult>;
  apply?: (input: ParameterSetApplyInput) => Promise<ParameterSetApplyResult>;
  read?: (input: ParameterSetReconcileInput) => Promise<ParameterSetAuthoritySnapshot>;
  flush?: (input: ParameterSetFlushInput) => Promise<void>;
  observe?: (input: ParameterSetObserveInput, sendBack: (event: ParameterSetMachineEvent) => void) => () => void;
  observeActor?: ParameterSetObserveActor;
}>;

const defaultPlan = async ({ request }: ParameterSetPlanInput): Promise<ParameterSetPlanResult> => ({
  status: 'ready',
  proposed: committedSnapshot(
    request,
    request.operation.kind === 'native-value' ? Number(request.operation.value) : 25,
  ),
});

const defaultApply = async ({ proposed }: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
  status: 'applied',
  current: structuredClone(proposed),
});

const providedMachine = (options: HarnessOptions = {}) =>
  parameterSetMachine.provide({
    actors: {
      resolveParameterSet: fromPromise<ParameterSetAuthoritySnapshot, ParameterSetResolveInput>(async ({ input }) =>
        options.resolve ? options.resolve(input) : structuredClone(initialSnapshot),
      ),
      planParameterOperation: fromPromise<ParameterSetPlanResult, ParameterSetPlanInput>(async ({ input }) =>
        options.plan ? options.plan(input) : defaultPlan(input),
      ),
      applyParameterOperation: fromPromise<ParameterSetApplyResult, ParameterSetApplyInput>(async ({ input }) =>
        options.apply ? options.apply(input) : { status: 'applied', current: structuredClone(input.proposed) },
      ),
      readParameterSet: fromPromise<ParameterSetAuthoritySnapshot, ParameterSetReconcileInput>(async ({ input }) =>
        options.read ? options.read(input) : structuredClone(initialSnapshot),
      ),
      flushParameterSet: fromPromise<void, ParameterSetFlushInput>(async ({ input }) => options.flush?.(input)),
      observeParameterSet:
        options.observeActor ??
        fromCallback<ParameterSetMachineEvent, ParameterSetObserveInput>(({ input, sendBack }) =>
          options.observe ? options.observe(input, sendBack) : () => undefined,
        ),
    },
  });

const startActor = (options?: HarnessOptions) => {
  const actor = createActor(providedMachine(options), {
    ...(options?.clock === undefined ? {} : { clock: options.clock }),
    input: { target, initialRequestId: 'resolve:initial' },
  });
  actor.start();
  return actor;
};

const failingObserver = (capture: (fail: () => void) => void): ParameterSetObserveActor =>
  fromCallback<ParameterSetMachineEvent, ParameterSetObserveInput>(({ receive, self }) => {
    receive(() => {
      throw new Error('Controlled observer failure');
    });
    capture(() => {
      self.send({ type: 'watch.error', generation: 0, code: 'CONTROLLED', message: 'fail observer' });
    });
    return () => undefined;
  });

const waitForReady = async (actor: ReturnType<typeof startActor>): Promise<void> => {
  await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'ready' }));
};

const submitUnchecked = (actor: ReturnType<typeof startActor>, request: unknown): void => {
  Reflect.apply(actor.send, actor, [{ type: 'submit', request }]);
};

const activeSandboxes: string[] = [];

afterEach(() => {
  for (const sandbox of activeSandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

const isMachine = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'getInitialSnapshot' in value && 'transition' in value;

describe('parameterSetMachine public owner', () => {
  it('rejects invalid input, starts headlessly, keeps snapshots serializable, and exports one machine value', async () => {
    const invalid = createActor(providedMachine(), {
      input: { target: { authority: '', root: '/project', entry: 'main.ts' }, initialRequestId: 'resolve:initial' },
    });
    invalid.start();
    expect(invalid.getSnapshot().matches('invalidInput')).toBe(true);

    const actor = startActor();
    await waitForReady(actor);

    expect(JSON.stringify(actor.getSnapshot().context)).toContain('"authority":"node:project"');
    expect(Object.values(machineModule).filter((value) => isMachine(value))).toEqual([parameterSetMachine]);

    invalid.stop();
    actor.stop();
  });

  it('publishes only the latest A/B resolution and keeps the last good value on failure', async () => {
    const initial = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const second = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const third = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const calls: ParameterSetResolveInput[] = [];
    const actor = startActor({
      resolve: async (input) => {
        calls.push(structuredClone(input));
        if (input.requestId === 'resolve:initial') {
          return initial.promise;
        }
        if (input.requestId === 'resolve:b') {
          return second.promise;
        }
        return third.promise;
      },
    });

    actor.send({ type: 'resolve', requestId: 'resolve:b' });
    second.resolve(committedSnapshot(nativeRequest('b'), 30));
    await waitForReady(actor);

    initial.resolve(initialSnapshot);
    await Promise.resolve();
    expect(actor.getSnapshot().context.current?.identity.valueRevision).toBe('value:b');

    actor.send({ type: 'resolve', requestId: 'resolve:c' });
    third.reject(Object.assign(new Error('offline'), { code: 'RESOLVE_OFFLINE' }));
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'resolutionFailed' }));
    expect(actor.getSnapshot().context.diagnostic).toMatchObject({ code: 'RESOLVE_OFFLINE', recoverable: true });
    expect(actor.getSnapshot().context.current?.identity.valueRevision).toBe('value:b');
    expect(calls.map(({ target: calledTarget }) => calledTarget)).toEqual([target, target, target]);
    actor.stop();
  });

  it('admits or rejects retained requests after startup and refresh resolution without rebasing', async () => {
    const startupRead = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const startupPlans: string[] = [];
    const startup = startActor({
      resolve: async () => startupRead.promise,
      plan: async (input) => {
        startupPlans.push(input.request.requestId);
        return defaultPlan(input);
      },
    });
    startup.send({ type: 'submit', request: nativeRequest('startup-pending') });
    startupRead.resolve(initialSnapshot);
    await waitFor(
      startup,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === 'startup-pending',
    );
    expect(startupPlans).toEqual(['startup-pending']);
    startup.stop();

    const refreshRead = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    let refreshReads = 0;
    const refreshPlans: string[] = [];
    const refreshing = startActor({
      resolve: async () => {
        refreshReads += 1;
        return refreshReads === 1 ? initialSnapshot : refreshRead.promise;
      },
      plan: async (input) => {
        refreshPlans.push(input.request.requestId);
        return defaultPlan(input);
      },
    });
    await waitForReady(refreshing);
    refreshing.send({ type: 'watch.changed', generation: 0, requestId: 'refresh:1' });
    refreshing.send({ type: 'submit', request: nativeRequest('refresh-pending') });
    refreshRead.resolve(initialSnapshot);
    await waitFor(
      refreshing,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === 'refresh-pending',
    );
    expect(refreshPlans).toEqual(['refresh-pending']);
    refreshing.stop();

    const escapedApply = Promise.withResolvers<ParameterSetApplyResult>();
    const afterApplyRead = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    let afterApplyReads = 0;
    const afterApplyPlans: string[] = [];
    const afterApply = startActor({
      resolve: async () => {
        afterApplyReads += 1;
        return afterApplyReads === 1 ? initialSnapshot : afterApplyRead.promise;
      },
      plan: async (input) => {
        afterApplyPlans.push(input.request.requestId);
        return defaultPlan(input);
      },
      apply: async (input) =>
        input.request.requestId === 'active' ? escapedApply.promise : { status: 'applied', current: input.proposed },
    });
    await waitForReady(afterApply);
    afterApply.send({ type: 'submit', request: nativeRequest('active') });
    await waitFor(afterApply, (snapshot) => snapshot.matches({ operational: 'applying' }));
    afterApply.send({ type: 'watch.changed', generation: 0, requestId: 'refresh:after-apply' });
    afterApply.send({ type: 'submit', request: nativeRequest('final-after-refresh') });
    escapedApply.reject(Object.assign(new Error('not dispatched'), { applicationState: 'known-not-applied' }));
    afterApplyRead.resolve(initialSnapshot);
    await waitFor(
      afterApply,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === 'final-after-refresh',
    );
    expect(afterApplyPlans).toEqual(['active', 'final-after-refresh']);
    afterApply.stop();
  });

  it('settles a matching pending cancellation once without planning or applying it', async () => {
    const firstApply = Promise.withResolvers<ParameterSetApplyResult>();
    const plans: string[] = [];
    const applies: string[] = [];
    const seen: Array<Readonly<{ requestId: string; status: string }>> = [];
    const actor = startActor({
      plan: async (input) => {
        plans.push(input.request.requestId);
        return defaultPlan(input);
      },
      apply: async (input) => {
        applies.push(input.request.requestId);
        return input.request.requestId === 'A' ? firstApply.promise : { status: 'applied', current: input.proposed };
      },
    });
    actor.subscribe((snapshot) => {
      if (snapshot.context.outcome) {
        seen.push({ requestId: snapshot.context.outcome.requestId, status: snapshot.context.outcome.status });
      }
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: nativeRequest('A') });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    actor.send({ type: 'submit', request: nativeRequest('B') });
    actor.send({ type: 'cancel', requestId: 'B' });
    expect(seen).toContainEqual({ requestId: 'B', status: 'cancelled-before-apply' });
    firstApply.reject(Object.assign(new Error('not dispatched'), { applicationState: 'known-not-applied' }));
    await waitForReady(actor);
    expect(plans).toEqual(['A']);
    expect(applies).toEqual(['A']);
    expect(seen.filter(({ requestId }) => requestId === 'B')).toHaveLength(1);
    actor.stop();
  });

  it('restarts a read when its watch generation is invalidated during startup or reconnect', async () => {
    const firstRead = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const newer = committedSnapshot(nativeRequest('external'), 30);
    let reads = 0;
    const startup = startActor({
      resolve: async () => {
        reads += 1;
        return reads === 1 ? firstRead.promise : newer;
      },
    });
    startup.send({ type: 'watch.changed', generation: 0, requestId: 'watch:newer' });
    firstRead.resolve(initialSnapshot);
    await waitForReady(startup);
    expect(reads).toBe(2);
    expect(startup.getSnapshot().context.current?.identity).toEqual(newer.identity);
    startup.stop();

    const reconnectRead = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const reconnectNewer = committedSnapshot(nativeRequest('reconnect-newer'), 40);
    const watchSenders: Array<(event: ParameterSetMachineEvent) => void> = [];
    let reconnectReads = 0;
    const reconnect = startActor({
      resolve: async () => {
        reconnectReads += 1;
        if (reconnectReads === 1) {
          return initialSnapshot;
        }
        if (reconnectReads === 2) {
          return reconnectRead.promise;
        }
        return reconnectNewer;
      },
      observe: (_input, sendBack) => {
        watchSenders.push(sendBack);
        return () => undefined;
      },
    });
    await waitForReady(reconnect);
    watchSenders[0]!({ type: 'watch.error', generation: 0, code: 'WATCH_LOST', message: 'lost' });
    await waitFor(reconnect, (snapshot) => snapshot.matches('disconnected'));
    reconnect.send({ type: 'watch.retry', requestId: 'reconnect' });
    await waitFor(reconnect, (snapshot) => snapshot.matches({ operational: 'resolving' }));
    watchSenders[1]!({ type: 'watch.changed', generation: 1, requestId: 'watch:reconnect-newer' });
    reconnectRead.resolve(initialSnapshot);
    await waitForReady(reconnect);
    expect(reconnectReads).toBe(3);
    expect(reconnect.getSnapshot().context.current?.identity).toEqual(reconnectNewer.identity);
    reconnect.stop();
  });

  it('rejects non-JSON and unsupported requests before retention while accepting nested JSON', async () => {
    const plan = Promise.withResolvers<ParameterSetPlanResult>();
    const observed: ParameterSetPlanInput[] = [];
    const actor = startActor({
      plan: async (input) => {
        observed.push(input);
        return plan.promise;
      },
    });
    await waitForReady(actor);
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    const invalidValues: readonly unknown[] = [12n, () => undefined, cyclic, Number.NaN, Number.POSITIVE_INFINITY];
    for (const [index, value] of invalidValues.entries()) {
      const request = nativeRequest(`invalid:${index}`);
      submitUnchecked(actor, { ...request, operation: { ...request.operation, value } });
      expect(actor.getSnapshot().context.outcome).toMatchObject({
        status: 'rejected',
        requestId: `invalid:${index}`,
        code: 'INVALID_REQUEST',
      });
      expect(actor.getSnapshot().context.activeRequest).toBeUndefined();
      expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
    }
    submitUnchecked(actor, null);
    expect(actor.getSnapshot().context.outcome).toMatchObject({
      status: 'rejected',
      requestId: 'unknown',
      code: 'INVALID_REQUEST',
    });
    const unsupported = nativeRequest('unsupported');
    submitUnchecked(actor, { ...unsupported, operation: { kind: 'execute-script', source: 'return 1' } });
    expect(actor.getSnapshot().context.outcome).toMatchObject({ requestId: 'unsupported', code: 'INVALID_REQUEST' });

    const nested: ParameterSetRequest = {
      ...nativeRequest('nested-json', 0),
      operation: {
        kind: 'native-value',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test:schema',
        pointer: '/width',
        value: { dimensions: [1, 2, { enabled: true, note: null }], metadata: { label: 'valid' } },
      },
    };
    actor.send({
      type: 'submit',
      request: nested,
    });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
    expect(observed[0]?.request.operation).toMatchObject({ kind: 'native-value' });
    expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
    plan.resolve({ status: 'ready', proposed: committedSnapshot(nested) });
    await waitForReady(actor);
    actor.stop();
  });

  it('applies an inferred binding without confirmation using immutable operation snapshots', async () => {
    const plans: ParameterSetPlanInput[] = [];
    const applies: ParameterSetApplyInput[] = [];
    const actor = startActor({
      plan: async (input) => {
        plans.push(structuredClone(input));
        return defaultPlan(input);
      },
      apply: async (input) => {
        applies.push(structuredClone(input));
        return { status: 'applied', current: input.proposed };
      },
    });
    await waitForReady(actor);
    const request = nativeRequest();
    actor.send({ type: 'submit', request });
    await waitFor(
      actor,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'committed',
    );

    expect(actor.getSnapshot().context.outcome).toMatchObject({
      status: 'committed',
      requestId: request.requestId,
      write: 'applied',
    });
    expect(plans).toEqual([{ target, request, current: initialSnapshot }]);
    const applyInput = applies.at(0);
    expect(applyInput).toMatchObject({ target, request, expected: initialIdentity });
    if (!applyInput) {
      throw new Error('Expected checked apply input');
    }
    expect(applyInput.proposed.entry.groups['default']!.bindings?.['/width']?.provenance?.unit?.origin).toBe(
      'inferred',
    );
    actor.stop();
  });

  it.each([
    {
      name: 'unit-bearing edit',
      operation: {
        kind: 'unit-value',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test:schema',
        pointer: '/width',
        inputUnit: 'in',
        value: '1/2',
      },
    },
    {
      name: 'batch',
      operation: {
        kind: 'batch',
        group: 'default',
        edits: [{ parameterId: 'width', resource: 'urn:test:schema', pointer: '/width', value: 12 }],
      },
    },
    { name: 'group reset', operation: { kind: 'reset-group', group: 'default' } },
    { name: 'group selection', operation: { kind: 'select-group', group: 'alternate' } },
    { name: 'group rename', operation: { kind: 'rename-group', group: 'alternate', nextGroup: 'wide' } },
    {
      name: 'inference confirmation',
      operation: {
        kind: 'confirm-inference',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test:schema',
        pointer: '/width',
      },
    },
  ] as const)('routes a $name through the one checked operation sequence', async ({ name, operation }) => {
    const request: ParameterSetRequest = { ...nativeRequest(`operation:${name}`), operation };
    const plan = vi.fn(async (input: ParameterSetPlanInput): Promise<ParameterSetPlanResult> => {
      if (input.request.operation.kind === 'select-group') {
        return {
          status: 'ready',
          proposed: committedRecordSnapshot(input.request, { ...initialEntry, activeGroup: 'alternate' }),
        };
      }
      if (input.request.operation.kind === 'rename-group') {
        return {
          status: 'ready',
          proposed: committedRecordSnapshot(input.request, {
            ...initialEntry,
            order: ['default', 'wide'],
            groups: {
              default: initialEntry.groups['default'],
              wide: initialEntry.groups['alternate'],
            },
          }),
        };
      }
      if (input.request.operation.kind === 'reset-group') {
        return {
          status: 'ready',
          proposed: committedRecordSnapshot(input.request, {
            ...initialEntry,
            groups: { ...initialEntry.groups, default: { values: {} } },
          }),
        };
      }
      return defaultPlan(input);
    });
    const actor = startActor({ plan });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    await waitFor(
      actor,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'committed',
    );
    expect(plan.mock.calls[0]?.[0].request.operation).toEqual(operation);
    actor.stop();
  });

  it('creates and deletes groups through checked whole-record plans while preserving existing provenance', async () => {
    const seeded = committedSnapshot(nativeRequest('seed'));
    const applied: ParameterSetApplyInput[] = [];
    const apply = vi.fn(async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => {
      applied.push(input);
      return { status: 'applied', current: input.proposed };
    });
    const actor = startActor({
      resolve: async () => seeded,
      plan: async ({ request, current }) => {
        if (request.operation.kind === 'create-group') {
          return {
            status: 'ready',
            proposed: committedRecordSnapshot(request, {
              ...current.entry,
              groups: {
                ...current.entry.groups,
                [request.operation.group]: { values: request.operation.values ?? {} },
              },
            }),
          };
        }
        if (request.operation.kind === 'delete-group') {
          const { group } = request.operation;
          const { [group]: removed, ...groups } = current.entry.groups;
          expect(removed).toBeDefined();
          return {
            status: 'ready',
            proposed: committedRecordSnapshot(request, {
              ...current.entry,
              order: current.entry.order?.filter((name) => name !== group),
              groups,
            }),
          };
        }
        return defaultPlan({ target, request, current });
      },
      apply,
    });
    await waitForReady(actor);

    const create: ParameterSetRequest = {
      ...nativeRequest('create:large'),
      expected: seeded.identity,
      operation: { kind: 'create-group', group: 'large', values: { width: 100, note: { source: 'user' } } },
    };
    actor.send({ type: 'submit', request: create });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === create.requestId,
    );
    expect(applied[0]?.expected).toEqual(seeded.identity);
    expect(applied[0]?.proposed.entry.groups['default']).toEqual(seeded.entry.groups['default']);
    expect(applied[0]?.proposed.entry.groups['large']).toEqual({
      values: { width: 100, note: { source: 'user' } },
    });
    expect(applied[0]?.proposed.entry.groups['default']?.bindings?.['/width']?.provenance?.unit?.producer).toBe(
      'tau-defaults',
    );

    const created = applied[0]!.proposed;
    const remove: ParameterSetRequest = {
      ...nativeRequest('delete:alternate'),
      expected: created.identity,
      operation: { kind: 'delete-group', group: 'alternate' },
    };
    actor.send({ type: 'submit', request: remove });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === remove.requestId,
    );
    expect(applied[1]?.expected).toEqual(created.identity);
    expect(applied[1]?.proposed.entry.groups['alternate']).toBeUndefined();
    expect(applied[1]?.proposed.entry.groups['default']).toEqual(created.entry.groups['default']);
    expect(applied[1]?.proposed.entry.groups['large']).toEqual(created.entry.groups['large']);
    expect(applied[1]?.proposed.entry.order).toEqual(['default']);
    actor.stop();
  });

  it.each([
    {
      name: 'duplicate creation',
      operation: { kind: 'create-group', group: 'default' } as const,
      code: 'GROUP_ALREADY_EXISTS',
      current: initialSnapshot,
    },
    {
      name: 'active-group deletion',
      operation: { kind: 'delete-group', group: 'default' } as const,
      code: 'ACTIVE_GROUP_DELETE',
      current: initialSnapshot,
    },
    {
      name: 'missing-group deletion',
      operation: { kind: 'delete-group', group: 'missing' } as const,
      code: 'GROUP_NOT_FOUND',
      current: initialSnapshot,
    },
    {
      name: 'last-group deletion',
      operation: { kind: 'delete-group', group: 'default' } as const,
      code: 'LAST_GROUP_DELETE',
      current: {
        identity: initialIdentity,
        entry: fileParameterEntrySchema.parse({
          activeGroup: 'default',
          order: ['default'],
          groups: { default: { values: { width: 10 } } },
          identity: initialIdentity,
        }),
      },
    },
  ])('rejects $name before planning or writing', async ({ operation, code, current }) => {
    const plan = vi.fn(defaultPlan);
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const actor = startActor({ resolve: async () => current, plan, apply });
    await waitForReady(actor);
    const request: ParameterSetRequest = { ...nativeRequest(`invalid:${code}`), expected: current.identity, operation };
    actor.send({ type: 'submit', request });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === request.requestId,
    );
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'rejected', code });
    expect(plan).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it('rejects a create-group plan that drops existing binding provenance before writing', async () => {
    const seeded = committedSnapshot(nativeRequest('seed-for-invalid-plan'));
    const request: ParameterSetRequest = {
      ...nativeRequest('create:invalid-plan'),
      expected: seeded.identity,
      operation: { kind: 'create-group', group: 'large' },
    };
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const actor = startActor({
      resolve: async () => seeded,
      plan: async () => ({
        status: 'ready',
        proposed: committedRecordSnapshot(request, {
          ...seeded.entry,
          groups: {
            ...seeded.entry.groups,
            default: { values: seeded.entry.groups['default']!.values },
            large: { values: {} },
          },
        }),
      }),
      apply,
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'ready' }));
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'rejected', code: 'INVALID_PLAN' });
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it('writes nothing for display-only actions and repeats only from a durable correlated receipt', async () => {
    const plan = vi.fn(defaultPlan);
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const actor = startActor({ plan, apply });
    await waitForReady(actor);
    const display: ParameterSetRequest = {
      ...nativeRequest('display'),
      operation: { kind: 'display-preference', parameterId: 'width', unit: 'in' },
    };
    actor.send({ type: 'submit', request: display });
    await waitFor(
      actor,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === 'display',
    );
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'rejected', code: 'DISPLAY_ONLY_ACTION' });
    expect(plan).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();

    const request = nativeRequest('idempotent');
    actor.send({ type: 'submit', request });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === request.requestId,
    );
    actor.send({ type: 'submit', request });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) &&
        snapshot.context.outcome?.status === 'committed' &&
        snapshot.context.outcome.write === 'durable-no-op',
    );
    expect(plan).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
    actor.stop();
  });

  it('requires the exact source-unit capability, dependencies, and plan fingerprint before apply', async () => {
    const capability = { producer: 'kernel:replicad', sourceRevision: 'source:1', capability: 'change-source-unit:v1' };
    const request: ParameterSetRequest = {
      ...nativeRequest('source-unit'),
      operation: {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test:schema',
        pointer: '/width',
        unit: 'in',
        producerCapability: capability,
        dependencies: { '/source.ts': 'sha256:source' },
      },
    };
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const actor = startActor({
      plan: async () => ({
        status: 'confirmation-required',
        proposed: committedSnapshot(request, 1),
        planFingerprint: 'plan:source-unit',
        producerCapability: capability,
        dependencies: { '/source.ts': 'sha256:source' },
      }),
      apply,
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'awaitingConfirmation' }));
    actor.send({ type: 'confirm', requestId: request.requestId, planFingerprint: 'plan:changed' });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'ready' }));

    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'rejected', code: 'PLAN_CHANGED' });
    expect(apply).not.toHaveBeenCalled();
    actor.stop();

    const confirmed = startActor({
      plan: async () => ({
        status: 'confirmation-required',
        proposed: committedSnapshot(request, 1),
        planFingerprint: 'plan:source-unit',
        producerCapability: capability,
        dependencies: { '/source.ts': 'sha256:source' },
      }),
      apply,
    });
    await waitForReady(confirmed);
    confirmed.send({ type: 'submit', request });
    await waitFor(confirmed, (snapshot) => snapshot.matches({ operational: 'awaitingConfirmation' }));
    confirmed.send({ type: 'confirm', requestId: request.requestId, planFingerprint: 'plan:source-unit' });
    await waitFor(confirmed, (snapshot) => snapshot.matches({ operational: 'ready' }));
    expect(confirmed.getSnapshot().context.outcome).toMatchObject({ status: 'committed', write: 'applied' });
    expect(apply).toHaveBeenCalledOnce();
    expect(apply.mock.calls[0]?.[0].planFingerprint).toBe('plan:source-unit');
    confirmed.stop();
  });

  it('cancels before apply, but settles an escaped delayed apply after cancellation', async () => {
    const plan = Promise.withResolvers<ParameterSetPlanResult>();
    const apply = Promise.withResolvers<ParameterSetApplyResult>();
    const applyCalls = vi.fn(async () => apply.promise);
    const actor = startActor({
      plan: async (input) => (input.request.requestId === 'cancelled' ? plan.promise : defaultPlan(input)),
      apply: applyCalls,
    });
    await waitForReady(actor);
    const cancelled = nativeRequest('cancelled');
    actor.send({ type: 'submit', request: cancelled });
    actor.send({ type: 'cancel', requestId: cancelled.requestId });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'ready' }));
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'cancelled-before-apply' });
    expect(applyCalls).not.toHaveBeenCalled();
    plan.resolve({ status: 'ready', proposed: committedSnapshot(cancelled) });

    const escaped = nativeRequest('escaped');
    actor.send({ type: 'submit', request: escaped });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    actor.send({ type: 'cancel', requestId: escaped.requestId });
    expect(actor.getSnapshot().matches({ operational: 'applying' })).toBe(true);
    apply.resolve({ status: 'applied', current: committedSnapshot(escaped) });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'ready' }));
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'committed', requestId: escaped.requestId });
    actor.stop();
  });

  it.each([
    { name: 'durable receipt', read: 'receipt', expected: 'committed' },
    { name: 'unchanged identity', read: 'old', expected: 'known-not-applied-failure' },
    { name: 'unrelated replacement', read: 'other', expected: 'indeterminate' },
  ] as const)('reconciles a lost reply from $name', async ({ read, expected }) => {
    const request = nativeRequest(`lost:${read}`);
    const replacement = committedSnapshot(nativeRequest('other'), 99);
    const actor = startActor({
      apply: async () => {
        throw Object.assign(new Error('channel closed'), { applicationState: 'potentially-applied' });
      },
      read: async () =>
        read === 'receipt' ? committedSnapshot(request) : read === 'old' ? initialSnapshot : replacement,
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) =>
      snapshot.matches({ operational: expected === 'indeterminate' ? 'indeterminate' : 'ready' }),
    );
    expect(actor.getSnapshot().context.outcome?.status).toBe(expected);
    actor.stop();
  });

  it('reports an authority-proven known-not-applied failure without readback', async () => {
    const read = vi.fn(async () => initialSnapshot);
    const actor = startActor({
      apply: async () => {
        throw Object.assign(new Error('rejected before authority dispatch'), {
          code: 'AUTHORITY_CLOSED',
          applicationState: 'known-not-applied',
        });
      },
      read,
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: nativeRequest('known-not-applied') });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'ready' }));
    expect(actor.getSnapshot().context.outcome).toMatchObject({
      status: 'known-not-applied-failure',
      code: 'AUTHORITY_CLOSED',
    });
    expect(read).not.toHaveBeenCalled();
    actor.stop();
  });

  it('coalesces transient pressure into one slot while retaining the latest final release', async () => {
    const firstApply = Promise.withResolvers<ParameterSetApplyResult>();
    const applied: string[] = [];
    const settlements: string[] = [];
    const actor = startActor({
      apply: async (input) => {
        applied.push(input.request.requestId);
        return input.request.requestId === 'first'
          ? firstApply.promise
          : { status: 'applied', current: input.proposed };
      },
    });
    actor.subscribe((snapshot) => {
      const requestId = snapshot.context.outcome?.requestId;
      if (requestId !== undefined && settlements.at(-1) !== requestId) {
        settlements.push(requestId);
      }
    });
    await waitForReady(actor);
    const first = nativeRequest('first');
    actor.send({ type: 'submit', request: first });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    actor.send({ type: 'submit', request: { ...nativeRequest('transient-a'), pressure: 'transient' } });
    actor.send({ type: 'submit', request: { ...nativeRequest('transient-b'), pressure: 'transient' } });
    actor.send({ type: 'submit', request: nativeRequest('final-release') });
    actor.send({ type: 'submit', request: { ...nativeRequest('late-transient'), pressure: 'transient' } });
    expect(actor.getSnapshot().context.pendingRequest?.requestId).toBe('final-release');
    firstApply.resolve({ status: 'applied', current: committedSnapshot(first) });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) &&
        snapshot.context.outcome?.requestId === 'final-release' &&
        snapshot.context.outcome.status === 'rejected',
    );
    expect(applied).toEqual(['first']);
    expect(settlements).toEqual(expect.arrayContaining(['first', 'final-release']));
    expect(settlements.indexOf('first')).toBeLessThan(settlements.indexOf('final-release'));
    actor.stop();
  });

  it('publishes every active, coalesced, overwritten-final, and closing settlement before moving on', async () => {
    const firstApply = Promise.withResolvers<ParameterSetApplyResult>();
    const flush = Promise.withResolvers<void>();
    const seen: Array<Readonly<{ requestId: string; status: string }>> = [];
    const actor = startActor({
      apply: async (input) =>
        input.request.requestId === 'A' ? firstApply.promise : { status: 'applied', current: input.proposed },
      flush: async () => flush.promise,
    });
    actor.subscribe((snapshot) => {
      const { outcome } = snapshot.context;
      if (outcome && seen.at(-1)?.requestId !== outcome.requestId) {
        seen.push({ requestId: outcome.requestId, status: outcome.status });
      }
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: nativeRequest('A') });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    actor.send({ type: 'submit', request: { ...nativeRequest('transient'), pressure: 'transient' } });
    actor.send({ type: 'submit', request: nativeRequest('final-1') });
    actor.send({ type: 'submit', request: nativeRequest('final-2') });
    actor.send({ type: 'submit', request: { ...nativeRequest('late-transient'), pressure: 'transient' } });
    actor.send({ type: 'close', requestId: 'close:settlement' });
    actor.send({ type: 'submit', request: nativeRequest('during-close') });
    firstApply.resolve({ status: 'applied', current: committedSnapshot(nativeRequest('A')) });
    await waitFor(actor, (snapshot) => snapshot.matches('quiescing'));

    expect(seen).toEqual(
      expect.arrayContaining([
        { requestId: 'transient', status: 'cancelled-before-apply' },
        { requestId: 'final-1', status: 'cancelled-before-apply' },
        { requestId: 'late-transient', status: 'cancelled-before-apply' },
        { requestId: 'during-close', status: 'rejected' },
        { requestId: 'A', status: 'committed' },
        { requestId: 'final-2', status: 'cancelled-before-apply' },
      ]),
    );
    expect(seen.findIndex(({ requestId }) => requestId === 'A')).toBeLessThan(
      seen.findIndex(({ requestId }) => requestId === 'final-2'),
    );
    flush.resolve();
    await waitFor(actor, (snapshot) => snapshot.matches('closed'));
  });

  it.each(['resolve', 'watch-retry'] as const)(
    'keeps indeterminate close recovery quiescent through $recovery settlement',
    async (recovery) => {
      const firstRead = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
      const request = nativeRequest(`uncertain:${recovery}`);
      let reads = 0;
      let applies = 0;
      let watchSend: ((event: ParameterSetMachineEvent) => void) | undefined;
      const actor = startActor({
        apply: async () => {
          applies += 1;
          throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
        },
        read: async () => {
          reads += 1;
          return reads === 1 ? firstRead.promise : committedSnapshot(request);
        },
        observe: (_input, sendBack) => {
          watchSend = sendBack;
          return () => undefined;
        },
      });
      await waitForReady(actor);
      actor.send({ type: 'submit', request });
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'reconciling' }));
      actor.send({ type: 'close', requestId: `close:${recovery}` });
      if (recovery === 'watch-retry') {
        watchSend?.({ type: 'watch.error', generation: 0, code: 'WATCH_LOST', message: 'lost' });
      }
      firstRead.resolve(committedSnapshot(nativeRequest('replacement'), 99));
      await waitFor(actor, (snapshot) =>
        recovery === 'resolve' ? snapshot.matches({ operational: 'indeterminate' }) : snapshot.matches('disconnected'),
      );
      actor.send({ type: 'submit', request: nativeRequest(`blocked:${recovery}`) });
      expect(actor.getSnapshot().context.outcome).toMatchObject({
        status: 'rejected',
        requestId: `blocked:${recovery}`,
      });
      if (recovery === 'resolve') {
        actor.send({ type: 'resolve', requestId: 'reconcile:retry' });
      } else {
        actor.send({ type: 'watch.retry', requestId: 'watch:retry' });
      }
      await waitFor(actor, (snapshot) => snapshot.matches('closed'));
      expect(applies).toBe(1);
      expect(reads).toBe(2);
      expect(actor.getSnapshot().context.closing).toBe(true);
    },
  );

  it('settles a fresh semantic no-op from current checked authority without writing or forging a receipt', async () => {
    const plan = vi.fn(async (): Promise<ParameterSetPlanResult> => ({ status: 'ready', proposed: initialSnapshot }));
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const actor = startActor({ plan, apply });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: nativeRequest('fresh-same-value', 10) });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === 'fresh-same-value',
    );
    expect(actor.getSnapshot().context.outcome).toMatchObject({
      status: 'committed',
      requestId: 'fresh-same-value',
      write: 'authority-no-op',
    });
    expect(actor.getSnapshot().context.current?.entry.lastOperation).toBeUndefined();
    expect(plan).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it('settles active and pending pre-apply work before reconnecting after a watch disconnect', async () => {
    const planGate = Promise.withResolvers<ParameterSetPlanResult>();
    const plans: string[] = [];
    const applies: string[] = [];
    const outcomes: string[] = [];
    let watchSend: ((event: ParameterSetMachineEvent) => void) | undefined;
    const actor = startActor({
      plan: async (input) => {
        plans.push(input.request.requestId);
        return input.request.requestId === 'disconnect-active' ? planGate.promise : defaultPlan(input);
      },
      apply: async (input) => {
        applies.push(input.request.requestId);
        return { status: 'applied', current: input.proposed };
      },
      observe: (_input, sendBack) => {
        watchSend = sendBack;
        return () => undefined;
      },
    });
    actor.subscribe((snapshot) => {
      const requestId = snapshot.context.outcome?.requestId;
      if (requestId !== undefined && outcomes.at(-1) !== requestId) {
        outcomes.push(requestId);
      }
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: nativeRequest('disconnect-active') });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
    actor.send({ type: 'submit', request: nativeRequest('disconnect-pending') });
    watchSend?.({ type: 'watch.error', generation: 0, code: 'WATCH_LOST', message: 'lost' });
    actor.send({ type: 'watch.retry', requestId: 'retry:disconnect' });
    await waitForReady(actor);

    expect(outcomes).toEqual(expect.arrayContaining(['disconnect-active', 'disconnect-pending']));
    expect(plans).toEqual(['disconnect-active']);
    expect(applies).toEqual([]);
    planGate.resolve({ status: 'ready', proposed: committedSnapshot(nativeRequest('disconnect-active')) });
    await Promise.resolve();
    expect(applies).toEqual([]);
    actor.stop();
  });

  it('settles disconnected pending work before cancellation or close can release it', async () => {
    const run = async (finish: 'cancel' | 'close'): Promise<void> => {
      const resolution = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
      const plans: string[] = [];
      const outcomes: string[] = [];
      let watchSend: ((event: ParameterSetMachineEvent) => void) | undefined;
      const actor = startActor({
        resolve: async () => resolution.promise,
        plan: async (input) => {
          plans.push(input.request.requestId);
          return defaultPlan(input);
        },
        observe: (_input, sendBack) => {
          watchSend = sendBack;
          return () => undefined;
        },
      });
      actor.subscribe((snapshot) => {
        const requestId = snapshot.context.outcome?.requestId;
        if (requestId !== undefined && outcomes.at(-1) !== requestId) {
          outcomes.push(requestId);
        }
      });
      actor.send({ type: 'submit', request: nativeRequest(`disconnected-${finish}`) });
      watchSend?.({ type: 'watch.error', generation: 0, code: 'WATCH_LOST', message: 'lost' });
      if (finish === 'cancel') {
        actor.send({ type: 'cancel', requestId: 'disconnected-cancel' });
        actor.send({ type: 'watch.retry', requestId: 'retry:cancel' });
        resolution.resolve(initialSnapshot);
        await waitForReady(actor);
      } else {
        actor.send({ type: 'close', requestId: 'close:disconnected' });
        await waitFor(actor, (snapshot) => snapshot.matches('closed'));
      }
      expect(outcomes).toContain(`disconnected-${finish}`);
      expect(plans).toEqual([]);
      actor.stop();
    };
    await run('cancel');
    await run('close');
  });

  it.each([
    { kind: 'select-group', operation: { kind: 'select-group', group: 'alternate' } as const },
    {
      kind: 'rename-group',
      operation: { kind: 'rename-group', group: 'alternate', nextGroup: 'renamed' } as const,
    },
    { kind: 'reset-group', operation: { kind: 'reset-group', group: 'alternate' } as const },
  ])('checks the complete $kind record while preserving unrelated provenance', async ({ operation }) => {
    const seeded = committedSnapshot(nativeRequest('group-seed'));
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const actor = startActor({
      resolve: async () => seeded,
      plan: async ({ request, current }) => {
        if (
          request.operation.kind !== 'select-group' &&
          request.operation.kind !== 'rename-group' &&
          request.operation.kind !== 'reset-group'
        ) {
          throw new Error('Expected a checked group operation');
        }
        const record = applyCheckedGroupPlan(current.entry, request.operation);
        return { status: 'ready', proposed: committedRecordSnapshot(request, record) };
      },
      apply,
    });
    await waitForReady(actor);
    const request: ParameterSetRequest = {
      ...nativeRequest(`valid:${operation.kind}`),
      expected: seeded.identity,
      operation,
    };
    actor.send({ type: 'submit', request });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === request.requestId,
    );
    expect(actor.getSnapshot().context.outcome?.status).toBe('committed');
    expect(actor.getSnapshot().context.current?.entry.groups['default']).toEqual(seeded.entry.groups['default']);
    expect(apply).toHaveBeenCalledOnce();
    actor.stop();
  });

  it.each([
    { name: 'missing selection', operation: { kind: 'select-group', group: 'missing' } as const },
    { name: 'missing reset', operation: { kind: 'reset-group', group: 'missing' } as const },
    {
      name: 'rename collision',
      operation: { kind: 'rename-group', group: 'alternate', nextGroup: 'default' } as const,
    },
  ])('rejects $name before planning or writing', async ({ operation }) => {
    const plan = vi.fn(defaultPlan);
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const actor = startActor({ plan, apply });
    await waitForReady(actor);
    actor.send({
      type: 'submit',
      request: { ...nativeRequest(`invalid:${operation.kind}`), operation },
    });
    await waitFor(
      actor,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'rejected',
    );
    const { outcome } = actor.getSnapshot().context;
    expect(outcome?.status).toBe('rejected');
    if (outcome?.status !== 'rejected') {
      throw new Error('Expected the invalid group operation to be rejected');
    }
    expect(outcome.code).toMatch(/^GROUP_/u);
    expect(plan).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it.each([
    { operation: { kind: 'select-group', group: 'alternate' } as const },
    {
      operation: { kind: 'rename-group', group: 'alternate', nextGroup: 'renamed' } as const,
    },
    { operation: { kind: 'reset-group', group: 'alternate' } as const },
  ])('rejects an otherwise valid $operation.kind plan that mutates an unrelated group', async ({ operation }) => {
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const actor = startActor({
      plan: async ({ request, current }) => {
        if (
          request.operation.kind !== 'select-group' &&
          request.operation.kind !== 'rename-group' &&
          request.operation.kind !== 'reset-group'
        ) {
          throw new Error('Expected a checked group operation');
        }
        const record = applyCheckedGroupPlan(current.entry, request.operation);
        record.groups['default'] = { values: { width: 999 } };
        return { status: 'ready', proposed: committedRecordSnapshot(request, record) };
      },
      apply,
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: { ...nativeRequest(`malicious:${operation.kind}`), operation } });
    await waitFor(
      actor,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'rejected',
    );
    const { outcome } = actor.getSnapshot().context;
    expect(outcome?.status).toBe('rejected');
    if (outcome?.status !== 'rejected') {
      throw new Error('Expected the invalid group plan to be rejected');
    }
    expect(outcome.code).toBe('INVALID_PLAN');
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it('refreshes authority before settling an invalidated semantic no-op', async () => {
    const planGate = Promise.withResolvers<ParameterSetPlanResult>();
    const newer = committedSnapshot(nativeRequest('external-change'), 99);
    let reads = 0;
    const apply = vi.fn(
      async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => ({
        status: 'applied',
        current: input.proposed,
      }),
    );
    const outcomes: Array<Readonly<{ requestId: string; status: string; write?: string }>> = [];
    const actor = startActor({
      resolve: async () => (++reads === 1 ? initialSnapshot : newer),
      plan: async () => planGate.promise,
      apply,
    });
    actor.subscribe((snapshot) => {
      const { outcome } = snapshot.context;
      if (outcome !== undefined) {
        outcomes.push(outcome);
      }
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: nativeRequest('invalidated-no-op', 10) });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
    actor.send({ type: 'watch.changed', generation: 0, requestId: 'watch:external-change' });
    planGate.resolve({ status: 'ready', proposed: initialSnapshot });
    await waitFor(
      actor,
      (snapshot) =>
        snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === 'invalidated-no-op',
    );
    expect(reads).toBe(2);
    expect(actor.getSnapshot().context.current?.identity).toEqual(newer.identity);
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
    expect(outcomes).not.toContainEqual(expect.objectContaining({ write: 'authority-no-op' }));
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it('keeps an escaped apply alive through an actual observer failure and close', async () => {
    const request = nativeRequest('observer-failure-apply');
    const applyGate = Promise.withResolvers<ParameterSetApplyResult>();
    const flush = vi.fn(async (): Promise<void> => undefined);
    const outcomes: string[] = [];
    let failObserver: (() => void) | undefined;
    const actor = startActor({
      apply: async () => applyGate.promise,
      flush,
      observeActor: failingObserver((fail) => {
        failObserver = fail;
      }),
    });
    actor.subscribe((snapshot) => {
      const { outcome } = snapshot.context;
      if (outcome !== undefined) {
        outcomes.push(`${outcome.status}:${outcome.requestId}`);
      }
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    failObserver?.();
    await waitFor(actor, (snapshot) => snapshot.context.watchDisconnected);
    actor.send({ type: 'close', requestId: 'close:observer-failure-apply' });
    await Promise.resolve();
    expect(flush).not.toHaveBeenCalled();
    expect(outcomes).not.toContain(`cancelled-before-apply:${request.requestId}`);

    applyGate.resolve({ status: 'applied', current: committedSnapshot(request) });
    await waitFor(actor, (snapshot) => snapshot.matches('closed'));
    expect(outcomes).toContain(`committed:${request.requestId}`);
    expect(flush).toHaveBeenCalledOnce();
  });

  it('keeps invalid successful apply reconciliation alive through observer failure and close', async () => {
    const request = nativeRequest('observer-failure-invalid-apply');
    const readGate = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const flush = vi.fn(async (): Promise<void> => undefined);
    const outcomes: string[] = [];
    let failObserver: (() => void) | undefined;
    const cyclic = committedSnapshot(request);
    const value: Record<string, unknown> = {};
    value['self'] = value;
    Reflect.set(cyclic.entry.groups['default']!.values, 'width', value);
    const actor = startActor({
      apply: async () => ({ status: 'applied', current: cyclic }),
      read: async () => readGate.promise,
      flush,
      observeActor: failingObserver((fail) => {
        failObserver = fail;
      }),
    });
    actor.subscribe((snapshot) => {
      const { outcome } = snapshot.context;
      if (outcome !== undefined) {
        outcomes.push(`${outcome.status}:${outcome.requestId}`);
      }
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'reconciling' }));
    expect(actor.getSnapshot().context).toMatchObject({ operationIndeterminate: true, activeRequest: request });
    failObserver?.();
    actor.send({ type: 'close', requestId: 'close:observer-failure-invalid-apply' });
    await Promise.resolve();
    expect(flush).not.toHaveBeenCalled();
    expect(outcomes).not.toContain(`cancelled-before-apply:${request.requestId}`);

    readGate.resolve(committedSnapshot(request));
    await waitFor(actor, (snapshot) => snapshot.matches('closed'));
    expect(outcomes).toContain(`committed:${request.requestId}`);
    expect(flush).toHaveBeenCalledOnce();
  });

  it('retries observer-failed reconciliation after an escaped apply rejection', async () => {
    const request = nativeRequest('observer-failure-retry');
    const firstRead = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const outcomes: string[] = [];
    let failObserver: (() => void) | undefined;
    let reads = 0;
    const actor = startActor({
      apply: async () => {
        throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
      },
      read: async () => (++reads === 1 ? firstRead.promise : committedSnapshot(request)),
      observeActor: failingObserver((fail) => {
        failObserver = fail;
      }),
    });
    actor.subscribe((snapshot) => {
      const { outcome } = snapshot.context;
      if (outcome !== undefined) {
        outcomes.push(`${outcome.status}:${outcome.requestId}`);
      }
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'reconciling' }));
    failObserver?.();
    firstRead.resolve(committedSnapshot(nativeRequest('unrelated-observer-write'), 99));
    await waitFor(actor, (snapshot) => snapshot.matches('disconnected'));
    expect(outcomes).not.toContain(`cancelled-before-apply:${request.requestId}`);

    actor.send({ type: 'watch.retry', requestId: 'retry:observer-failure' });
    await waitForReady(actor);
    expect(outcomes).toContain(`committed:${request.requestId}`);
    expect(reads).toBe(2);
    actor.stop();
  });

  it.each([
    { predecessor: 'committed', watchFailure: 'actual' },
    { predecessor: 'committed', watchFailure: 'explicit' },
    { predecessor: 'known-not-applied', watchFailure: 'actual' },
    { predecessor: 'known-not-applied', watchFailure: 'explicit' },
  ] as const)(
    'does not transfer a $predecessor apply boundary to queued planning after $watchFailure watch failure',
    async ({ predecessor, watchFailure }) => {
      const clock = new SimulatedClock();
      const firstApply = Promise.withResolvers<ParameterSetApplyResult>();
      const secondPlan = Promise.withResolvers<ParameterSetPlanResult>();
      const apply = vi.fn(async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => {
        if (input.request.requestId === 'phase-owner-a') {
          return firstApply.promise;
        }
        return defaultApply(input);
      });
      let failObserver: (() => void) | undefined;
      const actor = startActor({
        clock,
        apply,
        plan: async (input) => (input.request.requestId === 'phase-owner-b' ? secondPlan.promise : defaultPlan(input)),
        observeActor: failingObserver((fail) => {
          failObserver = fail;
        }),
      });
      await waitForReady(actor);
      const firstRequest = nativeRequest('phase-owner-a');
      const secondRequest = {
        ...nativeRequest('phase-owner-b'),
        expected: predecessor === 'committed' ? committedSnapshot(firstRequest).identity : initialIdentity,
      };
      actor.send({ type: 'submit', request: firstRequest });
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
      actor.send({ type: 'submit', request: secondRequest });
      if (predecessor === 'committed') {
        firstApply.resolve({ status: 'applied', current: committedSnapshot(firstRequest) });
      } else {
        firstApply.reject(Object.assign(new Error('not dispatched'), { applicationState: 'known-not-applied' }));
      }
      await waitFor(actor, (snapshot) =>
        snapshot.matches({ operational: predecessor === 'committed' ? 'committed' : 'failed' }),
      );
      clock.increment(1);
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
      expect(actor.getSnapshot().context).toMatchObject({ applyEscaped: false });

      if (watchFailure === 'actual') {
        failObserver?.();
      } else {
        actor.send({
          type: 'watch.error',
          generation: actor.getSnapshot().context.watchGeneration,
          code: 'WATCH_LOST',
          message: 'watch lost',
        });
      }
      clock.increment(1);
      await waitFor(actor, (snapshot) => snapshot.matches('disconnected'));
      secondPlan.resolve({ status: 'ready', proposed: committedSnapshot(secondRequest) });
      await Promise.resolve();
      expect(actor.getSnapshot().context.outcome).toEqual({
        status: 'cancelled-before-apply',
        requestId: 'phase-owner-b',
      });
      expect(apply).toHaveBeenCalledOnce();
      actor.stop();
    },
  );

  it('resets a promoted request before confirmation and post-settlement refresh', async () => {
    const clock = new SimulatedClock();
    const firstApply = Promise.withResolvers<ParameterSetApplyResult>();
    const refresh = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const capability = { producer: 'kernel:test', sourceRevision: 'source:1', capability: 'source-unit:v1' };
    const confirmationRequest: ParameterSetRequest = {
      ...nativeRequest('phase-confirmation'),
      expected: committedSnapshot(nativeRequest('phase-confirmation-a')).identity,
      operation: {
        kind: 'source-unit',
        mode: 'preserve-size',
        group: 'default',
        parameterId: 'width',
        resource: 'urn:test:schema',
        pointer: '/width',
        unit: 'in',
        producerCapability: capability,
        dependencies: { '/source.ts': 'sha256:source' },
      },
    };
    let failObserver: (() => void) | undefined;
    let reads = 0;
    const apply = vi.fn(async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => {
      if (input.request.requestId === 'phase-confirmation-a') {
        return firstApply.promise;
      }
      return defaultApply(input);
    });
    const actor = startActor({
      clock,
      resolve: async () => (++reads === 1 ? initialSnapshot : refresh.promise),
      plan: async (input) =>
        input.request.requestId === confirmationRequest.requestId
          ? {
              status: 'confirmation-required',
              proposed: committedSnapshot(confirmationRequest),
              planFingerprint: 'plan:confirmation',
              producerCapability: capability,
              dependencies: { '/source.ts': 'sha256:source' },
            }
          : defaultPlan(input),
      apply,
      observeActor: failingObserver((fail) => {
        failObserver = fail;
      }),
    });
    await waitForReady(actor);
    const firstRequest = nativeRequest('phase-confirmation-a');
    actor.send({ type: 'submit', request: firstRequest });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    actor.send({ type: 'submit', request: confirmationRequest });
    firstApply.resolve({ status: 'applied', current: committedSnapshot(firstRequest) });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
    clock.increment(1);
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'awaitingConfirmation' }));
    expect(actor.getSnapshot().context.applyEscaped).toBe(false);
    actor.send({ type: 'watch.changed', generation: 0, requestId: 'watch:phase-confirmation' });
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'rejected', code: 'PLAN_CHANGED' });
    clock.increment(1);
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'resolving' }));
    expect(actor.getSnapshot().context.applyEscaped).toBe(false);
    failObserver?.();
    clock.increment(1);
    await waitFor(actor, (snapshot) => snapshot.matches('disconnected'));
    refresh.resolve(committedSnapshot(nativeRequest('phase-confirmation-a')));
    await Promise.resolve();
    expect(apply).toHaveBeenCalledOnce();
    actor.stop();
  });

  it('disconnects a promoted semantic-no-op refresh without admitting its late result', async () => {
    const clock = new SimulatedClock();
    const firstApply = Promise.withResolvers<ParameterSetApplyResult>();
    const secondPlan = Promise.withResolvers<ParameterSetPlanResult>();
    const refresh = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    let failObserver: (() => void) | undefined;
    let reads = 0;
    const apply = vi.fn(async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => {
      if (input.request.requestId === 'phase-refresh-a') {
        return firstApply.promise;
      }
      return defaultApply(input);
    });
    const actor = startActor({
      clock,
      resolve: async () => (++reads === 1 ? initialSnapshot : refresh.promise),
      plan: async (input) => (input.request.requestId === 'phase-refresh-b' ? secondPlan.promise : defaultPlan(input)),
      apply,
      observeActor: failingObserver((fail) => {
        failObserver = fail;
      }),
    });
    await waitForReady(actor);
    const firstRequest = nativeRequest('phase-refresh-a');
    const secondRequest = {
      ...nativeRequest('phase-refresh-b', 10),
      expected: committedSnapshot(firstRequest).identity,
    };
    actor.send({ type: 'submit', request: firstRequest });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    actor.send({ type: 'submit', request: secondRequest });
    firstApply.resolve({ status: 'applied', current: committedSnapshot(firstRequest) });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
    clock.increment(1);
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
    actor.send({ type: 'watch.changed', generation: 0, requestId: 'watch:phase-refresh-b' });
    secondPlan.resolve({ status: 'ready', proposed: actor.getSnapshot().context.current! });
    await waitFor(actor, (snapshot) => snapshot.context.activeRefreshPending);
    expect(actor.getSnapshot().context.applyEscaped).toBe(false);
    failObserver?.();
    clock.increment(1);
    await waitFor(actor, (snapshot) => snapshot.matches('disconnected'));
    refresh.resolve(committedSnapshot(firstRequest));
    await Promise.resolve();
    expect(actor.getSnapshot().context.outcome).toEqual({
      status: 'cancelled-before-apply',
      requestId: 'phase-refresh-b',
    });
    expect(apply).toHaveBeenCalledOnce();
    actor.stop();
  });

  it('preserves a settled result when the observer fails during post-settlement refresh', async () => {
    const clock = new SimulatedClock();
    const refresh = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const flush = vi.fn(async (): Promise<void> => undefined);
    let failObserver: (() => void) | undefined;
    let reads = 0;
    const request = nativeRequest('settled-refresh');
    const actor = startActor({
      clock,
      resolve: async () => (++reads === 1 ? initialSnapshot : refresh.promise),
      flush,
      observeActor: failingObserver((fail) => {
        failObserver = fail;
      }),
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
    actor.send({ type: 'watch.changed', generation: 0, requestId: 'watch:settled-refresh' });
    clock.increment(1);
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'resolving' }));
    expect(actor.getSnapshot().context.applyEscaped).toBe(false);
    failObserver?.();
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'committed', requestId: request.requestId });
    actor.send({ type: 'close', requestId: 'close:settled-refresh' });
    clock.increment(1);
    await waitFor(actor, (snapshot) => snapshot.matches('closed'));
    refresh.resolve(committedSnapshot(request));
    await Promise.resolve();
    expect(flush).toHaveBeenCalledOnce();
  });

  it.each(['authority-no-op', 'durable-no-op', 'rejected', 'cancelled-before-apply', 'applied', 'known-not-applied'])(
    'preserves an observable $settlement settlement through actual observer failure, pending work, and close',
    async (settlement) => {
      const clock = new SimulatedClock();
      const planGate = Promise.withResolvers<ParameterSetPlanResult>();
      const request = nativeRequest(`terminal:${settlement}`, settlement === 'authority-no-op' ? 10 : 25);
      const current = settlement === 'durable-no-op' ? committedSnapshot(request) : initialSnapshot;
      const flush = vi.fn(async (): Promise<void> => undefined);
      const outcomes: ParameterSetOutcome[] = [];
      let failObserver: (() => void) | undefined;
      const apply = vi.fn(async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => {
        if (settlement === 'known-not-applied') {
          throw Object.assign(new Error('not dispatched'), { applicationState: 'known-not-applied' });
        }
        return defaultApply(input);
      });
      const actor = startActor({
        clock,
        resolve: async () => current,
        plan: async (input) => {
          if (settlement === 'cancelled-before-apply') {
            return planGate.promise;
          }
          if (settlement === 'rejected') {
            return { status: 'rejected', code: 'REFUSED', message: 'refused' };
          }
          if (settlement === 'authority-no-op') {
            return { status: 'ready', proposed: input.current };
          }
          return defaultPlan(input);
        },
        apply,
        flush,
        observeActor: failingObserver((fail) => {
          failObserver = fail;
        }),
      });
      actor.subscribe((snapshot) => {
        if (snapshot.context.outcome?.requestId === request.requestId) {
          outcomes.push(snapshot.context.outcome);
        }
      });
      await waitForReady(actor);
      actor.send({ type: 'submit', request });
      if (settlement === 'cancelled-before-apply') {
        await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
        actor.send({ type: 'cancel', requestId: request.requestId });
      }
      const terminal =
        settlement === 'rejected'
          ? 'rejected'
          : settlement === 'cancelled-before-apply'
            ? 'cancelled'
            : settlement === 'known-not-applied'
              ? 'failed'
              : 'committed';
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: terminal }));
      const before = structuredClone(actor.getSnapshot().context.outcome!);
      actor.send({ type: 'submit', request: nativeRequest(`pending:${settlement}`) });
      actor.send({ type: 'close', requestId: `close:${settlement}` });
      failObserver?.();
      expect(actor.getSnapshot().context.outcome).toEqual(before);
      clock.increment(1);
      clock.increment(1);
      await waitFor(actor, (snapshot) => snapshot.matches('closed'));
      expect(outcomes.some((outcome) => outcome.status !== before.status)).toBe(false);
      expect(apply).toHaveBeenCalledTimes(settlement === 'applied' || settlement === 'known-not-applied' ? 1 : 0);
      expect(flush).toHaveBeenCalledOnce();
    },
  );

  it.each([
    { settlement: 'authority-no-op', interference: 'pending-cancel', phase: 'terminal', watchFailure: 'actual' },
    { settlement: 'rejected', interference: 'pending-cancel', phase: 'terminal', watchFailure: 'actual' },
    { settlement: 'applied', interference: 'pending-cancel', phase: 'terminal', watchFailure: 'actual' },
    { settlement: 'known-not-applied', interference: 'pending-cancel', phase: 'terminal', watchFailure: 'actual' },
    { settlement: 'applied', interference: 'coalesced', phase: 'terminal', watchFailure: 'actual' },
    { settlement: 'applied', interference: 'rejected', phase: 'terminal', watchFailure: 'actual' },
    { settlement: 'applied', interference: 'pending-cancel', phase: 'refresh', watchFailure: 'actual' },
    { settlement: 'applied', interference: 'coalesced', phase: 'refresh', watchFailure: 'actual' },
    { settlement: 'applied', interference: 'rejected', phase: 'refresh', watchFailure: 'actual' },
    { settlement: 'applied', interference: 'pending-cancel', phase: 'terminal', watchFailure: 'explicit' },
    { settlement: 'applied', interference: 'pending-cancel', phase: 'refresh', watchFailure: 'explicit' },
  ] as const)(
    'keeps $settlement ownership after $interference publication, $phase $watchFailure watch failure',
    async ({ settlement, interference, phase, watchFailure }) => {
      const clock = new SimulatedClock();
      const refresh = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
      const request = nativeRequest(`correlated:${settlement}`, settlement === 'authority-no-op' ? 10 : 25);
      const outcomes: ParameterSetOutcome[] = [];
      let failObserver: (() => void) | undefined;
      let reads = 0;
      const apply = vi.fn(async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => {
        if (settlement === 'known-not-applied') {
          throw Object.assign(new Error('not dispatched'), { applicationState: 'known-not-applied' });
        }
        return defaultApply(input);
      });
      const actor = startActor({
        clock,
        resolve: async () => (++reads === 1 ? initialSnapshot : refresh.promise),
        plan: async (input) => {
          if (settlement === 'authority-no-op') {
            return { status: 'ready', proposed: input.current };
          }
          if (settlement === 'rejected') {
            return { status: 'rejected', code: 'REFUSED', message: 'refused' };
          }
          return defaultPlan(input);
        },
        apply,
        observeActor: failingObserver((fail) => {
          failObserver = fail;
        }),
      });
      actor.subscribe((snapshot) => {
        if (snapshot.context.outcome !== undefined) {
          outcomes.push(snapshot.context.outcome);
        }
      });
      await waitForReady(actor);
      actor.send({ type: 'submit', request });
      const terminal =
        settlement === 'rejected' ? 'rejected' : settlement === 'known-not-applied' ? 'failed' : 'committed';
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: terminal }));
      const settled = structuredClone(actor.getSnapshot().context.outcome!);
      expect(actor.getSnapshot().context.settledRequestId).toBe(request.requestId);
      if (phase === 'refresh') {
        actor.send({ type: 'watch.changed', generation: 0, requestId: `refresh:${settlement}` });
        clock.increment(1);
      }
      const pending = nativeRequest(`pending:${interference}`);
      actor.send({ type: 'submit', request: pending });
      if (interference === 'pending-cancel') {
        actor.send({ type: 'cancel', requestId: pending.requestId });
      } else if (interference === 'coalesced') {
        actor.send({ type: 'submit', request: nativeRequest('pending:replacement') });
      } else {
        submitUnchecked(actor, { requestId: 'unrelated-rejection' });
      }
      expect(actor.getSnapshot().context.outcome?.requestId).not.toBe(request.requestId);
      if (watchFailure === 'actual') {
        failObserver?.();
      } else {
        actor.send({
          type: 'watch.error',
          generation: actor.getSnapshot().context.watchGeneration,
          code: 'WATCH_LOST',
          message: 'watch lost',
        });
      }
      expect(actor.getSnapshot().context.settledRequestId).toBe(request.requestId);
      clock.increment(1);
      clock.increment(1);
      await waitFor(actor, (snapshot) => snapshot.matches('disconnected'));
      refresh.resolve(committedSnapshot(request));
      await Promise.resolve();
      expect(outcomes).not.toContainEqual({ status: 'cancelled-before-apply', requestId: request.requestId });
      expect(outcomes).toContainEqual(settled);
      expect(apply).toHaveBeenCalledTimes(settlement === 'applied' || settlement === 'known-not-applied' ? 1 : 0);
      actor.stop();
    },
  );

  it.each(['resolving', 'resolutionFailed'] as const)(
    'ignores cancellation of a settled request during post-settlement $refreshState refresh',
    async (refreshState) => {
      const clock = new SimulatedClock();
      const refresh = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
      const request = nativeRequest(`settled-cancel:${refreshState}`);
      let reads = 0;
      const apply = vi.fn(defaultApply);
      const actor = startActor({
        clock,
        resolve: async () => {
          reads += 1;
          if (reads === 1 || reads >= 3) {
            return reads === 1 ? initialSnapshot : committedSnapshot(request);
          }
          if (refreshState === 'resolutionFailed') {
            throw new Error('refresh unavailable');
          }
          return refresh.promise;
        },
        apply,
      });
      await waitForReady(actor);
      actor.send({ type: 'submit', request });
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
      const settled = structuredClone(actor.getSnapshot().context.outcome!);
      actor.send({ type: 'watch.changed', generation: 0, requestId: `refresh:${refreshState}` });
      clock.increment(1);
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: refreshState }));
      actor.send({ type: 'cancel', requestId: request.requestId });
      expect(actor.getSnapshot().context.outcome).toEqual(settled);
      expect(actor.getSnapshot().context.settledRequestId).toBe(request.requestId);
      expect(actor.getSnapshot().matches({ operational: refreshState })).toBe(true);
      if (refreshState === 'resolving') {
        refresh.resolve(committedSnapshot(request));
      } else {
        actor.send({ type: 'resolve', requestId: 'refresh:retry-settled' });
      }
      await waitForReady(actor);
      expect(actor.getSnapshot().context.outcome).toEqual(settled);
      expect(apply).toHaveBeenCalledOnce();
      actor.stop();
    },
  );

  it.each([
    { phase: 'applying', trigger: 'coalesce' },
    { phase: 'applying', trigger: 'close' },
    { phase: 'committed', trigger: 'coalesce' },
    { phase: 'committed', trigger: 'close' },
    { phase: 'committed', trigger: 'cancel' },
    { phase: 'indeterminate', trigger: 'cancel' },
  ] as const)('shares one $phase lifetime for an exact duplicate before $trigger', async ({ phase, trigger }) => {
    const clock = new SimulatedClock();
    const applyGate = Promise.withResolvers<ParameterSetApplyResult>();
    const request = nativeRequest(`duplicate:${phase}:${trigger}`);
    const unrelated = committedSnapshot(nativeRequest('duplicate:unrelated'), 99);
    const outcomes: ParameterSetOutcome[] = [];
    const apply = vi.fn(async (): Promise<ParameterSetApplyResult> => {
      if (phase === 'indeterminate') {
        throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
      }
      return applyGate.promise;
    });
    const flush = vi.fn(async (): Promise<void> => undefined);
    const actor = startActor({ clock, apply, read: async () => unrelated, flush });
    actor.subscribe((snapshot) => {
      if (snapshot.context.outcome !== undefined) {
        outcomes.push(snapshot.context.outcome);
      }
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request });
    if (phase === 'applying') {
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    } else if (phase === 'indeterminate') {
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'indeterminate' }));
    } else {
      applyGate.resolve({ status: 'applied', current: committedSnapshot(request) });
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
    }

    const beforeDuplicate = structuredClone(actor.getSnapshot().context.outcome);
    actor.send({ type: 'submit', request: structuredClone(request) });
    expect(actor.getSnapshot().context.pendingRequest).toBeUndefined();
    expect(actor.getSnapshot().context.outcome).toEqual(beforeDuplicate);
    if (trigger === 'coalesce') {
      actor.send({ type: 'submit', request: nativeRequest(`distinct:${phase}`) });
      expect(actor.getSnapshot().context.pendingRequest?.requestId).toBe(`distinct:${phase}`);
    } else if (trigger === 'close') {
      actor.send({ type: 'close', requestId: `close:${phase}` });
    } else {
      actor.send({ type: 'cancel', requestId: request.requestId });
    }
    if (phase === 'applying') {
      applyGate.resolve({ status: 'applied', current: committedSnapshot(request) });
      await waitFor(actor, (snapshot) => snapshot.context.outcome?.status === 'committed');
    }
    if (trigger === 'close') {
      clock.increment(1);
      clock.increment(1);
      await waitFor(actor, (snapshot) => snapshot.matches('closed'));
      expect(flush).toHaveBeenCalledOnce();
    }
    expect(outcomes).not.toContainEqual({ status: 'cancelled-before-apply', requestId: request.requestId });
    expect(apply).toHaveBeenCalledOnce();
    actor.stop();
  });

  it.each(['coalesce', 'cancel', 'close', 'watch-failure'] as const)(
    'settles a durable replay before $trigger can give it a second cancellable lifetime',
    async (trigger) => {
      const clock = new SimulatedClock();
      const planGate = Promise.withResolvers<void>();
      const requestA = nativeRequest(`durable-replay:${trigger}:A`);
      const activeRequestId = `durable-replay:${trigger}:B`;
      const outcomes: ParameterSetOutcome[] = [];
      const plan = vi.fn(async (input: ParameterSetPlanInput): Promise<ParameterSetPlanResult> => {
        if (input.request.requestId === activeRequestId) {
          await planGate.promise;
        }
        return defaultPlan(input);
      });
      const apply = vi.fn(defaultApply);
      const flush = vi.fn(async (): Promise<void> => undefined);
      const actor = startActor({ clock, plan, apply, flush });
      actor.subscribe((snapshot) => {
        if (snapshot.context.outcome !== undefined) {
          outcomes.push(snapshot.context.outcome);
        }
      });

      await waitForReady(actor);
      actor.send({ type: 'submit', request: requestA });
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
      clock.increment(1);
      await waitForReady(actor);

      const receipt = structuredClone(actor.getSnapshot().context.current!);
      const requestB = { ...nativeRequest(activeRequestId), expected: receipt.identity };
      actor.send({ type: 'submit', request: requestB });
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
      actor.send({ type: 'submit', request: structuredClone(requestA) });

      expect(actor.getSnapshot().context.activeRequest).toEqual(requestB);
      expect(actor.getSnapshot().context.pendingRequest).toBeUndefined();
      expect(actor.getSnapshot().context.outcome).toEqual({
        status: 'committed',
        requestId: requestA.requestId,
        revision: receipt.identity,
        write: 'durable-no-op',
      });

      switch (trigger) {
        case 'coalesce': {
          const requestC = { ...nativeRequest(`durable-replay:${trigger}:C`), expected: receipt.identity };
          actor.send({ type: 'submit', request: requestC });
          expect(actor.getSnapshot().context.pendingRequest).toEqual(requestC);
          planGate.resolve();
          await waitFor(actor, (snapshot) => snapshot.context.outcome?.requestId === activeRequestId);
          expect(actor.getSnapshot().context.outcome?.status).toBe('committed');
          clock.increment(1);
          await waitFor(actor, (snapshot) => snapshot.context.outcome?.requestId === requestC.requestId);
          expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
          break;
        }
        case 'cancel': {
          actor.send({ type: 'cancel', requestId: requestA.requestId });
          expect(actor.getSnapshot().context.activeRequest).toEqual(requestB);
          planGate.resolve();
          await waitFor(actor, (snapshot) => snapshot.context.outcome?.requestId === activeRequestId);
          expect(actor.getSnapshot().context.outcome?.status).toBe('committed');
          break;
        }
        case 'close': {
          actor.send({ type: 'close', requestId: `close:${trigger}` });
          clock.increment(1);
          await waitFor(actor, (snapshot) => snapshot.matches('closed'));
          expect(outcomes).toContainEqual({ status: 'cancelled-before-apply', requestId: activeRequestId });
          expect(flush).toHaveBeenCalledOnce();
          break;
        }
        case 'watch-failure': {
          actor.send({ type: 'watch.error', generation: 0, code: 'WATCH_LOST', message: 'lost' });
          clock.increment(1);
          await waitFor(actor, (snapshot) => snapshot.matches('disconnected'));
          expect(outcomes).toContainEqual({ status: 'cancelled-before-apply', requestId: activeRequestId });
          break;
        }
      }

      expect(outcomes).toContainEqual({
        status: 'committed',
        requestId: requestA.requestId,
        revision: receipt.identity,
        write: 'durable-no-op',
      });
      expect(outcomes).not.toContainEqual({ status: 'cancelled-before-apply', requestId: requestA.requestId });
      expect(apply.mock.calls.filter(([input]) => input.request.requestId === requestA.requestId)).toHaveLength(1);
      actor.stop();
    },
  );

  it('rejects a current durable-receipt request-ID collision without disturbing distinct active work', async () => {
    const clock = new SimulatedClock();
    const planGate = Promise.withResolvers<void>();
    const requestA = nativeRequest('durable-collision:A');
    const activeRequestId = 'durable-collision:B';
    const plan = vi.fn(async (input: ParameterSetPlanInput): Promise<ParameterSetPlanResult> => {
      if (input.request.requestId === activeRequestId) {
        await planGate.promise;
      }
      return defaultPlan(input);
    });
    const apply = vi.fn(defaultApply);
    const actor = startActor({ clock, plan, apply });

    await waitForReady(actor);
    actor.send({ type: 'submit', request: requestA });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
    clock.increment(1);
    await waitForReady(actor);

    const receipt = structuredClone(actor.getSnapshot().context.current!);
    const requestB = { ...nativeRequest(activeRequestId), expected: receipt.identity };
    actor.send({ type: 'submit', request: requestB });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
    actor.send({
      type: 'submit',
      request: { ...requestA, expected: receipt.identity, fingerprint: 'fingerprint:collision' },
    });

    expect(actor.getSnapshot().context.outcome).toMatchObject({
      status: 'rejected',
      requestId: requestA.requestId,
      code: 'REQUEST_ID_COLLISION',
    });
    expect(actor.getSnapshot().context.activeRequest).toEqual(requestB);
    expect(actor.getSnapshot().context.pendingRequest).toBeUndefined();
    planGate.resolve();
    await waitFor(actor, (snapshot) => snapshot.context.outcome?.requestId === activeRequestId);
    expect(actor.getSnapshot().context.outcome?.status).toBe('committed');
    expect(apply.mock.calls.filter(([input]) => input.request.requestId === requestA.requestId)).toHaveLength(1);
    actor.stop();
  });

  it.each(['planning', 'awaitingConfirmation'] as const)(
    'ignores exact active and pending duplicate delivery while $phase',
    async (phase) => {
      const planGate = Promise.withResolvers<ParameterSetPlanResult>();
      const capability = { producer: 'kernel:test', sourceRevision: 'source:1', capability: 'source-unit:v1' };
      const request: ParameterSetRequest =
        phase === 'planning'
          ? nativeRequest('duplicate:planning')
          : {
              ...nativeRequest('duplicate:confirmation'),
              operation: {
                kind: 'source-unit',
                mode: 'preserve-size',
                group: 'default',
                parameterId: 'width',
                resource: 'urn:test:schema',
                pointer: '/width',
                unit: 'in',
                producerCapability: capability,
                dependencies: { '/source.ts': 'sha256:source' },
              },
            };
      const actor = startActor({
        plan: async () =>
          phase === 'planning'
            ? planGate.promise
            : {
                status: 'confirmation-required',
                proposed: committedSnapshot(request),
                planFingerprint: 'plan:duplicate',
                producerCapability: capability,
                dependencies: { '/source.ts': 'sha256:source' },
              },
      });
      await waitForReady(actor);
      actor.send({ type: 'submit', request });
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: phase }));
      actor.send({ type: 'submit', request: structuredClone(request) });
      expect(actor.getSnapshot().context.pendingRequest).toBeUndefined();
      const pending = nativeRequest(`pending:${phase}`);
      actor.send({ type: 'submit', request: pending });
      actor.send({ type: 'submit', request: structuredClone(pending) });
      expect(actor.getSnapshot().context.pendingRequest).toEqual(pending);
      expect(actor.getSnapshot().context.outcome).toBeUndefined();
      actor.stop();
    },
  );

  it.each(['reconciling', 'refresh'] as const)(
    'ignores an exact duplicate without disturbing $phase work',
    async (phase) => {
      const clock = new SimulatedClock();
      const gate = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
      const request = nativeRequest(`duplicate:${phase}`);
      let reads = 0;
      const apply = vi.fn(async (input: ParameterSetApplyInput): Promise<ParameterSetApplyResult> => {
        if (phase === 'reconciling') {
          throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
        }
        return defaultApply(input);
      });
      const actor = startActor({
        clock,
        resolve: async () => (++reads === 1 ? initialSnapshot : gate.promise),
        apply,
        read: async () => gate.promise,
      });
      await waitForReady(actor);
      actor.send({ type: 'submit', request });
      if (phase === 'reconciling') {
        await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'reconciling' }));
      } else {
        await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
        actor.send({ type: 'watch.changed', generation: 0, requestId: 'refresh:duplicate' });
        clock.increment(1);
        await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'resolving' }));
      }
      const before = structuredClone(actor.getSnapshot().context.outcome);
      actor.send({ type: 'submit', request: structuredClone(request) });
      expect(actor.getSnapshot().context.pendingRequest).toBeUndefined();
      expect(actor.getSnapshot().context.outcome).toEqual(before);
      gate.resolve(committedSnapshot(request));
      if (phase === 'reconciling') {
        await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'committed' }));
        clock.increment(1);
      }
      await waitForReady(actor);
      expect(actor.getSnapshot().context.outcome?.status).toBe('committed');
      expect(apply).toHaveBeenCalledOnce();
      actor.stop();
    },
  );

  it.each(['different-fingerprint', 'different-intent'] as const)(
    'rejects a request-ID collision with $difference without disturbing active apply',
    async (difference) => {
      const applyGate = Promise.withResolvers<ParameterSetApplyResult>();
      const request = nativeRequest('collision:active');
      const collision: ParameterSetRequest =
        difference === 'different-fingerprint'
          ? { ...request, fingerprint: 'fingerprint:collision' }
          : { ...nativeRequest(request.requestId, 99), fingerprint: request.fingerprint };
      const apply = vi.fn(async () => applyGate.promise);
      const actor = startActor({ apply });
      await waitForReady(actor);
      actor.send({ type: 'submit', request });
      await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
      actor.send({ type: 'submit', request: collision });
      expect(actor.getSnapshot().context.outcome).toMatchObject({
        status: 'rejected',
        requestId: request.requestId,
        code: 'REQUEST_ID_COLLISION',
      });
      expect(actor.getSnapshot().context.activeRequest).toEqual(request);
      expect(actor.getSnapshot().context.pendingRequest).toBeUndefined();
      applyGate.resolve({ status: 'applied', current: committedSnapshot(request) });
      await waitFor(actor, (snapshot) => snapshot.context.outcome?.status === 'committed');
      expect(apply).toHaveBeenCalledOnce();
      actor.stop();
    },
  );

  it.each([
    { name: 'select another group', operation: { kind: 'select-group', group: 'alternate' } as const },
    {
      name: 'rename to a new group',
      operation: { kind: 'rename-group', group: 'alternate', nextGroup: 'renamed' } as const,
    },
  ])('rejects an unchanged plan that does not $name', async ({ operation }) => {
    const apply = vi.fn(defaultApply);
    const actor = startActor({
      plan: async () => ({ status: 'ready', proposed: initialSnapshot }),
      apply,
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: { ...nativeRequest(`invalid-noop:${operation.kind}`), operation } });
    await waitFor(
      actor,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'rejected',
    );
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'rejected', code: 'INVALID_PLAN' });
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it.each([
    { name: 'select active group', operation: { kind: 'select-group', group: 'default' } as const },
    {
      name: 'rename group to itself',
      operation: { kind: 'rename-group', group: 'alternate', nextGroup: 'alternate' } as const,
    },
  ])('settles $name as an authority no-op', async ({ operation }) => {
    const apply = vi.fn(defaultApply);
    const actor = startActor({
      plan: async () => ({ status: 'ready', proposed: initialSnapshot }),
      apply,
    });
    await waitForReady(actor);
    actor.send({ type: 'submit', request: { ...nativeRequest(`valid-noop:${operation.kind}`), operation } });
    await waitFor(
      actor,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'committed',
    );
    expect(actor.getSnapshot().context.outcome).toMatchObject({ status: 'committed', write: 'authority-no-op' });
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it('cancels an active semantic-no-op refresh and suppresses its late authority result', async () => {
    const stalePlan = Promise.withResolvers<ParameterSetPlanResult>();
    const lateRead = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const outcomes: string[] = [];
    const apply = vi.fn(defaultApply);
    let plans = 0;
    let reads = 0;
    const actor = startActor({
      resolve: async () => {
        reads += 1;
        return reads === 1 ? initialSnapshot : reads === 2 ? lateRead.promise : initialSnapshot;
      },
      plan: async () => {
        plans += 1;
        return stalePlan.promise;
      },
      apply,
    });
    actor.subscribe((snapshot) => {
      const { outcome } = snapshot.context;
      if (outcome !== undefined) {
        outcomes.push(`${outcome.status}:${outcome.requestId}`);
      }
    });
    await waitForReady(actor);
    const request = nativeRequest('cancel-active-refresh', 10);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
    actor.send({ type: 'watch.changed', generation: 0, requestId: 'watch:cancel-active-refresh' });
    stalePlan.resolve({ status: 'ready', proposed: initialSnapshot });
    await waitFor(actor, (snapshot) => snapshot.context.activeRefreshPending);
    actor.send({ type: 'cancel', requestId: request.requestId });
    await waitForReady(actor);
    lateRead.resolve(initialSnapshot);
    await Promise.resolve();
    expect(outcomes).toContain(`cancelled-before-apply:${request.requestId}`);
    expect(plans).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it('cancels an active semantic-no-op refresh after resolution failure and suppresses retry work', async () => {
    const stalePlan = Promise.withResolvers<ParameterSetPlanResult>();
    const lateRetry = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
    const outcomes: string[] = [];
    const apply = vi.fn(defaultApply);
    let plans = 0;
    let reads = 0;
    const actor = startActor({
      resolve: async () => {
        reads += 1;
        if (reads === 1 || reads >= 4) {
          return initialSnapshot;
        }
        if (reads === 2) {
          throw new Error('refresh failed');
        }
        return lateRetry.promise;
      },
      plan: async () => {
        plans += 1;
        return stalePlan.promise;
      },
      apply,
    });
    actor.subscribe((snapshot) => {
      const { outcome } = snapshot.context;
      if (outcome !== undefined) {
        outcomes.push(`${outcome.status}:${outcome.requestId}`);
      }
    });
    await waitForReady(actor);
    const request = nativeRequest('cancel-failed-refresh', 10);
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'planning' }));
    actor.send({ type: 'watch.changed', generation: 0, requestId: 'watch:cancel-failed-refresh' });
    stalePlan.resolve({ status: 'ready', proposed: initialSnapshot });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'resolutionFailed' }));
    actor.send({ type: 'cancel', requestId: request.requestId });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'resolving' }));
    actor.send({ type: 'resolve', requestId: 'resolve:after-cancel' });
    await waitForReady(actor);
    lateRetry.resolve(initialSnapshot);
    await Promise.resolve();
    expect(outcomes).toContain(`cancelled-before-apply:${request.requestId}`);
    expect(plans).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    actor.stop();
  });

  it.each(['resolve', 'plan', 'apply', 'read'] as const)(
    'keeps a cyclic nested $phase snapshot inside the common nonthrowing boundary',
    async (phase) => {
      const request = nativeRequest(`cycle-${phase}`);
      const unsafe = phase === 'resolve' ? structuredClone(initialSnapshot) : committedSnapshot(request);
      const value: Record<string, unknown> = {};
      value['self'] = value;
      Reflect.set(unsafe.entry.groups['default']!.values, 'width', value);
      const readGate = Promise.withResolvers<ParameterSetAuthoritySnapshot>();
      const actor = startActor({
        ...(phase === 'resolve' ? { resolve: async () => unsafe } : {}),
        ...(phase === 'plan' ? { plan: async () => ({ status: 'ready', proposed: unsafe }) } : {}),
        ...(phase === 'apply'
          ? { apply: async () => ({ status: 'applied', current: unsafe }), read: async () => readGate.promise }
          : {}),
        ...(phase === 'read'
          ? {
              apply: async () => {
                throw Object.assign(new Error('reply lost'), { applicationState: 'potentially-applied' });
              },
              read: async () => unsafe,
            }
          : {}),
      });
      if (phase === 'resolve') {
        await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'resolutionFailed' }));
      } else {
        await waitForReady(actor);
        actor.send({ type: 'submit', request });
        if (phase === 'plan') {
          await waitFor(
            actor,
            (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'rejected',
          );
          expect(actor.getSnapshot().context.outcome).toMatchObject({ code: 'INVALID_PLAN' });
        } else if (phase === 'apply') {
          await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'reconciling' }));
          expect(actor.getSnapshot().context).toMatchObject({ operationIndeterminate: true, activeRequest: request });
          readGate.resolve(initialSnapshot);
          await waitForReady(actor);
        } else {
          await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'indeterminate' }));
          expect(actor.getSnapshot().context).toMatchObject({ operationIndeterminate: true, activeRequest: request });
        }
      }
      expect(actor.getSnapshot().status).toBe('active');
      expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
      actor.stop();
    },
  );

  it('canonically projects successful effect snapshots and rejects unsafe nested values', async () => {
    const withUnsafeExtras = (snapshot: ParameterSetAuthoritySnapshot): ParameterSetAuthoritySnapshot => {
      const result = structuredClone(snapshot);
      Object.defineProperty(result, 'cycle', { value: result, enumerable: true });
      Object.defineProperty(result.identity, 'extra', { value: 12n, enumerable: true });
      return result;
    };
    const resolution = startActor({ resolve: async () => withUnsafeExtras(initialSnapshot) });
    await waitForReady(resolution);
    expect(Reflect.has(resolution.getSnapshot().context.current!, 'cycle')).toBe(false);
    expect(Reflect.has(resolution.getSnapshot().context.current!.identity, 'extra')).toBe(false);
    expect(() => JSON.stringify(resolution.getSnapshot().context)).not.toThrow();
    resolution.stop();

    const request = nativeRequest('project-effects');
    const applyInputs: ParameterSetApplyInput[] = [];
    const projected = startActor({
      plan: async () => ({ status: 'ready', proposed: withUnsafeExtras(committedSnapshot(request)) }),
      apply: async (input) => {
        applyInputs.push(input);
        return { status: 'applied', current: withUnsafeExtras(input.proposed) };
      },
    });
    await waitForReady(projected);
    projected.send({ type: 'submit', request });
    await waitFor(
      projected,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'committed',
    );
    expect(Reflect.has(applyInputs[0]!.proposed, 'cycle')).toBe(false);
    expect(Reflect.has(projected.getSnapshot().context.current!, 'cycle')).toBe(false);
    expect(() => JSON.stringify(projected.getSnapshot().context)).not.toThrow();
    projected.stop();

    const readback = startActor({
      apply: async () => {
        throw new Error('reply lost');
      },
      read: async () => withUnsafeExtras(committedSnapshot(nativeRequest('project-readback'))),
    });
    await waitForReady(readback);
    readback.send({ type: 'submit', request: nativeRequest('project-readback') });
    await waitFor(
      readback,
      (snapshot) => snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.status === 'committed',
    );
    expect(Reflect.has(readback.getSnapshot().context.current!.identity, 'extra')).toBe(false);
    expect(() => JSON.stringify(readback.getSnapshot().context)).not.toThrow();
    readback.stop();

    const unsafeNested = structuredClone(initialSnapshot);
    unsafeNested.entry.groups['default']!.values['width'] = Number.POSITIVE_INFINITY;
    const rejected = startActor({ resolve: async () => unsafeNested });
    await waitFor(rejected, (snapshot) => snapshot.matches({ operational: 'resolutionFailed' }));
    expect(rejected.getSnapshot().context.current).toBeUndefined();
    expect(() => JSON.stringify(rejected.getSnapshot().context)).not.toThrow();
    rejected.stop();
  });

  it.each(['cyclic', 'bigint'] as const)(
    'keeps every effect failure path live with a bounded $failure diagnostic',
    async (failure) => {
      const makeFailure = (): Error => {
        const value = new Error('controlled effect failure');
        Object.defineProperties(value, {
          applicationState: { value: 'known-not-applied', enumerable: true },
          code: { value: failure === 'bigint' ? 12n : 'CONTROLLED_FAILURE', enumerable: true },
          message: { value: failure === 'bigint' ? 34n : undefined, enumerable: true },
        });
        if (failure === 'cyclic') {
          Object.defineProperty(value, 'self', { value, enumerable: true });
        }
        return value;
      };
      const expectSafeContext = (actor: ReturnType<typeof startActor>): void => {
        expect(actor.getSnapshot().status).not.toBe('error');
        expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
        const { diagnostic, outcome } = actor.getSnapshot().context;
        const outcomeMessage = outcome !== undefined && 'message' in outcome ? outcome.message : undefined;
        const message = diagnostic?.message ?? outcomeMessage;
        expect(message?.length ?? 0).toBeLessThanOrEqual(512);
      };

      const resolve = startActor({
        resolve: async () => {
          throw makeFailure();
        },
      });
      await waitFor(resolve, (snapshot) => snapshot.matches({ operational: 'resolutionFailed' }));
      expectSafeContext(resolve);
      resolve.stop();

      const plan = startActor({
        plan: async () => {
          throw makeFailure();
        },
      });
      await waitForReady(plan);
      plan.send({ type: 'submit', request: nativeRequest(`plan-${failure}`) });
      await waitFor(
        plan,
        (snapshot) =>
          snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === `plan-${failure}`,
      );
      expectSafeContext(plan);
      plan.stop();

      const apply = startActor({
        apply: async () => {
          throw makeFailure();
        },
      });
      await waitForReady(apply);
      apply.send({ type: 'submit', request: nativeRequest(`apply-${failure}`) });
      await waitFor(
        apply,
        (snapshot) =>
          snapshot.matches({ operational: 'ready' }) && snapshot.context.outcome?.requestId === `apply-${failure}`,
      );
      expectSafeContext(apply);
      apply.stop();

      const read = startActor({
        apply: async () => {
          throw new Error('reply lost');
        },
        read: async () => {
          throw makeFailure();
        },
      });
      await waitForReady(read);
      read.send({ type: 'submit', request: nativeRequest(`read-${failure}`) });
      await waitFor(read, (snapshot) => snapshot.matches({ operational: 'indeterminate' }));
      expectSafeContext(read);
      read.stop();

      const watch = startActor({
        observe: () => {
          throw makeFailure();
        },
      });
      await waitFor(watch, (snapshot) => snapshot.matches('disconnected'));
      expectSafeContext(watch);
      watch.stop();

      const flush = startActor({
        flush: async () => {
          throw makeFailure();
        },
      });
      await waitForReady(flush);
      flush.send({ type: 'close', requestId: `flush-${failure}` });
      await waitFor(flush, (snapshot) => snapshot.matches('closeFailed'));
      expectSafeContext(flush);
      flush.stop();
    },
  );

  it('disposes a failed watch, resubscribes, reads current, and cleans up on abrupt stop', async () => {
    const cleanups: Array<ReturnType<typeof vi.fn>> = [];
    const watchSenders: Array<(event: ParameterSetMachineEvent) => void> = [];
    let watchCount = 0;
    const actor = startActor({
      observe: (_input, sendBack) => {
        watchCount += 1;
        const cleanup = vi.fn();
        cleanups.push(cleanup);
        watchSenders.push(sendBack);
        return cleanup;
      },
    });
    await waitForReady(actor);
    watchSenders[0]!({ type: 'watch.error', generation: 1, code: 'STALE_WATCH', message: 'stale' });
    expect(actor.getSnapshot().matches({ operational: 'ready' })).toBe(true);
    watchSenders[0]!({ type: 'watch.error', generation: 0, code: 'WATCH_LOST', message: 'lost' });
    await waitFor(actor, (snapshot) => snapshot.matches('disconnected'));
    expect(cleanups[0]).toHaveBeenCalledOnce();
    actor.send({ type: 'watch.retry', requestId: 'resolve:retry' });
    await waitForReady(actor);
    expect(watchCount).toBe(2);
    actor.stop();
    expect(cleanups[1]).toHaveBeenCalledOnce();
  });

  it('quiesces admitted work, reports invalid drafts, and never reports a failed flush as closed', async () => {
    const apply = Promise.withResolvers<ParameterSetApplyResult>();
    const flushInputs: ParameterSetFlushInput[] = [];
    const actor = startActor({
      apply: async () => apply.promise,
      flush: async (input) => {
        flushInputs.push(input);
        throw Object.assign(new Error('disk full'), { code: 'FLUSH_FAILED' });
      },
    });
    await waitForReady(actor);
    const request = nativeRequest('close-write');
    actor.send({ type: 'submit', request });
    await waitFor(actor, (snapshot) => snapshot.matches({ operational: 'applying' }));
    actor.send({ type: 'close', requestId: 'close-1', invalidDrafts: ['height'] });
    actor.send({ type: 'submit', request: nativeRequest('rejected-after-close') });
    apply.resolve({ status: 'applied', current: committedSnapshot(request) });
    await waitFor(actor, (snapshot) => snapshot.matches('closeFailed'));
    expect(flushInputs).toEqual([{ target, requestId: 'close-1', invalidDrafts: ['height'] }]);
    expect(actor.getSnapshot().context.diagnostic).toMatchObject({ code: 'FLUSH_FAILED', recoverable: false });
    expect(actor.getSnapshot().matches('closed')).toBe(false);
    actor.stop();
  });
});

describe('parameterSetMachine real Node checked authority', () => {
  it('admits one same-revision client, conflicts the other, and preserves grouped records atomically', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-parameter-set-'));
    activeSandboxes.push(sandbox);
    const root = join(sandbox, 'root');
    const authorityRoot = join(sandbox, 'authority');
    mkdirSync(root);
    mkdirSync(authorityRoot);
    const path = '.tau/parameters/main.ts.json';
    const initialBytes = JSON.stringify(initialEntry);
    mkdirSync(join(root, '.tau', 'parameters'), { recursive: true });
    writeFileSync(join(root, path), initialBytes);
    const authority = new NodeFsAuthorityHost({
      authorityDirectory: () => authorityRoot,
      authorityIdentity: () => root,
    });
    const portsA = new MessageChannel();
    const portsB = new MessageChannel();
    const stopA = serveNodeFsProvider(toNodeFsPort(portsA.port2), {
      allowRoot: (candidate) => candidate === root,
      authority,
    });
    const stopB = serveNodeFsProvider(toNodeFsPort(portsB.port2), {
      allowRoot: (candidate) => candidate === root,
      authority,
    });
    const channelA = new NodeFsChannel(toNodeFsPort(portsA.port1));
    const channelB = new NodeFsChannel(toNodeFsPort(portsB.port1));
    const providerA = new NodeFsProviderClient(channelA, root);
    const providerB = new NodeFsProviderClient(channelB, root);

    const readSnapshot = async (provider: NodeFsProviderClient): Promise<ParameterSetAuthoritySnapshot> => {
      const entry = fileParameterEntrySchema.parse(JSON.parse(await provider.readFile(path, 'utf8')));
      return { entry, identity: entry.identity ?? initialIdentity };
    };
    const authorityMachine = (provider: NodeFsProviderClient) =>
      providedMachine({
        resolve: async () => readSnapshot(provider),
        apply: async (input) => {
          const result = await provider.writeFileChecked({
            path,
            data: JSON.stringify(input.proposed.entry),
            preconditions: [{ path, expected: initialBytes }],
          });
          if (result.status === 'conflict') {
            const actual = result.conflicts.find((conflict) => conflict.path === path)?.actual;
            if (actual === null || actual === undefined) {
              throw new Error('Expected current conflict bytes');
            }
            const currentEntry = fileParameterEntrySchema.parse(JSON.parse(new TextDecoder().decode(actual)));
            return {
              status: 'conflict',
              code: 'STALE_MANIFEST',
              conflicts: [path],
              current: { entry: currentEntry, identity: currentEntry.identity! },
            };
          }
          const currentEntry = fileParameterEntrySchema.parse(JSON.parse(new TextDecoder().decode(result.content)));
          return { status: result.status, current: { entry: currentEntry, identity: currentEntry.identity! } };
        },
      });
    const actorA = createActor(authorityMachine(providerA), { input: { target, initialRequestId: 'resolve:a' } });
    const actorB = createActor(authorityMachine(providerB), { input: { target, initialRequestId: 'resolve:b' } });
    actorA.start();
    actorB.start();
    await Promise.all([waitForReady(actorA), waitForReady(actorB)]);
    actorA.send({ type: 'submit', request: nativeRequest('client-a', 30) });
    actorB.send({ type: 'submit', request: nativeRequest('client-b', 40) });
    await Promise.all([
      waitFor(actorA, (snapshot) => snapshot.matches({ operational: 'ready' })),
      waitFor(actorB, (snapshot) => snapshot.matches({ operational: 'ready' })),
    ]);

    expect(
      [actorA.getSnapshot().context.outcome?.status, actorB.getSnapshot().context.outcome?.status].sort((left, right) =>
        String(left).localeCompare(String(right)),
      ),
    ).toEqual(['committed', 'rejected']);
    const durable = await readSnapshot(providerA);
    expect(durable.entry.groups['alternate']!.values).toEqual({ width: 20 });
    expect(durable.entry.lastOperation?.requestId).toMatch(/^client-[ab]$/u);

    actorA.stop();
    actorB.stop();
    channelA.close();
    channelB.close();
    await Promise.all([stopA(), stopB()]);
    portsA.port2.close();
    portsB.port2.close();
  });
});
