/**
 * Subpath-isolation regression test for the runtime's transport surface.
 *
 * Every concrete transport ships behind its own topology-tagged subpath
 * so consumers signal their intent at import time and cross-environment
 * footguns stay impossible:
 *
 *   - `@taucad/runtime/transport`           — author API only
 *     (`defineRuntimeTransport`, `runtimeProtocolSchemas`, types)
 *   - `@taucad/runtime/transport/in-process` — same-isolate transport
 *   - `@taucad/runtime/transport/web`       — browser `Worker` transport
 *   - `@taucad/runtime/transport/node`      — Node `worker_threads` transport
 *
 * The Node split is load-bearing for browser bundles: without it,
 * rolldown / Vite emits `"Module 'node:worker_threads' has been
 * externalized for browser compatibility"` warnings the moment any
 * browser code touches the universal barrel.
 *
 * The web/in-process splits enforce architectural symmetry — Node /
 * CLI bundles never accidentally drag the web-worker transport into
 * their graph, and every consumer chooses its topology explicitly.
 *
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest';
import * as runtimeRoot from '#index.js';
import * as runtimeTransport from '#transport/index.js';
import * as runtimeTransportInProcess from '#transport/in-process.js';
import * as runtimeTransportWeb from '#transport/web.js';
import * as runtimeTransportNode from '#transport/node.js';
import { defineRuntime } from '#worker/runtime-definition.js';

const concreteTransportNames = ['inProcessTransport', 'webWorkerTransport', 'nodeWorkerTransport'] as const;

describe('transport subpath-isolation contract', () => {
  for (const name of concreteTransportNames) {
    it(`does not re-export \`${name}\` from \`@taucad/runtime\``, () => {
      expect(name in runtimeRoot).toBe(false);
    });

    it(`does not re-export \`${name}\` from \`@taucad/runtime/transport\``, () => {
      expect(name in runtimeTransport).toBe(false);
    });
  }

  it('the universal `/transport` barrel only exposes the author API + types + schemas', () => {
    const expected = new Set(['defineRuntimeTransport', 'definePassthroughTransport', 'runtimeProtocolSchemas']);
    const actual = new Set(
      Object.keys(runtimeTransport).filter((k) => (runtimeTransport as Record<string, unknown>)[k] !== undefined),
    );
    expect(actual).toEqual(expected);
  });

  it('exposes `inProcessTransport` via the cross-env `@taucad/runtime/transport/in-process` subpath', () => {
    const runtime = defineRuntime({});
    expect('inProcessTransport' in runtimeTransportInProcess).toBe(true);
    expect(typeof runtimeTransportInProcess.inProcessTransport).toBe('function');
    expect(runtimeTransportInProcess.inProcessTransport({ runtime }).id).toBe('in-process');
  });

  it('exposes `webWorkerTransport` via the browser-only `@taucad/runtime/transport/web` subpath', () => {
    expect('webWorkerTransport' in runtimeTransportWeb).toBe(true);
    expect(typeof runtimeTransportWeb.webWorkerTransport).toBe('function');
  });

  it('exposes `nodeWorkerTransport` via the Node-only `@taucad/runtime/transport/node` subpath', () => {
    expect('nodeWorkerTransport' in runtimeTransportNode).toBe(true);
    expect(typeof runtimeTransportNode.nodeWorkerTransport).toBe('function');
  });
});
