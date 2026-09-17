import { contentDigest, digestContent } from '@taucad/cache-core';
import type { ActorRefFrom } from 'xstate';
import type { ParameterSnapshot } from '#snapshot.js';
import { createActor, fromPromise } from 'xstate';
import { compileParameterManifest } from '#manifest.js';
import { resolveParameterSnapshot } from '#snapshot.js';
import { sameRequestDelivery } from '#request.js';
import { parameterSetMachine } from '#parameter-set.machine.js';
import type { ParameterSetOutcome, ParameterSetRequest } from '#types.js';

export const parameterSetHarness = async (
  refuseFirst = false,
  options: Readonly<{ gate?: Promise<void>; loseReply?: boolean }> = {},
): Promise<{
  actor: ActorRefFrom<typeof parameterSetMachine>;
  snapshot: ParameterSnapshot;
  submit(request: ParameterSetRequest): Promise<ParameterSetOutcome>;
  counts(): { writes: number; loads: number };
}> => {
  const digest = contentDigest({ value: `sha256:${'1'.repeat(64)}` });
  const target = { authority: 'memory', root: '/project', entry: 'main.ts' };
  const manifest = await compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
        properties: { width: { type: 'double', ucumUnit: 'mm' } },
      },
      defaults: { width: 25.4 },
      bindings: {
        '/width': { parameterId: 'width', quantityKind: 'http://qudt.org/vocab/quantitykind/Length', space: 'linear' },
      },
    },
    scope: { kind: 'source', ...target },
    source: { id: 'fixture', version: '1', revision: digest, capability: 'json-structure' },
    dependency: digest,
    middleware: digest,
    sourceFiles: { 'main.ts': await digestContent({ bytes: new TextEncoder().encode('source:1') }) },
  });
  let current = await resolveParameterSnapshot({
    target,
    manifest,
    path: '.tau/parameters/main.ts.json',
    bytes: null,
    preconditions: [],
  });
  let writes = 0;
  let loads = 0;
  let refuse = refuseFirst;
  const actor = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: fromPromise(async () => {
          loads += 1;
          return structuredClone(current);
        }),
        commitParameterSet: fromPromise(async ({ input }) => {
          if (refuse) {
            refuse = false;
            throw Object.assign(new Error('Controlled refusal'), { applicationState: 'known-not-applied' });
          }
          await options.gate;
          writes += 1;
          current = structuredClone(input.proposed);
          if (options.loseReply === true) {
            throw new Error('Reply lost after commit');
          }
          return { status: 'applied', content: current.bytes! };
        }),
      },
    }),
    { input: { target } },
  );
  const submit = async (request: ParameterSetRequest): Promise<ParameterSetOutcome> =>
    new Promise((resolve) => {
      const subscription = actor.on('settled', (event) => {
        if (sameRequestDelivery(event.request, request)) {
          subscription.unsubscribe();
          resolve(event.outcome);
        }
      });
      actor.send({ type: 'submit', request });
    });
  actor.start();
  return { actor, submit, snapshot: current, counts: (): { writes: number; loads: number } => ({ writes, loads }) };
};
