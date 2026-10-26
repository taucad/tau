/**
 * Compile-time guarantees for the node filesystem host.
 *
 * `allowRoot` decides that a renderer-named root is served at all; `policy` is
 * what stops an ordinary name resolving through a symlink into the reserved
 * layout under it (G0-6). Serving the first without the second is fail-open, so
 * the two are stated together or not at all (G0b-6).
 *
 * The served owner hands trusted composition a whole-root claim whose scope can
 * only make checked changes; nothing unchecked, watched or disposable leaves it.
 */

import { describe, expectTypeOf, it } from 'vitest';
import { serveNodeFsProvider } from '#backend/node/host.js';
import type { CheckedEntryResult, NodeFsRootRun, NodeFsServer } from '#backend/node/host.js';
import type {
  EntryIdentity,
  EntryObservation,
  EntryPrecondition,
  NodeFsRootScope,
} from '@taucad/filesystem/backend/node';
import type { NodeFsPort } from '#backend/node/port.js';
import { tauPathPolicy } from '#path-registry.js';

declare const port: NodeFsPort;
declare const server: NodeFsServer;
declare const run: NodeFsRootRun;
declare const checkoutRoot: string;

describe('serveNodeFsProvider options — type guarantees', () => {
  it('requires the reserved layout beside the root gate', () => {
    // @ts-expect-error A host that admits a root states the layout an ordinary name may not reach.
    serveNodeFsProvider(port, { allowRoot: () => true });
    serveNodeFsProvider(port, { allowRoot: () => true, policy: tauPathPolicy });
  });

  it('returns the served owner rather than a bare disposer', () => {
    expectTypeOf(
      serveNodeFsProvider(port, { allowRoot: () => true, policy: tauPathPolicy }),
    ).toEqualTypeOf<NodeFsServer>();
    expectTypeOf(server.close).returns.toEqualTypeOf<Promise<void>>();
    // @ts-expect-error The disposer is `close`; the owner is not itself callable.
    void server();
  });
});

describe('NodeFsServer.run — type guarantees', () => {
  it('infers the operation result', () => {
    expectTypeOf(run({ root: checkoutRoot }, async () => 1)).toEqualTypeOf<Promise<number>>();
    expectTypeOf(run({ root: checkoutRoot }, async (scope) => scope.mkdirChecked({ path: 'parts' }))).toEqualTypeOf<
      Promise<CheckedEntryResult>
    >();
  });

  it('refuses every misuse of the held claim', async () => {
    await run({ root: checkoutRoot }, async (scope) => {
      // @ts-expect-error A checked replacement requires the captured baseline as a precondition.
      await scope.writeFileChecked({ path: 'part.ts', data: 'bytes' });
      // @ts-expect-error A checked rename requires source and destination observations.
      await scope.renameChecked({ from: 'a.ts', to: 'b.ts' });
      // @ts-expect-error Directory operations act on exactly one directory; there is no recursive removal.
      await scope.rmdirChecked({ path: 'parts', recursive: true });
      // @ts-expect-error No unchecked write escapes the held claim.
      await scope.writeFile('part.ts', 'bytes');
      // @ts-expect-error No unchecked rename either.
      await scope.rename('a.ts', 'b.ts');
      // @ts-expect-error No watch subscription outlives the operation.
      scope.watch({ path: '' }, () => undefined);
      // @ts-expect-error The scope cannot dispose the server's provider.
      scope.dispose();
    });
    // @ts-expect-error The claim is always whole-root; there is no path list to narrow or widen (PO-Q4).
    await run({ root: checkoutRoot, paths: ['part.ts'] }, async () => undefined);
    // @ts-expect-error The operation must be asynchronous so the server can track it until settlement.
    await run({ root: checkoutRoot }, () => 1);
  });
});

describe('bounded entry public types', () => {
  it('should infer no-follow observations and require limits and authentic identities', async () => {
    await run({ root: checkoutRoot }, async (scope) => {
      expectTypeOf(scope).toEqualTypeOf<NodeFsRootScope>();
      const entry = await scope.observeEntry({ path: 'model', maximumBytes: 4096, maximumEntries: 16 });
      expectTypeOf(entry).toEqualTypeOf<EntryObservation>();
      if (entry.kind === 'symlink') {
        expectTypeOf(entry.identity).toEqualTypeOf<EntryIdentity>();
        expectTypeOf(entry.targetBytes).toEqualTypeOf<Uint8Array<ArrayBuffer>>();
        expectTypeOf(entry.targets).toEqualTypeOf<readonly string[]>();
        const condition = {
          path: 'model',
          expectedEntry: { kind: 'symlink', identity: entry.identity, targetBytes: entry.targetBytes },
        } satisfies EntryPrecondition;
        await scope.renameChecked({
          from: 'model',
          to: 'other',
          preconditions: [condition, { path: 'other', expected: null }],
        });
      }
      // @ts-expect-error Both hard allocation bounds are required.
      await scope.observeEntry({ path: 'model', maximumBytes: 1 });
      const invalid: EntryPrecondition = {
        path: 'model',
        // @ts-expect-error Entry identity cannot be fabricated from a path or caller string.
        expectedEntry: { kind: 'directory', identity: 'model', empty: true },
      };
      void invalid;
      // @ts-expect-error Observation is not a symlink creation capability.
      await scope.symlink({ path: 'new', target: 'model' });
    });
  });
});
