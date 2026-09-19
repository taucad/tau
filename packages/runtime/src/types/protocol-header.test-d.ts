/**
 * Type-level assertions for `ProtocolHeader` and `WireMessage`. The runtime
 * companion `protocol-header.runtime.test.ts` covers behavioural assertions.
 */

import { describe, it, assertType } from 'vitest';
import type { ProtocolHeader, WireMessage } from '#types/protocol-header.types.js';

describe('ProtocolHeader (type-d)', () => {
  it('should require v, seq and accept optional cid + rgen', () => {
    const minimal: ProtocolHeader = { v: 3, seq: 0 };
    assertType<ProtocolHeader>(minimal);

    const correlated: ProtocolHeader = { v: 3, seq: 1, cid: 'cmd_xyz', rgen: 3 };
    assertType<ProtocolHeader>(correlated);
  });

  it('should narrow v to the current protocol version literal `3`', () => {
    const header: ProtocolHeader = { v: 3, seq: 0 };
    // Compile-time: assignment to `3` only succeeds because `v` is a literal type.
    const literal: 3 = header.v;
    assertType<3>(literal);
  });
});

describe('WireMessage<T> (type-d)', () => {
  it('should produce the structural intersection of a payload and a ProtocolHeader', () => {
    type Ping = { type: 'ping' };
    const wire: WireMessage<Ping> = { type: 'ping', v: 3, seq: 0 };
    assertType<WireMessage<Ping>>(wire);
    assertType<'ping'>(wire.type);
    assertType<3>(wire.v);
    assertType<number>(wire.seq);
  });

  it('should preserve discriminated unions across the intersection', () => {
    type Sample = { type: 'a'; payload: string } | { type: 'b'; payload: number };
    const widen = <T>(value: T): T => value;
    const wireA = widen<WireMessage<Sample>>({ type: 'a', payload: 'hello', v: 3, seq: 0 });
    if (wireA.type === 'a') {
      assertType<string>(wireA.payload);
    }
  });
});
