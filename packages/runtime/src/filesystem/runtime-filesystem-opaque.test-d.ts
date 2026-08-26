/**
 * Conformance test C9: the public {@link RuntimeFileSystem} type is
 * fully opaque — `kind`, `port`, `fs`, `handle`, and any other
 * underlying-handle accessor are NOT keys of the public type.
 *
 * Catches the `library-api-policy.md` §22 Antipattern 5 regression
 * where the opaque envelope leaks wire primitives onto the consumer
 * surface.
 */

import { describe, it, assertType, expectTypeOf } from 'vitest';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import { fromMemoryFs, fromFsLike, fromFileSystemBridge } from '#filesystem/runtime-filesystem.js';
import type { FileSystemBridgePort } from '@taucad/fs-bridge';
import { fromBrowserFs } from '#filesystem/from-browser-fs.js';
import { fromNodeFs } from '#filesystem/from-node-fs.js';

describe('RuntimeFileSystem opacity (C9)', () => {
  it('exposes no `kind` accessor', () => {
    expectTypeOf<RuntimeFileSystem>().not.toHaveProperty('kind');
  });

  it('exposes no `port` accessor', () => {
    expectTypeOf<RuntimeFileSystem>().not.toHaveProperty('port');
  });

  it('exposes no `fs` accessor', () => {
    expectTypeOf<RuntimeFileSystem>().not.toHaveProperty('fs');
  });

  it('exposes no `handle` accessor', () => {
    expectTypeOf<RuntimeFileSystem>().not.toHaveProperty('handle');
  });

  it('exposes no `dispose` accessor', () => {
    expectTypeOf<RuntimeFileSystem>().not.toHaveProperty('dispose');
  });

  it('every bundled fromX factory returns RuntimeFileSystem', () => {
    const pathA = '/a.ts';
    const binaryPath = '/binary.step';
    assertType<RuntimeFileSystem>(fromMemoryFs());
    assertType<RuntimeFileSystem>(fromMemoryFs({ [pathA]: 'x' }));
    assertType<RuntimeFileSystem>(fromMemoryFs({ [binaryPath]: new Uint8Array([1, 2, 3]) }));
    assertType<RuntimeFileSystem>(
      fromFsLike({
        promises: {} as unknown as Parameters<typeof fromFsLike>[0]['promises'],
      }),
    );
    assertType<RuntimeFileSystem>(
      fromFileSystemBridge(() => ({ port: undefined as unknown as FileSystemBridgePort, dispose: () => undefined })),
    );
    assertType<RuntimeFileSystem>(fromBrowserFs(undefined as unknown as FileSystemDirectoryHandle));
    assertType<RuntimeFileSystem>(fromNodeFs('/tmp'));
  });

  it('a RuntimeFileSystem cannot be forged from a plain object', () => {
    /* The `[__runtimeFileSystemBrand]` field is a `unique symbol`
     * declared module-private; no caller can produce a value of type
     * `RuntimeFileSystem` outside of a fromX factory. The line below
     * MUST be a type error and is asserted via `@ts-expect-error`. */
    // @ts-expect-error -- plain object lacks the phantom brand
    const _forged: RuntimeFileSystem = {};
    void _forged;
  });
});
