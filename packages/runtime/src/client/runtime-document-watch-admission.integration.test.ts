// @vitest-environment node
/**
 * Document watch admission: supersession is per document (I1). Only a document's own
 * command, a change to one of its own watched paths, or worker termination may restart
 * its evaluation. Another document's admission, update or file change must not.
 *
 * See `docs/research/runtime-concurrent-open-watch-fence.md`.
 */
import { describe, expect, it } from 'vitest';
import { createRuntimeClient } from '#client/runtime-document-client-core.js';
import { createKernelSuccess } from '#kernels/kernel-helpers.js';
import type { UpdateOutcome } from '#client/runtime-document.types.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { _fromMemoryFsHandle } from '#transport/_internal/from-memory-fs-handle.js';
import { wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import type { RuntimeWatchRequest } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:document-watch-admission',
    $uses: ['JSONSchemaUnits'],
    name: 'DocumentWatchAdmissionParameters',
    type: 'object',
  },
  defaults: {},
} as const;

type Hooks = {
  /** Runs before each read; awaiting holds the reader. `count` is the 1-based read ordinal of `path`. */
  read?: (path: string, count: number) => Promise<void> | void;
  /** Runs synchronously before a watch subscription is installed. */
  watch?: (request: RuntimeWatchRequest) => void;
  /** Runs before the kernel evaluates an entry; awaiting holds the evaluation. */
  evaluate?: (entryPath: string) => Promise<void> | void;
};

/** One in-process client over a shared memory store whose reads, watch installs and evaluations can be held. */
const createHarness = (hooks: Hooks = {}) => {
  const handle = _fromMemoryFsHandle({ 'a.circuit': 'a', 'b.circuit': 'b', 'c.circuit': 'c', 'warm.circuit': 'w' });
  if (handle.kind !== 'inline') {
    throw new Error('The memory handle must be inline.');
  }
  const store = handle.create();
  const readCounts = new Map<string, number>();
  async function readFile(path: string, encoding: 'utf8'): Promise<string>;
  async function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const count = (readCounts.get(path) ?? 0) + 1;
    readCounts.set(path, count);
    await hooks.read?.(path, count);
    return encoding === undefined ? store.readFile(path) : store.readFile(path, encoding);
  }
  const watch: NonNullable<typeof store.watch> = (request, handler) => {
    hooks.watch?.(request);
    return store.watch!(request, handler);
  };
  /** Entry path and source text of every kernel evaluation, in order. */
  const evaluations: Array<{ path: string; source: string }> = [];
  const kernel = defineKernelV2({
    id: 'document-watch-admission',
    extensions: ['circuit'] as const,
    name: 'Document watch admission',
    version: '1.0.0',
    views: { primary: { title: 'Primary', mimeType: 'text/plain' } },
    exports: {},
    async initialize() {
      return {};
    },
    async resolve({ entryPath }) {
      return { resolved: [entryPath], unresolved: [] };
    },
    async describe() {
      return createKernelSuccess({ parameters });
    },
    async evaluate({ entryPath }, runtime) {
      await hooks.evaluate?.(entryPath);
      const source = await runtime.filesystem.readFile(entryPath, 'utf8');
      evaluations.push({ path: entryPath, source });
      return { handle: { source }, views: ['primary'] as const, exports: [] as const };
    },
    async render({ handle }) {
      return { content: handle.source };
    },
  })();
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime: defineRuntime({ kernels: [kernel] }),
      fileSystem: wrapAsRuntimeFileSystem({ kind: 'inline', create: () => ({ ...store, readFile, watch }) }),
    }),
  });
  const evaluationsOf = (path: string): string[] =>
    evaluations.filter((evaluation) => evaluation.path === path).map(({ source }) => source);
  /** Connect and settle one unrelated document so later opens are not deferred behind `connect()`. */
  const warm = async (): Promise<void> => {
    const document = client.open({ source: { path: 'warm.circuit' } });
    try {
      expect(await document.view('primary').rendering()).toMatchObject({ superseded: false });
    } finally {
      document.close();
    }
  };
  return { client, store, evaluationsOf, warm };
};

/** The autonomous file-change debounce is 200 ms; this window proves whether another evaluation was scheduled. */
const settle = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 500);
  });

describe('document watch admission', () => {
  describe('concurrent opens', () => {
    it('should leave the first rendering current when two documents open together on a fresh client', async () => {
      const { client, evaluationsOf } = createHarness();
      try {
        const a = client.open({ source: { path: 'a.circuit' } });
        const b = client.open({ source: { path: 'b.circuit' } });
        const [first, second] = await Promise.all([a.view('primary').rendering(), b.view('primary').rendering()]);

        expect(first).toMatchObject({ superseded: false, rendering: { success: true } });
        expect(second).toMatchObject({ superseded: false, rendering: { success: true } });
        expect(evaluationsOf('a.circuit')).toEqual(['a']);
        expect(evaluationsOf('b.circuit')).toEqual(['b']);
      } finally {
        await client.shutdown();
      }
    });

    it('should leave the first rendering current when another document opens during its watch baseline read', async () => {
      const baselineRead = Promise.withResolvers<void>();
      const releaseBaseline = Promise.withResolvers<void>();
      const { client, evaluationsOf, warm } = createHarness({
        async read(path, count) {
          if (path === 'a.circuit' && count === 1) {
            baselineRead.resolve();
            await releaseBaseline.promise;
          }
        },
      });
      try {
        await warm();
        const a = client.open({ source: { path: 'a.circuit' } });
        const view = a.view('primary');
        await baselineRead.promise;
        const b = client.open({ source: { path: 'b.circuit' } });
        releaseBaseline.resolve();
        const [first] = await Promise.all([view.rendering(), b.view('primary').rendering()]);

        expect(first).toMatchObject({ superseded: false, rendering: { success: true } });
        expect(evaluationsOf('a.circuit')).toEqual(['a']);
      } finally {
        releaseBaseline.resolve();
        await client.shutdown();
      }
    });
  });

  describe('changes observed while arming', () => {
    it('should re-evaluate only the owner when another document file changes during the arm', async () => {
      const baselineRead = Promise.withResolvers<void>();
      const releaseBaseline = Promise.withResolvers<void>();
      let changed = false;
      const { client, store, evaluationsOf, warm } = createHarness({
        async read(path, count) {
          if (path === 'a.circuit' && count === 1) {
            baselineRead.resolve();
            await releaseBaseline.promise;
          }
        },
        watch(request) {
          // Between B's baseline read and the subscription that covers it: no event can report this write.
          if (!changed && request.paths.includes('b.circuit')) {
            changed = true;
            void store.writeFile('b.circuit', 'b2');
          }
        },
      });
      try {
        await warm();
        const a = client.open({ source: { path: 'a.circuit' } });
        const view = a.view('primary');
        await baselineRead.promise;
        const b = client.open({ source: { path: 'b.circuit' } });
        const bView = b.view('primary');
        releaseBaseline.resolve();

        expect(await view.rendering()).toMatchObject({ superseded: false, rendering: { success: true } });
        await settle();
        expect(changed).toBe(true);
        expect(evaluationsOf('a.circuit')).toEqual(['a']);
        expect(evaluationsOf('b.circuit').at(-1)).toBe('b2');
        expect(await bView.rendering()).toMatchObject({ superseded: false, rendering: { success: true } });
      } finally {
        releaseBaseline.resolve();
        await client.shutdown();
      }
    });

    it('should re-evaluate a document exactly once when its own file changes during its arm', async () => {
      let changed = false;
      const { client, store, evaluationsOf, warm } = createHarness({
        watch(request) {
          if (!changed && request.paths.includes('a.circuit')) {
            changed = true;
            void store.writeFile('a.circuit', 'a2');
          }
        },
      });
      try {
        await warm();
        const a = client.open({ source: { path: 'a.circuit' } });
        const view = a.view('primary');
        let outcome = await view.rendering();
        while (outcome.superseded) {
          // The document's own change supersedes its first evaluation; read the settled successor.
          // oxlint-disable-next-line no-await-in-loop -- each read waits for the next current rendering.
          outcome = await view.rendering();
        }
        await settle();

        expect(changed).toBe(true);
        expect(outcome).toMatchObject({ superseded: false, rendering: { success: true } });
        expect(evaluationsOf('a.circuit')).toEqual(['a2']);
      } finally {
        await client.shutdown();
      }
    });
  });

  describe('interleaved admissions', () => {
    type Point = 'baseline read' | 'watch installation' | 'evaluation';
    type Action = 'open' | 'commit update' | 'transient update' | 'staged update' | 'close';
    const points: readonly Point[] = ['baseline read', 'watch installation', 'evaluation'];
    const actions: readonly Action[] = ['open', 'commit update', 'transient update', 'staged update', 'close'];
    const cases = points.flatMap((point) => actions.map((action) => ({ point, action })));

    it.each(cases)(
      'should keep A current when another document receives $action during A $point',
      async ({ point, action }) => {
        const reached = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        let fire: (() => void) | undefined;
        let fired = false;
        const updates: Array<Promise<UpdateOutcome>> = [];
        const { client, evaluationsOf, warm } = createHarness({
          async read(path, count) {
            if (point === 'baseline read' && path === 'a.circuit' && count === 1) {
              reached.resolve();
              await release.promise;
            }
          },
          watch(request) {
            if (point === 'watch installation' && !fired && request.paths.includes('a.circuit')) {
              fired = true;
              fire?.();
              reached.resolve();
            }
          },
          async evaluate(entryPath) {
            if (point === 'evaluation' && entryPath === 'a.circuit') {
              reached.resolve();
              await release.promise;
            }
          },
        });
        try {
          await warm();
          const b = client.open({ source: { path: 'b.circuit' } });
          expect(await b.view('primary').rendering()).toMatchObject({ superseded: false });
          fire = () => {
            switch (action) {
              case 'open': {
                client.open({ source: { path: 'c.circuit' } }).view('primary');
                break;
              }
              case 'commit update': {
                updates.push(b.update({ parameters: {} }));
                break;
              }
              case 'transient update': {
                updates.push(b.update({ parameters: {}, transient: true }));
                break;
              }
              case 'staged update': {
                updates.push(b.update({ stage: { 'b.circuit': 'b2' } }));
                break;
              }
              case 'close': {
                b.close();
                break;
              }
            }
          };
          const a = client.open({ source: { path: 'a.circuit' } });
          const view = a.view('primary');
          await reached.promise;
          if (point !== 'watch installation') {
            fire();
            release.resolve();
          }

          // One combinator observes B's updates too, so none rejects unobserved if A's assertion fails.
          const [rendering, ...outcomes] = await Promise.all([view.rendering(), ...updates]);

          expect(rendering).toMatchObject({ superseded: false, rendering: { success: true } });
          expect(outcomes.map(({ superseded }) => superseded)).toEqual(updates.map(() => false));
          expect(evaluationsOf('a.circuit')).toEqual(['a']);
        } finally {
          release.resolve();
          await client.shutdown();
        }
      },
    );
  });
});
