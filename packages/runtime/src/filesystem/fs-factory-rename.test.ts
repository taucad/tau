/**
 * Phase 5 / R7 — `fromX` factory rename per v6 Appendix A.
 *
 * The `Opaque` suffix and `fromWorker*` naming were transitional smells
 * during the v5 → v6 cutover. Per v6 Appendix A:
 *
 *   - public, always opaque: `fromMemoryFs`, `fromNodeFs`, `fromBrowserFs`,
 *     `fromFsLike`, `fromFileSystemBridge`.
 *   - internal handle-returning factories live under `transport/_internal/`.
 *
 * This test pins:
 *   1. The renamed factories `fromFsLike` and `fromFileSystemBridge` are exported
 *      from `@taucad/runtime/filesystem` and return `RuntimeFileSystem`.
 *   2. The legacy names `fromFsLikeOpaque` and `fromWorkerOpaque` are gone.
 */

import { describe, it, expectTypeOf, expect } from 'vitest';
import * as fsBarrel from '#filesystem/index.js';
import * as runtimeFs from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';

describe('FS factory rename per v6 Appendix A (R7)', () => {
  it('exposes `fromFsLike` from the filesystem barrel and runtime-filesystem module', () => {
    expect(typeof fsBarrel.fromFsLike).toBe('function');
    expect(typeof runtimeFs.fromFsLike).toBe('function');
  });

  it('exposes `fromFileSystemBridge` from the filesystem barrel and runtime-filesystem module', () => {
    expect(typeof fsBarrel.fromFileSystemBridge).toBe('function');
    expect(typeof runtimeFs.fromFileSystemBridge).toBe('function');
  });

  it('does not export the legacy `fromFsLikeOpaque` name', () => {
    expect((fsBarrel as Record<string, unknown>)['fromFsLikeOpaque']).toBeUndefined();
    expect((runtimeFs as Record<string, unknown>)['fromFsLikeOpaque']).toBeUndefined();
  });

  it('does not export the legacy `fromWorkerOpaque` name', () => {
    expect((fsBarrel as Record<string, unknown>)['fromWorkerOpaque']).toBeUndefined();
    expect((runtimeFs as Record<string, unknown>)['fromWorkerOpaque']).toBeUndefined();
  });

  it('does not export the removed worker-shaped channel factory name', () => {
    const removedFactoryName = ['from', 'Channel', 'Fs'].join('');

    expect((fsBarrel as Record<string, unknown>)[removedFactoryName]).toBeUndefined();
    expect((runtimeFs as Record<string, unknown>)[removedFactoryName]).toBeUndefined();
  });

  it('`fromFsLike` returns the opaque RuntimeFileSystem brand', () => {
    expectTypeOf(runtimeFs.fromFsLike).returns.toEqualTypeOf<RuntimeFileSystem>();
  });

  it('`fromFileSystemBridge` returns the opaque RuntimeFileSystem brand', () => {
    expectTypeOf(runtimeFs.fromFileSystemBridge).returns.toEqualTypeOf<RuntimeFileSystem>();
  });
});
