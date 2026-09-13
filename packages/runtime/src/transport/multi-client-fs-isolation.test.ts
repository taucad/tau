/**
 * Transport-conformance — multi-`RuntimeClient` filesystem isolation.
 *
 * Pins the spec/instance harmonisation of the inline
 * {@link RuntimeFileSystemHandle} (see
 * `docs/research/runtime-filesystem-spec-instance-harmonisation.md`):
 *
 * - A single `inProcessTransport({ fileSystem: fromMemoryFs(...) })`
 *   plugin is a plain-data spec safe to share at module scope.
 * - Each `plugin.materialize()` invocation produces a `RuntimeClient`
 *   whose underlying `RuntimeFileSystemBase` is freshly minted via
 *   `handle.create()` — never a captured live instance shared across
 *   sibling clients.
 *
 * The original symptom this contract closes: the docs Replicad-reference
 * vase-in-hollow-box regression, where five `<KernelModelView>` instances
 * built five `RuntimeClient`s from one module-level options bag and all
 * five raced to overwrite `'main.ts'` in the same closure-captured
 * `Map<string, ...>`. After harmonisation the five FS instances are
 * isolated by construction.
 */

import { describe, expect, it, vi } from 'vitest';

import { fromMemoryFs, isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystemBase } from '#types/runtime-kernel.types.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { resolveRuntimeFileSystem, wrapAsRuntimeFileSystem } from '#transport/_internal/runtime-filesystem-handle.js';

describe('multi-client filesystem isolation (spec/instance harmonisation)', () => {
  it('one inProcessTransport plugin produces N clients, each with an isolated RuntimeFileSystemBase', async () => {
    /* Build a plain-data filesystem spec (`fromMemoryFs(seed)`); feed
     * one plugin instance to two materialisations — the realistic
     * shape consumers hit when they declare module-level options and
     * render multiple components against it. */
    const mainPath = '/main.ts';
    const seedSource = 'export default () => "seed";';
    const seedFs = fromMemoryFs({ [mainPath]: seedSource });
    const plugin = inProcessTransport({ fileSystem: seedFs });

    const clientA = plugin.materialize();
    const clientB = plugin.materialize();

    /* The two clients are distinct fat handles per
     * `runtime-transport-callable-plugin.md`. */
    expect(clientA).not.toBe(clientB);

    /* Each materialisation calls `extractInlineFileSystem(fileSystem)`
     * exactly once; each call invokes `handle.create()` exactly once;
     * each `create()` mints a fresh isolated base. We observe this
     * directly via the public `resolveRuntimeFileSystem` helper —
     * calling `handle.create()` repeatedly must produce distinct
     * instances. */
    const handle = resolveRuntimeFileSystem(seedFs);
    expect(handle.kind).toBe('inline');
    if (handle.kind !== 'inline') {
      return;
    }
    const baseA: RuntimeFileSystemBase = handle.create();
    const baseB: RuntimeFileSystemBase = handle.create();
    expect(baseA).not.toBe(baseB);

    /* Both inherit the seed independently. */
    await expect(baseA.readFile(mainPath, 'utf8')).resolves.toBe(seedSource);
    await expect(baseB.readFile(mainPath, 'utf8')).resolves.toBe(seedSource);

    /* Cross-client writes do not bleed — the structural fix the docs
     * Replicad-reference cross-contamination depended on. */
    await baseA.writeFile(mainPath, 'A_CODE');
    await baseB.writeFile(mainPath, 'B_CODE');
    await expect(baseA.readFile(mainPath, 'utf8')).resolves.toBe('A_CODE');
    await expect(baseB.readFile(mainPath, 'utf8')).resolves.toBe('B_CODE');

    /* Tear down the materialised wires (the FS bases above were minted
     * independently of the wire — closing the clients is hygiene). */
    await clientA.close();
    await clientB.close();
  });

  it('plugin.materialize() invokes handle.create() exactly once per RuntimeClient', () => {
    /* Wrap a custom inline handle whose `create()` is observable so we
     * can count how often `inProcessTransport(...).materialize()` mints
     * a fresh base. The expectation is exactly-one-`create()`-per-
     * `RuntimeClient` — not per-render, not per-`open()`, not zero. */
    const minted: RuntimeFileSystemBase[] = [];
    const noop = async (): Promise<void> => {
      /* Stub op — only `create()` invocation count matters here. */
    };
    const fakeBaseFactory = vi.fn((): RuntimeFileSystemBase => {
      const base: RuntimeFileSystemBase = {
        id: 'runtime:test-counted',
        capabilities: { persistent: false, writable: true, quotaBased: false, caseSensitive: true },
        dispose() {
          /* Stub dispose — `create()`-count assertion does not exercise lifecycle. */
        },
        readFile: (async (..._args: unknown[]) => '') as RuntimeFileSystemBase['readFile'],
        writeFile: noop,
        mkdir: noop,
        readdir: async () => [],
        unlink: noop,
        stat: async () => ({ type: 'file', size: 0, mtimeMs: 0 }),
        rmdir: noop,
        rename: noop,
        lstat: async () => ({ type: 'file', size: 0, mtimeMs: 0 }),
        exists: async () => false,
      };
      minted.push(base);
      return base;
    });

    const opaque: RuntimeFileSystem = wrapAsRuntimeFileSystem({
      kind: 'inline',
      create: fakeBaseFactory,
    });

    /* Confirm the wrapped value is recognised as a first-class
     * `RuntimeFileSystem` by the public guard. */
    expect(isRuntimeFileSystem(opaque)).toBe(true);

    const plugin = inProcessTransport({ fileSystem: opaque });

    /* Plugin construction itself must not call `create()` — the spec
     * is plain data; only materialisation mints live state. */
    expect(fakeBaseFactory).toHaveBeenCalledTimes(0);

    const clientA = plugin.materialize();
    expect(fakeBaseFactory).toHaveBeenCalledTimes(1);

    const clientB = plugin.materialize();
    expect(fakeBaseFactory).toHaveBeenCalledTimes(2);

    /* Each materialisation owns a *different* base instance. */
    expect(minted).toHaveLength(2);
    expect(minted[0]).not.toBe(minted[1]);

    void clientA;
    void clientB;
  });
});
