/**
 * Type-level conformance: post-`Port.capabilities` removal contract (C3).
 *
 * The runtime transport architecture removed the per-adapter capability
 * descriptor: every transport now declares its delivery tier through the
 * v6 fat shape (`host.encodeGeometry` / `host.encodeFile` returns) and
 * the channel layer no longer reads `port.capabilities`. The adapter
 * surface shrank to just the message-passing primitives.
 *
 * @see docs/research/runtime-transport-architecture-v6.md (C3)
 */
// eslint-disable-next-line import-x/no-extraneous-dependencies -- this is a test file.
import { describe, it, expectTypeOf } from 'vitest';
import type { Port } from '#index.js';
import type * as rpc from '#index.js';

describe('Port<T> — adapter surface (C3 — no capabilities)', () => {
  it('does not expose a `capabilities` field', () => {
    type HasCapabilities = 'capabilities' extends keyof Port<unknown> ? true : false;
    expectTypeOf<HasCapabilities>().toEqualTypeOf<false>();
  });

  it('keeps the message-passing primitives required by the channel layer', () => {
    type RequiredKeys = keyof Port<unknown>;
    type ExpectsAtLeast = 'postMessage' | 'onMessage' | 'close';
    expectTypeOf<ExpectsAtLeast>().toExtend<RequiredKeys>();
  });

  it('does not re-export `PortCapabilities` from the @taucad/rpc barrel', () => {
    type Exports = keyof typeof rpc;
    type HasPortCapabilities = 'PortCapabilities' extends Exports ? true : false;
    expectTypeOf<HasPortCapabilities>().toEqualTypeOf<false>();
  });
});
