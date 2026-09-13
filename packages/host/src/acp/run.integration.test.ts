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
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ClientSideConnection } from '@agentclientprotocol/sdk';
import type { Client, SessionConfigOption, SessionUpdate, StopReason } from '@agentclientprotocol/sdk';

import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { AgentChannelAdmissionConfig, AgentLogEvent, ProviderMessage, ToolRegistry } from '@taucad/agent-host';

import { createIsomorphicGitRevisionPort } from '@taucad/revisions';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';

import { acpCapabilityRenewalMargin, createAcpExternalAgentPort } from '#acp/run.js';
import { openAcpSession, readSessionTextFile, writeSessionTextFile } from '#acp/session.js';
import type { AcpPromptTurn } from '#acp/session.js';
import { createProjectRevisions } from '#revisions.js';
import type { TurnCheckout, TurnFinalizedEvent } from '#revisions.js';
import { spawnAcpAdapter } from '#acp/spawn.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import { sampleTcpPeers } from '#acp/tcp-peers.js';
import { startAgentServer } from '#agent-server.js';
import type { AgentServerHandle } from '#agent-server.js';
import { createHostMcpEndpoint } from '#mcp-server.js';
import type { AcpAdapter } from '#acp/registry.js';

/* The model is not decoration: the `codex` pin carries one (`registry.ts`), an
 * adapter override spreads the whole pin, and a fixture that offered no
 * `configOptions` therefore broke every real external run while this literal —
 * which had no model — stayed green. It carries one now so the host tier fails
 * first (AV-5). */
const fakeAgentModel = 'gpt-5.3-codex-spark';

const fakeAgent: AcpAdapter = {
  id: 'codex',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  displayName: 'Codex',
  /* V5 deleted the pin's default model: with no turn selection the fixture runs
   * its own first model, which is `fakeAgentModel`. */
  modulePath: new URL('fixtures/fake-agent.ts', import.meta.url).pathname,
};

/** The same fixture under a second id, so an agent switch inside a chat is testable. */
const otherFakeAgent: AcpAdapter = { ...fakeAgent, id: 'claude' };

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
    get: (_target, property): unknown => Reflect.get(reference.current ?? {}, property),
  });

type Harness = {
  readonly launcher: NodeAgentLauncher;
  readonly workspaceRoot: string;
  readonly api: Awaited<ReturnType<typeof startStubApi>>;
  /** Every ACP frame both ways, so the *protocol* is the assertion (V2). */
  readonly frames: AcpWireFrame[];
  /** Every settlement the recorder reported, in order; empty without `revisions`. */
  readonly settlements: TurnFinalizedEvent[];
};

/** How many times the client sent one ACP method. */
const sent = (frames: readonly AcpWireFrame[], method: string): number =>
  frames.filter((frame) => frame.direction === 'client->agent' && frame.frame.includes(`"method":"${method}"`)).length;

const startHarness = async (
  options: {
    readonly idleTimeout?: number;
    readonly agents?: readonly AcpAdapter[];
    /** Override the minted capability's expiry (ISO instant), or offer an empty MCP url. */
    readonly mcp?: { readonly expiresAt?: () => string; readonly url?: string };
    /** Wrap the launcher the way a daemon does, so external turns are recorded (V19). */
    readonly revisions?: boolean;
  } = {},
): Promise<Harness> => {
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

  const frames: AcpWireFrame[] = [];
  /* The daemon's own composition: one map, written when the turn is placed and
   * read by the port when it opens the session (V19). */
  const checkouts = new Map<string, TurnCheckout>();
  const settlements: TurnFinalizedEvent[] = [];
  const plain = createNodeAgentLauncher({
    workspaceRoot,
    gatewayBaseUrl: `http://127.0.0.1:${String(api.port)}/`,
    model: { id: 'unused-by-external-runs', contextWindow: 1000 },
    systemPrompt: 'unused by external runs',
    toolRegistry: registry,
    externalAgents: createAcpExternalAgentPort({
      agents: options.agents ?? [fakeAgent, otherFakeAgent],
      workspaceRoot,
      ...(options.revisions ? { checkouts } : {}),
      mcp: {
        url: options.mcp?.url ?? new URL('mcp', server.url()).href,
        mint: (input) => {
          const minted = mcp.mint(input);
          return options.mcp?.expiresAt ? { ...minted, expiresAt: options.mcp.expiresAt() } : minted;
        },
      },
      onFrame: (frame) => frames.push(frame),
      ...(options.idleTimeout === undefined ? {} : { idleTimeout: options.idleTimeout }),
    }),
  });
  const launcher = options.revisions
    ? createProjectRevisions({
        workspaceRoot,
        checkouts,
        /* The test construction (W3a R7): `isomorphic-git` over the same root,
         * so this suite needs no `git` on PATH. A daemon takes the native port. */
        port: createIsomorphicGitRevisionPort({ filesystem: new NodeFsProvider(workspaceRoot) }),
        events: (event) => {
          if (event.type === 'turn.finalized') {
            settlements.push(event);
          }
        },
      }).record(plain)
    : plain;
  launcherRef.current = launcher;
  closers.push(async () => launcher.close());
  return { launcher, workspaceRoot, api, frames, settlements };
};

/** Start one external turn and wait for the run to settle. */
const runTurn = async (
  harness: Harness,
  input: {
    readonly chatId: string;
    readonly runId: string;
    readonly text: string;
    readonly messageId?: string;
    readonly agentId?: string;
    /** Admission context this turn carries beyond the agent selection (V12). */
    readonly config?: Partial<AgentChannelAdmissionConfig>;
  },
): Promise<void> => {
  await harness.launcher.execute({
    type: 'start',
    trigger: 'submit',
    chatId: input.chatId,
    runId: input.runId,
    message: { id: input.messageId ?? `user-${input.runId}`, role: 'user', content: input.text },
    config: {
      agent: { kind: 'acp', id: input.agentId ?? 'codex' },
      systemPrompt: '',
      toolChoice: 'auto',
      ...input.config,
    },
  });
  await until(
    async () => {
      const events = await readLog(harness.workspaceRoot, input.chatId);
      return events.some(
        (event) =>
          event.runId === input.runId &&
          event.type === 'run.lifecycle' &&
          ['completed', 'failed', 'cancelled'].includes(event.state),
      );
    },
    `run ${input.runId} to settle`,
    { dump: async () => readLog(harness.workspaceRoot, input.chatId) },
  );
  /* The terminal marker is durable a beat before the host lets go of the chat,
   * and a start inside that beat is refused as an admission conflict. */
  await until(async () => {
    const admitted = await harness.launcher.host.waitForAdmission(input.chatId);
    return admitted === undefined;
  }, `chat ${input.chatId} to be free`);
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

const textOfMessage = (message: ProviderMessage | undefined): string => {
  const { content } = message ?? {};
  if (typeof content === 'string') {
    return content;
  }
  return Array.isArray(content)
    ? content
        .flatMap((block) =>
          block !== null && typeof block === 'object' && !Array.isArray(block) && typeof block['text'] === 'string'
            ? [block['text']]
            : [],
        )
        .join('')
    : '';
};

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

      /* Thin projection: assistant text, then the agent's own tool call and
       * result. The trailing assistant row carries no text at all — this turn
       * ended on a tool call, so the vendor's own usage report has no open
       * block to ride and gets a carrier of its own (V6). It joins the run's
       * single UI message as a usage part, not as an empty bubble. */
      expect(messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'tool-input',
        'tool-output',
        'tool-input',
        'tool-output',
        'assistant',
      ]);
      expect(messages.at(-1)).toMatchObject({ content: [], metadata: { usage: { totalTokens: 1500 } } });
      const external = messages.filter((message) => message.role === 'tool-input' || message.role === 'tool-output');
      for (const message of external) {
        expect(message.metadata?.tauInternal).toMatchObject({ origin: 'external', agentId: 'codex' });
      }
      expect(lifecycleOf(events)).toEqual(['admitted', 'running', 'paused', 'running', 'completed']);

      /* V2: the agent works in the project's own tree, not a copy of it — so
       * its file is *the* file, and no branch directory exists to hold one. */
      await expect(readFile(join(workspaceRoot, 'hello.txt'), 'utf8')).resolves.toContain('write the file');
      await expect(readdir(join(workspaceRoot, '.tau'))).resolves.not.toContain('workspaces');
      /* The `cwd` fence is still the fence: it is the session's directory that
       * bounds the client filesystem methods, and that is now the root. */
      expect(JSON.parse(textOfMessage(messages[1]) || '{}')).toMatchObject({ cwd: workspaceRoot });

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

  /*
   * The decider's own option, not a kind-derived guess. The fixture offers
   * `allow` (allow_once), `allow-always` (allow_always) and `reject`
   * (reject_once) and echoes the id it received, so resolving with `allow`
   * proves which id crossed the wire: the kind fallback for an approval
   * prefers `allow_always`.
   */
  it('answers a permission request with the exact option the resolution named', async () => {
    const { launcher, workspaceRoot } = await startHarness();
    const chatId = 'chat-external-option';
    const runId = 'run-external-option';

    await launcher.execute({
      type: 'start',
      trigger: 'submit',
      chatId,
      runId,
      message: { id: 'user-1', role: 'user', content: 'write the file' },
      config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
    });
    const awaitingApproval = async (): Promise<boolean> => {
      const requests = await launcher.pendingInterrupts(runId);
      return requests.length > 0;
    };
    await until(awaitingApproval, 'the approval request', { dump: async () => readLog(workspaceRoot, chatId) });
    const [pending] = await launcher.pendingInterrupts(runId);
    await launcher.execute({
      type: 'resolve-interrupt',
      chatId,
      runId,
      interruptId: pending?.interruptId ?? '',
      outcome: 'approved',
      optionId: 'allow',
    });

    await until(
      async () => messagesOf(await readLog(workspaceRoot, chatId)).some((message) => message.role === 'tool-output'),
      'the tool result',
      { dump: async () => readLog(workspaceRoot, chatId) },
    );
    const events = await readLog(workspaceRoot, chatId);
    const result = messagesOf(events).findLast((message) => message.role === 'tool-output');
    expect(JSON.stringify(result?.content)).toContain('"optionId":"allow"');
    // The same tool-call facts reach the log in the shared vocabulary (N11).
    expect(result).toMatchObject({ call: { toolCallId: 'write-1' } });
    expect(messagesOf(events).find((message) => message.role === 'tool-input')).toMatchObject({
      call: { toolCallId: 'write-1', title: 'write hello.txt' },
    });
    // The chosen option is durable, so a restart replays the decision that was made.
    const resolved = events.findLast((event) => event.type === 'interrupt.recorded' && event.phase === 'resolved');
    expect(JSON.stringify(resolved)).toContain('"optionId":"allow"');
  }, 90_000);

  it('cancels a turn through the run signal and records it, leaving the session up', async () => {
    const harness = await startHarness();
    const { launcher, workspaceRoot, frames } = harness;
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

    /* D12: cancellation stops the prompt. The connection, the child and the
     * vendor session all stay up, so the next turn continues the same thread —
     * which is what a user who cancelled and rephrased expects. */
    expect(sent(frames, 'session/close')).toBe(0);
    await runTurn(harness, { chatId, runId: 'run-external-rephrased', text: 'second noask' });
    expect(sent(frames, 'session/new')).toBe(1);
    expect(sent(frames, 'session/prompt')).toBe(2);
  }, 90_000);

  it('settles a cancel while the adapter never answers its handshake', async () => {
    /* D12 + review 1-review S3: `cancel` observes settlement, so the handshake
     * must be cancellable too — an adapter wedged in `initialize` (a keychain
     * prompt, a hung CLI) would otherwise hold `cancel` open forever. */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
    const silent: AcpAdapter = { ...fakeAgent, spawnEnv: { TAU_FAKE_AGENT_MODE: 'silent' } };
    const { launcher, workspaceRoot, frames } = await startHarness({ agents: [silent] });
    const chatId = 'chat-external-silent-cancel';
    const runId = 'run-external-silent-cancel';

    await launcher.execute({
      type: 'start',
      trigger: 'submit',
      chatId,
      runId,
      message: { id: 'user-1', role: 'user', content: 'noask' },
      config: { agent: { kind: 'acp', id: 'codex' }, systemPrompt: '', toolChoice: 'auto' },
    });
    await until(async () => sent(frames, 'initialize') === 1, 'the unanswered initialize request');
    const started = Date.now();
    await launcher.execute({ type: 'cancel', chatId, runId });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(lifecycleOf(await readLog(workspaceRoot, chatId))).toContain('cancelled');
    expect(sent(frames, 'session/prompt')).toBe(0);
  }, 60_000);

  it('resumes an external run a daemon restart left unanswered', async () => {
    const { launcher, workspaceRoot, frames } = await startHarness();
    const chatId = 'chat-external-resume';
    const runId = 'run-external-resume';
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
              tauInternal: { kind: 'external-agent', agentId: 'codex', acpSessionId: 'fake-session-1' },
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
    /* The vendor session was resumed, not recreated: the agent keeps whatever
     * it had already done for this turn. */
    expect(sent(frames, 'session/resume')).toBe(1);
    expect(sent(frames, 'session/new')).toBe(0);
    const resumedEvents = await readLog(workspaceRoot, chatId);
    expect(lifecycleOf(resumedEvents).at(-1)).toBe('completed');
  }, 90_000);

  /*
   * V6. Three facts that were all being thrown away: the vendor's own token
   * report, the model that produced it, and the reason the turn stopped. The
   * last one is the dangerous one — `max_tokens` recorded as `completed` tells
   * every later reader that the work is finished.
   */
  it("records the vendor's usage and model, and never calls a short stop a completion", async () => {
    const harness = await startHarness();
    const chatId = 'chat-external-usage';
    const runId = 'run-external-usage';

    await runTurn(harness, { chatId, runId, text: 'stop:max_tokens' });

    const events = await readLog(harness.workspaceRoot, chatId);
    const assistant = messagesOf(events).findLast((message) => message.role === 'assistant');
    expect(assistant?.metadata).toMatchObject({
      model: fakeAgentModel,
      responseModel: fakeAgentModel,
      usage: { input: 1200, output: 300, totalTokens: 1500, cost: { total: 0 } },
    });
    /* The vendor's money is labelled as the vendor's own report and priced at
     * nothing by Tau: these are not Tau credits and must never be summed as if
     * they were. */
    expect(assistant?.metadata?.tauInternal).toMatchObject({
      agentId: 'codex',
      vendorCost: { amount: 0.01, currency: 'USD', reportedBy: 'codex' },
      vendorContext: { used: 1200, size: 200_000 },
    });
    const terminal = events.findLast((event) => event.type === 'run.lifecycle');
    expect(terminal).toMatchObject({ state: 'failed', stopReason: 'max_tokens' });
    expect(lifecycleOf(events)).not.toContain('completed');
  }, 90_000);

  /* Every ACP counter is a session total ("Total input tokens across all
   * turns"), and `metadata.usage` is a per-turn figure Tau's readers sum. Turn 2
   * must therefore report turn 2, not the session. */
  it('stamps each turn its own share of the running totals the agent reports', async () => {
    const harness = await startHarness();
    const chatId = 'chat-external-usage-delta';

    await runTurn(harness, { chatId, runId: 'run-usage-1', text: 'noask' });
    await runTurn(harness, { chatId, runId: 'run-usage-2', text: 'noask' });

    const events = await readLog(harness.workspaceRoot, chatId);
    const stamped = messagesOf(events).filter((message) => message.metadata?.usage !== undefined);
    expect(stamped).toHaveLength(2);
    expect(stamped.at(0)?.metadata?.usage).toMatchObject({ input: 1200, output: 300, totalTokens: 1500 });
    expect(stamped.at(1)?.metadata?.usage).toMatchObject({ input: 1200, output: 300, totalTokens: 1500 });
    /* The agent's own running totals are kept verbatim, so the vendor's report
     * is still readable beside the share Tau derived from it. */
    expect(stamped.at(1)?.metadata?.tauInternal).toMatchObject({
      vendorUsage: { inputTokens: 2400, outputTokens: 600, totalTokens: 3000 },
    });
  }, 90_000);

  /* VSC3 + V6: the agent moved its own session, so the chat's record follows it
   * rather than replaying the model Tau last asked for. */
  it('follows the agent onto the model it moved its own session to, and keeps the title it chose', async () => {
    const harness = await startHarness();
    const chatId = 'chat-external-switch';

    await runTurn(harness, { chatId, runId: 'run-switch-1', text: 'updates switch noask' });

    const first = await readLog(harness.workspaceRoot, chatId);
    const remembered = first.findLast((event) => event.type === 'message.envelope-replaced');
    expect(JSON.stringify(remembered)).toContain('"model":"gpt-5.3-codex"');
    // `session_info_update.title` is a durable candidate, not a dropped update.
    expect(JSON.stringify(remembered)).toContain('"title":"Fixture session"');

    await runTurn(harness, { chatId, runId: 'run-switch-2', text: 'noask' });

    /* The record drove the second turn: the fixture echoes the model it is
     * actually running, and it is the one the agent switched to. */
    const second = messagesOf(await readLog(harness.workspaceRoot, chatId)).filter(
      (message) => message.role === 'assistant',
    );
    expect(textOfMessage(second.at(-2) ?? second.at(-1))).toContain('"model":"gpt-5.3-codex"');
    /* And the record the second turn read is the *same session*: a `remember`
     * that clobbered the marker would silently open a fresh one, and every
     * assertion above would still pass (4-review S3). */
    expect(sent(harness.frames, 'session/new')).toBe(1);
  }, 90_000);

  /* The banner has to name the requester from the record, not from whatever the
   * composer happens to be showing when it renders (V6). */
  it('names the agent that asked on the durable interrupt record', async () => {
    const { launcher, workspaceRoot } = await startHarness();
    const chatId = 'chat-external-attribution';
    const runId = 'run-external-attribution';

    await launcher.execute({
      type: 'start',
      trigger: 'submit',
      chatId,
      runId,
      message: { id: 'user-1', role: 'user', content: 'write the file' },
      config: { agent: { kind: 'acp', id: 'claude' }, systemPrompt: '', toolChoice: 'auto' },
    });
    await until(
      async () => {
        const requests = await launcher.pendingInterrupts(runId);
        return requests.length > 0;
      },
      'the approval request',
      { dump: async () => readLog(workspaceRoot, chatId) },
    );

    const recorded = await readLog(workspaceRoot, chatId);
    const requested = recorded.find((event) => event.type === 'interrupt.recorded' && event.phase === 'requested');
    expect(requested).toMatchObject({ payload: { agentId: 'claude', kind: 'approval' } });
    // The options the agent offered ride the same record, so the banner renders them.
    expect(JSON.stringify(requested)).toContain('"optionId":"allow-always"');

    const [pending] = await launcher.pendingInterrupts(runId);
    await launcher.execute({
      type: 'resolve-interrupt',
      chatId,
      runId,
      interruptId: pending?.interruptId ?? '',
      outcome: 'denied',
    });
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

/* oxlint-disable-next-line typescript/no-deprecated -- the same long-lived
 * connection shape `runAcpSession` uses; the replacement scopes a connection to
 * one callback, which cannot outlive the multi-prompt cases below. */
type FixtureConnection = ClientSideConnection;

/**
 * A fixture agent driven directly over ACP, with no launcher in between.
 *
 * The launcher cases above prove the projection; these prove the *fixture*
 * offers what a G-ACP gate has to read (V15). Talking to it at the protocol
 * level is the cheaper seam — a spawn and a connection, no durable log.
 *
 * @param options - Working directory, and the pre-prompt mode to spawn under.
 * @returns The connection, plus every `session/update` it received.
 */
const openFixture = async (
  options: { readonly mode?: string } = {},
): Promise<{
  readonly connection: FixtureConnection;
  readonly updates: SessionUpdate[];
  readonly cwd: string;
}> => {
  const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-fixture-'));
  roots.push(cwd);
  const updates: SessionUpdate[] = [];
  const adapter = spawnAcpAdapter({
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
    adapter: options.mode === undefined ? fakeAgent : { ...fakeAgent, spawnEnv: { TAU_FAKE_AGENT_MODE: options.mode } },
    cwd,
  });
  closers.push(async () => {
    adapter.close();
  });
  const handler: Client = {
    sessionUpdate: (params) => {
      updates.push(params.update);
    },
    requestPermission: () => ({ outcome: { outcome: 'selected', optionId: 'allow' } }),
  };
  /* oxlint-disable-next-line typescript/no-deprecated -- the same long-lived
   * connection shape `runAcpSession` uses; the replacement scopes a connection
   * to one callback. */
  return { connection: new ClientSideConnection(() => handler, adapter.stream), updates, cwd };
};

/** The ACP handshake every fixture case starts with. */
const initializeFixture = async (connection: FixtureConnection): Promise<void> => {
  await connection.initialize({
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false },
    clientInfo: { name: 'tau-host-test', version: '1' },
  });
};

const modelOption = (configOptions: readonly SessionConfigOption[] | undefined): SessionConfigOption =>
  configOptions?.find((option) => option.category === 'model') ?? {
    id: 'missing',
    name: 'missing',
    type: 'boolean',
    currentValue: false,
  };

const textChunks = (updates: readonly SessionUpdate[]): readonly string[] =>
  updates.flatMap((update) =>
    update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text' ? [update.content.text] : [],
  );

/** The durable seams of one turn, stubbed, keeping whatever was appended. */
const stubTurn = (appended: unknown[] = []): AcpPromptTurn => ({
  append: async (events) => {
    appended.push(...events);
  },
  approve: async () => ({ interruptId: 'stub', outcome: 'approved' }),
  signal: new AbortController().signal,
});

/** One `openAcpSession` turn against the fixture, with the log stubbed out. */
const runFixtureSession = async (options: {
  readonly adapter: AcpAdapter;
  readonly cwd: string;
  readonly model?: string | undefined;
  readonly prompt: string;
}): Promise<StopReason> => {
  const session = await openAcpSession({ adapter: options.adapter, cwd: options.cwd, createId: () => randomUUID() });
  try {
    const { stopReason } = await session.prompt(options.prompt, stubTurn(), options.model);
    return stopReason;
  } finally {
    await session.close();
  }
};

describe('the fixture agent', () => {
  it('offers a model select, honours a selection, and reports it back on the turn', async () => {
    const { connection, updates, cwd } = await openFixture();
    await initializeFixture(connection);
    const session = await connection.newSession({ cwd, mcpServers: [] });

    const offered = modelOption(session.configOptions ?? undefined);
    expect(offered).toMatchObject({ id: 'model', type: 'select', currentValue: fakeAgentModel });
    expect(offered.type === 'select' ? offered.options : []).toEqual([
      { value: 'gpt-5.3-codex-spark', name: 'gpt-5.3-codex-spark' },
      { value: 'gpt-5.3-codex', name: 'gpt-5.3-codex' },
    ]);
    // The other categories a client must stay indifferent to are offered too.
    expect(session.configOptions?.map((option) => option.category)).toEqual([
      'model',
      'mode',
      'thought_level',
      'model_config',
    ]);

    const set = await connection.setSessionConfigOption({
      sessionId: session.sessionId,
      configId: 'model',
      value: 'gpt-5.3-codex',
    });
    expect(modelOption(set.configOptions)).toMatchObject({ currentValue: 'gpt-5.3-codex' });

    await connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: 'noask' }] });
    expect(JSON.parse(textChunks(updates)[0] ?? '{}')).toMatchObject({ model: 'gpt-5.3-codex', turn: 1 });
  }, 30_000);

  it('flattens a grouped model list, and refuses a model no group offers', async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
    const grouped: AcpAdapter = { ...fakeAgent, spawnEnv: { TAU_FAKE_AGENT_MODE: 'grouped' } };
    const branch = await mkdtemp(join(tmpdir(), 'tau-acp-grouped-'));
    roots.push(branch);

    await expect(
      runFixtureSession({ adapter: grouped, cwd: branch, model: 'gpt-5.3-codex', prompt: 'noask' }),
    ).resolves.toBe('end_turn');
    await expect(runFixtureSession({ adapter: grouped, cwd: branch, model: 'gpt-4', prompt: 'noask' })).rejects.toThrow(
      /does not offer the model "gpt-4"\. It offers: gpt-5\.3-codex-spark, gpt-5\.3-codex/u,
    );
  }, 60_000);

  it.each(['end_turn', 'max_tokens', 'refusal', 'cancelled'])(
    'ends a turn with stop reason %s',
    async (reason) => {
      const { connection, cwd } = await openFixture();
      await initializeFixture(connection);
      const session = await connection.newSession({ cwd, mcpServers: [] });

      const answered = await connection.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: 'text', text: `stop:${reason}` }],
      });

      expect(answered.stopReason).toBe(reason);
    },
    30_000,
  );

  it('reports usage both as an update and on the prompt response', async () => {
    const { connection, updates, cwd } = await openFixture();
    await initializeFixture(connection);
    const session = await connection.newSession({ cwd, mcpServers: [] });

    const answered = await connection.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: 'noask' }],
    });

    expect(updates.find((update) => update.sessionUpdate === 'usage_update')).toMatchObject({
      used: 1200,
      size: 200_000,
      cost: { currency: 'USD' },
    });
    expect(answered.usage).toMatchObject({ totalTokens: 1500, inputTokens: 1200, outputTokens: 300 });
  }, 30_000);

  it('changes its own model mid-turn and pushes the new options', async () => {
    const { connection, updates, cwd } = await openFixture();
    await initializeFixture(connection);
    const session = await connection.newSession({ cwd, mcpServers: [] });

    await connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: 'switch noask' }] });

    const pushed = updates.find((update) => update.sessionUpdate === 'config_option_update');
    expect(
      modelOption(pushed?.sessionUpdate === 'config_option_update' ? pushed.configOptions : undefined),
    ).toMatchObject({ currentValue: 'gpt-5.3-codex' });
    expect(textChunks(updates)).toContain('model: gpt-5.3-codex');
  }, 30_000);

  it('emits the presentation-only updates Tau drops', async () => {
    const { connection, updates, cwd } = await openFixture();
    await initializeFixture(connection);
    const session = await connection.newSession({ cwd, mcpServers: [] });

    await connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: 'updates noask' }] });

    expect(new Set(updates.map((update) => update.sessionUpdate))).toEqual(
      new Set([
        'agent_message_chunk',
        'usage_update',
        'agent_thought_chunk',
        'plan',
        'plan_update',
        'plan_removed',
        'available_commands_update',
        'current_mode_update',
        'session_info_update',
        'tool_call',
        'tool_call_update',
      ]),
    );
  }, 30_000);

  it('emits a Codex-style tool sequence with locations, diff and terminal content', async () => {
    const { connection, updates, cwd } = await openFixture();
    await initializeFixture(connection);
    const session = await connection.newSession({ cwd, mcpServers: [] });

    await connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: 'tools noask' }] });

    const calls = updates.filter((update) => update.sessionUpdate === 'tool_call');
    expect(new Set(calls.map((call) => call.kind))).toEqual(new Set(['read', 'execute', 'think', 'fetch', 'edit']));
    expect(calls.find((call) => call.toolCallId === 'list-1')).toMatchObject({
      title: 'List files',
      kind: 'read',
      status: 'pending',
      locations: [{ path: join(cwd, 'main.scad'), line: 1 }],
    });
    const results = updates.filter((update) => update.sessionUpdate === 'tool_call_update');
    // Every call moved through `in_progress` before it settled.
    expect(results.filter((result) => result.status === 'in_progress')).toHaveLength(5);
    const content = results.flatMap((result) => result.content ?? []);
    expect(content.map((entry) => entry.type)).toContain('diff');
    expect(content.map((entry) => entry.type)).toContain('terminal');
  }, 30_000);

  it('carries a transcript across two prompts in one session', async () => {
    const { connection, updates, cwd } = await openFixture();
    await initializeFixture(connection);
    const session = await connection.newSession({ cwd, mcpServers: [] });

    await connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: 'first noask' }] });
    await connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: 'second noask' }] });

    expect(textChunks(updates)).toContain('transcript: first noask | second noask');
    expect(JSON.parse(textChunks(updates).at(-2) ?? '{}')).toMatchObject({ turn: 2 });
  }, 30_000);

  it('restores silently on resume and replays the transcript on load', async () => {
    const { connection, updates, cwd } = await openFixture();
    await initializeFixture(connection);
    const session = await connection.newSession({ cwd, mcpServers: [] });
    await connection.prompt({ sessionId: session.sessionId, prompt: [{ type: 'text', text: 'first noask' }] });

    const beforeResume = updates.length;
    await connection.resumeSession({ sessionId: session.sessionId, cwd, mcpServers: [] });
    expect(updates.slice(beforeResume)).toEqual([]);

    await connection.loadSession({ sessionId: session.sessionId, cwd, mcpServers: [] });
    expect(textChunks(updates.slice(beforeResume))).toEqual(['replay: first noask']);
  }, 30_000);

  it('closes a session, and refuses to prompt the session it closed', async () => {
    const { connection, cwd } = await openFixture();
    await initializeFixture(connection);
    const session = await connection.newSession({ cwd, mcpServers: [] });

    await connection.closeSession({ sessionId: session.sessionId });

    await expect(
      connection.prompt({
        sessionId: session.sessionId,
        prompt: [{ type: 'text', text: 'noask' }],
      }),
    ).rejects.toThrow(/Unknown session/u);
  }, 30_000);

  it('advertises an auth method and refuses a session when it is logged out', async () => {
    const { connection, cwd } = await openFixture({ mode: 'auth-required' });

    const initialized = await connection.initialize({
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    });

    /* The `_meta` form, because Tau advertised `_meta['terminal-auth']`: a
     * command line the user runs themselves, not one Tau reproduces (V11). */
    expect(initialized.authMethods).toEqual([
      {
        id: 'codex-login',
        name: 'Log in with Codex',
        description: 'Sign in to the Codex CLI on the machine running this agent.',
        _meta: { 'terminal-auth': { command: 'codex', args: ['login'], label: 'Log in with Codex' } },
      },
    ]);
    await expect(connection.newSession({ cwd, mcpServers: [] })).rejects.toThrow(/Authentication required/u);
  }, 30_000);

  it('never answers initialize at all in silent mode', async () => {
    const { connection } = await openFixture({ mode: 'silent' });

    const answered = await Promise.race([
      connection
        .initialize({
          protocolVersion: 1,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        })
        .then(() => 'answered'),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('silent');
        }, 750);
      }),
    ]);

    expect(answered).toBe('silent');
  }, 30_000);
});

describe('one ACP session per chat', () => {
  it('opens one vendor session and prompts it twice, then closes it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-continuity-'));
    roots.push(cwd);
    const frames: AcpWireFrame[] = [];
    const appended: unknown[] = [];
    const session = await openAcpSession({
      adapter: fakeAgent,
      cwd,
      createId: () => randomUUID(),
      onFrame: (frame) => frames.push(frame),
    });

    await session.prompt('first noask', stubTurn(appended));
    await session.prompt('second noask', stubTurn(appended));
    await session.close();

    /* The whole point of V2, read off the wire: one conversation, two turns. */
    expect(sent(frames, 'session/new')).toBe(1);
    expect(sent(frames, 'session/prompt')).toBe(2);
    expect(sent(frames, 'session/close')).toBe(1);
    expect(JSON.stringify(appended)).toContain('transcript: first noask | second noask');
  }, 30_000);

  it('sets the model only when the session is not already on it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-model-'));
    roots.push(cwd);
    const frames: AcpWireFrame[] = [];
    const session = await openAcpSession({
      adapter: fakeAgent,
      cwd,
      createId: () => randomUUID(),
      onFrame: (frame) => frames.push(frame),
    });

    await session.prompt('first noask', stubTurn(), fakeAgentModel);
    expect(sent(frames, 'session/set_config_option')).toBe(0);

    await session.prompt('second noask', stubTurn(), 'gpt-5.3-codex');
    expect(sent(frames, 'session/set_config_option')).toBe(1);
    expect(modelOption(session.configOptions)).toMatchObject({ currentValue: 'gpt-5.3-codex' });

    /* Still one, because the session now holds what the third turn asks for. */
    await session.prompt('third noask', stubTurn(), 'gpt-5.3-codex');
    expect(sent(frames, 'session/set_config_option')).toBe(1);
    await session.close();
  }, 30_000);

  it('declines an elicitation that arrives between turns, and records it against nothing', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-late-login-'));
    roots.push(cwd);
    const frames: AcpWireFrame[] = [];
    const appended: unknown[] = [];
    const session = await openAcpSession({
      adapter: fakeAgent,
      cwd,
      createId: () => randomUUID(),
      onFrame: (frame) => frames.push(frame),
    });

    await session.prompt('late-auth noask', stubTurn(appended));
    const afterTurn = appended.length;
    await until(
      async () => frames.some((frame) => frame.frame.includes('"method":"elicitation/create"')),
      'the agent to ask after its turn ended',
    );

    /* The turn is over: there is no run to record the login against, so the
     * honest answer is to decline rather than to accept one nobody will see
     * and reopen a finished message with it (4-review S6). */
    expect(appended).toHaveLength(afterTurn);
    expect(JSON.stringify(appended)).not.toContain('login-1');
    expect(frames.some((frame) => frame.frame.includes('"action":"decline"'))).toBe(true);
    await session.close();
  }, 30_000);

  it('keeps replayed updates out of the durable log when no turn is open', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-quiet-'));
    roots.push(cwd);
    const appended: unknown[] = [];
    const session = await openAcpSession({ adapter: fakeAgent, cwd, createId: () => randomUUID() });
    await session.prompt('first noask', stubTurn(appended));
    const afterTurn = appended.length;

    /* A second client loads the same session, which replays it. Tau's own
     * connection sees those notifications with no turn open — the replay guard
     * the `session/load` fallback depends on. */
    const { connection, cwd: otherCwd } = await openFixture();
    void otherCwd;
    await initializeFixture(connection);
    await connection.loadSession({ sessionId: session.acpSessionId, cwd, mcpServers: [] });

    expect(appended).toHaveLength(afterTurn);
    expect(JSON.stringify(appended)).not.toContain('replay:');
    await session.close();
  }, 30_000);

  it('runs two turns of a chat through one session, with no workspace copy', async () => {
    const harness = await startHarness();
    const chatId = 'chat-continuity';

    await runTurn(harness, { chatId, runId: 'run-c1', text: 'first noask' });
    await runTurn(harness, { chatId, runId: 'run-c2', text: 'second noask' });

    expect(sent(harness.frames, 'session/new')).toBe(1);
    expect(sent(harness.frames, 'session/prompt')).toBe(2);
    /* V2: no branch was ever materialized, so the directory does not exist. */
    await expect(readdir(join(harness.workspaceRoot, '.tau'))).resolves.not.toContain('workspaces');
    const events = await readLog(harness.workspaceRoot, chatId);
    expect(JSON.stringify(messagesOf(events))).toContain('transcript: first noask | second noask');
    /* The session id is durable on the chat's own record, which is what a cold
     * start reads back (VSC3); `remember` records it by replacing the envelope. */
    const remembered = events.findLast((event) => event.type === 'message.envelope-replaced');
    expect(remembered).toMatchObject({
      /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- `expect.stringMatching` is typed `any` by vitest. */
      replacement: { metadata: { tauInternal: { acpSessionId: expect.stringMatching(/^fake-session-\d+-/u) } } },
    });
  }, 90_000);

  it('resumes after an idle eviction without replaying history into the log', async () => {
    const harness = await startHarness({ idleTimeout: 50 });
    const chatId = 'chat-cold-start';

    await runTurn(harness, { chatId, runId: 'run-cold-1', text: 'first noask' });
    await until(async () => sent(harness.frames, 'session/close') === 1, 'the idle eviction');
    const before = messagesOf(await readLog(harness.workspaceRoot, chatId)).length;

    await runTurn(harness, { chatId, runId: 'run-cold-2', text: 'second noask' });

    expect(sent(harness.frames, 'session/resume')).toBe(1);
    expect(sent(harness.frames, 'session/new')).toBe(1);
    const messages = messagesOf(await readLog(harness.workspaceRoot, chatId));
    /* Exactly turn two's own five messages — its text, the tool pair and the
     * usage carrier the turn's trailing tool call leaves it with (V6) — and
     * nothing the agent replayed was appended. */
    expect(messages.length - before).toBe(5);
    expect(JSON.stringify(messages)).not.toContain('replay:');
    /* The transcript itself is asserted on the *live* path above: this fixture
     * forgets a session on `session/close`, so a resume after eviction gets an
     * empty one back. See the report's fixture gaps. */
  }, 90_000);

  it('reopens a session whose capability is about to lapse instead of prompting under it', async () => {
    /* The idle timer bounds idleness, not life: a chat prompted every few
     * minutes would otherwise ride one capability past its expiry (2-review S1). */
    const harness = await startHarness({
      mcp: { expiresAt: () => new Date(Date.now() + acpCapabilityRenewalMargin / 2).toISOString() },
    });
    const chatId = 'chat-capability-lapse';

    await runTurn(harness, { chatId, runId: 'run-cap-1', text: 'first noask' });
    await runTurn(harness, { chatId, runId: 'run-cap-2', text: 'second noask' });

    expect(sent(harness.frames, 'session/close')).toBe(1);
    expect(sent(harness.frames, 'session/resume')).toBe(1);
    expect(harness.frames.filter((frame) => frame.frame.includes('tau-mcp-host-v1.'))).toHaveLength(2);
  }, 90_000);

  it('refuses to open a session while the MCP endpoint has no url yet', async () => {
    const harness = await startHarness({ mcp: { url: '' } });
    const chatId = 'chat-mcp-unbound';

    await runTurn(harness, { chatId, runId: 'run-unbound', text: 'first noask' });

    const events = await readLog(harness.workspaceRoot, chatId);
    const terminal = events.find((event) => event.type === 'run.lifecycle' && event.state === 'failed');
    // V-W9 records the typed code on the run; today only the message is durable.
    expect(JSON.stringify(terminal)).toContain('still starting its tool endpoint');
    expect(sent(harness.frames, 'session/new')).toBe(0);
  }, 90_000);

  it('closes the vendor session on relinquish and on host close', async () => {
    const harness = await startHarness();

    await runTurn(harness, { chatId: 'chat-relinquish', runId: 'run-r1', text: 'first noask' });
    await harness.launcher.host.relinquish('chat-relinquish');
    expect(sent(harness.frames, 'session/close')).toBe(1);

    await runTurn(harness, { chatId: 'chat-host-close', runId: 'run-r2', text: 'first noask' });
    await harness.launcher.close();
    expect(sent(harness.frames, 'session/close')).toBe(2);
  }, 90_000);

  it('serves Tau MCP to the second turn under the capability the session was opened with', async () => {
    const harness = await startHarness();
    const chatId = 'chat-mcp-twice';

    await runTurn(harness, { chatId, runId: 'run-m1', text: 'noask mcp' });
    await runTurn(harness, { chatId, runId: 'run-m2', text: 'noask mcp' });

    const evidence = messagesOf(await readLog(harness.workspaceRoot, chatId)).filter(
      (message) => message.role === 'tool-output' && message.toolName === 'test_model',
    );
    expect(evidence).toHaveLength(2);
    for (const message of evidence) {
      expect(JSON.stringify(message.content)).toContain('is-a-cube');
    }
    /* One session, so one server list, so one capability: it was minted at the
     * open and never re-issued under the live session (V7). */
    expect(harness.frames.filter((frame) => frame.frame.includes('tau-mcp-host-v1.'))).toHaveLength(1);
  }, 90_000);

  it('gives a second agent in the same chat its own session', async () => {
    const harness = await startHarness();
    const chatId = 'chat-agent-switch';

    await runTurn(harness, { chatId, runId: 'run-s1', text: 'first noask' });
    await runTurn(harness, { chatId, runId: 'run-s2', text: 'second noask', agentId: 'claude' });

    /* Two agents, two sessions: the second was never handed the first's id. */
    expect(sent(harness.frames, 'session/new')).toBe(2);
    expect(sent(harness.frames, 'session/resume')).toBe(0);
  }, 90_000);
});

/**
 * The fixture behind a wire proxy that hides capabilities it advertises.
 *
 * The fixture offers `session/resume`, so the `session/load` rung below it is
 * unreachable through it — and that rung is the one whose replay must never
 * reach the durable log. Rewriting the `initialize` reply on the wire is the
 * smallest honest way to exercise it without a second fixture: the proxy edits
 * one field of one frame and forwards everything else byte for byte.
 *
 * @param hidden - Capabilities to strip from the agent's `initialize` reply.
 * @returns An adapter that speaks the fixture's protocol without them.
 */
const withoutCapabilities = async (hidden: {
  readonly resume?: boolean;
  readonly load?: boolean;
}): Promise<AcpAdapter> => {
  const directory = await mkdtemp(join(tmpdir(), 'tau-acp-proxy-'));
  roots.push(directory);
  const modulePath = join(directory, 'capability-proxy.cjs');
  await writeFile(
    modulePath,
    `const { spawn } = require('node:child_process');
const child = spawn(process.execPath, [process.env.TAU_PROXIED_MODULE], { stdio: ['pipe', 'pipe', 'inherit'] });
process.stdin.pipe(child.stdin);
let buffer = '';
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    if (line.trim() === '') continue;
    let message;
    try { message = JSON.parse(line); } catch { process.stdout.write(line + '\\n'); continue; }
    const capabilities = message && message.result && message.result.agentCapabilities;
    if (capabilities) {
      if (process.env.TAU_PROXY_HIDE_RESUME && capabilities.sessionCapabilities) delete capabilities.sessionCapabilities.resume;
      if (process.env.TAU_PROXY_HIDE_LOAD) delete capabilities.loadSession;
    }
    process.stdout.write(JSON.stringify(message) + '\\n');
  }
});
`,
    'utf8',
  );
  return {
    ...fakeAgent,
    modulePath,
    spawnEnv: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
      TAU_PROXIED_MODULE: fakeAgent.modulePath,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
      ...(hidden.resume === false ? {} : { TAU_PROXY_HIDE_RESUME: '1' }),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
      ...(hidden.load === true ? { TAU_PROXY_HIDE_LOAD: '1' } : {}),
    },
  };
};

describe('restoring a session a cold start lost', () => {
  it('falls back to session/load, and appends nothing it replays', async () => {
    const adapter = await withoutCapabilities({ resume: true });
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-load-'));
    roots.push(cwd);
    const first = await openAcpSession({ adapter, cwd, createId: () => randomUUID() });
    await first.prompt('first noask', stubTurn());

    const frames: AcpWireFrame[] = [];
    const restored = await openAcpSession({
      adapter,
      cwd,
      createId: () => randomUUID(),
      acpSessionId: first.acpSessionId,
      onFrame: (frame) => frames.push(frame),
    });

    expect(sent(frames, 'session/load')).toBe(1);
    expect(sent(frames, 'session/resume')).toBe(0);
    expect(sent(frames, 'session/new')).toBe(0);
    expect(restored.contextLost).toBe(false);
    /* The agent really did stream the transcript back — and it went nowhere,
     * because no turn was open to receive it. */
    expect(
      frames.some((frame) => frame.direction === 'agent->client' && frame.frame.includes('replay: first noask')),
    ).toBe(true);
    await restored.close();
    await first.close();
  }, 30_000);

  it('opens a fresh session and says so when neither rung can restore one', async () => {
    const adapter = await withoutCapabilities({ load: true });
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-lost-'));
    roots.push(workspaceRoot);
    const port = createAcpExternalAgentPort({ agents: [adapter], workspaceRoot, createId: () => randomUUID() });
    const appended: AgentLogEvent[] = [];

    await port.run({
      agentId: 'codex',
      agent: { kind: 'acp', id: 'codex' },
      chatId: 'chat-lost',
      runId: 'run-lost',
      message: { id: 'user-1', role: 'user', content: 'noask' },
      state: { agentId: 'codex', acpSessionId: 'a-session-this-vendor-forgot' },
      history: [],
      signal: new AbortController().signal,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the log fills every base field; this stub only records bodies.
      append: async (events) => {
        appended.push(...(events as readonly AgentLogEvent[]));
      },
      remember: async () => undefined,
      approve: async () => ({ interruptId: 'stub', outcome: 'approved' }),
    });
    await port.closeChat?.('chat-lost');

    /* Never a silent fresh start: exactly one durable note says the context is gone. */
    const notes = appended.filter(
      (event) =>
        event.type === 'message.appended' &&
        event.message.role === 'assistant' &&
        textOfMessage(event.message).includes('could not restore'),
    );
    expect(notes).toHaveLength(1);
  }, 30_000);
});

/** Every event of one kind, narrowed, in log order. */
const eventsOfType = <Type extends AgentLogEvent['type']>(
  events: readonly AgentLogEvent[],
  type: Type,
): ReadonlyArray<Extract<AgentLogEvent, { readonly type: Type }>> =>
  events.flatMap((event) =>
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the discriminant is checked on the line above.
    event.type === type ? [event as Extract<AgentLogEvent, { readonly type: Type }>] : [],
  );

/** Every `session/prompt` this client sent, as raw frames. */
const promptFrames = (frames: readonly AcpWireFrame[]): readonly string[] =>
  frames
    .filter((frame) => frame.direction === 'client->agent' && frame.frame.includes('"method":"session/prompt"'))
    .map((frame) => frame.frame);

describe('authentication, initialize and prompt content', () => {
  it('refuses a logged-out agent with a typed code and the login it offered', async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
    const loggedOut: AcpAdapter = { ...fakeAgent, spawnEnv: { TAU_FAKE_AGENT_MODE: 'auth-required' } };
    const harness = await startHarness({ agents: [loggedOut] });

    await runTurn(harness, { chatId: 'chat-auth', runId: 'run-auth', text: 'noask' });

    const events = await readLog(harness.workspaceRoot, 'chat-auth');
    expect(eventsOfType(events, 'run.lifecycle').at(-1)).toMatchObject({
      state: 'failed',
      detail: { code: 'EXTERNAL_AGENT_AUTH_REQUIRED' },
    });
    /* The affordance, durable beside the refusal: the methods the agent listed,
     * with the command line the user runs themselves (X6). */
    const authInterrupts = eventsOfType(events, 'interrupt.recorded');
    expect(authInterrupts.at(0)?.payload).toMatchObject({
      kind: 'external-agent-login',
      agentId: 'codex',
      authMethods: [{ id: 'codex-login', name: 'Log in with Codex', terminalCommand: 'codex login' }],
    });
    /* Nothing ever answers a login interrupt — there is no completion event and
     * the affordance is deliberately buttonless — so the refusal settles its own
     * record. An unresolved one would flag the chat "approval required" forever. */
    expect(authInterrupts.at(1)).toMatchObject({
      interruptId: authInterrupts.at(0)?.interruptId,
      phase: 'resolved',
      reason: 'cancelled',
      payload: { outcome: 'cancelled' },
    });
    /* Refused before the turn, not during it: nothing was ever prompted. */
    expect(sent(harness.frames, 'session/prompt')).toBe(0);
  }, 30_000);

  it('records a url elicitation as a durable login, resolves it, and finishes the turn', async () => {
    const harness = await startHarness();

    await runTurn(harness, { chatId: 'chat-login', runId: 'run-login', text: 'login noask' });

    const events = await readLog(harness.workspaceRoot, 'chat-login');
    const interrupts = eventsOfType(events, 'interrupt.recorded');
    expect(interrupts[0]).toMatchObject({
      phase: 'requested',
      interruptId: 'login-1',
      payload: { kind: 'external-agent-login', url: 'https://example.invalid/device', code: 'FAKE-CODE' },
    });
    expect(interrupts[0]?.reason).toContain('FAKE-CODE');
    expect(interrupts[1]).toMatchObject({ phase: 'resolved', interruptId: 'login-1' });
    expect(lifecycleOf(events).at(-1)).toBe('completed');
    /* The agent was told Tau can present one; that is why it offered the flow. */
    expect(
      harness.frames.some(
        (frame) => frame.direction === 'client->agent' && frame.frame.includes('"elicitation":{"url":{}}'),
      ),
    ).toBe(true);
  }, 30_000);

  it('drops a login url no browser should follow, and keeps the rest of the affordance', async () => {
    const harness = await startHarness();

    await runTurn(harness, { chatId: 'chat-login-unsafe', runId: 'run-login-unsafe', text: 'login unsafe noask' });

    const events = await readLog(harness.workspaceRoot, 'chat-login-unsafe');
    const requested = eventsOfType(events, 'interrupt.recorded').at(0);
    /* One guard at the writer, because three surfaces render this record as a
     * link (banner, CLI, TUI). The code and the agent's own message survive:
     * the user can still finish the flow the way the agent described it. */
    expect(requested?.payload).toMatchObject({ kind: 'external-agent-login', code: 'FAKE-CODE' });
    // oxlint-disable-next-line eslint/no-script-url -- asserting the scheme is absent requires naming it.
    expect(JSON.stringify(requested?.payload)).not.toContain('javascript:');
    expect(requested?.payload).not.toHaveProperty('url');
  }, 30_000);

  it('disconnects from an agent whose protocol version it does not speak', async () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
    const future: AcpAdapter = { ...fakeAgent, spawnEnv: { TAU_FAKE_AGENT_MODE: 'protocol-2' } };
    const harness = await startHarness({ agents: [future] });

    await runTurn(harness, { chatId: 'chat-version', runId: 'run-version', text: 'noask' });

    const events = await readLog(harness.workspaceRoot, 'chat-version');
    expect(eventsOfType(events, 'run.lifecycle').at(-1)).toMatchObject({
      state: 'failed',
      detail: { code: 'EXTERNAL_AGENT_UNAVAILABLE' },
    });
    expect(sent(harness.frames, 'session/new')).toBe(0);
    expect(sent(harness.frames, 'session/prompt')).toBe(0);
  }, 30_000);

  it('carries the CAD context as embedded resources on the first prompt only, and writes no file', async () => {
    const harness = await startHarness();
    const config = {
      systemPrompt: 'You are Tau. The kernel is OpenSCAD.',
      contextPayload: { skills: [{ name: 'brep-design', description: 'Design manufacture-ready parts.' }] },
      snapshot: { files: ['main.scad'] },
    };

    await runTurn(harness, { chatId: 'chat-context', runId: 'run-context-1', text: 'noask', config });
    await runTurn(harness, { chatId: 'chat-context', runId: 'run-context-2', text: 'second noask', config });

    const [first, second] = promptFrames(harness.frames);
    expect(first).toContain('tau://system-prompt');
    expect(first).toContain('The kernel is OpenSCAD.');
    expect(first).toContain('tau://skills');
    expect(first).toContain('tau://snapshot');
    /* EQ8/V12: the agent keeps its own conversation, so the briefing is sent
     * once per vendor session and never again. */
    expect(second).not.toContain('tau://');
    expect(second).toContain('second noask');
    /* V12 supersedes the `AGENTS.md` rung: in direct mode the cwd is the user's
     * own project, and Tau writes no control file into it. */
    await expect(readdir(harness.workspaceRoot)).resolves.not.toContain('AGENTS.md');
  }, 60_000);

  it('refuses an image an agent cannot read, and sends one it can', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-image-'));
    roots.push(cwd);
    const frames: AcpWireFrame[] = [];
    const imageTurn = (agent: AcpAdapter): Parameters<ReturnType<typeof createAcpExternalAgentPort>['run']>[0] => ({
      agentId: agent.id,
      agent: { kind: 'acp', id: agent.id },
      chatId: 'chat-image',
      runId: 'run-image',
      message: {
        id: 'user-image',
        role: 'user',
        content: [
          { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
          { type: 'text', text: 'noask' },
        ],
      },
      history: [],
      signal: new AbortController().signal,
      append: async () => undefined,
      remember: async () => undefined,
      approve: async () => ({ interruptId: 'stub', outcome: 'approved' }),
    });

    const blind = createAcpExternalAgentPort({
      agents: [fakeAgent],
      workspaceRoot: cwd,
      onFrame: (frame) => frames.push(frame),
    });
    /* Loud, never dropped: an answer about a picture the model never saw is
     * worse than a refusal that says why (V12). */
    await expect(blind.run(imageTurn(fakeAgent))).rejects.toMatchObject({
      code: 'EXTERNAL_AGENT_CONTENT_UNSUPPORTED',
    });
    expect(promptFrames(frames)).toEqual([]);
    await blind.closeChat?.('chat-image');

    // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables keep their wire names
    const seeing: AcpAdapter = { ...fakeAgent, spawnEnv: { TAU_FAKE_AGENT_MODE: 'images' } };
    const sighted = createAcpExternalAgentPort({
      agents: [seeing],
      workspaceRoot: cwd,
      onFrame: (frame) => frames.push(frame),
    });
    await sighted.run(imageTurn(seeing));
    await sighted.closeChat?.('chat-image');

    expect(promptFrames(frames).at(-1)).toContain('iVBORw0KGgo=');
  }, 60_000);
});

/**
 * The revision seam, over the same daemon composition (V19, VI11, G-REV-EXT).
 *
 * `revisions: true` wraps the harness launcher exactly the way `host-daemon.ts`
 * does, so the ordering under test — prepare and anchor before admission, the
 * port rooting its session in what was prepared, finalize on the terminal
 * marker — is the ordering a real daemon produces.
 */
describe('external turns through the revision port', () => {
  /**
   * The `cwd` the client actually sent at `session/new`.
   *
   * Asserted off the wire rather than off the port's internals: the whole claim
   * of candidate mode is that the *agent* was rooted somewhere else, and only
   * the frame proves that.
   *
   * @param frames - Every frame the harness captured.
   * @returns The working directory of the last session opened.
   */
  const openedCwd = (frames: readonly AcpWireFrame[]): string | undefined => {
    const frame = frames.findLast((entry) => entry.frame.includes('"method":"session/new"'))?.frame;
    return frame === undefined ? undefined : /"cwd":"([^"]*)"/u.exec(frame)?.[1];
  };

  /**
   * The revision this turn recorded, read back through a second port.
   *
   * A fresh port over the same root is what the next process sees, which is the
   * only reading that proves the turn is durable rather than in memory.
   *
   * @param workspaceRoot - The host's own root.
   * @param branch - The branch the turn recorded onto; the trunk by default,
   *   because placement is non-branching (D7/I18).
   * @returns The finalized revision, or `undefined` when none was recorded.
   */
  const recordedRevision = async (
    workspaceRoot: string,
    branch = 'main',
  ): Promise<
    | {
        readonly id: string;
        readonly parents: readonly string[];
        readonly tree: Map<string, string>;
        readonly provenance: unknown;
      }
    | undefined
  > => {
    const port = createIsomorphicGitRevisionPort({ filesystem: new NodeFsProvider(workspaceRoot) });
    const head = await port.readRef(branch);
    const revision = head === undefined ? undefined : await port.readRevision(head);
    const tree = head === undefined ? undefined : await port.readTree(head);
    if (revision === undefined || tree === undefined) {
      return undefined;
    }
    const decoder = new TextDecoder();
    return {
      id: revision.id,
      parents: revision.parents,
      tree: new Map(tree.entries().map(({ path, content }) => [path, decoder.decode(content)])),
      provenance: revision.provenance,
    };
  };

  it('records one finalized revision for an external turn on the live checkout', async () => {
    const harness = await startHarness({ revisions: true });

    await runTurn(harness, { chatId: 'chat-rev-direct', runId: 'run-rev-direct', text: 'noask direct turn' });
    await until(async () => harness.settlements.length > 0, 'the turn to settle its revision');

    /* Non-branching placement (D7/I18): the agent worked in the project itself,
     * so the write is in the live tree and the revision is a record of it, not
     * a copy of it. */
    expect(openedCwd(harness.frames)).toBe(harness.workspaceRoot);
    expect(await readFile(join(harness.workspaceRoot, 'hello.txt'), 'utf8')).toBe('noask direct turn');
    expect(harness.settlements[0]).toMatchObject({
      type: 'turn.finalized',
      chatId: 'chat-rev-direct',
      runId: 'run-rev-direct',
      branch: 'main',
      changedPaths: ['hello.txt'],
      trigger: 'turn',
      runIds: ['run-rev-direct'],
    });

    const revision = await recordedRevision(harness.workspaceRoot);
    expect(revision?.tree.get('hello.txt')).toBe('noask direct turn');
    expect(revision?.provenance).toMatchObject({ source: 'agent', runId: 'run-rev-direct' });

    /* The turn's lease is retired with it, and no directory is left behind:
     * `.tau/runs` is the only place a turn ever wrote outside the tree (S7). */
    await expect(readdir(join(harness.workspaceRoot, '.tau', 'runs'))).resolves.toEqual([]);
    await expect(readdir(join(harness.workspaceRoot, '.tau', 'workspaces'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }, 60_000);

  it('runs two turns of one chat on one session, each revision parented on the last', async () => {
    const harness = await startHarness({ revisions: true });

    await runTurn(harness, {
      chatId: 'chat-rev-second',
      runId: 'run-rev-second-1',
      text: 'noask first turn',
    });
    await until(async () => harness.settlements.length > 0, 'the first turn to settle its revision');
    const first = await recordedRevision(harness.workspaceRoot);
    expect(first?.tree.get('hello.txt')).toBe('noask first turn');

    await runTurn(harness, {
      chatId: 'chat-rev-second',
      runId: 'run-rev-second-2',
      text: 'noask second turn',
    });
    await until(async () => harness.settlements.length > 1, 'the second turn to settle its revision');

    /* One checkout, so one `cwd` and one vendor session for both turns, and the
     * second revision is the next step on the trunk rather than a lineage of
     * its own. */
    expect(sent(harness.frames, 'session/new')).toBe(1);
    expect(openedCwd(harness.frames)).toBe(harness.workspaceRoot);
    const second = await recordedRevision(harness.workspaceRoot);
    expect(second?.tree.get('hello.txt')).toBe('noask second turn');
    expect(second?.id).not.toBe(first?.id);
    expect(second?.parents).toEqual([first?.id]);
    expect(harness.settlements[1]).toMatchObject({
      revisionId: second?.id,
      changedPaths: ['hello.txt'],
    });
  }, 60_000);

  it('refuses an agent write under Tau’s own control metadata and still serves the read', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-mask-'));
    roots.push(cwd);
    await mkdir(join(cwd, '.tau', 'chats', 'chat-1'), { recursive: true });
    await mkdir(join(cwd, '.tau', 'revisions'), { recursive: true });
    await writeFile(join(cwd, '.tau', 'chats', 'chat-1', 'events.jsonl'), '{"type":"run.lifecycle"}\n', 'utf8');
    await writeFile(join(cwd, '.tau', 'revisions', 'note.txt'), 'store\n', 'utf8');

    for (const path of ['.tau/chats/chat-1/events.jsonl', '.tau/revisions/note.txt', '.tau/chats']) {
      // oxlint-disable-next-line no-await-in-loop -- one refusal at a time is the assertion.
      await expect(writeSessionTextFile(cwd, { path, content: 'forged' })).rejects.toMatchObject({
        code: 'WORKSPACE_MASKED_PATH',
      });
    }
    /* Escaping the session directory is the same refusal to a client: one code,
     * one affordance. */
    await expect(writeSessionTextFile(cwd, { path: '../escaped.txt', content: 'x' })).rejects.toMatchObject({
      code: 'WORKSPACE_MASKED_PATH',
    });

    // Read-only, not invisible: the agent may read back its own transcript.
    await expect(readSessionTextFile(cwd, { path: '.tau/chats/chat-1/events.jsonl' })).resolves.toBe(
      '{"type":"run.lifecycle"}\n',
    );
    /* The revision control plane is invisible, not merely read-only: a read is
     * refused exactly as a write is (path registry `hidden`, north star S18). */
    await expect(readSessionTextFile(cwd, { path: '.tau/revisions/note.txt' })).rejects.toMatchObject({
      code: 'WORKSPACE_MASKED_PATH',
    });
    /* Inside `.tau` a path that only *starts* like a masked one is still Tau's
     * (P13); the authored controls are the rows that stay the agent's. */
    await expect(writeSessionTextFile(cwd, { path: '.tau/chats-notes.md', content: 'mine' })).rejects.toMatchObject({
      code: 'WORKSPACE_MASKED_PATH',
    });
    await expect(writeSessionTextFile(cwd, { path: '.tau/AGENTS.md', content: 'mine' })).resolves.toBeUndefined();
  });

  it('serves the line window an agent asked for and creates the parent a write implies', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-fs-'));
    roots.push(cwd);
    await writeFile(join(cwd, 'main.scad'), 'one\ntwo\nthree\nfour\n', 'utf8');

    await expect(readSessionTextFile(cwd, { path: 'main.scad' })).resolves.toBe('one\ntwo\nthree\nfour\n');
    await expect(readSessionTextFile(cwd, { path: 'main.scad', line: 2, limit: 2 })).resolves.toBe('two\nthree');
    await expect(readSessionTextFile(cwd, { path: 'main.scad', line: 3 })).resolves.toBe('three\nfour\n');
    await expect(readSessionTextFile(cwd, { path: 'main.scad', limit: 1 })).resolves.toBe('one');
    /* `null` is what an agent sends for a field it declined to fill; treating it
     * as line zero would silently drop the first line of every read. */
    await expect(readSessionTextFile(cwd, { path: 'main.scad', line: null, limit: null })).resolves.toBe(
      'one\ntwo\nthree\nfour\n',
    );

    await writeSessionTextFile(cwd, { path: 'src/parts/bracket.scad', content: 'cube(2);\n' });
    await expect(readFile(join(cwd, 'src', 'parts', 'bracket.scad'), 'utf8')).resolves.toBe('cube(2);\n');
  });
});
