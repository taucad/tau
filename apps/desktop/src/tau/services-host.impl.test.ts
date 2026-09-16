import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
import { NodeFsChannel, NodeFsProviderClient } from '@taucad/filesystem/backend';
import { acquireNodeAuthorityWriter, toNodeFsPort } from '@taucad/filesystem/backend/node';
import type * as TauHost from '@taucad/host';
import type * as AgentTools from '@taucad/host/agent-tools';
import type * as RuntimeClient from '@taucad/runtime/client';

import { createServicesHost } from '#tau/services-host.impl.js';
import type { AgentHostConfig, ServicesHostOptions, UtilityMessage, UtilityPort } from '#tau/services-host.impl.js';

/**
 * Every `createAcpExternalAgentPort` call the utility makes, in order.
 *
 * The MCP wiring is invisible from the channel — it only shows up in what the
 * external-agent port was handed — so the real factory is wrapped rather than
 * replaced: every other assertion in this file still exercises the genuine
 * port, including its "cannot start the codex agent" refusal.
 */
const acpPortCalls = vi.hoisted(() => [] as Array<Parameters<typeof TauHost.createAcpExternalAgentPort>[0]>);
const toolRegistryCalls = vi.hoisted(() => [] as Array<Parameters<typeof AgentTools.createHostToolRegistry>[0]>);
const runtimeClientCalls = vi.hoisted(() => [] as Array<ReturnType<typeof RuntimeClient.createRuntimeClient>>);

vi.mock('@taucad/host', async (importOriginal) => {
  const actual = await importOriginal<typeof TauHost>();
  return {
    ...actual,
    createAcpExternalAgentPort: (options: Parameters<typeof TauHost.createAcpExternalAgentPort>[0]) => {
      acpPortCalls.push(options);
      return actual.createAcpExternalAgentPort(options);
    },
  };
});

vi.mock('@taucad/host/agent-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentTools>();
  return {
    ...actual,
    createHostToolRegistry: (options: Parameters<typeof actual.createHostToolRegistry>[0]) => {
      toolRegistryCalls.push(options);
      return actual.createHostToolRegistry(options);
    },
  };
});

vi.mock('@taucad/runtime/client', async (importOriginal) => {
  const actual = await importOriginal<typeof RuntimeClient>();
  return {
    ...actual,
    createRuntimeClient: (...args: Parameters<typeof actual.createRuntimeClient>) => {
      const client = actual.createRuntimeClient(...args);
      vi.spyOn(client, 'terminate');
      runtimeClientCalls.push(client);
      return client;
    },
  };
});

const homeRoot = '/Users/tester/Library/Application Support/Tau/home';

const stubPort = () => ({
  postMessage: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  start: vi.fn(),
  close: vi.fn(),
});

const hostHarness = (overrides: Partial<ServicesHostOptions> = {}) => {
  const serve = vi.fn(() => async () => undefined);
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

  it('serves a main-only runtime filesystem as an exact rooted authority client', async () => {
    const bridge = { emit: vi.fn(), dispose: vi.fn() };
    type ServeRuntimeFileSystem = NonNullable<ServicesHostOptions['serveRuntimeFileSystem']>;
    const serveRuntimeFileSystem = vi.fn(
      (_handlers: Parameters<ServeRuntimeFileSystem>[0], _port: Parameters<ServeRuntimeFileSystem>[1]) => bridge,
    );
    const { host } = hostHarness({
      authorityDirectory: '/tmp/tau-desktop-authority-fixture',
      serveRuntimeFileSystem: serveRuntimeFileSystem as ServicesHostOptions['serveRuntimeFileSystem'],
    });
    host.handleMessage(frame({ type: 'allowRoots', roots: [homeRoot] }));
    const port = stubPort();

    host.handleMessage(
      frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: `${homeRoot}/widget` } }, [
        port,
      ]),
    );

    expect(serveRuntimeFileSystem).toHaveBeenCalledOnce();
    expect(serveRuntimeFileSystem.mock.calls[0]?.[0]).toMatchObject({ root: `${homeRoot}/widget` });
    expect(serveRuntimeFileSystem.mock.calls[0]?.[1]).toBe(port);
    await host.quiesce();
    expect(bridge.dispose).toHaveBeenCalledOnce();
    host.dispose();
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

describe('createServicesHost — filesystem authority lifetime', () => {
  const createHeldRuntimeWrite = async (outcome: 'success' | 'failure') => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-runtime-drain-'));
    const root = join(sandbox, 'project');
    const authorityDirectory = join(sandbox, 'authority');
    await Promise.all([mkdir(root), mkdir(authorityDirectory)]);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    type ServeRuntimeFileSystem = NonNullable<ServicesHostOptions['serveRuntimeFileSystem']>;
    let capturedHandlers: Parameters<ServeRuntimeFileSystem>[0] | undefined;
    const bridge = { emit: vi.fn(), dispose: vi.fn() };
    const host = createServicesHost({
      authorityDirectory,
      log: vi.fn(),
      serveRuntimeFileSystem: (handlers, port) => {
        void port;
        capturedHandlers = handlers;
        vi.spyOn(handlers, 'writeFile').mockImplementation(async (path, data) => {
          entered.resolve();
          await release.promise;
          if (outcome === 'failure') {
            throw new Error('held runtime write failed');
          }
          await writeFile(join(root, path), data);
        });
        return bridge;
      },
    });
    host.handleMessage(frame({ type: 'allowRoots', roots: [root] }));
    host.handleMessage(
      frame({ type: 'concern', concern: 'runtimeFileSystem', context: { workspaceRoot: root } }, [stubPort()]),
    );
    if (capturedHandlers === undefined) {
      throw new Error('The runtime filesystem concern was not served.');
    }
    return { bridge, entered, handlers: capturedHandlers, host, release, root, sandbox };
  };

  it('waits for a dispatched runtime bridge success reply before quiescing', async () => {
    const fixture = await createHeldRuntimeWrite('success');
    const write = fixture.handlers.writeFile('accepted.txt', 'settled');
    await fixture.entered.promise;
    const quiescence = fixture.host.quiesce();

    const pending = async (): Promise<'pending'> => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      return 'pending';
    };
    await expect(Promise.race([quiescence, pending()])).resolves.toBe('pending');
    fixture.release.resolve();
    await expect(write).resolves.toBeUndefined();
    await quiescence;
    await expect(readFile(join(fixture.root, 'accepted.txt'), 'utf8')).resolves.toBe('settled');

    fixture.host.dispose();
    await rm(fixture.sandbox, { recursive: true, force: true });
  });

  it('preserves a dispatched runtime bridge failure reply before quiescing', async () => {
    const fixture = await createHeldRuntimeWrite('failure');
    const write = fixture.handlers.writeFile('accepted.txt', 'settled');
    await fixture.entered.promise;
    const quiescence = fixture.host.quiesce();

    fixture.release.resolve();
    await expect(write).rejects.toThrow('held runtime write failed');
    await expect(quiescence).resolves.toBeUndefined();

    fixture.host.dispose();
    await rm(fixture.sandbox, { recursive: true, force: true });
  });

  it('hard-closes a held runtime bridge operation during forced disposal', async () => {
    const fixture = await createHeldRuntimeWrite('success');
    const write = fixture.handlers.writeFile('accepted.txt', 'settled');
    await fixture.entered.promise;

    fixture.host.dispose();
    expect(fixture.bridge.dispose).toHaveBeenCalledOnce();
    fixture.release.resolve();
    await expect(write).resolves.toBeUndefined();

    await rm(fixture.sandbox, { recursive: true, force: true });
  });

  it('shares one real checked-write owner across overlapping rooted views and drains it on quiesce', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-authority-'));
    const root = join(sandbox, 'home');
    const project = join(root, 'project');
    const authorityDirectory = join(sandbox, 'authority');
    await Promise.all([mkdir(project, { recursive: true }), mkdir(authorityDirectory)]);
    await writeFile(join(project, 'value.txt'), 'old');
    const host = createServicesHost({ authorityDirectory, log: vi.fn() });
    const firstPorts = new MessageChannel();
    const secondPorts = new MessageChannel();
    host.handleMessage(frame({ type: 'allowRoots', roots: [root] }));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [firstPorts.port2 as unknown as UtilityPort]));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [secondPorts.port2 as unknown as UtilityPort]));
    const firstChannel = new NodeFsChannel(toNodeFsPort(firstPorts.port1 as unknown as UtilityPort));
    const secondChannel = new NodeFsChannel(toNodeFsPort(secondPorts.port1 as unknown as UtilityPort));
    const parentView = new NodeFsProviderClient(firstChannel, root);
    const projectView = new NodeFsProviderClient(secondChannel, project);

    try {
      const [first, second] = await Promise.all([
        parentView.writeFileChecked({
          path: 'project/value.txt',
          data: 'first',
          preconditions: [{ path: 'project/value.txt', expected: 'old' }],
        }),
        projectView.writeFileChecked({
          path: 'value.txt',
          data: 'second',
          preconditions: [{ path: 'value.txt', expected: 'old' }],
        }),
      ]);
      expect([first.status, second.status].sort()).toEqual(['applied', 'conflict']);

      const quiescence = host.quiesce();
      expect(host.quiesce()).toBe(quiescence);
      await quiescence;
      expect(existsSync(join(authorityDirectory, 'authority.writer.lock'))).toBe(true);
      expect(existsSync(join(root, 'authority.writer.lock'))).toBe(false);
    } finally {
      firstChannel.close();
      secondChannel.close();
      host.dispose();
      firstPorts.port2.close();
      secondPorts.port2.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('rejects a broad authored root that encloses authority metadata before applying its checked write', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-authority-overlap-'));
    const authorityDirectory = join(sandbox, 'filesystem-authority');
    const contentDirectory = join(sandbox, 'project');
    await Promise.all([mkdir(authorityDirectory), mkdir(contentDirectory)]);
    const target = join(contentDirectory, 'value.txt');
    await writeFile(target, 'old');
    const host = createServicesHost({ authorityDirectory, log: vi.fn() });
    const ports = new MessageChannel();
    host.handleMessage(frame({ type: 'allowRoots', roots: [sandbox] }));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [ports.port2 as unknown as UtilityPort]));
    const channel = new NodeFsChannel(toNodeFsPort(ports.port1 as unknown as UtilityPort));
    const broadView = new NodeFsProviderClient(channel, sandbox);

    try {
      await expect(
        broadView.writeFileChecked({
          path: 'project/value.txt',
          data: 'new',
          preconditions: [{ path: 'project/value.txt', expected: 'old' }],
        }),
      ).rejects.toMatchObject({ code: 'AUTHORITY_ROOT_OVERLAP', applicationState: 'known-not-applied' });
      await expect(readFile(target, 'utf8')).resolves.toBe('old');
      expect(existsSync(join(authorityDirectory, 'authority.writer.lock'))).toBe(false);
    } finally {
      channel.close();
      await host.quiesce();
      host.dispose();
      ports.port2.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('refuses physical and symlinked broad roots before reading, listing, stating, or watching authority metadata', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-authority-private-'));
    const alias = `${sandbox}-alias`;
    const authorityDirectory = join(sandbox, 'filesystem-authority');
    await mkdir(authorityDirectory);
    await symlink(sandbox, alias);
    const writer = await acquireNodeAuthorityWriter({ authorityRoot: authorityDirectory });
    await writer.release();
    expect(existsSync(join(authorityDirectory, 'authority.writer.lock'))).toBe(true);
    const host = createServicesHost({ authorityDirectory, log: vi.fn() });
    const connections = [new MessageChannel(), new MessageChannel()];
    host.handleMessage(frame({ type: 'allowRoots', roots: [sandbox, alias] }));
    for (const connection of connections) {
      host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [connection.port2 as unknown as UtilityPort]));
    }
    const channels = connections.map(({ port1 }) => new NodeFsChannel(toNodeFsPort(port1 as unknown as UtilityPort)));
    const broadViews = [new NodeFsProviderClient(channels[0]!, sandbox), new NodeFsProviderClient(channels[1]!, alias)];

    try {
      await Promise.all(
        broadViews.map(async (broadView) => {
          const metadataPath = 'filesystem-authority/authority.writer.lock';
          await Promise.all([
            expect(broadView.readFile(metadataPath)).rejects.toMatchObject({ code: 'AUTHORITY_ROOT_OVERLAP' }),
            expect(broadView.readdir('filesystem-authority')).rejects.toMatchObject({
              code: 'AUTHORITY_ROOT_OVERLAP',
            }),
            expect(broadView.stat(metadataPath)).rejects.toMatchObject({ code: 'AUTHORITY_ROOT_OVERLAP' }),
            expect(broadView.watch({ paths: ['filesystem-authority'] }, () => undefined)).rejects.toMatchObject({
              code: 'AUTHORITY_ROOT_OVERLAP',
            }),
          ]);
        }),
      );
    } finally {
      for (const channel of channels) {
        channel.close();
      }
      await host.quiesce();
      host.dispose();
      for (const connection of connections) {
        connection.port2.close();
      }
      await Promise.all([rm(alias, { force: true }), rm(sandbox, { recursive: true, force: true })]);
    }
  });

  it('returns OS writer ownership when an actual MessageChannel client disconnects', async () => {
    const sandbox = await mkdtemp(join(tmpdir(), 'tau-desktop-authority-detach-'));
    const root = join(sandbox, 'project');
    const authorityDirectory = join(sandbox, 'authority');
    await Promise.all([mkdir(root), mkdir(authorityDirectory)]);
    await writeFile(join(root, 'value.txt'), 'old');
    const log = vi.fn();
    const host = createServicesHost({ authorityDirectory, log });
    const ports = new MessageChannel();
    host.handleMessage(frame({ type: 'allowRoots', roots: [root] }));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [ports.port2 as unknown as UtilityPort]));
    const channel = new NodeFsChannel(toNodeFsPort(ports.port1 as unknown as UtilityPort));
    const provider = new NodeFsProviderClient(channel, root);

    try {
      await expect(
        provider.writeFileChecked({
          path: 'value.txt',
          data: 'new',
          preconditions: [{ path: 'value.txt', expected: 'old' }],
        }),
      ).resolves.toMatchObject({ status: 'applied' });
      channel.close();
      await vi.waitFor(() => {
        expect(log).toHaveBeenCalledWith('node-fs-disconnected');
      });
      await expect(acquireNodeAuthorityWriter({ authorityRoot: authorityDirectory })).rejects.toMatchObject({
        code: 'AUTHORITY_ALREADY_OWNED',
      });
      await host.quiesce();
      const replacement = await acquireNodeAuthorityWriter({ authorityRoot: authorityDirectory });
      await replacement.release();
    } finally {
      channel.close();
      await host.quiesce();
      host.dispose();
      ports.port2.close();
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('waits for every accepted disposer, reports failure, and refuses new concerns', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const pending = [first.promise, second.promise];
    const quiesced = vi.fn();
    const serve = vi.fn(() => {
      const settlement = pending.shift()!;
      return async () => settlement;
    });
    const host = createServicesHost({
      log: vi.fn(),
      quiesced,
      serve: serve as unknown as ServicesHostOptions['serve'],
    });
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [stubPort()]));
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [stubPort()]));
    host.handleMessage(frame({ type: 'quiesce' }));
    const quiescence = host.quiesce();
    expect(host.quiesce()).toBe(quiescence);

    first.reject(new Error('first disposer failed'));
    await Promise.resolve();
    expect(quiesced).not.toHaveBeenCalled();
    const refused = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [refused]));
    expect(refused.close).toHaveBeenCalledOnce();
    second.resolve();

    await expect(quiescence).rejects.toThrow(/could not quiesce every accepted operation/u);
    await vi.waitFor(() => {
      expect(quiesced).toHaveBeenCalledWith({
        type: 'quiesce-failed',
        message: 'The services host could not quiesce every accepted operation.',
      });
    });
    host.dispose();
  });

  it('reports forced filesystem cleanup failure and never fabricates a later graceful result', async () => {
    const cleanupFailure = new Error('forced cleanup failed');
    const log = vi.fn();
    const quiesced = vi.fn();
    const serve = vi.fn(() => async () => {
      throw cleanupFailure;
    });
    const host = createServicesHost({
      log,
      quiesced,
      serve: serve as unknown as ServicesHostOptions['serve'],
    });
    const unhandledRejections: unknown[] = [];
    const observeUnhandled = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on('unhandledRejection', observeUnhandled);

    try {
      host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [stubPort()]));
      host.dispose();
      host.handleMessage(frame({ type: 'quiesce' }));
      const quiescence = host.quiesce();
      expect(host.quiesce()).toBe(quiescence);

      await expect(quiescence).rejects.toThrow(/forcibly disposed before graceful quiescence/u);
      await vi.waitFor(() => {
        expect(log).toHaveBeenCalledWith('node-fs-dispose-failed', cleanupFailure.message);
        expect(quiesced).toHaveBeenCalledWith({
          type: 'quiesce-failed',
          message: 'The services host was forcibly disposed before graceful quiescence.',
        });
      });
      expect(quiesced).not.toHaveBeenCalledWith({ type: 'quiesced' });
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', observeUnhandled);
    }
  });

  it('keeps an already-started graceful settlement when forced disposal follows', async () => {
    const cleanup = Promise.withResolvers<void>();
    const serve = vi.fn(() => async () => cleanup.promise);
    const host = createServicesHost({
      log: vi.fn(),
      serve: serve as unknown as ServicesHostOptions['serve'],
    });
    host.handleMessage(frame({ type: 'concern', concern: 'nodeFs' }, [stubPort()]));

    const quiescence = host.quiesce();
    host.dispose();
    expect(host.quiesce()).toBe(quiescence);
    cleanup.resolve();

    await expect(quiescence).resolves.toBeUndefined();
  });
});

describe('createServicesHost — agent host configuration', () => {
  const config = {
    gatewayBaseUrl: 'http://localhost:4000/v1/llm',
    systemPrompt: 'You are Tau.',
    tauApiUrl: 'http://localhost:4000',
    tauWebSocketUrl: 'ws://localhost:4001',
  };

  it('stores the frame rather than constructing a host', () => {
    /* Nothing is launched by configuration alone: a launcher is scoped to one
     * workspace root, and no root is named until a connection arrives. */
    const { host, log } = hostHarness();
    host.handleMessage(frame({ type: 'agentHost', config }));

    expect(host.agentHostConfig()).toEqual(config);
    expect(log).toHaveBeenCalledWith('agent-host-config-received', {
      gatewayBaseUrl: 'http://localhost:4000/v1/llm',
      /* The utility's own witness of what main discovered; empty here because
       * this frame carries no adapters. */
      externalAgents: [],
    });
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
    expect(log).toHaveBeenLastCalledWith('credential-updated', {
      present: true,
    });
    host.handleMessage(frame({ type: 'authToken', token: undefined }));
    expect(log).toHaveBeenLastCalledWith('credential-updated', {
      present: false,
    });
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
    for (const host of hosts.splice(0)) {
      host.dispose();
    }
    acpPortCalls.length = 0;
    toolRegistryCalls.length = 0;
    runtimeClientCalls.length = 0;
    /* `dispose` closes each launcher without waiting, and a revision store that
       is still finishing its own creation holds the directory: retry rather than
       fail the test on the teardown of a host that is already going away. */
    await Promise.all(
      workspaces.splice(0).map(async (root) =>
        rm(root, {
          recursive: true,
          force: true,
          maxRetries: 20,
          retryDelay: 50,
        }),
      ),
    );
  });

  /** Hosts to dispose, so the utility's loopback listener never outlives a test. */
  const hosts: Array<ReturnType<typeof createServicesHost>> = [];

  const config = {
    gatewayBaseUrl: 'http://localhost:4000/v1/llm',
    systemPrompt: 'You are Tau.',
    tauApiUrl: 'http://localhost:4000',
    tauWebSocketUrl: 'ws://localhost:4001',
  };

  /** A configured host with one real, granted workspace directory. */
  const configuredHost = async (
    overrides: Partial<AgentHostConfig> = {},
    hostOverrides: Partial<ServicesHostOptions> = {},
  ) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-'));
    workspaces.push(workspaceRoot);
    const harness = hostHarness(hostOverrides);
    hosts.push(harness.host);
    harness.host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot] }));
    harness.host.handleMessage(frame({ type: 'agentHost', config: { ...config, ...overrides } }));
    return { ...harness, workspaceRoot };
  };

  /** One external-agent turn, admitted the way the renderer admits it. */
  const startExternal = async (client: AgentChannelClient, agentId: string): Promise<unknown> =>
    client.execute({
      type: 'start',
      trigger: 'submit',
      chatId: `chat-${agentId}`,
      runId: `run-${agentId}`,
      message: { id: 'message-1', role: 'user', content: 'Model a bracket.' },
      config: {
        agent: { kind: 'acp', id: agentId },
        systemPrompt: 'You are Tau.',
        toolChoice: 'auto',
      },
    });

  /**
   * Hand the host one leg of a `worker_threads` channel and dial the other.
   *
   * `MessagePort` there speaks `on/off/start/close` exactly as Electron's
   * `MessagePortMain` does, which is why one binding spans both.
   */
  const connect = (
    host: ReturnType<typeof hostHarness>['host'],
    workspaceRoot: string,
    projectId = 'proj_test',
  ): AgentChannelClient => {
    const channel = new MessageChannel();
    channels.push(channel);
    host.handleMessage(
      frame(
        {
          type: 'concern',
          concern: 'agentHost',
          context: {
            workspaceRoot,
            nativeTrustFile: '/trust/widget',
            projectId,
          },
        },
        [channel.port1 as unknown as UtilityPort],
      ),
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

  it('terminates a connected runtime client when its main-owned port closes', async () => {
    let closePort: (() => void) | undefined;
    const terminate = vi.fn();
    const runtimePort = {
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'close') {
          closePort = listener;
        }
      }),
      off: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
      postMessage: vi.fn(),
    };
    const { host, workspaceRoot } = await configuredHost(
      {},
      {
        requestRuntimePort: vi.fn(async () => ({
          port: runtimePort,
          release: vi.fn(),
        })),
      },
    );
    connect(host, workspaceRoot);
    const registry = toolRegistryCalls.at(-1)!;
    await registry.runtimeClient!(workspaceRoot);
    vi.mocked(runtimeClientCalls[0]!.terminate).mockImplementation(terminate);

    closePort!();

    await vi.waitFor(() => {
      expect(terminate).toHaveBeenCalledOnce();
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

  it('awaits one project release without stopping another launcher', async () => {
    const released = vi.fn();
    const { host, log, workspaceRoot } = await configuredHost({}, { agentHostReleased: released });
    const otherRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-other-'));
    workspaces.push(otherRoot);
    host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot, otherRoot] }));
    const projectA = connect(host, workspaceRoot, 'project-a');
    connect(host, otherRoot, 'project-b');
    projectA.close();

    host.handleMessage(
      frame({
        type: 'agent-host-release',
        requestId: 'release-a',
        workspaceRoot,
        projectId: 'project-a',
      }),
    );
    await vi.waitFor(
      () => {
        expect(released).toHaveBeenCalledWith('release-a');
      },
      { timeout: 10_000 },
    );

    connect(host, otherRoot, 'project-b');
    connect(host, workspaceRoot, 'project-a');
    expect(log.mock.calls.filter(([event]) => event === 'agent-host-served').slice(-2)).toEqual([
      ['agent-host-served', { workspaceRoot: otherRoot, reused: true }],
      ['agent-host-served', { workspaceRoot, reused: false }],
    ]);
  });

  it('starts no external agents when main discovered none', async () => {
    /* The honest empty list, not a refusal: a machine without the pinned
     * adapters — or without their CLIs — is simply a Tau-runs-only host. */
    const { host, workspaceRoot } = await configuredHost();
    await expect(startExternal(connect(host, workspaceRoot), 'codex')).rejects.toThrow(/runs no acp agents/u);
  });

  it('wires the agents main discovered into launcher 2, and only those', async () => {
    const { host, workspaceRoot } = await configuredHost({
      externalAgents: [
        {
          id: 'claude',
          displayName: 'Claude Code',
          package: '@agentclientprotocol/claude-agent-acp',
          version: '0.70.0',
          cli: 'claude',
          configEnv: ['CLAUDE_CONFIG_DIR'],
          modulePath: '/opt/adapters/claude-agent-acp.mjs',
        },
      ],
    });
    const client = connect(host, workspaceRoot);

    /* The port's own inventory answers — a different refusal from the "runs no
     * acp agents" above, and the only way to reach it is a wired port whose
     * list is exactly what main discovered. */
    await expect(startExternal(client, 'codex')).rejects.toThrow(/cannot start the codex agent/u);
  });

  it('serves its own MCP endpoint to the agents it wires (V7)', async () => {
    const { host, workspaceRoot } = await configuredHost({
      externalAgents: [
        {
          id: 'codex',
          displayName: 'Codex',
          package: '@agentclientprotocol/codex-acp',
          version: '0.5.6',
          cli: 'codex',
          configEnv: ['CODEX_HOME'],
          modulePath: '/opt/adapters/codex-acp.mjs',
        },
      ],
    });
    connect(host, workspaceRoot);

    const [wired] = acpPortCalls;
    expect(wired).toBeDefined();
    /* The socket binds a tick after the connection is served, exactly as the
     * daemon's own URL resolves per run rather than at wiring time. */
    await expect.poll(() => wired!.mcp?.url ?? '').toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp\//u);
    const [skillBundle] = wired!.systemSkillBundles ?? [];
    expect(typeof skillBundle?.slug).toBe('string');
    expect(skillBundle?.files.some(({ path }) => path === 'SKILL.md')).toBe(true);
    expect(wired!.mcp?.activate).toEqual(expect.any(Function));
    /* A capability, not the channel token (VI4): a distinct prefix, a distinct
     * secret, and a grant of the four CAD tools. */
    expect(wired!.mcp?.mint({ runId: 'run-1', chatId: 'chat-1' }).token).toMatch(/^tau-mcp-host-v1\./u);

    /* The listener is real and the route reaches the endpoint: an unadmitted
     * request is refused by the capability check, not by a missing route. */
    const refused = await fetch(wired!.mcp!.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(refused.status).toBe(401);
    const unrouted = await fetch(new URL('/mcp/elsewhere', wired!.mcp!.url));
    expect(unrouted.status).toBe(404);
  });

  it('records one finalized revision per turn on launcher 2 (V17)', async () => {
    const { host, workspaceRoot } = await configuredHost();
    await writeFile(join(workspaceRoot, 'main.ts'), 'export const size = 1;\n');
    const projectId = 'proj_revision';
    const client = connect(host, workspaceRoot, projectId);

    /* The gateway is main's real URL and nothing is listening, so the turn is
       admitted and then fails. That is the point: a revision is recorded for
       every turn that *ran*, not only for one that succeeded — the writes a
       failed turn already made are exactly what would otherwise be unrecorded. */
    await client.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-revision',
      runId: 'run-revision',
      message: { id: 'message-1', role: 'user', content: 'Model a bracket.' },
      config: {
        systemPrompt: 'You are Tau.',
        toolChoice: 'auto',
        model: {
          id: 'fixture-model',
          providerKind: 'vertexai',
          contextWindow: 200_000,
        },
      },
    });

    /* Read off disk rather than through the launcher: the utility keeps its
       launchers private, and the store the revision lands in is the project's
       own — the one the next window reopens. No branch is created for the chat
       (S11): the turn attaches to the live checkout and records on `main`. */
    const head = async (): Promise<string | undefined> => {
      try {
        const reference = await readFile(join(workspaceRoot, '.git', 'refs', 'heads', 'main'), 'utf8');
        return reference.trim();
      } catch {
        return undefined;
      }
    };
    await expect.poll(head, { timeout: 10_000 }).toMatch(/^[\da-f]{40}$/u);
    const finalized = async (): Promise<unknown> => {
      const result = await client.execute({
        type: 'tail',
        chatId: 'chat-revision',
        cursor: 0,
        limit: 16,
      });
      return result.type === 'tail' ? result.batch.events.find((event) => event.type === 'turn.finalized') : undefined;
    };
    await expect.poll(finalized, { timeout: 10_000 }).toMatchObject({ type: 'turn.finalized', projectId });
    const nativeHistory = await client.execute({
      type: 'revision',
      request: { command: 'log', limit: 8 },
    });
    expect(nativeHistory).toMatchObject({
      type: 'revision',
      status: { projectId, branch: 'main' },
      result: [expect.objectContaining({ revisionNumber: 1 })],
    });
    /* The turn held a lease while it ran and the settlement retired it, so the
       next window's open sweep finds nothing of this run. */
    const leases = async (): Promise<readonly string[]> => {
      try {
        return await readdir(join(workspaceRoot, '.tau', 'runs'));
      } catch {
        return [];
      }
    };
    await expect.poll(leases, { timeout: 10_000 }).toEqual([]);
    await expect(readdir(join(workspaceRoot, '.tau', 'workspaces'))).rejects.toThrow();
  }, 20_000);

  /* Review a1 R1: the desktop performs the early named refusal too. A packaged app
   * launched from Finder has `/usr/bin:/bin:/usr/sbin:/sbin` on PATH, and
   * Homebrew's `git-lfs` is not on it. */
  it('names the binaries it is missing, and records with the ones main gives it', async () => {
    const unavailable: Array<{
      readonly reason: string;
      readonly missing: readonly string[];
    }> = [];
    const previousPath = process.env['PATH'] ?? '';
    process.env['PATH'] = '';
    try {
      const { host, workspaceRoot } = await configuredHost(
        {},
        {
          onRevisionsUnavailable: (_root, event) => {
            unavailable.push(event);
          },
        },
      );
      connect(host, workspaceRoot);
      await expect.poll(() => unavailable.length, { timeout: 10_000 }).toBe(1);
      expect(unavailable[0]?.missing).toEqual(['git', 'git-lfs']);
      expect(unavailable[0]?.reason).toContain('git-lfs');
      expect(existsSync(join(workspaceRoot, '.git'))).toBe(false);
    } finally {
      process.env['PATH'] = previousPath;
    }

    /* Environment names, not identifiers: assigned rather than spelled as keys. */
    const searchPath: NodeJS.ProcessEnv = {};
    searchPath['PATH'] = previousPath;
    const git = execFileSync('which', ['git'], {
      encoding: 'utf8',
      env: searchPath,
    }).trim();
    const gitLfs = execFileSync('which', ['git-lfs'], {
      encoding: 'utf8',
      env: searchPath,
    }).trim();
    /* The bundled layout OQ3 ships: one `git` whose own exec path carries
     * `git-lfs`, so `git lfs` resolves through it with nothing on `PATH` and
     * this host names a single binary. A system git has no such exec path,
     * hence the stand-in. */
    const bundleRoot = await mkdtemp(join(tmpdir(), 'tau-services-git-bundle-'));
    workspaces.push(bundleRoot);
    const bundledGit = join(bundleRoot, 'bundled-git');
    await writeFile(bundledGit, `#!/bin/sh\nPATH="${dirname(gitLfs)}"\nexport PATH\nexec "${git}" "$@"\n`);
    await chmod(bundledGit, 0o755);
    process.env['PATH'] = '';
    try {
      const bundled = await configuredHost(
        {},
        {
          gitExecutable: bundledGit,
          onRevisionsUnavailable: (_root, event) => {
            unavailable.push(event);
          },
        },
      );
      connect(bundled.host, bundled.workspaceRoot);
      await expect
        .poll(() => existsSync(join(bundled.workspaceRoot, '.git')), {
          timeout: 10_000,
        })
        .toBe(true);
      expect(unavailable).toHaveLength(1);
    } finally {
      process.env['PATH'] = previousPath;
    }
  }, 30_000);

  it('leaves a direct turn to the project context main already registered', async () => {
    const runtimeContext = vi.fn();
    const { host, workspaceRoot } = await configuredHost({}, { runtimeContext });
    const client = connect(host, workspaceRoot);

    await client.execute({
      type: 'start',
      trigger: 'submit',
      chatId: 'chat-direct',
      runId: 'run-direct',
      message: { id: 'message-1', role: 'user', content: 'Model a bracket.' },
      config: {
        systemPrompt: 'You are Tau.',
        toolChoice: 'auto',
        model: {
          id: 'fixture-model',
          providerKind: 'vertexai',
          contextWindow: 200_000,
        },
      },
    });

    /* A direct turn publishes the live root under its own run id; registering
       it again would put the project's own context on a turn's lifetime. */
    expect(runtimeContext).not.toHaveBeenCalled();
  }, 20_000);

  it('refuses a root the user never granted, and closes the port', async () => {
    const { host, log } = await configuredHost();
    const port = stubPort();
    host.handleMessage(
      frame(
        {
          type: 'concern',
          concern: 'agentHost',
          context: { workspaceRoot: '/etc' },
        },
        [port],
      ),
    );

    expect(log).toHaveBeenCalledWith('agent-host.untrusted-root', {
      workspaceRoot: '/etc',
    });
    expect(port.close).toHaveBeenCalled();
  });

  it('refuses a connection that names no root at all', async () => {
    const { host, log } = await configuredHost();
    const port = stubPort();
    host.handleMessage(frame({ type: 'concern', concern: 'agentHost' }, [port]));

    expect(log).toHaveBeenCalledWith('agent-host.untrusted-root', {
      workspaceRoot: undefined,
    });
    expect(port.close).toHaveBeenCalled();
  });

  it('refuses a connection before main has sent the configuration', async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-desktop-agent-'));
    workspaces.push(workspaceRoot);
    const { host, log } = hostHarness();
    host.handleMessage(frame({ type: 'allowRoots', roots: [workspaceRoot] }));
    const port = stubPort();
    host.handleMessage(
      frame(
        {
          type: 'concern',
          concern: 'agentHost',
          context: { workspaceRoot, nativeTrustFile: '/trust/widget' },
        },
        [port],
      ),
    );

    expect(log).toHaveBeenCalledWith('agent-host.not-configured', {
      workspaceRoot,
    });
    expect(port.close).toHaveBeenCalled();
  });
});
