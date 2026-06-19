/**
 * Bridge primitives accept wire-agnostic {@link Port}, not DOM `MessagePort` only.
 */
import type { Port } from '@taucad/rpc';
import { describe, expectTypeOf, it } from 'vitest';

import type { createBridgeCall, createBridgeProxy, createBridgeServer } from '@taucad/rpc/bridge';

describe('filesystem bridge primitive port typing', () => {
  it('createBridgeServer second parameter is Port<unknown>', () => {
    expectTypeOf<Parameters<typeof createBridgeServer>[1]>().toEqualTypeOf<Port<unknown>>();
  });

  it('createBridgeCall first parameter is Port<unknown>', () => {
    expectTypeOf<Parameters<typeof createBridgeCall>[0]>().toEqualTypeOf<Port<unknown>>();
  });

  it('createBridgeProxy first parameter is Port<unknown>', () => {
    expectTypeOf<Parameters<typeof createBridgeProxy>[0]>().toEqualTypeOf<Port<unknown>>();
  });
});
