import assert from 'node:assert/strict';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import { compileParameterManifest, resolveParameterSnapshot } from '@taucad/parameters';
import type { ParameterChange, ParameterSetRequest } from '@taucad/parameters';
import { parameterSetMachine, submitParameterRequest } from '@taucad/parameters/set-machine';
import type { ParameterSetActors } from '@taucad/parameters/set-machine';

const target = { authority: 'process-fixture', root: '/project', entry: 'main.ts' };
const digest = `sha256:${'1'.repeat(64)}` as Parameters<typeof compileParameterManifest>[0]['dependency'];
const manifest = await compileParameterManifest({
  declaration: {
    schema: {
      $schema: 'https://json-structure.org/meta/extended/v0/#',
      $id: 'urn:test:process-close',
      $uses: ['JSONSchemaUnits'],
      name: 'Parameters',
      type: 'object',
      properties: { width: { type: 'double' } },
    },
    defaults: { width: 10 },
  },
  scope: { kind: 'source', ...target },
  source: { id: 'process-close', version: '1', revision: 'source:1', capability: 'json-structure' },
  dependency: digest,
  middleware: digest,
});
const initial = resolveParameterSnapshot({
  target,
  manifest,
  path: '.tau/parameters/main.ts.json',
  bytes: null,
});
const request = (requestId: string): ParameterSetRequest => ({
  requestId,
  fingerprint: requestId,
  expected: initial.identity,
  pressure: 'final',
  operation: { kind: 'replace-group-values', group: 'default', values: { width: 25 } },
});

const delayedInvalidDraftClose = async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic({ run: async () => initial }),
        commitParameterSet: createAsyncLogic({
          run: async ({ input }) => {
            started.resolve();
            await release.promise;
            return { status: 'applied', content: input.proposed.bytes! };
          },
        }),
      } satisfies Partial<ParameterSetActors>,
    }),
    { input: { target } },
  );
  actor.start();
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  const submission = submitParameterRequest(actor, request('delayed-write'));
  await started.promise;
  let blocked: readonly string[] | undefined;
  actor.on('close-blocked', (event) => {
    blocked = event.invalidDrafts;
  });
  actor.send({ type: 'close', invalidDrafts: ['width'] });
  assert.deepEqual(blocked, ['width']);
  assert.equal(actor.getSnapshot().status, 'active');
  release.resolve();
  const settled = await submission;
  assert.equal(settled.status, 'committed');
  actor.send({ type: 'close' });
  await waitFor(actor, (snapshot) => snapshot.status === 'done');
  return ['write-admitted', 'close-waited', 'invalid-drafts-rejected', 'close-retried'];
};

const uncertainWriteClose = async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const recoveryStarted = Promise.withResolvers<void>();
  const releaseRecovery = Promise.withResolvers<void>();
  let change: Extract<ParameterChange, { status: 'prepared' }> | undefined;
  let writes = 0;
  let reads = 0;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: createAsyncLogic({
          run: async () => {
            if (change === undefined) {
              return initial;
            }
            reads += 1;
            recoveryStarted.resolve();
            await releaseRecovery.promise;
            return change.proposed;
          },
        }),
        commitParameterSet: createAsyncLogic({
          run: async ({ input }) => {
            writes += 1;
            change = input;
            started.resolve();
            await release.promise;
            throw new Error('Checked write reply lost.');
          },
        }),
      } satisfies Partial<ParameterSetActors>,
    }),
    { input: { target } },
  );
  actor.start();
  await waitFor(actor, (snapshot) => snapshot.matches({ open: 'ready' }));
  const submission = submitParameterRequest(actor, request('uncertain-write'));
  await started.promise;
  actor.send({ type: 'close' });
  release.resolve();
  await recoveryStarted.promise;
  assert.equal(actor.getSnapshot().status, 'active');
  releaseRecovery.resolve();
  const outcome = await submission;
  assert.ok(outcome.status === 'committed' && outcome.write === 'reconciled', JSON.stringify(outcome));
  await waitFor(actor, (snapshot) => snapshot.status === 'done');
  assert.equal(writes, 1);
  assert.equal(reads, 1);
  return ['reply-lost', 'close-waited', 'write-reconciled', 'close-settled'];
};

try {
  process.send?.({ ok: true, delayed: await delayedInvalidDraftClose(), uncertain: await uncertainWriteClose() });
} catch (error) {
  process.send?.({ ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
  process.exitCode = 1;
}
