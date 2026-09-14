import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentChannelClient } from '@taucad/agent-host/channel-client';
import type { AgentChannelClient } from '@taucad/agent-host/channel-client';
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
      workspaces
        .splice(0)
        .map(async (root) => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })),
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
      config: { agent: { kind: 'acp', id: agentId }, systemPrompt: 'You are Tau.', toolChoice: 'auto' },
    });

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
      frame({ type: 'concern', concern: 'agentHost', context: { workspaceRoot, nativeTrustFile: '/trust/widget' } }, [
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
        requestRuntimePort: vi.fn(async () => ({ port: runtimePort, release: vi.fn() })),
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
     * secret, and a grant of the four read-only tools. */
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
    const client = connect(host, workspaceRoot);

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
        model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
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
    const unavailable: Array<{ readonly reason: string; readonly missing: readonly string[] }> = [];
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
    const git = execFileSync('which', ['git'], { encoding: 'utf8', env: searchPath }).trim();
    const gitLfs = execFileSync('which', ['git-lfs'], { encoding: 'utf8', env: searchPath }).trim();
    process.env['PATH'] = '';
    try {
      const bundled = await configuredHost(
        {},
        {
          gitExecutable: git,
          gitLfsExecutable: gitLfs,
          onRevisionsUnavailable: (_root, event) => {
            unavailable.push(event);
          },
        },
      );
      connect(bundled.host, bundled.workspaceRoot);
      await expect.poll(() => existsSync(join(bundled.workspaceRoot, '.git')), { timeout: 10_000 }).toBe(true);
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
        model: { id: 'fixture-model', providerKind: 'vertexai', contextWindow: 200_000 },
      },
    });

    /* A direct turn publishes the live root under its own run id; registering
       it again would put the project's own context on a turn's lifetime. */
    expect(runtimeContext).not.toHaveBeenCalled();
  }, 20_000);

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
    host.handleMessage(
      frame({ type: 'concern', concern: 'agentHost', context: { workspaceRoot, nativeTrustFile: '/trust/widget' } }, [
        port,
      ]),
    );

    expect(log).toHaveBeenCalledWith('agent-host.not-configured', { workspaceRoot });
    expect(port.close).toHaveBeenCalled();
  });
});
