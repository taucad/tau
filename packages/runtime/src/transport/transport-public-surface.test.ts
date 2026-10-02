/**
 * Conformance test C1: the public transport surface at
 * `@taucad/runtime/transport` exposes exactly the documented set of
 * primitives — no leakage of wire primitives, no extra escape hatches.
 *
 * Catches accidental drift where a future PR re-exports a `MessagePort`
 * helper or `Port.capabilities` projection from the transport barrel.
 */

import { describe, it, expect } from 'vitest';
import * as transport from '#transport/index.js';

describe('transport public surface (C1)', () => {
  it('exposes only the cross-environment author API', () => {
    const expected = new Set([
      'defineRuntimeTransport',
      'definePassthroughTransport',
      'runtimeDocumentProtocolSchemas',
    ]);
    const actual = new Set(
      Object.keys(transport).filter((k) => (transport as Record<string, unknown>)[k] !== undefined),
    );
    /* Type-only exports do not show up at runtime; we only assert the
     * value-side surface here. Concrete transports are intentionally
     * absent from this barrel — each ships behind its own
     * topology-tagged subpath (`/transport/in-process`, `/transport/web`,
     * `/transport/node`). The full subpath-isolation contract is pinned
     * by `transport-browser-safe.test.ts`. */
    expect(actual).toEqual(expected);
  });

  it('defineRuntimeTransport is a callable function', () => {
    expect(typeof transport.defineRuntimeTransport).toBe('function');
  });

  it('does not export any port/wire/capability helpers', () => {
    const banned = ['MessagePort', 'Port', 'Channel', 'capabilities', 'PortCapabilities', 'wrapMessagePort'];
    for (const name of banned) {
      expect(name in transport).toBe(false);
    }
  });
});
