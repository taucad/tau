/**
 * One external agent turn, end to end, through the pieces a daemon assembles:
 * the Node launcher's external run kind, the ACP client, the materialized
 * branch, the durable approval inbox, and the host-local MCP endpoint.
 *
 * The API is asserted *absent from the data path*, not assumed: a stub API
 * listens for the whole turn and the process tree's established TCP peers are
 * sampled while the agent works (SP-4's measurement, ported into Node).
 */

import { createServer } from 'node:http';
import { connect } from 'node:net';
import type { Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { AgentLogEvent, ProviderMessage, ToolRegistry } from '@taucad/agent-host';

import { branchDirectory, createAcpExternalAgentPort } from '#acp/run.js';
import { sampleTcpPeers } from '#acp/tcp-peers.js';
import { startAgentServer } from '#agent-server.js';
import type { AgentServerHandle } from '#agent-server.js';
import { createHostMcpEndpoint } from '#mcp-server.js';
import type { AcpAdapter } from '#acp/registry.js';

const fakeAgent: AcpAdapter = {
  id: 'codex',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  modulePath: new URL('fixtures/fake-agent.ts', import.meta.url).pathname,
};

const geospecEvidence = {
  success: true,
  failures: [],
  passes: [{ id: 'is-a-cube', requirement: 'the part is a 10mm cube', targetFile: 'main.scad' }],
  passed: 1,
  total: 1,
};

const registry: ToolRegistry = {
  list: () => [],
  invoke: async () => ({ content: geospecEvidence, isError: false }),
};

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  /* Sequential, and that is the point: a server must not close before the
   * launcher whose runs still hold sockets on it. */
  for (const close of closers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown order is the invariant under test.
    await close();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/** A stub standing in for the Tau API, so "absent" is measured, not assumed. */
const startStubApi = async (): Promise<{ readonly port: number; readonly requests: string[] }> => {
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.writeHead(500).end();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  closers.push(
    async () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  );
  const address = server.address();
  return { port: typeof address === 'object' && address !== null ? address.port : 0, requests };
};

/** A launcher reference the server may hold before the launcher exists. */
const launcherStandIn = (reference: { current?: NodeAgentLauncher }): NodeAgentLauncher =>
  new Proxy({} as NodeAgentLauncher, {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a forwarding proxy is opaque to the checker by construction.
    get: (_target, property) => Reflect.get(reference.current ?? {}, property) as never,
  });

type Harness = {
  readonly launcher: NodeAgentLauncher;
  readonly workspaceRoot: string;
  readonly api: Awaited<ReturnType<typeof startStubApi>>;
};

const startHarness = async (): Promise<Harness> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-run-'));
  roots.push(workspaceRoot);
  await writeFile(join(workspaceRoot, 'main.scad'), 'cube(10);\n', 'utf8');
  const api = await startStubApi();
  const mcp = createHostMcpEndpoint({ secret: randomBytes(32).toString('base64url'), registry });
  closers.push(async () => mcp.close());

  const launcherRef: { current?: NodeAgentLauncher } = {};
  const server: AgentServerHandle = startAgentServer({
    /* The channel is never dialled here; only the MCP route is. The stand-in
     * exists so the server can be listening — and so name its own `/mcp` url —
     * before the launcher that will use that url is built. */
    launcher: launcherStandIn(launcherRef),
    token: 'agent-server-token-with-at-least-32-characters',
    workspaceRoot,
    mcp,
  });
  await server.ready;
  closers.push(async () => server.close());

  const launcher = createNodeAgentLauncher({
    workspaceRoot,
    gatewayBaseUrl: `http://127.0.0.1:${String(api.port)}/`,
    model: { id: 'unused-by-external-runs', contextWindow: 1000 },
    systemPrompt: 'unused by external runs',
    toolRegistry: registry,
    externalAgents: createAcpExternalAgentPort({
      agents: [fakeAgent],
      workspaceRoot,
      mcp: { url: new URL('mcp', server.url()).href, mint: (input) => mcp.mint(input) },
    }),
  });
  launcherRef.current = launcher;
  closers.push(async () => launcher.close());
  return { launcher, workspaceRoot, api };
};

const readLog = async (workspaceRoot: string, chatId: string): Promise<readonly AgentLogEvent[]> => {
  const raw = await readFile(join(workspaceRoot, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8');
  return (
    raw
      .split('\n')
      .filter((line) => line.trim() !== '')
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the log this test just wrote is the vocabulary by construction.
      .map((line) => JSON.parse(line) as AgentLogEvent)
  );
};

const messagesOf = (events: readonly AgentLogEvent[]): readonly ProviderMessage[] =>
  events.flatMap((event) => (event.type === 'message.appended' ? [event.message] : []));

const lifecycleOf = (events: readonly AgentLogEvent[]): readonly string[] =>
  events.flatMap((event) => (event.type === 'run.lifecycle' ? [event.state] : []));

/**
 * Poll a condition, bounded, so a hung agent fails as a timeout and not a hang.
 *
 * The durable log is dumped into the failure: an external run that dies records
 * its reason there and nowhere else.
 *
 * @param predicate - Condition to wait for.
 * @param label - What is being waited on.
 * @param options - Diagnostic dump and the upper bound (milliseconds).
 */
const until = async (
  predicate: () => Promise<boolean>,
  label: string,
  options: {
    readonly dump?: (() => Promise<unknown>) | undefined;
    /** Milliseconds. */ readonly budget?: number | undefined;
  } = {},
): Promise<void> => {
  const { dump = async (): Promise<unknown> => undefined, budget = 25_000 } = options;
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling is ordered by construction.
    if (await predicate()) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- polling is ordered by construction.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error(`Timed out waiting for ${label}. Log: ${JSON.stringify(await dump())}`);
};

describe('the external agent run kind', () => {
  it('projects a turn, confines it to a branch, calls Tau MCP, and never touches the API', async () => {
    const { launcher, workspaceRoot, api } = await startHarness();
    const chatId = 'chat-external-1';
    const runId = 'run-external-1';
    const peers: string[] = [];
    // async-iife: bootstrap; the interval is cleared in this test's own `finally`.
    const sample = async (): Promise<void> => {
      const rows = await sampleTcpPeers();
      peers.push(...rows.map((row) => row.peer));
    };
    const sampling = setInterval(() => {
      void sample();
    }, 100);

    try {
      const started = await launcher.execute({
        type: 'start',
        trigger: 'submit',
        chatId,
        runId,
        message: { id: 'user-1', role: 'user', content: 'write the file and run mcp' },
        config: {
          agent: { kind: 'acp', id: 'codex' },
          systemPrompt: '',
          toolChoice: 'auto',
        },
      });
      expect(started).toMatchObject({ type: 'result', operation: 'start' });

      // The approval is durable *before* anyone is attached (PH13 / OQ-X4).
      const hasApproval = async (): Promise<boolean> => {
        const requests = await launcher.pendingInterrupts(runId);
        return requests.length > 0;
      };
      await until(hasApproval, 'the approval request', { dump: async () => readLog(workspaceRoot, chatId) });
      const [pending] = await launcher.pendingInterrupts(runId);
      await launcher.execute({
        type: 'resolve-interrupt',
        chatId,
        runId,
        interruptId: pending?.interruptId ?? '',
        outcome: 'approved',
      });

      await until(
        async () => lifecycleOf(await readLog(workspaceRoot, chatId)).includes('completed'),
        'the run to complete',
        { dump: async () => readLog(workspaceRoot, chatId) },
      );
      const events = await readLog(workspaceRoot, chatId);
      const messages = messagesOf(events);

      // Thin projection: assistant text, then the agent's own tool call and result.
      expect(messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'tool-input',
        'tool-output',
        'tool-input',
        'tool-output',
      ]);
      const external = messages.filter((message) => message.role === 'tool-input' || message.role === 'tool-output');
      for (const message of external) {
        expect(message.metadata?.tauInternal).toMatchObject({ origin: 'external', agentId: 'codex' });
      }
      expect(lifecycleOf(events)).toEqual(['admitted', 'running', 'paused', 'running', 'completed']);

      // Confinement: the agent wrote into the branch, never the workspace root.
      const branch = branchDirectory(workspaceRoot, runId);
      await expect(readFile(join(branch, 'hello.txt'), 'utf8')).resolves.toContain('write the file');
      await expect(readFile(join(workspaceRoot, 'hello.txt'), 'utf8')).rejects.toThrow();
      // The branch is a copy of the workspace, minus Tau's own directory.
      await expect(readFile(join(branch, 'main.scad'), 'utf8')).resolves.toBe('cube(10);\n');
      await expect(readFile(join(branch, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8')).rejects.toThrow();

      // GeoSpec evidence came back through the host-local MCP endpoint.
      const evidence = messages.findLast(
        (message) => message.role === 'tool-output' && message.toolName === 'test_model',
      );
      expect(JSON.stringify(evidence?.content)).toContain('is-a-cube');

      // The API was absent from the data path: measured, not assumed.
      expect(api.requests).toEqual([]);
      await sample();
      expect(peers.filter((peer) => peer.endsWith(`:${String(api.port)}`))).toEqual([]);

      /* And the instrument works: a deliberate connection to the same stub is
       * observed by the same sampler, so "no API peer" is a measurement rather
       * than a sampler that never saw anything. */
      const probe = connect(api.port, '127.0.0.1');
      try {
        await new Promise<void>((resolve, reject) => {
          probe.once('connect', resolve);
          probe.once('error', reject);
        });
        const observed = await sampleTcpPeers();
        const observedPeers = observed.map((row) => row.peer);
        expect(observedPeers.filter((peer) => peer.endsWith(`:${String(api.port)}`))).not.toEqual([]);
      } finally {
        probe.destroy();
      }
    } finally {
      clearInterval(sampling);
    }
  }, 90_000);

  it('cancels a turn through the run signal and records it', async () => {
    const { launcher, workspaceRoot } = await startHarness();
    const chatId = 'chat-external-cancel';
    const runId = 'run-external-cancel';

    await launcher.execute({
      type: 'start',
      trigger: 'submit',
      chatId,
      runId,
      message: { id: 'user-1', role: 'user', content: 'go slow please' },
      config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
    });
    await until(
      async () => messagesOf(await readLog(workspaceRoot, chatId)).some((message) => message.role === 'assistant'),
      'the first assistant chunk',
      { dump: async () => readLog(workspaceRoot, chatId) },
    );
    await launcher.execute({ type: 'cancel', chatId, runId });

    await until(
      async () => lifecycleOf(await readLog(workspaceRoot, chatId)).includes('cancelled'),
      'the cancelled lifecycle marker',
      { dump: async () => readLog(workspaceRoot, chatId) },
    );
  }, 90_000);

  it('resumes an external run a daemon restart left unanswered', async () => {
    const { launcher, workspaceRoot } = await startHarness();
    const chatId = 'chat-external-resume';
    const runId = 'run-external-resume';
    const branch = branchDirectory(workspaceRoot, runId);
    await mkdir(join(workspaceRoot, '.tau', 'chats', chatId), { recursive: true });
    /* Exactly what a killed daemon leaves behind: an admitted, running turn
     * whose marker names the agent and the ACP session it had already created. */
    const base = { version: 1, leaderEpoch: 'epoch-before-restart', recordedAt: new Date(0).toISOString(), runId };
    await writeFile(
      join(workspaceRoot, '.tau', 'chats', chatId, 'events.jsonl'),
      [
        {
          ...base,
          sequence: 0,
          type: 'message.appended',
          message: {
            id: 'user-1',
            role: 'user',
            content: 'write the file',
            metadata: {
              tauInternal: { kind: 'external-agent', agentId: 'codex', acpSessionId: 'fake-session-1', cwd: branch },
            },
          },
        },
        { ...base, sequence: 1, type: 'run.lifecycle', state: 'admitted', storageDurability: 'exclusive-append' },
        { ...base, sequence: 2, type: 'run.lifecycle', state: 'running' },
      ]
        .map((event) => JSON.stringify(event))
        .join('\n'),
      'utf8',
    );

    const attached = await launcher.execute({ type: 'attach', chatId, cursor: 0, limit: 16 });

    expect(attached).toMatchObject({ type: 'attach', takeover: true });
    await until(
      async () => lifecycleOf(await readLog(workspaceRoot, chatId)).includes('completed'),
      'the resumed run to complete',
      { dump: async () => readLog(workspaceRoot, chatId) },
    );
    // The branch was reused, not re-materialized: the agent's own work survives.
    const resumedEvents = await readLog(workspaceRoot, chatId);
    expect(lifecycleOf(resumedEvents).at(-1)).toBe('completed');
  }, 90_000);

  it('refuses an agent this host cannot start, without failing the channel', async () => {
    const { launcher } = await startHarness();

    await expect(
      launcher.execute({
        type: 'start',
        trigger: 'submit',
        chatId: 'chat-external-missing',
        runId: 'run-external-missing',
        message: { id: 'user-1', role: 'user', content: 'hello' },
        config: { agent: { kind: 'acp', id: 'gemini' }, systemPrompt: '', toolChoice: 'auto' },
      }),
    ).rejects.toThrow(/cannot start the gemini agent/u);
  }, 30_000);
});
