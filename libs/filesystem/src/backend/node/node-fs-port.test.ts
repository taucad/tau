/**
 * Client/host round trip for the node storage backend.
 *
 * Runs both halves in this process over a `MessageChannel` pair — the repo's
 * vitest cannot host a `.ts` `worker_threads` worker, and an in-process channel
 * exercises the same structured-clone wire the Electron `MessagePortMain` uses.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFsChannel, NodeFsChannelClosedError, NodeFsProviderClient } from '#backend/node/client.js';
import { serveNodeFsProvider } from '#backend/node/host.js';
import { nodeFsProtocolVersion } from '#backend/node/protocol.js';
import type { NodeFsWatchEvent } from '#backend/node/protocol.js';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    cleanup();
  }
});

type Connected = {
  readonly root: string;
  readonly outside: string;
  readonly provider: NodeFsProviderClient;
  readonly port: MessagePort;
};

const connect = (): Connected => {
  const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-port-'));
  const root = join(sandbox, 'root');
  const outside = join(sandbox, 'outside');
  mkdirSync(root);
  mkdirSync(outside);
  const { port1, port2 } = new MessageChannel();
  const stop = serveNodeFsProvider(port2, { allowRoot: (candidate) => candidate === root });
  const channel = new NodeFsChannel(port1);
  cleanups.push(() => {
    channel.close();
    stop();
    port2.close();
    rmSync(sandbox, { recursive: true, force: true });
  });
  return { root, outside, provider: new NodeFsProviderClient(channel, root), port: port1 };
};

/**
 * Arm a watch and hold it until the host proves it is live.
 *
 * Arming resolves as soon as the host has called `fs.watch`, but macOS FSEvents
 * needs a moment more before it delivers. A probe file is written in a loop
 * until its own event arrives, so a test's real mutation cannot be missed.
 */
const armLiveWatch = async (
  provider: NodeFsProviderClient,
  root: string,
  request: { recursive?: boolean; excludes?: string[] } = {},
): Promise<{ readonly events: NodeFsWatchEvent[] }> => {
  const events: NodeFsWatchEvent[] = [];
  const unsubscribe = await provider.watch(
    { paths: [''], recursive: request.recursive ?? true, ...(request.excludes ? { excludes: request.excludes } : {}) },
    (event) => {
      events.push(event);
    },
  );
  cleanups.push(unsubscribe);
  const probe = join(root, '.watch-probe');
  const deadline = Date.now() + 10_000;
  while (!events.some((event) => event.type !== 'reset' && event.path === '.watch-probe')) {
    if (Date.now() > deadline) {
      throw new Error('The host watcher never went live.');
    }
    writeFileSync(probe, String(Date.now()));
    // oxlint-disable-next-line no-await-in-loop -- Liveness is polled by design.
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  unlinkSync(probe);
  events.length = 0;
  return { events };
};

/** Resolve once `events` contains a match, or reject at `timeoutMs`. */
const waitForEvent = async (
  events: readonly NodeFsWatchEvent[],
  predicate: (event: NodeFsWatchEvent) => boolean,
  timeoutMs = 10_000,
): Promise<NodeFsWatchEvent> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = events.find((event) => predicate(event));
    if (hit) {
      return hit;
    }
    if (Date.now() > deadline) {
      throw new Error(`No matching watch event arrived over the port; saw ${JSON.stringify(events)}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- Polling an event buffer.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
};

/** Post a frame the typed client would never build, to reach the host directly. */
const rawRequest = async (port: MessagePort, frame: Record<string, unknown>): Promise<unknown> =>
  new Promise((resolve) => {
    const listener = (event: MessageEvent): void => {
      const data = event.data as { id?: unknown };
      if (data.id === frame['id']) {
        port.removeEventListener('message', listener);
        resolve(event.data);
      }
    };
    port.addEventListener('message', listener);
    port.postMessage({ v: nodeFsProtocolVersion, ...frame });
  });

describe('node filesystem client/host round trip', () => {
  it('round-trips bytes through the port', async () => {
    const { provider } = connect();

    await provider.writeFile('nested/file.txt', 'hello');

    await expect(provider.readFile('nested/file.txt', 'utf8')).resolves.toBe('hello');
    await expect(provider.stat('nested/file.txt')).resolves.toMatchObject({
      type: 'file',
      size: 5,
      contentKind: 'text',
    });
  });

  it('hides an in-flight atomic-write temp file from directory listings', async () => {
    const { root, provider } = connect();
    // What `_atomicWrite` parks beside its target for a few milliseconds, plus
    // two dotfiles a listing must keep: a user dotfile and a user `.tmp`.
    writeFileSync(join(root, `.main.scad.json.${String(process.pid)}.1b4e28ba-2fa1-4d3b-9c6e-0f3a2b1c4d5e.tmp`), '');
    writeFileSync(join(root, '.keep'), '');
    writeFileSync(join(root, 'notes.tmp'), 'draft');

    const entries = await provider.readdir('');

    expect(entries).toContain('.keep');
    expect(entries).toContain('notes.tmp');
    expect(entries.filter((name) => name.endsWith('.tmp'))).toEqual(['notes.tmp']);
  });

  it('carries errno codes across the port', async () => {
    const { provider } = connect();
    await provider.mkdir('directory');

    await expect(provider.unlink('directory')).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(provider.readFile('absent.txt')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('delivers a watch change event with its entry kind', async () => {
    const { root, provider } = connect();
    const { events } = await armLiveWatch(provider, root);

    writeFileSync(join(root, 'watched.txt'), 'external');

    await expect(
      waitForEvent(events, (event) => event.type === 'change' && event.path === 'watched.txt'),
    ).resolves.toEqual({ type: 'change', path: 'watched.txt', kind: 'file' });
  }, 30_000);

  it('classifies a removal as a delete rather than trusting the OS event type', async () => {
    const { root, provider } = connect();
    writeFileSync(join(root, 'doomed.txt'), 'external');
    const { events } = await armLiveWatch(provider, root);

    unlinkSync(join(root, 'doomed.txt'));

    await expect(
      waitForEvent(events, (event) => event.type === 'delete' && event.path === 'doomed.txt'),
    ).resolves.toEqual({ type: 'delete', path: 'doomed.txt' });
  }, 30_000);

  it('excludes cache paths from the event stream', async () => {
    const { root, provider } = connect();
    mkdirSync(join(root, '.tau', 'cache'), { recursive: true });
    const { events } = await armLiveWatch(provider, root, { excludes: ['.tau/cache/**'] });

    writeFileSync(join(root, '.tau', 'cache', 'burst.bin'), 'x');
    writeFileSync(join(root, 'after.txt'), 'x');
    await waitForEvent(events, (event) => event.type === 'change' && event.path === 'after.txt');

    expect(events.filter((event) => event.type !== 'reset' && event.path.startsWith('.tau/cache'))).toEqual([]);
  }, 30_000);

  it('refuses a traversal the typed client cannot express', async () => {
    const { root, outside, port } = connect();
    writeFileSync(join(outside, 'secret.txt'), 'private');

    const response = (await rawRequest(port, { id: 9001, root, op: 'readFile', path: '../outside/secret.txt' })) as {
      type: string;
      code?: string;
    };

    expect(response.type).toBe('error');
    expect(response.code).toBe('PATH_OUTSIDE_ROOT');
  });

  it('refuses a symlink that escapes the root', async () => {
    const { root, outside, provider } = connect();
    writeFileSync(join(outside, 'target.txt'), 'private');
    symlinkSync(join(outside, 'target.txt'), join(root, 'escape.txt'));

    // Containment answers first: the link resolves outside the admitted root.
    await expect(provider.writeFile('escape.txt', 'overwritten')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(provider.readFile('escape.txt')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses to replace a symlink inside the root instead of following it', async () => {
    const { root, provider } = connect();
    await provider.writeFile('real.txt', 'original');
    symlinkSync(join(root, 'real.txt'), join(root, 'alias.txt'));

    await expect(provider.writeFile('alias.txt', 'overwritten')).rejects.toMatchObject({ code: 'ELOOP' });
    await expect(provider.readFile('real.txt', 'utf8')).resolves.toBe('original');
  });

  it('refuses a root the host did not admit', async () => {
    const { port } = connect();

    const response = (await rawRequest(port, { id: 9002, root: '/', op: 'readdir', path: '' })) as {
      type: string;
      code?: string;
    };

    expect(response).toMatchObject({ type: 'error', code: 'EACCES' });
  });

  it('rejects a frame from a peer speaking another protocol version', async () => {
    const { root, port } = connect();

    const response = await new Promise((resolve) => {
      const listener = (event: MessageEvent): void => {
        port.removeEventListener('message', listener);
        resolve(event.data);
      };
      port.addEventListener('message', listener);
      port.postMessage({ v: 999, id: 9003, root, op: 'readdir', path: '' });
    });

    expect(response).toMatchObject({ type: 'error', code: 'NODE_FS_PROTOCOL_VERSION' });
  });
});

describe('node filesystem host hardening', () => {
  it('refuses to remove its own root', async () => {
    const { provider, root } = connect();

    await expect(provider.rmdir('')).rejects.toMatchObject({ code: 'EINVAL' });
    // Still there — the guard is the only thing between an empty root and `fs.rmdir`.
    await expect(provider.readdir('')).resolves.toEqual([]);
    expect(existsSync(root)).toBe(true);
  });

  it('re-consults allowRoot on every request, so a narrowed allowlist takes effect', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-allow-'));
    const root = join(sandbox, 'root');
    mkdirSync(root);
    const { port1, port2 } = new MessageChannel();
    let admitted = true;
    const stop = serveNodeFsProvider(port2, { allowRoot: () => admitted });
    const channel = new NodeFsChannel(port1);
    cleanups.push(() => {
      channel.close();
      stop();
      port2.close();
      rmSync(sandbox, { recursive: true, force: true });
    });
    const provider = new NodeFsProviderClient(channel, root);

    await expect(provider.readdir('')).resolves.toEqual([]);
    admitted = false;

    await expect(provider.readdir('')).rejects.toMatchObject({ code: 'EACCES' });
  });
});

describe('host death', () => {
  it('rejects in-flight and subsequent requests instead of hanging forever', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-death-'));
    const root = join(sandbox, 'root');
    mkdirSync(root);
    const { port1, port2 } = new MessageChannel();
    // No host listening: the request goes out and nothing ever answers it —
    // exactly what a services-utility death looks like from the renderer.
    const channel = new NodeFsChannel(port1);
    const provider = new NodeFsProviderClient(channel, root);
    cleanups.push(() => {
      channel.close();
      rmSync(sandbox, { recursive: true, force: true });
    });

    const inFlight = provider.readdir('');
    port2.close();

    await expect(inFlight).rejects.toBeInstanceOf(NodeFsChannelClosedError);
    // And the channel stays closed rather than silently swallowing the next call.
    await expect(provider.readdir('')).rejects.toBeInstanceOf(NodeFsChannelClosedError);
    expect(channel.closed).toBe(true);
  });

  it('resets every live watcher when the host dies, so observers resync', async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'tau-node-death-watch-'));
    const root = join(sandbox, 'root');
    mkdirSync(root);
    const { port1, port2 } = new MessageChannel();
    const stop = serveNodeFsProvider(port2, { allowRoot: () => true });
    const channel = new NodeFsChannel(port1);
    const provider = new NodeFsProviderClient(channel, root);
    cleanups.push(() => {
      channel.close();
      stop();
      rmSync(sandbox, { recursive: true, force: true });
    });
    const events: NodeFsWatchEvent[] = [];
    await provider.watch({ paths: [''], recursive: true }, (event) => {
      events.push(event);
    });

    port2.close();
    await vi.waitFor(() => {
      expect(events).toContainEqual({ type: 'reset' });
    });
  });

  it('notifies close listeners exactly once', () => {
    const { port1, port2 } = new MessageChannel();
    const channel = new NodeFsChannel(port1);
    const closes: number[] = [];
    channel.onClose(() => closes.push(1));

    channel.close();
    channel.close();
    port2.close();

    expect(closes).toHaveLength(1);
  });
});
