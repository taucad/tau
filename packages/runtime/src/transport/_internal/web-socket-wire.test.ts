/**
 * Pure decisions of the WebSocket transport: URL join, upgrade routing, the
 * origin allowlist, the close-code map, and the session pairing slot. The
 * `ws` wiring in `websocket-host.ts` is intentionally thin around these —
 * real sockets live in `apps/runtime-e2e` (blueprint Finding 7).
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildSocketUrl,
  closeCauseFor,
  createSessionPairing,
  isOriginAllowed,
  pairingTimeoutCloseReason,
  randomSessionId,
  routeOf,
  webSocketCloseCode,
} from '#transport/_internal/web-socket-wire.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildSocketUrl', () => {
  it.each([
    ['ws://127.0.0.1:8080', 'ws://127.0.0.1:8080/runtime?session=s1'],
    ['ws://127.0.0.1:8080/', 'ws://127.0.0.1:8080/runtime?session=s1'],
    ['ws://127.0.0.1:8080//', 'ws://127.0.0.1:8080/runtime?session=s1'],
    ['ws://example.test/api', 'ws://example.test/api/runtime?session=s1'],
    ['ws://example.test/api/', 'ws://example.test/api/runtime?session=s1'],
  ])('joins %s with the route and session', (base, expected) => {
    expect(buildSocketUrl(base, 'runtime', 's1')).toBe(expected);
  });

  it('accepts a URL instance and dials the fs route', () => {
    expect(buildSocketUrl(new URL('ws://127.0.0.1:8080/'), 'fs', 's2')).toBe('ws://127.0.0.1:8080/fs?session=s2');
  });

  /* A host mounted under `pathPrefix: '/rt'` needs no client change: the
   * consumer passes the prefixed base and the routes append to it. */
  it('dials a prefixed host without a client-side option', () => {
    expect(buildSocketUrl('ws://h/rt', 'runtime', 's3')).toBe('ws://h/rt/runtime?session=s3');
    expect(buildSocketUrl('ws://h/rt', 'fs', 's3')).toBe('ws://h/rt/fs?session=s3');
  });

  it('preserves the base URL search params (a pairing token survives the join)', () => {
    expect(buildSocketUrl('ws://h/?token=abc', 'runtime', 's4')).toBe('ws://h/runtime?token=abc&session=s4');
  });
});

describe('routeOf', () => {
  it.each([
    ['/runtime', '/', 'runtime'],
    ['/fs', '/', 'fs'],
    ['/rt/runtime', '/rt', 'runtime'],
    ['/rt/fs', '/rt', 'fs'],
    ['/rt/fs', 'rt/', 'fs'],
    ['/api/v1/runtime', '/api/v1', 'runtime'],
  ] as const)('classifies %s under prefix %s', (pathname, prefix, route) => {
    expect(routeOf(pathname, prefix)).toBe(route);
  });

  it.each(['/', '/runtimes', '/fs/extra', '/socket.io'])('rejects %s', (pathname) => {
    expect(routeOf(pathname)).toBeUndefined();
  });

  /* Exact matching: the last-segment rule this replaced hijacked a foreign
   * service's `/agent/fs` and answered `/api/v1/runtime` on the default
   * prefix (daemon-websocket-prerequisites-blueprint.md, Finding 2). */
  it.each([
    ['/agent/fs', '/'],
    ['/agent/runtime', '/'],
    ['/api/v1/runtime', '/'],
    ['/rt/fs', '/'],
    ['/fs', '/rt'],
    ['/other/fs', '/rt'],
    ['/rt/fs/extra', '/rt'],
  ] as const)('does not claim %s under prefix %s', (pathname, prefix) => {
    expect(routeOf(pathname, prefix)).toBeUndefined();
  });
});

describe('isOriginAllowed', () => {
  it('admits a request without an Origin header (Node clients)', () => {
    expect(isOriginAllowed(undefined, [])).toBe(true);
  });

  it('denies every browser origin by default', () => {
    expect(isOriginAllowed('http://ui.test', [])).toBe(false);
  });

  it('admits an exactly matching origin only', () => {
    expect(isOriginAllowed('http://ui.test', ['http://ui.test'])).toBe(true);
    expect(isOriginAllowed('http://ui.test/', ['http://ui.test'])).toBe(false);
    expect(isOriginAllowed('http://evil.test', ['http://ui.test'])).toBe(false);
  });
});

describe('closeCauseFor', () => {
  it.each([webSocketCloseCode.normal, webSocketCloseCode.goingAway])('maps %i to host-exit', (code) => {
    expect(closeCauseFor(code)).toEqual({ cause: 'host-exit' });
  });

  it('maps 1006 to wire-failure with a described error', () => {
    const result = closeCauseFor(webSocketCloseCode.abnormal);
    expect(result.cause).toBe('wire-failure');
    if (result.cause !== 'wire-failure') {
      throw new TypeError('expected wire-failure');
    }
    expect(result.error.message).toContain('1006');
  });

  it('carries the close reason into the error message', () => {
    const result = closeCauseFor(webSocketCloseCode.policyViolation, pairingTimeoutCloseReason);
    if (result.cause !== 'wire-failure') {
      throw new TypeError('expected wire-failure');
    }
    expect(result.error.message).toContain(pairingTimeoutCloseReason);
  });

  it('treats a missing code as a wire failure', () => {
    expect(closeCauseFor(undefined).cause).toBe('wire-failure');
  });
});

describe('randomSessionId', () => {
  it('mints distinct ids', () => {
    expect(randomSessionId()).not.toBe(randomSessionId());
  });

  it('falls back to getRandomValues where randomUUID is unavailable (insecure browser context)', () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(globalThis.crypto) });

    const id = randomSessionId();
    expect(id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(id).not.toBe(randomSessionId());
  });
});

describe('createSessionPairing', () => {
  it('hands an early /fs socket to the /runtime connection that claims it', async () => {
    const pairing = createSessionPairing<string>(1000);
    pairing.offer('s1', 'fs-socket');
    await expect(pairing.claim('s1')).resolves.toBe('fs-socket');
    pairing.dispose();
  });

  it('resolves a waiting /runtime connection when its /fs peer arrives', async () => {
    const pairing = createSessionPairing<string>(1000);
    const claimed = pairing.claim('s2');
    pairing.offer('s2', 'fs-socket');
    await expect(claimed).resolves.toBe('fs-socket');
    pairing.dispose();
  });

  it('never pairs across sessions and consumes an offer once', async () => {
    const pairing = createSessionPairing<string>(20);
    pairing.offer('s3', 'fs-socket');
    await expect(pairing.claim('s3')).resolves.toBe('fs-socket');
    await expect(pairing.claim('s3')).rejects.toThrow(pairingTimeoutCloseReason);
    await expect(pairing.claim('other')).rejects.toThrow(pairingTimeoutCloseReason);
    pairing.dispose();
  });

  it('rejects a claim that outlives the pairing bound', async () => {
    const pairing = createSessionPairing<string>(10);
    await expect(pairing.claim('s4')).rejects.toThrow(pairingTimeoutCloseReason);
    pairing.dispose();
  });

  it('revokes a parked offer whose socket died before anyone claimed it', async () => {
    const pairing = createSessionPairing<string>(20);
    pairing.offer('s6', 'dead-fs-socket');
    pairing.revoke('s6');

    /* Without the revoke the dead socket is handed over and the bridge
     * handshake never resolves. */
    await expect(pairing.claim('s6')).rejects.toThrow(pairingTimeoutCloseReason);
    pairing.dispose();
  });

  it('revoking an unknown session is a no-op', async () => {
    const pairing = createSessionPairing<string>(1000);
    pairing.revoke('never-seen');
    pairing.offer('s7', 'fs-socket');
    await expect(pairing.claim('s7')).resolves.toBe('fs-socket');
    pairing.dispose();
  });

  it('rejects every waiter on dispose', async () => {
    const pairing = createSessionPairing<string>(60_000);
    const claimed = pairing.claim('s5');
    pairing.dispose();
    await expect(claimed).rejects.toThrow(/closed while waiting/);
  });
});
