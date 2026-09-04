import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';

import { createServicesHost } from '#tau/services-host.impl.js';
import type { ServicesHostOptions, UtilityMessage, UtilityPort } from '#tau/services-host.impl.js';

const homeRoot = '/Users/tester/Library/Application Support/Tau/home';

const stubPort = () => ({
  postMessage: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  start: vi.fn(),
  close: vi.fn(),
});

const hostHarness = (overrides: Partial<ServicesHostOptions> = {}) => {
  const serve = vi.fn(() => () => undefined);
  const log = vi.fn();
  return {
    serve,
    log,
    host: createServicesHost({
      log,
      serve: serve as unknown as ServicesHostOptions['serve'],
      ...overrides,
    }),
  };
};

const frame = (
  data: unknown,
  ports: Array<ReturnType<typeof stubPort>> | readonly UtilityPort[] = [],
): UtilityMessage => ({ data, ports }) as unknown as UtilityMessage;

describe('createServicesHost — root admission', () => {
  it('trusts nothing until main sends the admitted set', () => {
    const { host } = hostHarness();
    expect(host.isTrustedRoot(homeRoot)).toBe(false);
  });

  it('trusts an admitted root and its descendants, and nothing beside them', () => {
    const { host } = hostHarness();
    host.handleMessage(frame({ type: 'allowRoots', roots: [homeRoot] }));
    expect(host.isTrustedRoot(homeRoot)).toBe(true);
    expect(host.isTrustedRoot(`${homeRoot}/widget`)).toBe(true);
    expect(host.isTrustedRoot(`${homeRoot}-evil`)).toBe(false);
    expect(host.isTrustedRoot('/')).toBe(false);
    expect(host.isTrustedRoot('relative/path')).toBe(false);
  });

  it('replaces the admitted set rather than accumulating it', () => {
    const { host } = hostHarness();
    host.handleMessage(frame({ type: 'allowRoots', roots: [homeRoot] }));
    host.handleMessage(frame({ type: 'allowRoots', roots: ['/tmp/picked'] }));
    expect(host.isTrustedRoot(homeRoot)).toBe(false);
    expect(host.isTrustedRoot('/tmp/picked')).toBe(true);
  });
});

describe('createServicesHost — concern ports', () => {
  it('serves the node filesystem over the transferred port, gated by the admitted set', () => {
    const { host, serve } = hostHarness();
    host.handleMessage(frame({ type: 'allowRoots', roots: [homeRoot] }));
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [port]));

    expect(serve).toHaveBeenCalledTimes(1);
    const [, options] = serve.mock.calls[0] as unknown as [unknown, { allowRoot: (root: string) => boolean }];
    expect(options.allowRoot(`${homeRoot}/widget`)).toBe(true);
    expect(options.allowRoot('/etc')).toBe(false);
    expect(port.start).toHaveBeenCalled();
  });

  it('closes a port for a concern it does not serve', () => {
    const { host, serve } = hostHarness();
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'unknown' }, [port]));
    expect(serve).not.toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it('ignores a concern frame that carries no port', () => {
    const { host, serve } = hostHarness();
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }));
    expect(serve).not.toHaveBeenCalled();
  });
});

describe('createServicesHost — agent host configuration', () => {
  const config = {
    gatewayBaseUrl: 'http://localhost:4000/v1/llm',
    model: { id: 'openai-gpt-5.6-luna', contextWindow: 400_000 },
    systemPrompt: 'You are Tau.',
  };

  it('stores the frame rather than constructing a host', () => {
    /* Nothing is launched by configuration alone: a launcher is scoped to one
     * workspace root, and no root is named until a connection arrives. */
    const { host, log } = hostHarness();
    host.handleMessage(frame({ type: 'agentHost', config }));

    expect(host.agentHostConfig()).toEqual(config);
    expect(log).toHaveBeenCalledWith('agent-host-config-received', { model: 'openai-gpt-5.6-luna' });
    /* The superseded accessor and its `createAgentHost` seam are gone. */
    expect(host).not.toHaveProperty('agentHost');
  });

  it('stays unconfigured until main sends the frame', () => {
    const { host } = hostHarness();
    expect(host.agentHostConfig()).toBeUndefined();
  });

  it('keeps tracking the credential main pushes in, for the launcher that will read it', () => {
    const { host, log } = hostHarness();
    host.handleMessage(frame({ type: 'authToken', token: 'first' }));
    expect(log).toHaveBeenLastCalledWith('credential-updated', { present: true });
    host.handleMessage(frame({ type: 'authToken', token: undefined }));
    expect(log).toHaveBeenLastCalledWith('credential-updated', { present: false });
  });
});

/* ------------------------------------------------------------------------ */

/**
 * Launcher 2 over a real workspace, driven by the real `serveAgentChannel` and
 * the first-party client — no stub between them, because the thing worth
 * proving is that this utility's binding is the daemon's binding.
 */
describe('createServicesHost — the agentHost concern (launcher 2)', () => {
  const workspaces: string[] = [];
  const clients: AgentChannelClient[] = [];
  const channels: MessageChannel[] = [];

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }
    for (const channel of channels.splice(0)) {
      channel.port1.close();
      channel.port2.close();
    }
    await Promise.all(workspaces.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
  });

  const config = {
    gatewayBaseUrl: 'http://localhost:4000/v1/llm',
    model: { id: 'openai-gpt-5.6-luna', contextWindow: 400_000 },
    systemPrompt: 'You are Tau.',
  };

  /** A configured host with one real, granted workspace directory. */
  const configuredHost = async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-'));
    workspaces.push(workspaceRoot);
    const harness = hostHarness();
    harness.host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot] }));
    harness.host.handleMessage(frame({ type: 'agentHost', config }));
    return { ...harness, workspaceRoot };
  };

  /**
   * Hand the host one leg of a `worker_threads` channel and dial the other.
   *
   * `MessagePort` there speaks `on/off/start/close` exactly as Electron's
   * `MessagePortMain` does, which is why one binding spans both.
   */
  const connect = (host: ReturnType<typeof hostHarness>['host'], workspaceRoot: string): AgentChannelClient => {
    const channel = new MessageChannel();
    channels.push(channel);
    host.handleMessage(
      frame({ type: 'concern', concern: 'agentHost', context: { workspaceRoot } }, [
        channel.port1 as unknown as UtilityPort,
      ]),
    );
    const client = createAgentChannelClient(channel.port2 as unknown as Parameters<typeof createAgentChannelClient>[0]);
    clients.push(client);
    return client;
  };

  it('answers the T0 vocabulary over the transferred port', async () => {
    const { host, workspaceRoot } = await configuredHost();
    const client = connect(host, workspaceRoot);

    /* An empty workspace has no `.tau/chats/<id>/events.jsonl`, so the honest
     * answer is an empty batch rather than a failure. */
    await expect(client.execute({ type: 'tail', chatId: 'chat-1', cursor: 0, limit: 8 })).resolves.toEqual({
      type: 'tail',
      chatId: 'chat-1',
      batch: { cursor: 0, nextCursor: 0, endCursor: 0, events: [] },
    });
  });

  it('keeps one always-on launcher per root across connections', async () => {
    const { host, log, workspaceRoot } = await configuredHost();
    connect(host, workspaceRoot);
    connect(host, workspaceRoot);

    const served = log.mock.calls.filter(([event]) => event === 'agent-host-served');
    expect(served).toEqual([
      ['agent-host-served', { workspaceRoot, reused: false }],
      /* A second window on the same project attaches to the run already
         executing; a second launcher would fork the durable log. */
      ['agent-host-served', { workspaceRoot, reused: true }],
    ]);
  });

  it('refuses a root the user never granted, and closes the port', async () => {
    const { host, log } = await configuredHost();
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'agentHost', context: { workspaceRoot: '/etc' } }, [port]));

    expect(log).toHaveBeenCalledWith('agent-host.untrusted-root', { workspaceRoot: '/etc' });
    expect(port.close).toHaveBeenCalled();
  });

  it('refuses a connection that names no root at all', async () => {
    const { host, log } = await configuredHost();
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'agentHost' }, [port]));

    expect(log).toHaveBeenCalledWith('agent-host.untrusted-root', { workspaceRoot: undefined });
    expect(port.close).toHaveBeenCalled();
  });

  it('refuses a connection before main has sent the configuration', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-'));
    workspaces.push(workspaceRoot);
    const { host, log } = hostHarness();
    host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot] }));
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'agentHost', context: { workspaceRoot } }, [port]));

    expect(log).toHaveBeenCalledWith('agent-host.not-configured', { workspaceRoot });
    expect(port.close).toHaveBeenCalled();
  });
});
