/**
 * Finding 1 / R1: `HostInitializeBindingsCore` must not expose a dead
 * `fileSystem` field — dispatcher binds FS via `inlineFileSystem` /
 * `memoryHandle.fileSystemPort` only.
 */

import { describe, it, expectTypeOf } from 'vitest';
import type {
  HostBinaryDeliveryBinding,
  HostInitializeBindingsCore,
  HostInitializeBindings,
} from '#transport/runtime-transport.types.js';

describe('HostInitializeBindingsCore excludes fileSystem slot (Finding 1, R1)', () => {
  it('does not expose a fileSystem field on HostInitializeBindingsCore', () => {
    expectTypeOf<HostInitializeBindingsCore>().not.toHaveProperty('fileSystem');
  });

  it('retains the binary-delivery binding', () => {
    expectTypeOf<HostInitializeBindingsCore>().toHaveProperty('binaryDelivery');
    expectTypeOf<HostInitializeBindingsCore['binaryDelivery']>().toMatchTypeOf<HostBinaryDeliveryBinding>();
  });

  it('HostInitializeBindings default still extends HostInitializeBindingsCore without fileSystem', () => {
    expectTypeOf<HostInitializeBindings>().toMatchTypeOf<HostInitializeBindingsCore>();
  });
});
