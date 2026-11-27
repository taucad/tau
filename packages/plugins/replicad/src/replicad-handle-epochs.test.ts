// @vitest-environment node
/* oxlint-disable eslint/no-await-in-loop -- builds run in order: each one replaces the last. */
/**
 * Build epochs through the real runtime (catalogue E12, memory R5 and T6): the runtime releases a replaced build and
 * the kernel deletes what it delivered without waiting for the collector; module-scope shapes survive parameter-only
 * rebuilds (A3); and over a long drag the WebAssembly heap and the live OpenCascade handles stay flat, with the live
 * tier on, off, and under byte pressure. The four slow tests (module state, three long drags) are in
 * `replicad-handle-epochs.<name>.test.ts`, so Vitest runs them side by side; shared helpers are in
 * `replicad-handle-epochs.test-utils.ts`.
 */
import { describe, expect, it } from 'vitest';
import { esbuildBundler } from '@taucad/esbuild';
import { createRuntimeClient } from '@taucad/runtime/client';
import type { ViewUpdateOutcome } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { summarizeLeaks } from '@taucad/runtime-testing';
import type { HandleLedger } from '@taucad/runtime-testing';
import { replicadKernel } from '#replicad.kernel.js';
import type { Options } from '#replicad-handle-epochs.test-utils.js';
import {
  closeClientsAfterEachTest,
  coldGlbs,
  collect,
  counted,
  executions,
  failureOf,
  ledgerOf,
  memoBody,
  moduleScope,
  pin,
  renderTimeout,
  session,
  tracked,
} from '#replicad-handle-epochs.test-utils.js';

closeClientsAfterEachTest();

describe('replicad release fallback', () => {
  /**
   * A slider drag cycles a memo through three keys and back: the third build deletes the first key's shape, parked
   * when its build was replaced, so the fourth build returns a deleted shape. The kernel runs the module fresh once in
   * that build and releases its shapes by the collector from then on.
   */
  it(
    'should rebuild a module-state memo cycling 1, 2, 3, 1 with the bytes of a cold build, reuse off and on',
    async () => {
      const keys = [1, 2, 3, 1, 2, 3, 1, 3, 2, 1];
      for (const [arm, options] of [
        ['off', { computeReuse: false }],
        ['on', {}],
      ] as const) {
        const counter = `__replicadFallbackMemo_${arm}`;
        const source = counted(counter, memoBody);
        const cold = await coldGlbs(source, [1, 2, 3]);
        const opened = session(source, options);
        try {
          const glbs: string[] = [];
          for (const [index, key] of keys.entries()) {
            // A new tag every build: the scene table never answers, so the memo does.
            glbs.push(await opened.build({ key, tag: index }));
          }
          expect(glbs, arm).toStrictEqual(keys.map((key) => cold.get(key)));
          // Three cold sessions, the session's first execution and one fresh run: the switch to the collector holds
          // for the later cycles.
          expect(executions(counter), arm).toBe(3 + 2);
          // One `main` phase per build, the fourth marked; with the tier, every build advanced it once.
          expect(
            opened.mainSpans.map((span) => span['releaseFallback'] ?? '-'),
            arm,
          ).toStrictEqual(keys.map((_, index) => (index === 3 ? 'module' : '-')));
          if (arm === 'on') {
            expect(opened.tierBytes).toHaveLength(keys.length);
          }
        } finally {
          await opened.close();
        }
      }
    },
    renderTimeout,
  );

  it(
    'should neither double-delete nor leak across the fresh run',
    async () => {
      const counter = '__replicadFallbackLedger';
      const opened = session(counted(counter, memoBody), { computeReuse: false });
      try {
        await opened.build({ key: 1, tag: 0 });
        const ledger = ledgerOf();
        await collect(ledger);
        const before = ledger.snapshot();
        const alive: number[] = [];
        for (let step = 1; step <= 30; step += 1) {
          await opened.build({ key: (step % 3) + 1, tag: step });
          await collect(ledger);
          alive.push(ledger.since(before).length);
        }
        expect(executions(counter)).toBe(2);
        const settled = alive.slice(9);
        expect(settled, JSON.stringify(summarizeLeaks(ledger.since(before)))).toStrictEqual(
          Array.from({ length: settled.length }, () => settled[0]),
        );
        expect(ledger.stats().doubleDeletes).toBe(0);
      } finally {
        await opened.close();
      }
    },
    renderTimeout,
  );

  /**
   * The fresh instance stays in the JavaScript module map after its code is edited, and its memo with it: retiring the
   * module's collector group deletes those shapes, so each edited version leaves nothing behind.
   */
  it(
    'should free the fresh instance memo when the module is edited',
    async () => {
      const memoVersion = (version: number): string => `
        import { makeCylinder } from 'replicad';
        const version = ${version};
        const cache = new Map();
        export const defaultParams = { key: 1, tag: 0 };
        export default function main(p = defaultParams) {
          let shape = cache.get(p.key);
          if (!shape) {
            shape = makeCylinder(p.key + version / 1000, 8);
            cache.set(p.key, shape);
          }
          return shape;
        }`;
      const client = tracked(
        createRuntimeClient({
          transport: inProcessTransport({
            runtime: defineRuntime({
              kernels: [replicadKernel({ wasm: 'single', computeReuse: false })],
              bundlers: [esbuildBundler()],
            }),
            fileSystem: fromMemoryFs({ 'main.ts': memoVersion(0) }),
            compute: { mode: 'memory' },
          }),
        }),
      );
      const fallbacks: unknown[] = [];
      client.on('telemetry', (batch) => {
        for (const entry of batch.entries) {
          if (entry.name === 'replicad.run-main' && entry.detail?.['releaseFallback'] !== undefined) {
            fallbacks.push(entry.detail['releaseFallback']);
          }
        }
      });
      const document = client.open({ source: { path: 'main.ts' }, parameters: { key: 1, tag: 0 }, watch: false });
      const view = document.view('model');
      const counts: number[] = [];
      let ledger: HandleLedger | undefined;
      let before: ReadonlySet<WeakKey> | undefined;
      try {
        for (let version = 1; version <= 6; version += 1) {
          // Each version is an edit; 1, 2, 3, 1 falls back and 2, 3 fills the fresh instance's memo with three
          // cylinders.
          for (const [index, key] of [1, 2, 3, 1, 2, 3].entries()) {
            await document.update({
              parameters: { key, tag: index },
              ...(index === 0 ? { stage: { 'main.ts': memoVersion(version) } } : {}),
            });
            const outcome = await view.rendering();
            if (outcome.superseded || !outcome.rendering.success) {
              throw new Error(JSON.stringify(outcome).slice(0, 1000));
            }
          }
          await collect();
          ledger ??= ledgerOf();
          before ??= ledger.snapshot();
          counts.push(ledger.since(before).length);
        }
        expect(fallbacks).toStrictEqual(Array.from({ length: 6 }, () => 'module'));
        // Each version holds at most its own fresh instance's three cylinders (fewer once the collector has run);
        // before the group was retired on edit, every version added its memo: [0, 3, 6, 8, 11, 13].
        expect(Math.max(...counts), JSON.stringify(counts)).toBeLessThanOrEqual(4);
        expect(ledger!.stats().doubleDeletes).toBe(0);
      } finally {
        view.close();
        document.close();
        await client.shutdown();
      }
    },
    renderTimeout,
  );

  /** A client over an in-memory `main.ts`; documents edit it by staging a new source. */
  const memoryClient = (source: string, options: Options) =>
    tracked(
      createRuntimeClient({
        transport: inProcessTransport({
          runtime: defineRuntime({
            kernels: [replicadKernel({ wasm: 'single', ...options })],
            bundlers: [esbuildBundler()],
          }),
          fileSystem: fromMemoryFs({ 'main.ts': source }),
          compute: { mode: 'memory' },
        }),
      }),
    );
  const rendered = (outcome: ViewUpdateOutcome<'model'>): string => {
    if (outcome.superseded) {
      return 'superseded';
    }
    return outcome.rendering.success ? 'ok' : `fail:${outcome.rendering.issues[0]?.message}`;
  };

  it.each([
    ['off', { computeReuse: false }],
    ['on', {}],
  ] as const)(
    'should never delete, when a group retires, a shape a still-open document delivers (reuse %s)',
    async (_arm, options) => {
      const memoVersion = (version: number): string => `
        import { makeCylinder } from 'replicad';
        const version = ${version};
        const cache = new Map();
        export const defaultParams = { key: 1, tag: 0 };
        export default function main(p = defaultParams) {
          let shape = cache.get(p.key);
          if (!shape) {
            shape = makeCylinder(p.key + version / 1000, 8);
            cache.set(p.key, shape);
          }
          return shape;
        }`;
      const client = memoryClient(memoVersion(0), options);
      const results: string[] = [];
      try {
        const old = client.open({ source: { path: 'main.ts' }, parameters: { key: 1, tag: 0 }, watch: false });
        const oldView = old.view('model');
        for (const [index, key] of [1, 2, 3, 1, 2, 3, 1].entries()) {
          if (index > 0) {
            await old.update({ parameters: { key, tag: index } });
          }
          results.push(rendered(await oldView.rendering()));
        }
        const ledger = ledgerOf();
        // Edit: a second document builds the new code, which retires the old instance's group.
        const edited = client.open({ source: { path: 'main.ts' }, parameters: { key: 1, tag: 0 }, watch: false });
        const editedView = edited.view('model');
        for (const [index, key] of [1, 2, 3].entries()) {
          await edited.update({
            parameters: { key, tag: index + 10 },
            ...(index === 0 ? { stage: { 'main.ts': memoVersion(1) } } : {}),
          });
          results.push(rendered(await editedView.rendering()));
        }
        // The old document still holds its handle: exports and a second view work.
        for (const format of ['step', 'glb'] as const) {
          const exported = await old.export(format);
          results.push(exported.success ? 'ok' : `fail:${exported.issues[0]?.message}`);
        }
        const second = old.view('model');
        results.push(rendered(await second.rendering()));
        second.close();
        oldView.close();
        old.close();
        editedView.close();
        edited.close();
        expect(results).toStrictEqual(results.map(() => 'ok'));
        expect(ledger.stats().doubleDeletes).toBe(0);
      } finally {
        await client.shutdown();
      }
    },
    renderTimeout,
  );

  /**
   * Version A memoizes on `globalThis` too and falls back; the edit to B, which returns A's shapes from `globalThis`,
   * escalates to the worker. When the old document closes, A's group retires, but a worker-wide collector handle of B
   * still delivers one of its shapes: that shape must survive for B's export and next view.
   */
  it(
    'should spare, when a group retires, a shape a worker-wide collector handle still delivers',
    async () => {
      const versionA = `
        import { makeCylinder } from 'replicad';
        const cache = new Map();
        export const defaultParams = { key: 1, tag: 0 };
        export default function main(p = defaultParams) {
          let shape = cache.get(p.key);
          if (!shape) {
            shape = makeCylinder(p.key, 8);
            cache.set(p.key, shape);
          }
          (globalThis.__replicadFallbackShare ??= new Map()).set(p.key, shape);
          return shape;
        }`;
      const versionB = `
        import { makeCylinder } from 'replicad';
        export const defaultParams = { key: 1, tag: 0 };
        export default function main(p = defaultParams) {
          return globalThis.__replicadFallbackShare?.get(p.key) ?? makeCylinder(p.key + 0.5, 8);
        }`;
      const client = memoryClient(versionA, { computeReuse: false });
      const log: string[] = [];
      try {
        const old = client.open({ source: { path: 'main.ts' }, parameters: { key: 1, tag: 0 }, watch: false });
        const oldView = old.view('model');
        for (const [index, key] of [1, 2, 3, 1].entries()) {
          if (index > 0) {
            await old.update({ parameters: { key, tag: index } });
          }
          log.push(`A${key}:${rendered(await oldView.rendering())}`);
        }
        const edited = client.open({ source: { path: 'main.ts' }, parameters: { key: 2, tag: 0 }, watch: false });
        const editedView = edited.view('model');
        await edited.update({ parameters: { key: 2, tag: 0 }, stage: { 'main.ts': versionB } });
        // Key 2's shape was released with A's second build: B's first build fails and escalates to the worker.
        log.push(`B2:${rendered(await editedView.rendering())}`);
        await edited.update({ parameters: { key: 1, tag: 1 } });
        log.push(`B1:${rendered(await editedView.rendering())}`);
        // The old document goes: its handle, the group's last, is released and the group settles.
        oldView.close();
        old.close();
        const other = client.open({ source: { path: 'main.ts' }, parameters: { key: 5, tag: 9 }, watch: false });
        await other.view('model').rendering();
        other.close();
        const exported = await edited.export('step');
        log.push(`B1-export:${exported.success ? 'ok' : `fail:${exported.issues[0]?.message}`}`);
        const again = edited.view('model');
        log.push(`B1-view:${rendered(await again.rendering())}`);
        again.close();
        editedView.close();
        edited.close();
        expect(log.filter((entry) => entry.startsWith('B1'))).toStrictEqual(['B1:ok', 'B1-export:ok', 'B1-view:ok']);
      } finally {
        await client.shutdown();
      }
    },
    renderTimeout,
  );

  it(
    'should not run a module fresh when its build throws any other error, even one that mentions a deletion',
    async () => {
      const counter = '__replicadFallbackOther';
      const opened = session(
        counted(
          counter,
          `export default function main(p = defaultParams) {
            globalThis.${counter}Mains = (globalThis.${counter}Mains ?? 0) + 1;
            if (p.key === 2) throw new Error('Gear ratio out of range');
            if (p.key === 3) throw new Error('Gear 3 has been deleted from the BOM; pick another gear');
            return makeCylinder(p.key, 8);
          }`,
        ),
        { computeReuse: false },
      );
      try {
        // Builds 1 and 4 deliver and replace cylinders, so the epochs have deleted something before key 3 fails.
        await opened.build({ key: 1, tag: 0 });
        expect(await failureOf(opened.build({ key: 2, tag: 0 }))).toContain('Gear ratio out of range');
        await opened.build({ key: 4, tag: 0 });
        await opened.build({ key: 5, tag: 0 });
        expect(await failureOf(opened.build({ key: 3, tag: 0 }))).toContain('has been deleted from the BOM');
        expect(executions(counter)).toBe(1);
        expect(executions(`${counter}Mains`)).toBe(5);
      } finally {
        await opened.close();
      }
    },
    renderTimeout,
  );

  it(
    'should not retry a deleted-object error when the epochs have deleted nothing',
    async () => {
      for (const [arm, options] of [
        ['off', { computeReuse: false }],
        ['on', {}],
      ] as const) {
        const counter = `__replicadFallbackUser_${arm}`;
        const opened = session(
          counted(
            counter,
            `export default function main(p = defaultParams) {
              const shape = makeCylinder(p.key, 8);
              shape.delete();
              return shape.translate([1, 0, 0]);
            }`,
          ),
          options,
        );
        try {
          expect(await failureOf(opened.build({ key: 1, tag: 0 })), arm).toContain('This object has been deleted');
          expect(executions(counter), arm).toBe(1);
          expect(
            opened.mainSpans.map((span) => span['releaseFallback']),
            arm,
          ).toStrictEqual([undefined]);
        } finally {
          await opened.close();
        }
      }
    },
    renderTimeout,
  );

  /**
   * A memo kept outside the bundle (`globalThis`) survives a fresh module, so the fresh run fails the same way: the
   * worker switches to collector release and runs the module once more. The shape the epochs already deleted cannot
   * come back, so that build fails; nothing is deleted deterministically afterwards.
   */
  it(
    'should switch the worker to collector release when the fresh run fails the same way',
    async () => {
      const counter = '__replicadFallbackGlobal';
      const opened = session(
        counted(
          counter,
          `const cache = (globalThis.${counter}Cache ??= new Map());
          export default function main(p = defaultParams) {
            let shape = cache.get(p.key);
            if (!shape) {
              shape = makeCylinder(p.key, 8);
              cache.set(p.key, shape);
            }
            return shape;
          }`,
        ),
        { computeReuse: false },
      );
      try {
        const outcomes: string[] = [];
        for (const [index, key] of [1, 2, 3, 1, 2, 3, 2, 3, 4, 2, 3, 4].entries()) {
          outcomes.push((await failureOf(opened.build({ key, tag: index }))) ?? 'ok');
        }
        expect(outcomes[3]).toContain('This object has been deleted');
        expect(outcomes.filter((outcome) => outcome !== 'ok')).toHaveLength(1);
        // The first execution, the module's fresh run and the worker's: none after the switch.
        expect(executions(counter)).toBe(3);
        expect(opened.mainSpans.map((span) => span['releaseFallback']).filter(Boolean)).toStrictEqual(['worker']);
      } finally {
        await opened.close();
      }
    },
    renderTimeout,
  );
});

describe('replicad build epochs', () => {
  it(
    'should delete what a replaced build delivered without the collector',
    async () => {
      const opened = session(pin, { computeReuse: false });
      try {
        await opened.build({ radius: 2 });
        const ledger = ledgerOf();
        const before = ledger.snapshot();
        const alive: number[] = [];
        for (let step = 1; step <= 6; step += 1) {
          await opened.build({ radius: 2 + step });
          alive.push(ledger.since(before).length);
        }

        // Without `releaseHandle` each build adds the cylinder it delivered until the collector runs. With it, the
        // replaced build's cylinder stays parked for one more build, then goes.
        expect(alive, JSON.stringify(summarizeLeaks(ledger.since(before)))).toStrictEqual([1, 2, 2, 2, 2, 2]);
        expect(ledger.stats().doubleDeletes).toBe(0);
      } finally {
        await opened.close();
      }
    },
    renderTimeout,
  );

  it(
    'should keep a module-scope shape that builds deliver, release and deliver again (A3)',
    async () => {
      for (const options of [{ computeReuse: false }, {}] as const) {
        const opened = session(moduleScope, options);
        try {
          const glbs = [];
          for (const useBase of [true, false, false, true, false, true]) {
            glbs.push(await opened.build({ useBase, radius: glbs.length + 1 }));
          }
          expect(new Set([glbs[0], glbs[3], glbs[5]]).size).toBe(1);
        } finally {
          await opened.close();
        }
      }
    },
    renderTimeout,
  );
});
