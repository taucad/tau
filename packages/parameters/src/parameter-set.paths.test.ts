import { contentDigest } from '@taucad/cache-core';
import type { CheckedFileWriteResult } from '@taucad/types';
import { expect, it } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { compileParameterManifest } from '#manifest.js';
import type { ParameterResolutionOptions } from '#manifest.js';
import { parameterSetMachine, submitParameterRequest } from '#parameter-set.machine.js';
import type { ParameterSetEmission, ParameterSetLoadInput } from '#parameter-set.machine.js';
import { parameterSetHarness } from '#parameter-set.test-helper.js';
import { resolveParameterSnapshot } from '#snapshot.js';
import { planParameterChange } from '#planning.js';
import type { ParameterChange } from '#planning.js';
import type { ParameterSnapshot } from '#snapshot.js';
import type { ParameterSetOutcome, ParameterSetRequest, ParameterSetTarget } from '#types.js';

const target: ParameterSetTarget = { authority: 'memory', root: '/project', entry: 'main.ts' };
const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });

const sourceUnitSnapshot = async (resolution?: ParameterResolutionOptions): Promise<ParameterSnapshot> =>
  resolveParameterSnapshot({
    target,
    path: '.tau/parameters/main.ts.json',
    bytes: null,
    manifest: await compileParameterManifest({
      declaration: {
        schema: {
          $schema: 'https://json-structure.org/meta/extended/v0/#',
          $id: 'urn:test:parameters',
          $uses: ['JSONSchemaUnits'],
          name: 'Parameters',
          type: 'object',
          properties: { width: { type: 'double', ucumUnit: 'mm', minimum: 0 } },
        },
        defaults: { width: 100 },
        bindings: {
          '/width': {
            parameterId: 'width',
            quantityKind: 'http://qudt.org/vocab/quantitykind/Length',
            space: 'linear',
            unit: 'mm',
            sourceUnitCapability: 'change-source-unit:preserve-size:v1',
          },
        },
      },
      scope: { kind: 'source', ...target },
      source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
      dependency: digest,
      middleware: digest,
      ...(resolution === undefined ? {} : { resolution }),
    }),
  });

const sourceUnitRequest = (current: ParameterSnapshot, requestId = 'unit'): ParameterSetRequest => ({
  requestId,
  pressure: 'final',
  expected: current.identity,
  operation: {
    kind: 'source-unit',
    mode: 'preserve-size',
    group: 'default',
    parameterId: 'width',
    resource: current.manifest.bindings['/width']!.schema.resource,
    pointer: '/width',
    unit: 'cm',
    producerCapability: {
      producer: 'fixture',
      sourceRevision: current.manifest.source.revision,
      capability: 'change-source-unit:preserve-size:v1',
    },
  },
});

const groupRequest = (current: ParameterSnapshot, requestId: string): ParameterSetRequest => ({
  requestId,
  pressure: 'final',
  expected: current.identity,
  operation: { kind: 'create-group', group: requestId },
});

const valueRequest = (current: ParameterSnapshot, requestId: string, value: number): ParameterSetRequest => ({
  requestId,
  pressure: 'final',
  expected: current.identity,
  base: { pointer: '/width', value: 100 },
  operation: {
    kind: 'native-value',
    group: 'default',
    parameterId: 'width',
    resource: current.manifest.bindings['/width']!.schema.resource,
    pointer: '/width',
    value,
  },
});

type Fixture = Readonly<{
  actor: ActorRefFrom<typeof parameterSetMachine>;
  current: ParameterSnapshot;
  emitted: ParameterSetEmission[];
  counts(): { loads: number; writes: number };
}>;

const start = async (
  options: Readonly<{
    commit?: (write: number) => Promise<CheckedFileWriteResult>;
    load?: (load: number, current: ParameterSnapshot) => Promise<ParameterSnapshot>;
    plan?: () => Promise<ParameterChange>;
  }> = {},
): Promise<Fixture> => {
  const current = await sourceUnitSnapshot();
  let loads = 0;
  let writes = 0;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: fromPromise(async () => {
          loads += 1;
          return options.load === undefined ? structuredClone(current) : options.load(loads, current);
        }),
        commitParameterSet: fromPromise(async ({ input }) => {
          writes += 1;
          return options.commit === undefined
            ? { status: 'applied', content: new TextEncoder().encode(String(input.write.data)) }
            : options.commit(writes);
        }),
        ...(options.plan === undefined ? {} : { planParameterSet: fromPromise(options.plan) }),
      },
    }),
    { input: { target } },
  );
  const emitted: ParameterSetEmission[] = [];
  for (const type of ['settled', 'command-rejected', 'confirmation-required', 'loaded'] as const) {
    actor.on(type, (event) => emitted.push(event));
  }
  actor.start();
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  return { actor, current, emitted, counts: () => ({ loads, writes }) };
};

const confirming = async (fixture: Fixture): Promise<Readonly<{ outcome: Promise<ParameterSetOutcome> }>> => {
  const outcome = submitParameterRequest(fixture.actor, sourceUnitRequest(fixture.current));
  await waitFor(fixture.actor, (snapshot) => snapshot.matches({ open: 'confirmation' }));
  return { outcome };
};

const planFingerprint = (fixture: Fixture): string => {
  const event = fixture.emitted.find((item) => item.type === 'confirmation-required');
  if (event?.type !== 'confirmation-required') {
    throw new Error('Expected a confirmation emission');
  }
  return event.fingerprint;
};

it('emits a confirmation and applies only the matching fingerprint', async () => {
  const fixture = await start();
  const { outcome } = await confirming(fixture);
  fixture.actor.send({ type: 'confirm', requestId: 'unit', fingerprint: 'not-the-plan' });
  expect(fixture.actor.getSnapshot().matches({ open: 'confirmation' })).toBe(true);
  expect(fixture.emitted.at(-1)).toMatchObject({
    type: 'command-rejected',
    outcome: { requestId: 'unit', code: 'STALE_PLAN' },
  });
  fixture.actor.send({ type: 'confirm', requestId: 'unit', fingerprint: planFingerprint(fixture) });
  await expect(outcome).resolves.toMatchObject({ status: 'committed', write: 'applied' });
  expect(fixture.counts().writes).toBe(1);
  fixture.actor.stop();
});

it('keeps a confirmation across a same-mode read and rejects it on a mode change', async () => {
  const fixture = await start();
  const { outcome } = await confirming(fixture);
  fixture.actor.send({ type: 'resolve' });
  fixture.actor.send({ type: 'resolve', resolution: { mode: 'default' } });
  expect(fixture.actor.getSnapshot().matches({ open: 'confirmation' })).toBe(true);
  fixture.actor.send({ type: 'resolve', resolution: { mode: 'declared-only' } });
  await expect(outcome).resolves.toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
  await waitFor(fixture.actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  expect(fixture.counts()).toEqual({ loads: 2, writes: 0 });
  fixture.actor.stop();
});

it.each([
  {
    label: 'cancel',
    event: { type: 'cancel', requestId: 'unit' },
    expected: { status: 'cancelled-before-apply' },
    state: 'ready',
  },
  { label: 'close', event: { type: 'close' }, expected: { status: 'cancelled-before-apply' }, state: 'closed' },
  {
    label: 'watch.error',
    event: { type: 'watch.error', message: 'reset' },
    expected: { status: 'rejected', code: 'DISCONNECTED' },
    state: 'disconnected',
  },
] as const)('settles a pending confirmation on $label without writing', async ({ event, expected, state }) => {
  const fixture = await start();
  const { outcome } = await confirming(fixture);
  fixture.actor.send(event);
  await expect(outcome).resolves.toMatchObject(expected);
  await waitFor(fixture.actor, (snapshot) =>
    state === 'closed' ? snapshot.status === 'done' : snapshot.matches({ open: state }),
  );
  expect(fixture.counts().writes).toBe(0);
  fixture.actor.stop();
});

it('reports a planner failure as an invalid operation', async () => {
  const fixture = await start({
    plan: async () => {
      throw new Error('Planner exploded');
    },
  });
  await expect(submitParameterRequest(fixture.actor, groupRequest(fixture.current, 'broken'))).resolves.toEqual({
    status: 'rejected',
    requestId: 'broken',
    code: 'INVALID_OPERATION',
    message: 'Planner exploded',
  });
  fixture.actor.stop();
});

it('should re-plan a conflicted write and commit when the field did not move', async () => {
  const fixture = await start({
    commit: async (write) =>
      write === 1 ? { status: 'conflict', conflicts: [] } : { status: 'applied', content: new Uint8Array() },
    load: async (load, current) => {
      if (load === 1) {
        return structuredClone(current);
      }
      const foreign = planParameterChange({ current, request: groupRequest(current, 'foreign') });
      if (foreign.status !== 'prepared') {
        throw new Error(JSON.stringify(foreign));
      }
      return foreign.proposed;
    },
  });
  await expect(
    submitParameterRequest(fixture.actor, valueRequest(fixture.current, 'raced', 101)),
  ).resolves.toMatchObject({
    status: 'committed',
  });
  expect(fixture.actor.getSnapshot().context.current?.entry.groups).toMatchObject({
    default: { values: { width: 101 } },
    foreign: { values: {} },
  });
  expect(fixture.counts()).toEqual({ loads: 2, writes: 2 });
  fixture.actor.stop();
});

it('should settle RECORD_CONFLICT after three conflicts', async () => {
  const fixture = await start({ commit: async () => ({ status: 'conflict', conflicts: [] }) });
  await expect(submitParameterRequest(fixture.actor, groupRequest(fixture.current, 'raced'))).resolves.toMatchObject({
    status: 'rejected',
    code: 'RECORD_CONFLICT',
  });
  expect(fixture.counts()).toEqual({ loads: 3, writes: 3 });
  fixture.actor.stop();
});

it('re-plans a pending confirmation when the record changes, instead of losing the command', async () => {
  const fixture = await start();
  const { outcome } = await confirming(fixture);
  const before = fixture.emitted.filter((event) => event.type === 'confirmation-required').length;
  fixture.actor.send({ type: 'watch.changed' });
  await waitFor(fixture.actor, (snapshot) => snapshot.matches({ open: 'confirmation' }) && fixture.counts().loads > 1);
  // The command is still pending its confirmation, re-planned against the fresh record.
  expect(fixture.emitted.filter((event) => event.type === 'confirmation-required').length).toBe(before + 1);
  expect(fixture.counts().writes).toBe(0);
  fixture.actor.send({ type: 'cancel', requestId: 'unit' });
  await expect(outcome).resolves.toMatchObject({ status: 'cancelled-before-apply' });
  fixture.actor.stop();
});

it('holds an unprovable write as indeterminate when recovery cannot read, then reopens on change', async () => {
  const fixture = await start({
    commit: async () => {
      throw new Error('Reply lost');
    },
    load: async (load, current) => {
      if (load === 2) {
        throw new Error('Replica unavailable');
      }
      return structuredClone(current);
    },
  });
  await expect(submitParameterRequest(fixture.actor, groupRequest(fixture.current, 'lost'))).resolves.toMatchObject({
    status: 'indeterminate',
    code: 'RECOVERY_FAILED',
  });
  expect(fixture.actor.getSnapshot().matches({ open: 'uncertain' })).toBe(true);
  // Recovering means reloading and accepting commands again; the settled command stays settled.
  fixture.actor.send({ type: 'watch.changed' });
  await waitFor(fixture.actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  expect(fixture.emitted.filter((event) => event.type === 'settled')).toHaveLength(1);
  fixture.actor.stop();
});

it('disconnects when observation fails during the first load', async () => {
  const gate = Promise.withResolvers<ParameterSnapshot>();
  const current = await sourceUnitSnapshot();
  const actor = createActor(
    parameterSetMachine.provide({ actors: { loadParameterSet: fromPromise(async () => gate.promise) } }),
    { input: { target } },
  ).start();
  actor.send({ type: 'watch.error', message: 'Watch reset' });
  expect(actor.getSnapshot().matches({ open: 'disconnected' })).toBe(true);
  expect(actor.getSnapshot().context.diagnostic).toEqual({ code: 'WATCH_FAILED', message: 'Watch reset' });
  gate.resolve(current);
  actor.stop();
});

it('exposes a typed record failure and refuses submissions until reloaded', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: fromPromise<ParameterSnapshot, ParameterSetLoadInput>(async () => {
          throw Object.assign(new Error('The parameter record is invalid; its bytes are preserved.'), {
            code: 'INVALID_RECORD',
            applicationState: 'known-not-applied',
          });
        }),
      },
    }),
    { input: { target } },
  ).start();
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'disconnected' }));
  expect(actor.getSnapshot().context.diagnostic).toMatchObject({ code: 'INVALID_RECORD' });
  await expect(submitParameterRequest(actor, groupRequest(fixture.snapshot, 'blocked'))).resolves.toMatchObject({
    code: 'DISCONNECTED',
  });
  actor.stop();
});

it('rejects a cancel for an unknown request without settling any submitted command', async () => {
  const fixture = await start();
  fixture.actor.send({ type: 'cancel', requestId: 'nobody' });
  expect(fixture.emitted.at(-1)).toEqual({
    type: 'command-rejected',
    outcome: {
      status: 'rejected',
      requestId: 'nobody',
      code: 'UNKNOWN_REQUEST',
      message: 'No matching parameter operation is pending.',
    },
  });
  expect(fixture.emitted.some((event) => event.type === 'settled')).toBe(false);
  fixture.actor.stop();
});

it('rejects the settlement promise when the actor stops during a write', async () => {
  const gate = Promise.withResolvers<CheckedFileWriteResult>();
  const fixture = await start({ commit: async () => gate.promise });
  const outcome = submitParameterRequest(fixture.actor, groupRequest(fixture.current, 'stopped'));
  await waitFor(fixture.actor, (snapshot) => snapshot.matches({ open: 'applying' }));
  fixture.actor.stop();
  await expect(outcome).rejects.toThrow('Parameter actor closed without settling its command.');
  gate.resolve({ status: 'applied', content: new Uint8Array() });
});

it('should keep the same current object for an own-write echo', async () => {
  const fixture = await start();
  const loaded = fixture.emitted.filter((event) => event.type === 'loaded').length;
  const { current } = fixture.actor.getSnapshot().context;
  fixture.actor.send({ type: 'resolve' });
  expect(fixture.actor.getSnapshot().matches({ open: 'refreshing' })).toBe(true);
  await waitFor(fixture.actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  expect(fixture.counts().loads).toBe(2);
  expect(fixture.actor.getSnapshot().context.current).toBe(current);
  expect(fixture.emitted.filter((event) => event.type === 'loaded')).toHaveLength(loaded);
  fixture.actor.stop();
});

it('bounds the pending queue and refuses the overflow as busy', async () => {
  const gate = Promise.withResolvers<CheckedFileWriteResult>();
  const fixture = await start({ commit: async () => gate.promise });
  void submitParameterRequest(fixture.actor, groupRequest(fixture.current, 'active'));
  await waitFor(fixture.actor, (snapshot) => snapshot.matches({ open: 'applying' }));
  const queued = Array.from({ length: 8 }, async (_, index) =>
    submitParameterRequest(fixture.actor, groupRequest(fixture.current, `queued-${String(index)}`)),
  );
  await expect(submitParameterRequest(fixture.actor, groupRequest(fixture.current, 'overflow'))).resolves.toMatchObject(
    {
      code: 'BUSY',
    },
  );
  expect(fixture.actor.getSnapshot().context.pending).toHaveLength(8);
  fixture.actor.send({ type: 'close' });
  await expect(Promise.all(queued)).resolves.toHaveLength(8);
  gate.resolve({ status: 'applied', content: new Uint8Array() });
});
