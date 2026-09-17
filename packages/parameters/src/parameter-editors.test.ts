import { contentDigest } from '@taucad/cache-core';
import type { CheckedFileWriteResult } from '@taucad/types';
import { afterEach, expect, it } from 'vitest';
import { createActor, fromPromise, waitFor } from 'xstate';
import { compileParameterManifest } from '#manifest.js';
import { parameterInputMachine } from '#parameter-input.machine.js';
import type { ParameterInputBinding } from '#parameter-input.machine.js';
import { parameterSetMachine } from '#parameter-set.machine.js';
import { resolveParameterSnapshot } from '#snapshot.js';
import type { ParameterSnapshot } from '#snapshot.js';
import type { ParameterSetTarget } from '#types.js';

/**
 * Editors composed with one set actor exactly as the UI service composes them: intents are
 * submitted, settlements are routed by request, and every authority identity change is forwarded to
 * every editor of the target.
 */

const target: ParameterSetTarget = { authority: 'memory', root: '/project', entry: 'main.ts' };
const path = '.tau/parameters/main.ts.json';
const decoder = new TextDecoder();
const length = 'http://qudt.org/vocab/quantitykind/Length';

const manifestAt = async (source: string) => {
  const revision = contentDigest({ value: `sha256:${source.repeat(64)}` });
  return compileParameterManifest({
    declaration: {
      schema: {
        $schema: 'https://json-structure.org/meta/extended/v0/#',
        $id: 'urn:test:parameters',
        $uses: ['JSONSchemaUnits'],
        name: 'Parameters',
        type: 'object',
        properties: { width: { type: 'double', ucumUnit: 'mm' }, height: { type: 'double', ucumUnit: 'mm' } },
      },
      defaults: { width: 25.4, height: 10 },
      bindings: {
        '/width': { parameterId: 'width', quantityKind: length, space: 'linear' },
        '/height': { parameterId: 'height', quantityKind: length, space: 'linear' },
      },
    },
    scope: { kind: 'source', ...target },
    source: { id: 'fixture', version: '1', revision, capability: 'json-structure' },
    dependency: revision,
    middleware: revision,
  });
};

const valueOf = (current: ParameterSnapshot, pointer: '/width' | '/height'): number => {
  const name = pointer.slice(1);
  const stored = current.entry.groups[current.entry.activeGroup]?.values[name];
  return typeof stored === 'number' ? stored : (current.manifest.defaults as Record<string, number>)[name]!;
};

const actors: Array<{ stop(): void }> = [];
afterEach(() => {
  for (const actor of actors.splice(0)) {
    actor.stop();
  }
});

const authority = async () => {
  let current = await resolveParameterSnapshot({
    target,
    manifest: await manifestAt('1'),
    path,
    bytes: null,
    preconditions: [],
  });
  let gate: Promise<void> | undefined;
  let writes = 0;
  const set = createActor(
    parameterSetMachine.provide({
      actors: {
        loadParameterSet: fromPromise(async () => structuredClone(current)),
        commitParameterSet: fromPromise(async ({ input }): Promise<CheckedFileWriteResult> => {
          await gate;
          const expected = input.write.preconditions.find((item) => item.path === path)?.expected ?? null;
          const actual = current.bytes;
          const same =
            expected === null || actual === null
              ? expected === actual
              : (typeof expected === 'string' ? expected : decoder.decode(expected)) === decoder.decode(actual);
          if (!same || input.proposed.identity.sourceRevision !== current.identity.sourceRevision) {
            return { status: 'conflict', conflicts: [] };
          }
          writes += 1;
          current = structuredClone(input.proposed);
          return { status: 'applied', content: current.bytes! };
        }),
      },
    }),
    { input: { target } },
  );
  actors.push(set);
  set.start();
  await waitFor(set, (snapshot) => snapshot.matches({ open: 'ready' }));
  return {
    set,
    current: () => current,
    writes: () => writes,
    hold: () => {
      const release = Promise.withResolvers<void>();
      gate = release.promise;
      return () => {
        gate = undefined;
        release.resolve();
      };
    },
    /** The model source changes: the manifest re-resolves while every value stays the same. */
    editSource: async (source: string) => {
      current = await resolveParameterSnapshot({
        target,
        manifest: await manifestAt(source),
        path,
        bytes: current.bytes,
        preconditions: [],
      });
      set.send({ type: 'watch.changed' });
      await waitFor(set, (snapshot) => snapshot.matches({ open: 'ready' }));
    },
  };
};

type Authority = Awaited<ReturnType<typeof authority>>;

const editor = (
  owner: Authority,
  name: string,
  options: Readonly<{ pointer?: '/width' | '/height'; pressure?: 'default' | 'continual' }> = {},
) => {
  const { pointer = '/width', pressure = 'default' } = options;
  const current = owner.current();
  const bindingFor = (snapshot: ParameterSnapshot): ParameterInputBinding => ({
    target,
    group: 'default',
    parameterId: snapshot.manifest.bindings[pointer]!.parameter.value,
    resource: snapshot.manifest.bindings[pointer]!.schema.resource,
    pointer,
    nativeUnit: 'mm',
    quantityKind: length,
    space: 'linear',
    representation: 'binary64',
    constraints: {},
  });
  const input = createActor(parameterInputMachine, {
    input: {
      editorInstance: name,
      binding: bindingFor(current),
      acknowledgedValue: valueOf(current, pointer),
      acknowledgedRevision: current.identity,
      display: { unit: 'mm', locale: 'en' },
      pressure,
    },
  });
  actors.push(input);
  const generations = new Map<string, number>();
  const settled: string[] = [];
  input.on('parameterSetIntent', (event) => {
    generations.set(event.request.requestId, event.request.draftGeneration);
    owner.set.send({ type: 'submit', request: event.request });
  });
  owner.set.on('settled', (event) => {
    const generation = generations.get(event.request.requestId);
    if (generation === undefined) {
      return;
    }
    generations.delete(event.request.requestId);
    settled.push(event.outcome.status === 'rejected' ? event.outcome.code : event.outcome.status);
    input.send({ type: 'settleSubmission', generation, outcome: event.outcome });
  });
  let forwarded = current.identity;
  owner.set.subscribe((snapshot) => {
    const next = snapshot.context.current;
    if (next === undefined || JSON.stringify(next.identity) === JSON.stringify(forwarded)) {
      return;
    }
    forwarded = next.identity;
    input.send({
      type: 'refreshAuthority',
      binding: bindingFor(next),
      value: valueOf(next, pointer),
      revision: next.identity,
    });
  });
  input.start();
  const type = (text: string) => {
    input.send({ type: 'focus' });
    input.send({ type: 'changeRaw', text });
    input.send({ type: 'pressEnter' });
  };
  return { input, settled, type };
};

const idle = async (owner: Authority) => {
  await waitFor(owner.set, (snapshot) => snapshot.matches({ open: 'ready' }) && snapshot.context.pending.length === 0);
  await Promise.resolve();
};

it('commits the next edit of a retained row after a source edit leaves every value unchanged', async () => {
  const owner = await authority();
  const width = editor(owner, 'width');
  const height = editor(owner, 'height', { pointer: '/height' });
  width.type('110');
  await idle(owner);
  height.input.send({ type: 'focus' });
  height.input.send({ type: 'changeRaw', text: '12' });
  await owner.editSource('2');
  expect(height.input.getSnapshot().context).toMatchObject({
    acknowledged: { revision: owner.current().identity },
    draft: { raw: '12', expected: owner.current().identity },
  });
  expect(height.input.getSnapshot().context.draft?.conflict).toBeUndefined();
  width.type('120');
  await idle(owner);
  height.input.send({ type: 'pressEnter' });
  await idle(owner);
  expect(width.settled).toEqual(['committed', 'committed']);
  expect(height.settled).toEqual(['committed']);
  expect(valueOf(owner.current(), '/width')).toBe(120);
  expect(valueOf(owner.current(), '/height')).toBe(12);
  expect(owner.writes()).toBe(3);
});

it('resubmits a rebound draft with the current identity after a stale rejection', async () => {
  const owner = await authority();
  const width = editor(owner, 'width');
  const release = owner.hold();
  const foreign = editor(owner, 'foreign');
  foreign.type('50');
  width.type('60');
  release();
  await idle(owner);
  expect(width.settled).toEqual(['STALE_MANIFEST']);
  expect(width.input.getSnapshot().matches({ active: { interaction: 'conflicted' } })).toBe(true);
  expect(width.input.getSnapshot().context.draft?.raw).toBe('60');
  width.input.send({ type: 'rebind' });
  width.input.send({ type: 'pressEnter' });
  await idle(owner);
  expect(width.settled).toEqual(['STALE_MANIFEST', 'committed']);
  expect(valueOf(owner.current(), '/width')).toBe(60);
});

it('queues two editors’ finals on different fields and persists both', async () => {
  const owner = await authority();
  const release = owner.hold();
  const width = editor(owner, 'width');
  const height = editor(owner, 'height', { pointer: '/height' });
  width.type('30');
  height.type('40');
  expect(width.input.getSnapshot().context.draft?.raw).toBe('30');
  release();
  await idle(owner);
  expect([width.settled, height.settled]).toEqual([['committed'], ['committed']]);
  expect([valueOf(owner.current(), '/width'), valueOf(owner.current(), '/height')]).toEqual([30, 40]);
});

it('reports a same-field final as a retained conflict, never a silent cancellation', async () => {
  const owner = await authority();
  const release = owner.hold();
  const first = editor(owner, 'first');
  const second = editor(owner, 'second');
  first.type('30');
  second.type('40');
  release();
  await idle(owner);
  expect(first.settled).toEqual(['committed']);
  expect(second.settled).toEqual(['STALE_MANIFEST']);
  expect(second.input.getSnapshot().context.draft?.raw).toBe('40');
  second.input.send({ type: 'rebind' });
  second.input.send({ type: 'pressEnter' });
  await idle(owner);
  expect(valueOf(owner.current(), '/width')).toBe(40);
});

it('keeps a continual editor’s release when another editor’s drag displaces its transient', async () => {
  const owner = await authority();
  const release = owner.hold();
  const busy = editor(owner, 'busy', { pointer: '/height' });
  busy.type('11');
  const dragged = editor(owner, 'dragged', { pressure: 'continual' });
  const other = editor(owner, 'other', { pressure: 'continual' });
  dragged.input.send({ type: 'pointerChanged', value: 30 });
  dragged.input.send({ type: 'pointerChanged', value: 35 });
  dragged.input.send({ type: 'pointerReleased' });
  other.input.send({ type: 'pointerChanged', value: 40 });
  expect(dragged.settled).toEqual(['cancelled-before-apply']);
  expect(other.settled).toEqual(['cancelled-before-apply']);
  expect(other.input.getSnapshot().context).toMatchObject({
    draft: { nativeValue: 40 },
    diagnostic: { code: 'CANCELLED_BEFORE_APPLY' },
  });
  release();
  await idle(owner);
  expect(dragged.settled).toEqual(['cancelled-before-apply', 'committed']);
  expect(valueOf(owner.current(), '/width')).toBe(35);
});
