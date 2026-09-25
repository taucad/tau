import type { CheckedFileWriteResult } from '@taucad/types';
import { expect, it } from 'vitest';
import { createActor, createCallbackLogic, createAsyncLogic, waitFor } from 'xstate';
import { parameterSetMachine, submitParameterRequest } from '#parameter-set.machine.js';
import type { ParameterSetLoadInput } from '#parameter-set.machine.js';
import { parameterSetHarness } from '#parameter-set.test-helper.js';
import { planParameterChange } from '#planning.js';
import type { ParameterChange } from '#planning.js';
import type { ParameterSetOutcome, ParameterSetRequest } from '#types.js';
import type { ParameterSnapshot } from '#snapshot.js';

const groupRequest = (requestId: string, harness: { snapshot: ParameterSnapshot }): ParameterSetRequest => ({
  requestId,
  fingerprint: requestId,
  pressure: 'final',
  expected: harness.snapshot.identity,
  operation: { kind: 'create-group', group: requestId },
});

it('reports an authority-proven refusal without readback or retry', async () => {
  const harness = await parameterSetHarness(true);
  await expect(harness.submit(groupRequest('refused', harness))).resolves.toMatchObject({
    status: 'known-not-applied-failure',
    code: 'APPLY_REFUSED',
  });
  expect(harness.counts()).toEqual({ writes: 0, loads: 1 });
  expect(harness.actor.getSnapshot().matches({ open: 'ready' })).toBe(true);
  harness.actor.stop();
});

it('settles a repeated value as a durable no-op without another write', async () => {
  const harness = await parameterSetHarness();
  const edit = (requestId: string, expected: ParameterSetRequest['expected']): ParameterSetRequest => ({
    ...groupRequest(requestId, harness),
    expected,
    operation: {
      kind: 'native-value',
      group: 'default',
      pointer: '/width',
      value: 30,
    },
  });
  const first = await harness.submit(edit('first', harness.snapshot.identity));
  if (first.status !== 'committed') {
    throw new Error(JSON.stringify(first));
  }
  await expect(harness.submit(edit('again', first.revision))).resolves.toMatchObject({
    status: 'committed',
    write: 'durable-no-op',
  });
  expect(harness.counts().writes).toBe(1);
  harness.actor.stop();
});

it('settles a failed write that left the record untouched as a known refusal', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  let writes = 0;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async () => structuredClone(fixture.snapshot),
        }),
        commitParameterSet: createAsyncLogic<CheckedFileWriteResult, Extract<ParameterChange, { status: 'prepared' }>>({
          run: async (): Promise<CheckedFileWriteResult> => {
            writes += 1;
            throw new Error('Reply lost; nothing was written');
          },
        }),
      },
    }),
    { input: { target: fixture.snapshot.target } },
  ).start();
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));
  // The record still holds the bytes the change was planned from, so the write provably never landed.
  await expect(submitParameterRequest(actor, groupRequest('refused', fixture))).resolves.toMatchObject({
    status: 'known-not-applied-failure',
    code: 'WRITE_FAILED',
  });
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));
  expect(writes).toBe(1);
  actor.stop();
});

it('should reconcile a lost reply when the intended write landed', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  let visible = fixture.snapshot;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async () => structuredClone(visible),
        }),
        commitParameterSet: createAsyncLogic<CheckedFileWriteResult, Extract<ParameterChange, { status: 'prepared' }>>({
          run: async ({ input }): Promise<CheckedFileWriteResult> => {
            visible = structuredClone(input.proposed);
            throw new Error('Reply lost after the write landed');
          },
        }),
      },
    }),
    { input: { target: fixture.snapshot.target } },
  ).start();
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));

  await expect(submitParameterRequest(actor, groupRequest('landed', fixture))).resolves.toMatchObject({
    status: 'committed',
    requestId: 'landed',
    write: 'reconciled',
  });
  expect(actor.getSnapshot().context.current?.entry.groups).toHaveProperty('landed');
  actor.stop();
});

it('should accept a command after a readback that found foreign bytes', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  // A third party replaced the record, so neither the intended nor the planned bytes are on disk.
  const foreign: ParameterSnapshot = {
    ...fixture.snapshot,
    bytes: new TextEncoder().encode('{"activeGroup":"x","groups":{"x":{"values":{}}}}\n'),
  };
  let visible: ParameterSnapshot = fixture.snapshot;
  let lost = true;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async () => structuredClone(visible),
        }),
        commitParameterSet: createAsyncLogic<CheckedFileWriteResult, Extract<ParameterChange, { status: 'prepared' }>>({
          run: async ({ input }): Promise<CheckedFileWriteResult> => {
            if (lost) {
              lost = false;
              visible = foreign;
              throw new Error('Reply lost after an unknown write');
            }
            visible = structuredClone(input.proposed);
            return { status: 'applied', content: input.proposed.bytes! };
          },
        }),
      },
    }),
    { input: { target: fixture.snapshot.target } },
  ).start();
  const settled: ParameterSetOutcome[] = [];
  actor.on('settled', (event) => settled.push(event.outcome));
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));
  actor.send({ type: 'submit', request: groupRequest('uncertain', fixture) });
  await waitFor(actor, (state) => state.matches({ open: 'ready' }) && settled.length > 0);
  expect(settled).toEqual([
    expect.objectContaining({ status: 'indeterminate', requestId: 'uncertain', code: 'UNKNOWN_APPLICATION' }),
  ]);
  visible = fixture.snapshot;
  await expect(submitParameterRequest(actor, groupRequest('after', fixture))).resolves.toMatchObject({
    status: 'committed',
  });
  expect(settled.filter(({ requestId }) => requestId === 'uncertain')).toHaveLength(1);
  actor.stop();
});

it('publishes only the latest overlapping load and keeps the last good snapshot on failure', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  const loads: Array<PromiseWithResolvers<ParameterSnapshot>> = [];
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async () => {
            const load = Promise.withResolvers<ParameterSnapshot>();
            loads.push(load);
            return load.promise;
          },
        }),
      },
    }),
    { input: { target: fixture.snapshot.target } },
  ).start();
  const loaded: string[] = [];
  actor.on('loaded', (event) => loaded.push(event.current.path));
  actor.send({ type: 'resolve', resolution: { mode: 'declared-only' } });
  expect(loads).toHaveLength(2);
  loads[1]!.resolve({ ...fixture.snapshot, path: 'b' });
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));
  loads[0]!.resolve({ ...fixture.snapshot, path: 'a' });
  await Promise.resolve();
  expect(loaded).toEqual(['b']);
  actor.send({ type: 'resolve', resolution: { mode: 'default' } });
  loads[2]!.reject(Object.assign(new Error('Producer failed'), { code: 'RESOLUTION_FAILED' }));
  await waitFor(actor, (state) => state.matches({ open: 'disconnected' }));
  expect(actor.getSnapshot().context).toMatchObject({
    current: { path: 'b' },
    diagnostic: { code: 'RESOLUTION_FAILED' },
  });
  actor.stop();
});

it('hands a same-mode re-resolution the held snapshot, leaving the host to decide what it re-reads', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  const inputs: ParameterSetLoadInput[] = [];
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async ({ input }) => {
            inputs.push(input);
            return fixture.snapshot;
          },
        }),
      },
    }),
    { input: { target: fixture.snapshot.target } },
  ).start();
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));
  actor.send({ type: 'resolve' });
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));

  /* A held-mode `resolve` reaches the loader with `current`, exactly as a watch event does. A host
   * that treats that as "only the sidecar changed" never re-resolves the producer, so an agent host
   * that edits sources between reads must load unconditionally. */
  expect(inputs.map(({ current }) => current !== undefined)).toEqual([false, true]);
  actor.stop();
});

it('cancels a queued command once without planning or applying it', async () => {
  const gate = Promise.withResolvers<void>();
  const harness = await parameterSetHarness(false, { gate: gate.promise });
  const active = harness.submit(groupRequest('active', harness));
  await waitFor(harness.actor, (state) => state.matches({ open: 'applying' }));
  const pending = harness.submit(groupRequest('pending', harness));
  harness.actor.send({ type: 'cancel', requestId: 'pending' });
  await expect(pending).resolves.toEqual({ status: 'cancelled-before-apply', requestId: 'pending' });
  gate.resolve();
  await expect(active).resolves.toMatchObject({ status: 'committed' });
  await waitFor(harness.actor, (state) => state.matches({ open: 'ready' }));
  expect(harness.counts().writes).toBe(1);
  harness.actor.stop();
});

it('settles queued work before disconnecting when observation fails during a write', async () => {
  const gate = Promise.withResolvers<void>();
  const harness = await parameterSetHarness(false, { gate: gate.promise });
  const active = harness.submit(groupRequest('active', harness));
  await waitFor(harness.actor, (state) => state.matches({ open: 'applying' }));
  const pending = harness.submit(groupRequest('pending', harness));
  harness.actor.send({ type: 'watch.error', message: 'Watch reset' });
  gate.resolve();
  await expect(active).resolves.toMatchObject({ status: 'committed' });
  await expect(pending).resolves.toMatchObject({ status: 'rejected', requestId: 'pending' });
  await waitFor(harness.actor, (state) => state.matches({ open: 'disconnected' }));
  expect(harness.counts().writes).toBe(1);
  harness.actor.stop();
});

it('settles immediate startup submission and three edits with one load and no settlement timer', async () => {
  const harness = await parameterSetHarness();
  const { actor, snapshot, submit } = harness;
  let expected = snapshot.identity;
  for (const value of [30, 40, 50]) {
    const request: ParameterSetRequest = {
      requestId: `edit:${value}`,
      fingerprint: `label:${value}`,
      pressure: 'final',
      expected,
      operation: {
        kind: 'native-value',
        group: 'default',
        pointer: '/width',
        value,
      },
    };
    // oxlint-disable-next-line no-await-in-loop -- Every edit must use the preceding committed revision.
    const outcome = await submit(request);
    expect(outcome.status).toBe('committed');
    if (outcome.status !== 'committed') {
      throw new Error(JSON.stringify(outcome));
    }
    expected = outcome.revision;
  }
  expect(harness.counts()).toEqual({ writes: 3, loads: 1 });
  actor.send({ type: 'close' });
  await waitFor(actor, (state) => state.status === 'done');
});

it('refuses a re-delivered group creation from the record, without a durable receipt', async () => {
  const harness = await parameterSetHarness();
  const request: ParameterSetRequest = {
    requestId: 'duplicate',
    fingerprint: 'untrusted-label',
    pressure: 'final',
    expected: harness.snapshot.identity,
    operation: { kind: 'create-group', group: 'second' },
  };
  expect(await harness.submit(request)).toMatchObject({ status: 'committed' });
  // The record itself, not a stored request id, is what refuses the second delivery.
  expect(await harness.submit(request)).toMatchObject({ status: 'rejected', code: 'GROUP_ALREADY_EXISTS' });
  expect(harness.counts().writes).toBe(1);
  harness.actor.stop();
});

it('rejects a reused request id while its original command is still in flight', async () => {
  const gate = Promise.withResolvers<void>();
  const harness = await parameterSetHarness(false, { gate: gate.promise });
  const request: ParameterSetRequest = {
    requestId: 'reused',
    fingerprint: 'label',
    pressure: 'final',
    expected: harness.snapshot.identity,
    operation: { kind: 'create-group', group: 'second' },
  };
  const active = harness.submit(request);
  await waitFor(harness.actor, (state) => state.matches({ open: 'applying' }));
  expect(await harness.submit({ ...request, operation: { kind: 'create-group', group: 'third' } })).toMatchObject({
    status: 'rejected',
    code: 'REQUEST_ID_COLLISION',
  });
  gate.resolve();
  expect(await active).toMatchObject({ status: 'committed' });
  expect(harness.counts().writes).toBe(1);
  harness.actor.stop();
});

it('does not let a collision settle the original command and drains an escaped write on close', async () => {
  const gate = Promise.withResolvers<void>();
  const harness = await parameterSetHarness(false, { gate: gate.promise });
  const request: ParameterSetRequest = {
    requestId: 'in-flight',
    fingerprint: 'label',
    pressure: 'final',
    expected: harness.snapshot.identity,
    operation: { kind: 'create-group', group: 'second' },
  };
  const original = harness.submit(request);
  await waitFor(harness.actor, (state) => state.matches({ open: 'applying' }));
  const collision = await harness.submit({ ...request, operation: { kind: 'create-group', group: 'third' } });
  expect(collision).toMatchObject({ status: 'rejected', code: 'REQUEST_ID_COLLISION' });
  harness.actor.send({ type: 'cancel', requestId: request.requestId });
  harness.actor.send({ type: 'close' });
  expect(harness.actor.getSnapshot().status).toBe('active');
  gate.resolve();
  const result = await original;
  expect(result.status).toBe('committed');
  await waitFor(harness.actor, (state) => state.status === 'done');
  expect(harness.counts().writes).toBe(1);
});

it('recovers a lost acknowledgement once without replaying the write', async () => {
  const harness = await parameterSetHarness(false, { loseReply: true });
  const result = await harness.submit({
    requestId: 'lost',
    fingerprint: 'label',
    pressure: 'final',
    expected: harness.snapshot.identity,
    operation: { kind: 'create-group', group: 'second' },
  });
  expect(result).toMatchObject({ status: 'committed', write: 'reconciled' });
  expect(harness.counts()).toEqual({ writes: 1, loads: 2 });
  harness.actor.stop();
});

it('settles queued commands on close while preserving an active checked write', async () => {
  const gate = Promise.withResolvers<void>();
  const harness = await parameterSetHarness(false, { gate: gate.promise });
  const request: ParameterSetRequest = {
    requestId: 'active',
    fingerprint: 'label',
    pressure: 'final',
    expected: harness.snapshot.identity,
    operation: { kind: 'create-group', group: 'second' },
  };
  const active = harness.submit(request);
  await waitFor(harness.actor, (state) => state.matches({ open: 'applying' }));
  const pending = harness.submit({
    ...request,
    requestId: 'pending',
    operation: { kind: 'create-group', group: 'third' },
  });
  harness.actor.send({ type: 'close' });
  expect(await pending).toEqual({ status: 'cancelled-before-apply', requestId: 'pending' });
  gate.resolve();
  expect(await active).toMatchObject({ status: 'committed' });
  expect(harness.counts().writes).toBe(1);
});

it('keeps invalid drafts open and settles a command across immediate re-resolution', async () => {
  const harness = await parameterSetHarness();
  harness.actor.send({ type: 'resolve' });
  const result = await harness.submit({
    requestId: 'overlap',
    fingerprint: 'label',
    pressure: 'final',
    expected: harness.snapshot.identity,
    operation: { kind: 'create-group', group: 'second' },
  });
  expect(result).toMatchObject({ status: 'committed' });
  const blocked: string[][] = [];
  harness.actor.on('close-blocked', (event) => blocked.push([...event.invalidDrafts]));
  harness.actor.send({ type: 'close', invalidDrafts: ['width'] });
  expect(blocked).toEqual([['width']]);
  expect(harness.actor.getSnapshot().status).toBe('active');
  harness.actor.send({ type: 'close' });
  await waitFor(harness.actor, (state) => state.status === 'done');
});

it('coalesces queued edits, settles every superseded request, and preserves final release', async () => {
  const gate = Promise.withResolvers<void>();
  const harness = await parameterSetHarness(false, { gate: gate.promise });
  const request: ParameterSetRequest = {
    requestId: 'active',
    fingerprint: 'active',
    pressure: 'final',
    expected: harness.snapshot.identity,
    operation: { kind: 'create-group', group: 'second' },
  };
  const active = harness.submit(request);
  await waitFor(harness.actor, (snapshot) => snapshot.matches({ open: 'applying' }));
  const transientA = harness.submit({ ...request, requestId: 'transient-a', pressure: 'transient' });
  const transientB = harness.submit({ ...request, requestId: 'transient-b', pressure: 'transient' });
  const final = harness.submit({ ...request, requestId: 'final' });
  const late = harness.submit({ ...request, requestId: 'late', pressure: 'transient' });
  // Transients for the same operation displace each other; the final is never displaced and a later
  // transient queues behind it instead of being refused.
  expect(harness.actor.getSnapshot().context.pending.map(({ requestId }) => requestId)).toEqual(['final', 'late']);
  expect(await transientA).toMatchObject({ status: 'cancelled-before-apply', requestId: 'transient-a' });
  expect(await transientB).toMatchObject({ status: 'cancelled-before-apply', requestId: 'transient-b' });
  gate.resolve();
  expect(await active).toMatchObject({ status: 'committed' });
  // The record, not a whole-record revision, refuses the duplicate group the queued final names.
  expect(await final).toMatchObject({ status: 'rejected', code: 'GROUP_ALREADY_EXISTS' });
  expect(await late).toMatchObject({ status: 'rejected', requestId: 'late' });
  expect(harness.counts().writes).toBe(1);
  harness.actor.stop();
});

it('disposes a failed observer and rearms it before accepting edits after reconnect', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  let opens = 0;
  let closes = 0;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async () => fixture.snapshot,
        }),
        observeParameterSet: createCallbackLogic(() => {
          opens += 1;
          return () => {
            closes += 1;
          };
        }),
      },
    }),
    { input: { target: fixture.snapshot.target } },
  );
  actor.start();
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  actor.send({ type: 'watch.error', message: 'Watch reset' });
  expect(actor.getSnapshot().matches({ open: 'disconnected' })).toBe(true);
  actor.send({ type: 'resolve' });
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  expect({ opens, closes }).toEqual({ opens: 2, closes: 1 });
  actor.stop();
  expect(closes).toBe(2);
});

it('rejects unsafe and over-budget requests before retaining or invoking them', async () => {
  const harness = await parameterSetHarness();
  await waitFor(harness.actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  let accessed = false;
  const accessor = Object.defineProperty({}, 'value', {
    enumerable: true,
    get: () => {
      accessed = true;
      return 1;
    },
  });
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;
  let deep: unknown = 1;
  for (let index = 0; index < 70; index += 1) {
    deep = { nested: deep };
  }
  const invalid = [Number.NaN, Number.POSITIVE_INFINITY, 1n, new Map(), cyclic, accessor, deep];
  const outcomes: unknown[] = [];
  harness.actor.on('settled', (event) => {
    outcomes.push(event.outcome);
  });
  for (const [index, value] of invalid.entries()) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- Exercise the public actor's untyped admission boundary.
    const request = {
      requestId: `invalid:${index}`,
      fingerprint: 'invalid',
      expected: harness.snapshot.identity,
      pressure: 'final',
      operation: { kind: 'replace-group-values', group: 'default', values: { value } },
    } as ParameterSetRequest;
    harness.actor.send({ type: 'submit', request });
  }
  expect(outcomes).toHaveLength(invalid.length);
  for (const outcome of outcomes) {
    expect(outcome).toMatchObject({ status: 'rejected', code: 'INVALID_REQUEST' });
  }
  expect(accessed).toBe(false);
  expect(harness.counts().writes).toBe(0);
  expect(harness.actor.getSnapshot().context.active).toBeUndefined();
  harness.actor.stop();
});

/**
 * The filesystem worker delivers `fileWritten` asynchronously, so every commit echoes back as a
 * change. The echo must never reject the command that follows it.
 * Evidence for the original defect: `docs/research/artifacts/parameter-story-simplification-review/
 * runs/2026-09-17-review/evidence/echo-race.test.ts`, which settled `r2` as `STALE_MANIFEST`.
 */
const widthEdit = (
  requestId: string,
  value: number,
  expected: ParameterSetRequest['expected'],
): ParameterSetRequest => ({
  requestId,
  expected,
  pressure: 'final',
  operation: {
    kind: 'native-value',
    group: 'default',
    pointer: '/width',
    value,
  },
});

const proposedSnapshot = (current: ParameterSnapshot, request: ParameterSetRequest): ParameterSnapshot => {
  const change = planParameterChange({ current, request });
  if (change.status !== 'prepared') {
    throw new Error(JSON.stringify(change));
  }
  return change.proposed;
};

it('commits the next command when the previous write echoes during planning', async () => {
  const harness = await parameterSetHarness();
  expect(await harness.submit(widthEdit('r1', 30, harness.snapshot.identity))).toMatchObject({ status: 'committed' });
  const settled = harness.submit(widthEdit('r2', 31, harness.actor.getSnapshot().context.current!.identity));
  expect(harness.actor.getSnapshot().matches({ open: 'planning' })).toBe(true);
  harness.actor.send({ type: 'watch.changed' });
  expect(await settled).toMatchObject({ status: 'committed' });
  expect(harness.counts().writes).toBe(2);
  harness.actor.stop();
});

it('commits a command whose write is already applying when the previous echo lands', async () => {
  const gate = Promise.withResolvers<void>();
  const harness = await parameterSetHarness(false, { gate: gate.promise });
  const settled = harness.submit(widthEdit('r1', 30, harness.snapshot.identity));
  await waitFor(harness.actor, (state) => state.matches({ open: 'applying' }));
  harness.actor.send({ type: 'watch.changed' });
  gate.resolve();
  expect(await settled).toMatchObject({ status: 'committed' });
  await waitFor(harness.actor, (state) => state.matches({ open: 'ready' }));
  expect(harness.counts().writes).toBe(1);
  harness.actor.stop();
});

it('should re-plan against foreign bytes that land during planning and keep the foreign change', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  let visible = fixture.snapshot;
  const foreign = proposedSnapshot(visible, {
    ...groupRequest('foreign', fixture),
    operation: { kind: 'create-group', group: 'other' },
  });
  const firstPlan = Promise.withResolvers<void>();
  let plans = 0;
  const writes: Array<Extract<ParameterChange, { status: 'prepared' }>> = [];
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async () => structuredClone(visible),
        }),
        planParameterSet: createAsyncLogic<
          ParameterChange,
          Readonly<{ current: ParameterSnapshot; request: ParameterSetRequest }>
        >({
          run: async ({ input }) => {
            plans += 1;
            if (plans === 1) {
              await firstPlan.promise;
            }
            return planParameterChange(input);
          },
        }),
        commitParameterSet: createAsyncLogic<CheckedFileWriteResult, Extract<ParameterChange, { status: 'prepared' }>>({
          run: async ({ input }) => {
            writes.push(input);
            visible = structuredClone(input.proposed);
            return { status: 'applied', content: input.proposed.bytes! };
          },
        }),
      },
    }),
    { input: { target: fixture.snapshot.target } },
  ).start();
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));
  const outcome = submitParameterRequest(actor, {
    ...widthEdit('local', 30, fixture.snapshot.identity),
    base: { pointer: '/width', value: 25.4 },
  });
  await waitFor(actor, (state) => state.matches({ open: 'planning' }));
  visible = foreign;
  actor.send({ type: 'watch.changed' });
  await expect(outcome).resolves.toMatchObject({ status: 'committed' });
  expect(writes[0]?.write.preconditions).toEqual([{ path: foreign.path, expected: foreign.bytes }]);
  expect(writes[0]?.proposed.entry.groups).toHaveProperty('other');
  expect(writes[0]?.proposed.entry.groups['default']?.values).toEqual({ width: 30 });
  firstPlan.resolve();
  actor.stop();
});

it('should refuse only on base when the foreign write moved the same field', async () => {
  const fixture = await parameterSetHarness();
  fixture.actor.stop();
  let visible = fixture.snapshot;
  const foreign = proposedSnapshot(visible, widthEdit('foreign', 29, fixture.snapshot.identity));
  const firstPlan = Promise.withResolvers<void>();
  let plans = 0;
  let writes = 0;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async () => structuredClone(visible),
        }),
        planParameterSet: createAsyncLogic<
          ParameterChange,
          Readonly<{ current: ParameterSnapshot; request: ParameterSetRequest }>
        >({
          run: async ({ input }) => {
            plans += 1;
            if (plans === 1) {
              await firstPlan.promise;
            }
            return planParameterChange(input);
          },
        }),
        commitParameterSet: createAsyncLogic<CheckedFileWriteResult, Extract<ParameterChange, { status: 'prepared' }>>({
          run: async ({ input }) => {
            writes += 1;
            visible = structuredClone(input.proposed);
            return { status: 'applied', content: input.proposed.bytes! };
          },
        }),
      },
    }),
    { input: { target: fixture.snapshot.target } },
  ).start();
  await waitFor(actor, (state) => state.matches({ open: 'ready' }));
  const outcome = submitParameterRequest(actor, {
    ...widthEdit('local', 30, fixture.snapshot.identity),
    base: { pointer: '/width', value: 25.4 },
  });
  await waitFor(actor, (state) => state.matches({ open: 'planning' }));
  visible = foreign;
  actor.send({ type: 'watch.changed' });
  await expect(outcome).resolves.toMatchObject({ status: 'rejected', code: 'STALE_MANIFEST' });
  expect(writes).toBe(0);
  firstPlan.resolve();
  actor.stop();
});

it('should commit the last of three queued steps on one field', async () => {
  const gate = Promise.withResolvers<void>();
  const fixture = await parameterSetHarness(false, { gate: gate.promise });
  const active = fixture.submit({
    ...widthEdit('step-1', 26, fixture.snapshot.identity),
    base: { pointer: '/width', value: 25.4 },
  });
  await waitFor(fixture.actor, (state) => state.matches({ open: 'applying' }));
  const displaced = fixture.submit({
    ...widthEdit('step-2', 27, fixture.snapshot.identity),
    base: { pointer: '/width', value: 26 },
  });
  const latest = fixture.submit({
    ...widthEdit('step-3', 28, fixture.snapshot.identity),
    base: { pointer: '/width', value: 27 },
  });
  await expect(displaced).resolves.toMatchObject({ status: 'cancelled-before-apply' });
  gate.resolve();
  await expect(active).resolves.toMatchObject({ status: 'committed' });
  await expect(latest).resolves.toMatchObject({ status: 'committed' });
  expect(fixture.actor.getSnapshot().context.current?.entry.groups['default']?.values).toEqual({ width: 28 });
  fixture.actor.stop();
});

it('should keep a queued final when a later transient for the same field arrives', async () => {
  const gate = Promise.withResolvers<void>();
  const fixture = await parameterSetHarness(false, { gate: gate.promise });
  const active = fixture.submit(widthEdit('active', 26, fixture.snapshot.identity));
  await waitFor(fixture.actor, (state) => state.matches({ open: 'applying' }));
  const final = fixture.submit(widthEdit('final', 27, fixture.snapshot.identity));
  const transient = fixture.submit({ ...widthEdit('transient', 28, fixture.snapshot.identity), pressure: 'transient' });
  expect(fixture.actor.getSnapshot().context.pending.map(({ requestId }) => requestId)).toEqual(['final', 'transient']);
  fixture.actor.send({ type: 'close' });
  await expect(final).resolves.toMatchObject({ status: 'cancelled-before-apply' });
  await expect(transient).resolves.toMatchObject({ status: 'cancelled-before-apply' });
  gate.resolve();
  await expect(active).resolves.toMatchObject({ status: 'committed' });
});

it('should queue finals for two fields and commit both', async () => {
  const gate = Promise.withResolvers<void>();
  const fixture = await parameterSetHarness(false, { gate: gate.promise });
  const active = fixture.submit(groupRequest('second', fixture));
  await waitFor(fixture.actor, (state) => state.matches({ open: 'applying' }));
  const first = fixture.submit(widthEdit('default-width', 30, fixture.snapshot.identity));
  const second = fixture.submit({
    ...widthEdit('second-width', 31, fixture.snapshot.identity),
    operation: {
      kind: 'native-value',
      group: 'second',
      pointer: '/width',
      value: 31,
    },
  });
  expect(fixture.actor.getSnapshot().context.pending.map(({ requestId }) => requestId)).toEqual([
    'default-width',
    'second-width',
  ]);
  gate.resolve();
  await expect(active).resolves.toMatchObject({ status: 'committed' });
  await expect(first).resolves.toMatchObject({ status: 'committed' });
  await expect(second).resolves.toMatchObject({ status: 'committed' });
  expect(fixture.actor.getSnapshot().context.current?.entry.groups).toMatchObject({
    default: { values: { width: 30 } },
    second: { values: { width: 31 } },
  });
  fixture.actor.stop();
});

it('displaces an older queued value edit for the same field with a newer one', async () => {
  const gate = Promise.withResolvers<void>();
  const harness = await parameterSetHarness(false, { gate: gate.promise });
  const active = harness.submit(widthEdit('active', 30, harness.snapshot.identity));
  await waitFor(harness.actor, (state) => state.matches({ open: 'applying' }));
  const superseded = harness.submit(widthEdit('queued', 31, harness.snapshot.identity));
  const latest = harness.submit(widthEdit('latest', 32, harness.snapshot.identity));
  expect(harness.actor.getSnapshot().context.pending.map(({ requestId }) => requestId)).toEqual(['latest']);
  expect(await superseded).toMatchObject({ status: 'cancelled-before-apply', requestId: 'queued' });
  gate.resolve();
  expect(await active).toMatchObject({ status: 'committed' });
  expect(await latest).toMatchObject({ status: 'committed' });
  // The superseded release never reached a write.
  expect(harness.counts().writes).toBe(2);
  harness.actor.stop();
});

it('rejects an invalid target before opening observation or loading authority', () => {
  let effects = 0;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic<ParameterSnapshot, ParameterSetLoadInput>({
          run: async (): Promise<ParameterSnapshot> => {
            effects += 1;
            throw new Error('Invalid target must not load');
          },
        }),
        observeParameterSet: createCallbackLogic(() => {
          effects += 1;
        }),
      },
    }),
    { input: { target: { authority: '', root: '/project', entry: 'main.ts' } } },
  );
  actor.start();
  expect(actor.getSnapshot().matches('invalidInput')).toBe(true);
  expect(effects).toBe(0);
});
