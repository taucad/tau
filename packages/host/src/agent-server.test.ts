/**
 * Admission and serve-mode behaviour of the `/agent` channel host.
 *
 * The channel's *vocabulary* is proved end-to-end where a real daemon runs
 * (`packages/cli/src/serve-agent.integration.test.ts`); what only this level can
 * prove is the upgrade guard — path, origin, secret — and that the served UI
 * carries the isolation headers and the session cookie that later admits the
 * same-origin upgrade with no token in the page.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';

import { hostSessionCookieName, startAgentServer } from '#agent-server.js';
import type { AgentServerHandle } from '#agent-server.js';

const token = 'agent-server-token-with-at-least-32-characters';

const stubLauncher = (): NodeAgentLauncher =>
  ({
    execute: async () => ({
      type: 'tail',
      chatId: 'chat-1',
      batch: { cursor: 0, nextCursor: 0, endCursor: 0, events: [] },
    }),
    events: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    liveEvents: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    pendingInterrupts: async () => [],
    host: undefined,
    close: async () => undefined,
  }) as unknown as NodeAgentLauncher;

let server: AgentServerHandle | undefined;
const roots: string[] = [];

afterEach(async () => {
  await server?.close();
  server = undefined;
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const workspaceRoot = '/tmp/tau-agent-server-workspace';

const start = async (uiRoot?: string, label?: string): Promise<URL> => {
  server = startAgentServer({
    launcher: stubLauncher(),
    token,
    workspaceRoot,
    ...(label ? { label } : {}),
    ...(uiRoot ? { uiRoot } : {}),
  });
  await server.ready;
  return server.url();
};

const upgrade = async (origin: URL, options: { readonly headers?: Record<string, string> } = {}): Promise<void> => {
  const socket = new WebSocket(new URL('/agent', origin).href.replace('http:', 'ws:'), {
    headers: options.headers ?? {},
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
  } finally {
    socket.close();
  }
};

describe('startAgentServer', () => {
  it('refuses a token shorter than the loopback secret floor', () => {
    expect(() => startAgentServer({ launcher: stubLauncher(), token: 'too-short', workspaceRoot })).toThrow(
      /32 characters/u,
    );
  });

  /*
   * Rung-1 discovery. The page fetches this once, same-origin, to learn that the
   * origin it was served from is itself an agent host — and which directory that
   * host owns. It carries no secret: admission still rides the `HttpOnly` cookie.
   */
  describe('host descriptor', () => {
    it('answers the same-origin descriptor with the isolation headers', async () => {
      const origin = await start();
      const response = await fetch(new URL('/.well-known/tau-host', origin));

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
      expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
      expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(await response.json()).toEqual({ v: 1, agent: true, label: hostname(), workspaceRoot });
      expect(response.headers.get('set-cookie')).toBeNull();
    });

    it('prefers a configured label over the machine hostname', async () => {
      const origin = await start(undefined, 'workshop-mac');
      const response = await fetch(new URL('/.well-known/tau-host', origin));
      await expect(response.json()).resolves.toMatchObject({ label: 'workshop-mac' });
    });

    it('refuses a method other than GET or HEAD', async () => {
      const origin = await start();
      const response = await fetch(new URL('/.well-known/tau-host', origin), { method: 'POST' });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
    });
  });

  it('admits a bearer, refuses a missing one, and refuses a foreign origin', async () => {
    const origin = await start();

    await expect(upgrade(origin, { headers: { authorization: `Bearer ${token}` } })).resolves.toBeUndefined();
    await expect(upgrade(origin)).rejects.toThrow(/401/u);
    await expect(
      upgrade(origin, { headers: { authorization: `Bearer ${token}`, origin: 'https://evil.example' } }),
    ).rejects.toThrow(/403/u);
    // Its own origin is always admitted — that is rung 1, with no configuration.
    await expect(
      upgrade(origin, { headers: { authorization: `Bearer ${token}`, origin: origin.href.replace(/\/$/u, '') } }),
    ).resolves.toBeUndefined();
  });

  it('refuses an upgrade on any path but the agent route', async () => {
    const origin = await start();
    const socket = new WebSocket(new URL('/runtime', origin).href.replace('http:', 'ws:'), {
      headers: { authorization: `Bearer ${token}` },
    });
    await expect(
      new Promise((_resolve, reject) => {
        socket.once('open', () => {
          reject(new Error('a foreign route was upgraded'));
        });
        socket.once('error', reject);
      }),
    ).rejects.toThrow(/404/u);
  });

  it('answers the agent channel only, with no UI configured', async () => {
    const origin = await start();
    const response = await fetch(origin);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('--ui');
  });

  describe('serve mode', () => {
    const makeUi = async (): Promise<string> => {
      const root = await mkdtemp(join(tmpdir(), 'tau-agent-ui-'));
      roots.push(root);
      await writeFile(join(root, 'index.html'), '<!doctype html><title>Tau</title>', 'utf8');
      await writeFile(join(root, 'app.js'), 'export const tau = 1;\n', 'utf8');
      return root;
    };

    it('serves the shell cross-origin isolated and hands out the session cookie', async () => {
      const origin = await start(await makeUi());
      const response = await fetch(origin);

      expect(response.status).toBe(200);
      expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
      expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp');
      expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin');
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      const cookie = response.headers.get('set-cookie');
      expect(cookie).toContain(`${hostSessionCookieName}=`);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      // No secret is written into the page, so the UI build stays untouched.
      expect(await response.text()).not.toContain(token);
    });

    it('admits the upgrade with the cookie the shell handed out', async () => {
      const origin = await start(await makeUi());
      await expect(
        upgrade(origin, { headers: { cookie: `${hostSessionCookieName}=${token}` } }),
      ).resolves.toBeUndefined();
      await expect(upgrade(origin, { headers: { cookie: `${hostSessionCookieName}=wrong` } })).rejects.toThrow(/401/u);
    });

    it('answers the descriptor ahead of the SPA fallback', async () => {
      const origin = await start(await makeUi());

      /* A UI build has no `.well-known/tau-host` file, so the extension-less SPA
       * fallback would otherwise hand the discovery fetch an HTML shell. */
      const descriptor = await fetch(new URL('/.well-known/tau-host', origin));
      expect(descriptor.headers.get('content-type')).toBe('application/json');
      expect(await descriptor.json()).toMatchObject({ v: 1, agent: true, workspaceRoot });

      const clientRoute = await fetch(new URL('/w/space/project', origin));
      expect(clientRoute.headers.get('content-type')).toBe('text/html; charset=utf-8');
    });

    it('routes a client path to the shell but 404s a missing asset', async () => {
      const origin = await start(await makeUi());

      const clientRoute = await fetch(new URL('/w/space/project', origin));
      expect(clientRoute.status).toBe(200);
      expect(clientRoute.headers.get('content-type')).toBe('text/html; charset=utf-8');

      const asset = await fetch(new URL('/app.js', origin));
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
      expect(asset.headers.get('set-cookie')).toBeNull();

      const missing = await fetch(new URL('/missing.js', origin));
      expect(missing.status).toBe(404);
    });

    it('never serves a file outside the build root', async () => {
      const origin = await start(await makeUi());
      /* `..` written plainly is normalised away by URL parsing; the vector that
       * survives it is the percent-encoded separator, which only becomes a
       * separator once the handler decodes the path. Both are put on the raw
       * wire so no client-side normalisation can flatter the result. */
      const request = async (path: string): Promise<string> =>
        new Promise((resolve, reject) => {
          const socket = connect(Number(origin.port), '127.0.0.1', () => {
            socket.write(`GET ${path} HTTP/1.1\r\nHost: ${origin.host}\r\nConnection: close\r\n\r\n`);
          });
          const chunks: Array<Uint8Array<ArrayBuffer>> = [];
          socket.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
            chunks.push(chunk);
          });
          socket.once('error', reject);
          socket.once('close', () => {
            resolve(Buffer.concat(chunks).toString('utf8'));
          });
        });

      // A real file two directories up is never reachable — it 404s as missing.
      expect(await request('/%2e%2e%2f%2e%2e%2fpackage.json')).toMatch(/^HTTP\/1\.1 404 /u);
      expect(await request('/../../package.json')).toMatch(/^HTTP\/1\.1 404 /u);
      // An extension-less escape attempt lands on the shell, never on the host's files.
      const shell = await request('/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd');
      expect(shell).toContain('<!doctype html>');
      expect(shell).not.toContain('root:');
    });

    it('refuses a method other than GET or HEAD', async () => {
      const origin = await start(await makeUi());
      const response = await fetch(origin, { method: 'POST' });
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
    });
  });
});
