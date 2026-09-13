/**
 * Compile-time guarantees for the per-port mutation-context wrapper and
 * the simplified `createBridgeServer` primitive.
 *
 * These tests pin three architectural commitments:
 * 1. `bindMutationContextForPort` preserves the input handler shape.
 * 2. The override-map keys exhaustively match the
 *    `MutationMethodName` union — adding a new mutating method to
 *    `WorkspaceFileService` without updating the wrapper fails here.
 * 3. `createBridgeServer` is a dumb dispatcher: no `methodContextProvider`
 *    or any other context-injection hook.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type { WorkspaceFileService, WorkspaceMutationContext } from '@taucad/filesystem';
import { bindMutationContextForPort } from '#filesystem/filesystem-bridge.js';
import type { MutationMethodNameInternal, MutationOverrideMapInternal } from '#filesystem/filesystem-bridge.js';
import type { createBridgeServer } from '#transport/_internal/runtime-filesystem-bridge.js';

/**
 * Strict equality check: `true` only when `A` and `B` are mutually
 * assignable. Stronger than `extends` — catches both directions of
 * drift.
 */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe('bindMutationContextForPort — type guarantees', () => {
  it('preserves the input handler shape (T → T)', () => {
    const partial = { readFile: async (_: string) => new Uint8Array() };
    const wrapped = bindMutationContextForPort(partial, { originClientId: 'p' });
    expectTypeOf(wrapped).toEqualTypeOf<typeof partial>();
  });

  it('accepts a partial handler — no requirement that all mutating methods are present', () => {
    // Compile-only: this would fail if the wrapper required the full
    // `WorkspaceFileService` shape.
    bindMutationContextForPort({ readFile: async (_: string) => new Uint8Array() }, { originClientId: 'p' });
  });

  it('accepts the full WorkspaceFileService and returns the same nominal type', () => {
    type Wrapped = ReturnType<typeof bindMutationContextForPort<WorkspaceFileService>>;
    expectTypeOf<Wrapped>().toEqualTypeOf<WorkspaceFileService>();
  });

  it('requires a WorkspaceMutationContext for the second parameter', () => {
    expectTypeOf<Parameters<typeof bindMutationContextForPort>[1]>().toEqualTypeOf<WorkspaceMutationContext>();
  });

  it('override-map keys exactly match MutationMethodName (no extras, no omissions)', () => {
    expectTypeOf<Exact<keyof MutationOverrideMapInternal, MutationMethodNameInternal>>().toEqualTypeOf<true>();
  });

  it('every override-map row matches the live WorkspaceFileService signature', () => {
    // The override map type is `{ [K in MutationMethodName]: WorkspaceFileService[K] }`
    // (via Pick). This assertion pins that derivation: the override
    // type for `unlink` IS the service's `unlink` type. Any drift on
    // the live service surfaces as a TS error here.
    expectTypeOf<MutationOverrideMapInternal['unlink']>().toEqualTypeOf<WorkspaceFileService['unlink']>();
    expectTypeOf<MutationOverrideMapInternal['rmdir']>().toEqualTypeOf<WorkspaceFileService['rmdir']>();
    expectTypeOf<MutationOverrideMapInternal['writeFile']>().toEqualTypeOf<WorkspaceFileService['writeFile']>();
    expectTypeOf<MutationOverrideMapInternal['writeFiles']>().toEqualTypeOf<WorkspaceFileService['writeFiles']>();
    expectTypeOf<MutationOverrideMapInternal['mkdir']>().toEqualTypeOf<WorkspaceFileService['mkdir']>();
    expectTypeOf<MutationOverrideMapInternal['rename']>().toEqualTypeOf<WorkspaceFileService['rename']>();
    expectTypeOf<MutationOverrideMapInternal['duplicateFile']>().toEqualTypeOf<WorkspaceFileService['duplicateFile']>();
    expectTypeOf<MutationOverrideMapInternal['copyDirectory']>().toEqualTypeOf<WorkspaceFileService['copyDirectory']>();
  });
});

describe('createBridgeServer — primitive purity', () => {
  it('options bag does not carry any context-injection hook', () => {
    type Options = NonNullable<Parameters<typeof createBridgeServer>[2]>;
    expectTypeOf<Options>().not.toHaveProperty('methodContextProvider');
  });
});
