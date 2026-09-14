/**
 * One *real* turn through each pinned ACP adapter, on the machine running it.
 *
 * Everything else in this directory runs against `fixtures/fake-agent.ts`, which
 * proves the projection but cannot prove the pins: whether the adapter version
 * we ship still speaks this protocol version, whether the model id we name still
 * exists, whether the user's own CLI login reaches the vendor at all. Those only
 * fail against the real thing, and they fail silently in production.
 *
 * It spends the operator's own Codex and Claude quota, so it is opt-in twice
 * over: its own Nx target (`nx run host:test:acp-live`) sets `TAU_ACP_LIVE`, and
 * the suite still skips unless both adapters resolve and both CLIs answer.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

import { createNodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import type { NodeAgentLauncher } from '@taucad/agent-host/node-launcher';
import { reduceEventLog } from '@taucad/agent-host';
import type { AgentChannelLiveEvent, AgentLogEvent, ProviderMessage } from '@taucad/agent-host';

import { createAcpExternalAgentPort } from '#acp/run.js';
import { discoverAcpAgents } from '#acp/registry.js';
import type { AcpAdapter } from '#acp/registry.js';
import type { AcpWireFrame } from '#acp/spawn.js';

const execFileAsync = promisify(execFile);

/** A bounded prompt that must exercise the adapter's real filesystem tool. */
const prompt = 'Use your filesystem read tool to read main.scad, then report the cube dimension. You must call a tool.';

/**
 * The adapters this host may actually bill against.
 *
 * `TAU_ACP_LIVE` is checked first so an ordinary `nx test host` neither probes
 * nor spends. Codex is asked whether it is logged in, which is free; Claude
 * keeps its credential in the macOS Keychain and offers no equivalent, so its
 * turn is its own authentication probe.
 *
 * @returns The resolved adapters, or an empty list when this host is not live.
 */
const liveEnabled = process.env['TAU_ACP_LIVE'] === '1';
const selectedAgentIds = liveEnabled
  ? (process.env['TAU_ACP_LIVE_AGENTS'] ?? 'codex,claude')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  : [];

const liveAdapters = async (): Promise<{
  readonly adapters: readonly AcpAdapter[];
  readonly unavailable: readonly string[];
}> => {
  if (!liveEnabled) {
    return { adapters: [], unavailable: [] };
  }
  const discovery = await discoverAcpAgents({ resolveFrom: import.meta.url, probeTimeout: 10_000 });
  const authenticated = await Promise.all(
    discovery.agents.map(async (adapter) => {
      if (adapter.id !== 'codex') {
        return true;
      }
      return execFileAsync('codex', ['login', 'status'], { timeout: 30_000 }).then(
        () => true,
        () => false,
      );
    }),
  );
  const authenticatedAgents = discovery.agents.filter((_adapter, index) => authenticated[index] === true);
  const adapters = authenticatedAgents.filter((adapter) => selectedAgentIds.includes(adapter.id));
  const unavailable = selectedAgentIds.flatMap((id) => {
    if (adapters.some((adapter) => adapter.id === id)) {
      return [];
    }
    const refusal = discovery.refused.find((candidate) => candidate.id === id);
    return [`${id}: ${refusal?.code ?? 'CLI_NOT_AUTHENTICATED_OR_UNKNOWN'}`];
  });
  return { adapters, unavailable };
};

const { adapters, unavailable } = await liveAdapters();
const selectedModel = (agentId: string): string | undefined =>
  process.env[`TAU_ACP_LIVE_${agentId.toUpperCase()}_MODEL`];
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];

afterAll(async () => {
  for (const close of closers.splice(0).reverse()) {
    // oxlint-disable-next-line no-await-in-loop -- teardown order is the invariant.
    await close();
  }
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

/**
 * A launcher over the real adapters, in an empty workspace of its own.
 *
 * No MCP endpoint: the turn under test asks for one word, and offering Tau's
 * tools would only widen what the vendor may charge for. The gateway URL is a
 * closed port on purpose — an external run that reached it would fail loudly.
 *
 * @returns The launcher and the workspace root its log is written under.
 */
const startHarness = async (): Promise<{
  readonly launcher: NodeAgentLauncher;
  readonly workspaceRoot: string;
  readonly frames: AcpWireFrame[];
}> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-live-'));
  roots.push(workspaceRoot);
  /* The agent works in this directory itself (V2), so it is a real workspace. */
  await writeFile(join(workspaceRoot, 'main.scad'), 'cube(10);\n', 'utf8');
  const frames: AcpWireFrame[] = [];
  const launcher = createNodeAgentLauncher({
    workspaceRoot,
    gatewayBaseUrl: 'http://127.0.0.1:1/',
    model: { id: 'unused-by-external-runs', contextWindow: 1000 },
    systemPrompt: 'unused by external runs',
    toolRegistry: { list: () => [], invoke: async () => ({ content: null, isError: false }) },
    externalAgents: createAcpExternalAgentPort({
      agents: adapters,
      workspaceRoot,
      onFrame: (frame) => frames.push(frame),
    }),
  });
  closers.push(async () => launcher.close());
  return { launcher, workspaceRoot, frames };
};

const readLog = async (workspaceRoot: string, chatId: string): Promise<readonly AgentLogEvent[]> => {
  const raw = await readFile(join(workspaceRoot, '.tau', 'chats', chatId, 'events.jsonl'), 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as AgentLogEvent);
};

const messagesOf = (events: readonly AgentLogEvent[]): readonly ProviderMessage[] => reduceEventLog(events);

const textOf = (message: ProviderMessage): string =>
  typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
      ? message.content
          .flatMap((block) =>
            block !== null && typeof block === 'object' && !Array.isArray(block) && typeof block['text'] === 'string'
              ? [block['text']]
              : [],
          )
          .join('\n')
      : '';

/**
 * Wait for the run's own log to record a terminal lifecycle state.
 *
 * The log is the authority a restart would read, so waiting on it rather than
 * on in-memory state is also the assertion that the state was made durable.
 *
 * @param read - Reads the chat's durable events.
 * @returns The terminal state.
 * @throws When the agent never settles inside the budget.
 */
const settled = async (read: () => Promise<readonly AgentLogEvent[]>): Promise<string> => {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polling is ordered by construction.
    const events = await read().catch(() => []);
    const state = events
      .flatMap((event) => (event.type === 'run.lifecycle' ? [event.state] : []))
      .findLast((candidate) => ['completed', 'failed', 'cancelled'].includes(candidate));
    if (state !== undefined) {
      return state;
    }
    // oxlint-disable-next-line no-await-in-loop -- polling is ordered by construction.
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }
  throw new Error(`The run never settled. Log: ${JSON.stringify(await read().catch(() => []))}`);
};

describe.skipIf(!liveEnabled)('live ACP selection', () => {
  it('requires every explicitly selected adapter to be available', () => {
    expect(selectedAgentIds, 'TAU_ACP_LIVE_AGENTS must select at least one adapter').not.toEqual([]);
    expect(unavailable, 'selected ACP adapters unavailable').toEqual([]);
    expect(adapters).toHaveLength(selectedAgentIds.length);
  });
});

describe.skipIf(!liveEnabled)('a live ACP turn', () => {
  /* No model is named: V5 deleted the pin's default, so a live turn runs on
   * whatever the user's own CLI has selected — which is exactly what a turn
   * with no picker selection does in production. */
  it.each(adapters.map((adapter) => [adapter.id]))(
    'answers through %s',
    async (agentId) => {
      const { launcher, workspaceRoot } = await startHarness();
      const chatId = `chat-live-${agentId}`;
      const runId = `run-live-${agentId}`;
      const started = Date.now();
      const liveAbort = new AbortController();
      const live: AgentChannelLiveEvent[] = [];
      const liveDone = (async () => {
        for await (const event of launcher.liveEvents(liveAbort.signal)) {
          if (event.event.runId === runId) {
            live.push(event);
          }
        }
      })();

      const accepted = await launcher.execute({
        type: 'start',
        trigger: 'submit',
        chatId,
        runId,
        message: { id: `user-${agentId}`, role: 'user', content: prompt },
        config: {
          agent: {
            kind: 'acp',
            id: agentId,
            ...(selectedModel(agentId) === undefined ? {} : { model: selectedModel(agentId) }),
          },
          systemPrompt: '',
          toolChoice: 'auto',
        },
      });
      expect(accepted).toMatchObject({ type: 'result', operation: 'start' });

      const state = await settled(async () => readLog(workspaceRoot, chatId));
      liveAbort.abort();
      await liveDone;
      const events = await readLog(workspaceRoot, chatId);
      const messages = messagesOf(events);
      /* The run id, adapter and duration are this target's whole evidence. */
      console.log(`[acp-live] ${agentId} run=${runId} state=${state} ms=${String(Date.now() - started)}`);

      /* The reason a live turn failed is in the log and nowhere else. */
      expect(state, JSON.stringify(events.slice(-3))).toBe('completed');

      expect(
        messages
          .filter((message) => message.role === 'assistant')
          .map((message) => textOf(message))
          .at(-1) ?? '',
      ).toMatch(/10|ten/iu);

      /* The shared tool vocabulary, not an external one (N11): whatever the
       * agent chose to run is recorded with a typed top-level `call`. */
      const toolMessages = messages.filter(
        (candidate): candidate is Extract<ProviderMessage, { readonly role: 'tool-input' | 'tool-output' }> =>
          candidate.role === 'tool-input' || candidate.role === 'tool-output',
      );
      for (const message of toolMessages) {
        expect(typeof message.call?.toolCallId).toBe('string');
      }
      expect(toolMessages.some((message) => message.role === 'tool-input')).toBe(true);
      expect(toolMessages.some((message) => message.role === 'tool-output')).toBe(true);
      const liveTypes = live.map(({ event }) => event.type);
      expect(liveTypes).toContain('tool-input-start');
      expect(liveTypes).toContain('tool-input-end');
      expect(liveTypes.some((type) => type === 'thinking-delta' || type === 'text-delta')).toBe(true);

      /* The selection is durable: a replay reader can say which adapter
       * produced this transcript. */
      expect(messages.find((message) => message.role === 'user')).toMatchObject({
        metadata: { tauInternal: { kind: 'external-agent', runKind: 'acp', agentId } },
      });
    },
    300_000,
  );
});

const codexAdapter = adapters.find((adapter) => adapter.id === 'codex');

/**
 * How many times the client sent one ACP method.
 *
 * @param frames - Every frame the wire tap observed.
 * @param method - ACP method name.
 * @returns The count of client-to-agent frames naming it.
 */
const sentFrames = (frames: readonly AcpWireFrame[], method: string): number =>
  frames.filter((frame) => frame.direction === 'client->agent' && frame.frame.includes(`"method":"${method}"`)).length;

/* The one claim source alone cannot settle (r1 risk 1): `codex-acp` calls the
 * same `threadResume` for `session/resume` and `session/load`, which says the
 * transcript survives — but only a real turn can prove the model *uses* it. */
describe.skipIf(!liveEnabled || codexAdapter === undefined)('a live ACP chat across two turns', () => {
  it('recalls the first turn on the second, in one session', async () => {
    const { launcher, workspaceRoot, frames } = await startHarness();
    const chatId = 'chat-live-continuity';
    const agentId = codexAdapter?.id ?? 'codex';
    const started = Date.now();

    const turn = async (runId: string, text: string): Promise<string> => {
      await launcher.execute({
        type: 'start',
        trigger: 'submit',
        chatId,
        runId,
        message: { id: `user-${runId}`, role: 'user', content: text },
        config: {
          agent: {
            kind: 'acp',
            id: agentId,
            ...(selectedModel(agentId) === undefined ? {} : { model: selectedModel(agentId) }),
          },
          systemPrompt: '',
          toolChoice: 'auto',
        },
      });
      return settled(async () => {
        const events = await readLog(workspaceRoot, chatId);
        return events.filter((event) => event.runId === runId);
      });
    };

    expect(await turn('run-live-continuity-1', 'Remember the number 8127 and say ok.')).toBe('completed');
    const answered = await turn('run-live-continuity-2', 'What number did I ask you to remember?');

    const events = await readLog(workspaceRoot, chatId);
    const opened = events.findLast((event) => event.type === 'message.envelope-replaced');
    console.log(
      `[acp-live] ${agentId} chat=${chatId} sessions=${String(sentFrames(frames, 'session/new'))} thread=${JSON.stringify(opened && 'replacement' in opened ? opened.replacement.metadata?.tauInternal : undefined)} ms=${String(Date.now() - started)}`,
    );
    expect(answered, JSON.stringify(events.slice(-3))).toBe('completed');

    const secondTurn = events.filter((event) => event.runId === 'run-live-continuity-2');
    expect(
      messagesOf(secondTurn)
        .filter((message) => message.role === 'assistant')
        .map((message) => textOf(message))
        .join(' '),
    ).toContain('8127');
    /* One conversation, not two: the second turn prompted the session the first
     * one opened. */
    expect(sentFrames(frames, 'session/new')).toBe(1);
    expect(sentFrames(frames, 'session/prompt')).toBe(2);
  }, 600_000);
});
