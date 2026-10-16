/* eslint-disable @typescript-eslint/naming-convention -- Grok configuration keys retain their vendor wire names. */
/**
 * One *real* turn through each pinned ACP adapter, on the machine running it.
 *
 * Everything else in this directory runs against `fixtures/fake-agent.ts`, which
 * proves the projection but cannot prove the pins: whether the adapter version
 * we ship still speaks this protocol version, whether the model id we name still
 * exists, whether the user's own CLI login reaches the vendor at all. Those only
 * fail against the real thing, and they fail silently in production.
 *
 * It spends the operator's own selected agent quota, so it is opt-in twice
 * over: its own Nx target (`nx run host:test:acp-live`) sets `TAU_ACP_LIVE`, and
 * the suite still skips unless selected adapters resolve and their CLIs answer.
 */

import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parse as parseToml } from 'smol-toml';

import {
  answersPath,
  askQuestionsInputSchema,
  parseQuestionsFile,
  questionsPath,
  serializeAnswersFile,
} from '@taucad/chat';
import { toolDescriptions, toolName } from '@taucad/chat/constants';
import { handleAskQuestions } from '@taucad/chat/rpc';
import type { QuestionRecordFileSystem } from '@taucad/chat/rpc';

import type { AgentLauncher } from '@taucad/agent-host/launcher';

import { createNodeLauncher } from '#node-launcher.fixture.js';
import { reduceEventLog } from '@taucad/agent-host';
import type {
  AgentLiveEvent,
  AgentLogEvent,
  ExternalAgentLogEvent,
  JsonObject,
  ProviderMessage,
  ToolRegistry,
} from '@taucad/agent-host';

import { createAcpExternalAgentPort } from '#acp/run.js';
import { discoverAcpAgents } from '#acp/registry.js';
import type { AcpAdapter } from '#acp/registry.js';
import type { AcpWireFrame } from '#acp/spawn.js';
import { openAcpSession } from '#acp/acp-session.js';
import { defaultConfigDirectory } from '#credential-store.js';
import { createHostMcpEndpoint } from '#mcp-server.js';

const execFileAsync = promisify(execFile);

/** A bounded prompt that must exercise the adapter's real filesystem tool. */
const prompt =
  'Open main.scad in the current directory with your file-reading tool, then report the cube dimension. You must read the file. Do not use shell commands or search tools.';

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
  const discovery = await discoverAcpAgents({
    // Qualification may run this suite under packaged Electron against its own adapter closure.
    resolveFrom: process.env['TAU_ACP_LIVE_RESOLVE_FROM'] ?? import.meta.url,
    probeTimeout: 10_000,
  });
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
  readonly launcher: AgentLauncher;
  readonly workspaceRoot: string;
  readonly frames: AcpWireFrame[];
}> => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-live-'));
  roots.push(workspaceRoot);
  /* The agent works in this directory itself (V2), so it is a real workspace. */
  await writeFile(join(workspaceRoot, 'main.scad'), 'cube(10);\n', 'utf8');
  const frames: AcpWireFrame[] = [];
  const launcher = createNodeLauncher({
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

/** Replay direct-session events with the same row envelope the durable appender supplies. */
const directMessagesOf = (events: readonly ExternalAgentLogEvent[]): readonly ProviderMessage[] =>
  messagesOf(
    events.map((event, sequence) => ({
      ...event,
      version: 1,
      leaderEpoch: 'test',
      sequence,
      recordedAt: new Date(0).toISOString(),
      runId: 'run-live-direct',
    })),
  );

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
      const live: AgentLiveEvent[] = [];
      const liveDone = (async () => {
        for await (const event of launcher.liveEvents({ chatId, signal: liveAbort.signal })) {
          if (event.runId === runId) {
            live.push(event);
          }
        }
      })();

      const accepted = await launcher.execute({
        type: 'start',
        commandId: `start-${runId}`,
        payload: {
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
        },
      });
      expect(accepted).toMatchObject({ status: 'applied', effect: 'durable' });

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
          .findLast((text) => text !== '') ?? '',
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
      const liveTypes = live.map((event) => event.type);
      expect(liveTypes).not.toContain('tool-input-start');
      expect(liveTypes).not.toContain('tool-input-end');
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

describe.each(adapters.filter((adapter) => adapter.id === 'codex' || adapter.id === 'grok'))(
  'live $id screenshot carrier',
  (adapter) => {
    it('preserves all six persisted MCP images through the installed ACP client', async () => {
      const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-capture-'));
      roots.push(workspaceRoot);
      const views = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const;
      // Large enough for native image normalization; filenames carry no color hints.
      const pixels = [
        'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdLep8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3IPanc8OLDQitxAAAAAElFTkSuQmCC',
        'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdLu58QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ24Pbjs8OLsrFddAAAAAElFTkSuQmCC',
        'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAb0lEQVR4nO3PAQkAAAyEwO9feoshgnABdNvJ8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ3I8QUNyPEFDcjxBQ2oPcf88OIhvJ6vAAAAAElFTkSuQmCC',
        'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAdklEQVR4nO3PQQkAMAzAwPo33Yno4xgEIuAyu/N1XtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWjBsQcyl+HSnr9raQAAAABJRU5ErkJggg==',
        'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAdklEQVR4nO3PQQkAMAzAwPo33Yno4xgEIuAyO/t1wwUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWHHtBp+HSthEAJgAAAABJRU5ErkJggg==',
        'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAdklEQVR4nO3PQQkAMAzAwPo33Yno4xgEIuAys/t3XtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWhBA1rQgBY0oAUNaEEDWtCAFjSgBQ1oQQNa0IAWNKAFDWjBrQdQt+HSQM5t4gAAAABJRU5ErkJggg==',
      ];
      const registry: ToolRegistry = {
        list: () => [],
        invoke: async (invocation) => {
          const content: JsonObject =
            invocation.toolName === toolName.testModel
              ? { success: true, failures: [], passes: [], passed: 0, total: 0 }
              : {
                  success: true,
                  images: views.map((view, index) => ({ view, dataUrl: `data:image/png;base64,${pixels[index]}` })),
                };
          return { isError: false, content };
        },
      };
      const endpoint = createHostMcpEndpoint({
        secret: randomBytes(32).toString('base64url'),
        workspaceRoot,
        registry,
      });
      const server = createServer((request, response) => {
        void endpoint.handle(request, response);
      });
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('The capture MCP server did not open a TCP port.');
      }
      const chatId = 'chat-live-capture';
      const runId = 'run-live-capture';
      const capability = endpoint.mint({ chatId, runId });
      const release = endpoint.activate({
        token: capability.token,
        chatId,
        runId,
        signal: new AbortController().signal,
      });
      let session: Awaited<ReturnType<typeof openAcpSession>> | undefined;
      const events: ExternalAgentLogEvent[] = [];
      try {
        session = await openAcpSession({
          adapter,

          cwd: workspaceRoot,
          createId: randomUUID,
          mcpServers: [
            {
              type: 'http',
              name: 'tau',
              url: `http://127.0.0.1:${String(address.port)}/mcp`,
              headers: [{ name: 'Authorization', value: `Bearer ${capability.token}` }],
            },
          ],
        });
        await session.prompt(
          'Call tau test_model with files ["main.geospec.ts"], then call tau screenshot with targetFile main.scad and mode multi_angle. Inspect the actual pixels of all six images and report the dominant color of each view in order. Do not infer colors from names or inspect file bytes with code. Do not edit files or call other Tau tools.',
          {
            append: async (batch) => {
              events.push(...batch);
            },
            approve: async () => ({ interruptId: 'capture', outcome: 'approved' }),
            publishLive: async () => undefined,
            signal: AbortSignal.timeout(180_000),
          },
          selectedModel(adapter.id),
        );
        const messages = directMessagesOf(events);
        expect(
          messages.some(
            (message) => message.role === 'tool-output' && message.toolName === 'screenshot' && !message.isError,
          ),
        ).toBe(true);
        if (adapter.id === 'grok') {
          expect(
            messages.find((message) => message.role === 'tool-output' && message.toolName === toolName.testModel),
          ).toMatchObject({ isError: false, content: { failures: [], passed: 0, total: 0 } });
        }
        const answer = messages
          .filter((message) => message.role === 'assistant')
          .map((message) => textOf(message))
          .join(' ')
          .toLowerCase();
        expect(answer).toMatch(/red[\s\S]*green[\s\S]*blue[\s\S]*yellow[\s\S]*magenta[\s\S]*cyan/u);
        const attachments = await readdir(join(workspaceRoot, '.tau', 'chats', chatId, 'attachments'));
        expect(attachments).toHaveLength(6);
        const stored = await Promise.all(
          attachments.map(async (name) => readFile(join(workspaceRoot, '.tau', 'chats', chatId, 'attachments', name))),
        );
        expect(stored.map((bytes) => bytes.toString('base64')).sort()).toEqual([...pixels].sort());
      } finally {
        await session?.close();
        await release();
        await endpoint.close();
        await new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        });
      }
    }, 240_000);
  },
);

/* Every selected agent must round-trip a real Tau MCP question and its answer. */
describe.each(adapters)('live $id question through Tau', (adapter) => {
  it("asks through mcp.tau.ask_questions and continues with the person's answer", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), 'tau-acp-questions-'));
    roots.push(workspaceRoot);
    const chatId = 'chat-live-questions';
    const runId = 'run-live-questions';
    const record: QuestionRecordFileSystem = {
      exists: async (path) => {
        try {
          await access(join(workspaceRoot, path));
          return true;
        } catch {
          return false;
        }
      },
      readFile: async (path) => readFile(join(workspaceRoot, path), 'utf8'),
      writeFile: async (path, content) => {
        await mkdir(dirname(join(workspaceRoot, path)), { recursive: true });
        await writeFile(join(workspaceRoot, path), content, 'utf8');
      },
    };
    const answerWithSecondOption = async (): Promise<void> => {
      const { asks } = parseQuestionsFile(await record.readFile(questionsPath(chatId)));
      const at = new Date().toISOString();
      const answers = Object.fromEntries(
        asks.map((ask) => [
          ask.id,
          {
            questions: Object.fromEntries(
              ask.questions.map((question) => [question.id, { choice: question.options[1]?.label ?? 'B', at }]),
            ),
          },
        ]),
      );
      await record.writeFile(answersPath(chatId), serializeAnswersFile({ version: 2, answers }));
    };
    const registry: ToolRegistry = {
      list: () => [
        {
          name: toolName.askQuestions,
          description: toolDescriptions[toolName.askQuestions],
          inputSchema: z.toJSONSchema(askQuestionsInputSchema) as JsonObject,
        },
      ],
      invoke: async (invocation) => {
        const person = setTimeout(() => {
          void answerWithSecondOption();
        }, 2000);
        try {
          const input = askQuestionsInputSchema.parse(invocation.input);
          const output = await handleAskQuestions(
            { ...input, toolCallId: invocation.toolCallId },
            record,
            invocation.signal,
          );
          return { content: output as unknown as JsonObject, isError: false };
        } finally {
          clearTimeout(person);
        }
      },
    };
    const endpoint = createHostMcpEndpoint({ secret: randomBytes(32).toString('base64url'), workspaceRoot, registry });
    const server = createServer((request, response) => {
      void endpoint.handle(request, response);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('The questions MCP server did not open a TCP port.');
    }
    const capability = endpoint.mint({ chatId, runId });
    const release = endpoint.activate({ token: capability.token, chatId, runId, signal: new AbortController().signal });
    let session: Awaited<ReturnType<typeof openAcpSession>> | undefined;
    const events: ExternalAgentLogEvent[] = [];
    try {
      session = await openAcpSession({
        adapter,
        cwd: workspaceRoot,
        createId: randomUUID,
        mcpServers: [
          {
            type: 'http',
            name: 'tau',
            url: `http://127.0.0.1:${String(address.port)}/mcp`,
            headers: [{ name: 'Authorization', value: `Bearer ${capability.token}` }],
          },
        ],
      });
      await session.prompt(
        'Before you design anything, ask me with mcp.tau.ask_questions which material the desk ornament should be printed in, offering PLA (recommended) and PETG. Then reply with one sentence naming the material I chose. Do not edit files.',
        {
          append: async (batch) => {
            events.push(...batch);
          },
          approve: async () => ({ interruptId: 'questions', outcome: 'approved' }),
          publishLive: async () => undefined,
          signal: AbortSignal.timeout(240_000),
        },
        selectedModel(adapter.id),
      );
      const messages = directMessagesOf(events);
      const answered = messages.find(
        (message) => message.role === 'tool-output' && message.toolName === toolName.askQuestions && !message.isError,
      );
      expect(JSON.stringify(answered?.content)).toContain('"source":"person"');
      const { asks } = parseQuestionsFile(await record.readFile(questionsPath(chatId)));
      expect(asks).toHaveLength(1);
      expect(asks[0]?.resolution?.outcome).toBe('answered');
      const reply = messages
        .filter((message) => message.role === 'assistant')
        .map((message) => textOf(message))
        .join(' ');
      expect(reply).toMatch(/PETG/u);
    } finally {
      await session?.close();
      await release();
      await endpoint.close();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  }, 300_000);
});

/* Native agent questions share the same durable question record as Tau tools. */
describe.each(adapters.filter((adapter) => adapter.id === 'codex' || adapter.id === 'grok'))(
  'live $id native question',
  (adapter) => {
    it("records the native question and returns the person's answer", async () => {
      const { launcher, workspaceRoot } = await startHarness();
      const chatId = 'chat-live-plan-question';
      const runId = 'run-live-plan-question';
      const recordPath = join(workspaceRoot, questionsPath(chatId));
      let answered = false;
      /* The person answers B once the card appears. */
      const answerOnce = async (): Promise<void> => {
        const { asks } = parseQuestionsFile(await readFile(recordPath, 'utf8').catch(() => undefined));
        if (answered || asks.length === 0) {
          return;
        }
        answered = true;
        const at = new Date().toISOString();
        const choices = (ask: (typeof asks)[number]) =>
          Object.fromEntries(
            ask.questions.map((question) => {
              const option = question.options[1] ?? question.options[0];
              if (!option) {
                throw new Error('The live question did not offer a selectable answer.');
              }
              return [question.id, { value: option.value ?? option.label, at }];
            }),
          );
        const answers = Object.fromEntries(asks.map((ask) => [ask.id, { questions: choices(ask) }]));
        await writeFile(
          join(workspaceRoot, answersPath(chatId)),
          serializeAnswersFile({ version: 2, answers }),
          'utf8',
        );
      };
      const person = setInterval(() => {
        void answerOnce();
      }, 500);
      try {
        await launcher.execute({
          type: 'start',
          commandId: `start-${runId}`,
          payload: {
            trigger: 'submit',
            chatId,
            runId,
            message: {
              id: `user-${runId}`,
              role: 'user',
              content: `Use your ${adapter.id === 'grok' ? 'ask_user_question' : 'request_user_input'} tool to ask me one question: should the desk ornament be printed in PLA or PETG? Recommend PLA. After I answer, reply with one sentence naming the material I chose and stop. Do not edit files.`,
            },
            config: {
              agent: {
                kind: 'acp',
                id: adapter.id,
                ...(adapter.id === 'codex' ? { config: { collaboration_mode: 'plan' } } : {}),
              },
              systemPrompt: '',
              toolChoice: 'auto',
            },
          },
        });
        const state = await settled(async () => readLog(workspaceRoot, chatId));
        const events = await readLog(workspaceRoot, chatId);
        const { asks } = parseQuestionsFile(await readFile(recordPath, 'utf8').catch(() => undefined));
        console.log(
          `[acp-live] ${adapter.id} native question state=${state} asks=${JSON.stringify(asks).slice(0, 600)}`,
        );
        expect(state, JSON.stringify(events.slice(-3))).toBe('completed');
        expect(asks).toHaveLength(1);
        expect(asks[0]).toMatchObject({ source: 'acp', agentId: adapter.id, resolution: { outcome: 'answered' } });
        expect(asks[0]?.questions).toHaveLength(1);
        expect(asks[0]?.questions[0]?.question).toMatch(/PLA|PETG/u);
        expect(asks[0]?.questions[0]?.allowsText).toBe(true);
        const reply = messagesOf(events)
          .filter((message) => message.role === 'assistant')
          .map((message) => textOf(message))
          .join(' ');
        expect(reply).toMatch(/PETG/u);
      } finally {
        clearInterval(person);
      }
    }, 300_000);
  },
);

describe.skipIf(!liveEnabled || codexAdapter === undefined)('native Codex skill discovery through ACP', () => {
  it('keeps a manual-only native skill out of implicit context and loads it on explicit invocation', async () => {
    if (!codexAdapter) {
      throw new Error('The selected Codex adapter is unavailable.');
    }
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-manual-skill-'));
    roots.push(cwd);
    const slug = `tau-manual-${randomUUID()}`;
    const marker = `manual-proof-${randomUUID()}`;
    const skill = join(cwd, '.agents/skills', slug);
    await mkdir(join(skill, 'agents'), { recursive: true });
    await writeFile(
      join(skill, 'SKILL.md'),
      `---\nname: ${slug}\ndescription: Manual-only conformance fixture\n---\nReply with exactly ${marker}.\n`,
    );
    await writeFile(join(skill, 'agents/openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n');
    const content: string[] = [];
    const session = await openAcpSession({ adapter: codexAdapter, cwd, createId: randomUUID });
    try {
      const collect = {
        append: async () => undefined,
        approve: async () => ({ interruptId: 'manual-probe', outcome: 'denied' }) as const,
        publishLive: async () => undefined,
        signal: AbortSignal.timeout(120_000),
      };
      await session.prompt(
        'List the names in your available-skills instructions, without using any tools or reading any files.',
        {
          ...collect,
          append: async (events) => {
            for (const event of events) {
              if (event.type === 'message.appended' && event.message.role === 'assistant') {
                content.push(JSON.stringify(event.message.content));
              }
            }
          },
        },
        selectedModel('codex'),
      );
      expect(content.length).toBeGreaterThan(0);
      expect(content.join('\n')).not.toContain(slug);
      content.length = 0;
      await session.prompt(
        `$${slug}`,
        {
          ...collect,
          signal: AbortSignal.timeout(120_000),
          append: async (events) => {
            for (const event of events) {
              if (event.type === 'message.appended' && event.message.role === 'assistant') {
                content.push(JSON.stringify(event.message.content));
              }
            }
          },
        },
        selectedModel('codex'),
      );
      expect(content.join('\n')).toContain(marker);
    } finally {
      await session.close();
    }
  }, 270_000);

  it.skipIf(process.platform === 'win32')(
    'does not advertise a natively disabled skill',
    async () => {
      if (!codexAdapter) {
        throw new Error('The selected Codex adapter is unavailable.');
      }
      const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-disabled-skill-'));
      roots.push(cwd);
      const slug = `tau-disabled-${randomUUID()}`;
      const skill = join(cwd, '.agents/skills', slug);
      await mkdir(skill, { recursive: true });
      await writeFile(
        join(skill, 'SKILL.md'),
        `---\nname: ${slug}\ndescription: Disabled native conformance skill\n---\nDo not invoke this disabled fixture.\n`,
      );
      // Configure only this test child through Codex's own CLI. User configuration is untouched.
      const wrapper = join(cwd, 'codex-fixture');
      await writeFile(wrapper, `#!/bin/sh\nexec codex -c 'skills.config=[{name="${slug}",enabled=false}]' "$@"\n`);
      await chmod(wrapper, 0o700);
      const frames: AcpWireFrame[] = [];
      const session = await openAcpSession({
        adapter: { ...codexAdapter, spawnEnv: { ...codexAdapter.spawnEnv, CODEX_PATH: wrapper } },
        cwd,
        createId: randomUUID,
        onFrame: (frame) => frames.push(frame),
      });
      try {
        await expect
          .poll(() => frames.some(({ frame }) => frame.includes('available_commands_update')), { timeout: 30_000 })
          .toBe(true);
        const commands = frames
          .filter(
            ({ direction, frame }) => direction === 'agent->client' && frame.includes('available_commands_update'),
          )
          .map(({ frame }) => frame)
          .join('\n');
        expect(commands).not.toContain(`$${slug}`);
      } finally {
        await session.close();
      }
    },
    60_000,
  );

  it.each(['read-only', 'agent', 'agent-full-access'])(
    'preserves native %s authority for an additional skill root',
    async (mode) => {
      if (!codexAdapter) {
        throw new Error('The selected Codex adapter is unavailable.');
      }
      const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-policy-project-'));
      await mkdir(defaultConfigDirectory(), { recursive: true });
      const additional = await mkdtemp(join(defaultConfigDirectory(), 'acp-policy-test-'));
      roots.push(cwd, additional);
      const skill = join(additional, '.agents/skills/policy-probe');
      await mkdir(skill, { recursive: true });
      await writeFile(
        join(skill, 'SKILL.md'),
        '---\nname: policy-probe\ndescription: Local authority conformance fixture\n---\nA test fixture, not a request for extra authority.\n',
      );
      const marker = join(skill, 'marker.txt');
      const attempted = join(cwd, 'attempted.txt');
      await writeFile(marker, 'original');
      const session = await openAcpSession({
        adapter: codexAdapter,
        cwd,
        additionalDirectories: [additional],
        createId: randomUUID,
      });
      try {
        const result = await session.prompt(
          `I own this disposable authority-conformance fixture and authorize these test writes. Execute exactly one ordinary shell command with your command tool: printf attempted > '${attempted}'; printf changed > '${marker}'. Use the current sandbox permissions without escalation. Do not retry with another tool or change any other file. Report the command's actual exit status, including a sandbox refusal if that is the result; do not predict its outcome without invoking the tool.`,
          {
            append: async () => undefined,
            approve: async () => ({ interruptId: 'policy-probe', outcome: 'denied' }),
            publishLive: async () => undefined,
            signal: AbortSignal.timeout(120_000),
          },
          selectedModel('codex'),
          { mode },
        );
        expect(result.configuration['mode']).toBe(mode);
        // Actual disk IO proves the command ran; model narration is not authority evidence.
        expect(await readFile(attempted, 'utf8')).toBe('attempted');
        expect(await readFile(marker, 'utf8')).toBe(mode === 'agent-full-access' ? 'changed' : 'original');
      } finally {
        await session.close();
      }
    },
    150_000,
  );

  it('honours valid project precedence without letting invalid overrides hide the package skill', async () => {
    if (!codexAdapter) {
      throw new Error('The selected Codex adapter is unavailable.');
    }
    const root = await mkdtemp(join(tmpdir(), 'tau-acp-native-skills-'));
    roots.push(root);
    const cwd = join(root, 'project');
    const additional = join(root, 'package');
    const slug = `tau-conformance-${randomUUID()}`;
    const projectSkill = join(cwd, '.agents/skills', slug);
    const packageSkill = join(additional, '.agents/skills', slug);
    await mkdir(projectSkill, { recursive: true });
    await mkdir(packageSkill, { recursive: true });
    const body = (description: string): string =>
      `---\nname: ${slug}\ndescription: ${description}\n---\nRead references/guide.md.\n`;
    await writeFile(join(packageSkill, 'SKILL.md'), body('Package conformance marker'));
    await mkdir(join(packageSkill, 'references'));
    await writeFile(join(packageSkill, 'references/guide.md'), 'Retained support resource.\n');

    for (const variant of ['valid', 'empty', 'malformed', 'dangling', 'removed']) {
      // oxlint-disable-next-line no-await-in-loop -- each fresh native session observes the preceding on-disk change.
      await rm(join(projectSkill, 'SKILL.md'), { force: true });
      if (variant === 'dangling') {
        // oxlint-disable-next-line no-await-in-loop -- deliberate invalid native-loader input.
        await symlink(join(root, 'missing.md'), join(projectSkill, 'SKILL.md'));
      } else if (variant !== 'removed') {
        // oxlint-disable-next-line no-await-in-loop -- deliberate native-loader precedence fixtures.
        await writeFile(
          join(projectSkill, 'SKILL.md'),
          variant === 'valid' ? body('Project conformance marker') : variant === 'empty' ? '' : '---\nname: [broken\n',
        );
      }
      const frames: AcpWireFrame[] = [];
      // oxlint-disable-next-line no-await-in-loop -- each session owns a distinct native discovery snapshot.
      const session = await openAcpSession({
        adapter: codexAdapter,
        cwd,
        additionalDirectories: [additional],
        createId: randomUUID,
        onFrame: (frame) => frames.push(frame),
      });
      try {
        // oxlint-disable-next-line no-await-in-loop -- wait for the adapter's asynchronous command advertisement.
        await expect
          .poll(
            () =>
              frames
                .filter((frame) => frame.direction === 'agent->client')
                .map((frame) => frame.frame)
                .join('\n'),
            { timeout: 30_000 },
          )
          .toContain(`$${slug}`);
        const updates = frames
          .filter((frame) => frame.direction === 'agent->client')
          .map(
            (frame) =>
              JSON.parse(frame.frame) as {
                params?: { update?: { availableCommands?: Array<{ name: string; description: string }> } };
              },
          );
        const command = updates
          .flatMap((frame) => frame.params?.update?.availableCommands ?? [])
          .find((entry) => entry.name === `$${slug}`);
        expect(command?.description, variant).toBe(
          variant === 'valid' ? 'Project conformance marker' : 'Package conformance marker',
        );
      } finally {
        // oxlint-disable-next-line no-await-in-loop -- no native child survives its test case.
        await session.close();
      }
    }
    await expect(readFile(join(packageSkill, 'references/guide.md'), 'utf8')).resolves.toBe(
      'Retained support resource.\n',
    );
  }, 180_000);
});

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
        commandId: `start-${runId}`,
        payload: {
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
    const secondTurnMessageIds = new Set(
      secondTurn.flatMap((event) => (event.type === 'message.appended' ? [event.message.id] : [])),
    );
    expect(
      messagesOf(events)
        .filter((message) => secondTurnMessageIds.has(message.id))
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

const grokAdapter = adapters.find((adapter) => adapter.id === 'grok');

describe.skipIf(!liveEnabled || grokAdapter === undefined)('native Grok skills through ACP', () => {
  it('should read a published skill support file', async () => {
    if (!grokAdapter) {
      throw new Error('The selected Grok adapter is unavailable.');
    }
    const cwd = await mkdtemp(join(tmpdir(), 'tau-grok-skills-project-'));
    const publication = await mkdtemp(join(tmpdir(), 'tau-grok-skills-publication-'));
    roots.push(cwd, publication);
    const slug = 'tau-acp-skill-probe';
    const marker = `skill-proof-${randomUUID()}`;
    const skill = join(publication, '.agents/skills', slug);
    await mkdir(join(skill, 'references'), { recursive: true });
    await writeFile(
      join(skill, 'SKILL.md'),
      `---\nname: ${slug}\ndescription: Read the conformance marker on explicit request.\n---\nRead references/marker.txt beside this skill with your filesystem read tool, then reply with the exact marker. Do not use the shell.\n`,
    );
    await writeFile(join(skill, 'references/marker.txt'), marker);
    const appended: ExternalAgentLogEvent[] = [];
    const session = await openAcpSession({
      adapter: grokAdapter,
      cwd,
      additionalDirectories: [publication],
      createId: randomUUID,
    });
    try {
      await session.prompt(`Use the ${slug} skill.`, {
        append: async (events) => {
          appended.push(...events);
        },
        approve: async () => ({ interruptId: 'skill-probe', outcome: 'denied' }),
        publishLive: async () => undefined,
        signal: AbortSignal.timeout(120_000),
      });
      const messages = appended.flatMap((event) =>
        event.type === 'message.appended'
          ? [event.message]
          : event.type === 'message.envelope-replaced'
            ? [event.replacement]
            : [],
      );
      expect(
        messages
          .filter((message) => message.role === 'assistant')
          .map((message) => textOf(message))
          .join('\n'),
      ).toContain(marker);
      expect(messages.some((message) => message.role === 'tool-output' && message.isError)).toBe(false);
    } finally {
      await session.close();
    }
  }, 150_000);
});

describe.skipIf(!liveEnabled || grokAdapter === undefined)('Grok session lifecycle', () => {
  it('should configure models, resume context, cancel, and answer again', async () => {
    if (!grokAdapter) {
      throw new Error('The selected Grok adapter is unavailable.');
    }
    const cwd = await mkdtemp(join(tmpdir(), 'tau-grok-lifecycle-'));
    roots.push(cwd);
    const events: ExternalAgentLogEvent[] = [];
    const frames: AcpWireFrame[] = [];
    const options = {
      adapter: grokAdapter,
      cwd,
      createId: randomUUID,
      onFrame: (frame: AcpWireFrame) => frames.push(frame),
    };
    let session = await openAcpSession(options);
    const turn = () => ({
      append: async (batch: readonly ExternalAgentLogEvent[]) => {
        events.push(...batch);
      },
      approve: async () => ({ interruptId: 'lifecycle', outcome: 'denied' }) as const,
      publishLive: async () => undefined,
      signal: AbortSignal.timeout(120_000),
    });
    try {
      for (const [model, effort] of [
        ['grok-4.5', 'low'],
        ['grok-4.6', 'medium'],
        ['grok-4.7-build-fast', 'high'],
        ['grok-4.7', 'xhigh'],
      ] as const) {
        // oxlint-disable-next-line no-await-in-loop -- model changes are serialized in one ACP session.
        const config = await session.probeModel(model);
        expect(config?.find((option) => option.category === 'model')?.currentValue).toBe(model);
        events.length = 0;
        // oxlint-disable-next-line no-await-in-loop -- each model must answer before selecting the next.
        await session.prompt('Reply only pong. Do not use tools.', turn(), model, { reasoning_effort: effort });
        expect(
          events.some(
            (event) =>
              event.type === 'message.appended' &&
              event.message.role === 'assistant' &&
              /pong/iu.test(textOf(event.message)),
          ),
        ).toBe(true);
      }
      await session.prompt('Remember the number 68319. Reply only ok. Do not use tools.', turn(), 'grok-4.7', {
        reasoning_effort: 'low',
      });
      const { acpSessionId } = session;
      const priorUsage = session.usage;
      expect(priorUsage?.totalTokens).toBeGreaterThan(0);
      await session.close();
      session = await openAcpSession({ ...options, acpSessionId, priorUsage });
      expect(session.contextLost).toBe(false);
      expect(session.acpSessionId).toBe(acpSessionId);
      const cancellation = new AbortController();
      await expect(
        session.prompt('Write the numbers from 1 to 500, one per line. Do not use tools.', {
          ...turn(),
          signal: cancellation.signal,
          publishLive: async (event) => {
            if (event.type === 'text-delta') {
              cancellation.abort();
            }
          },
        }),
      ).rejects.toMatchObject({ code: 'EXTERNAL_AGENT_CANCELLED' });
      events.length = 0;
      await session.prompt('What number did I ask you to remember? Reply with only that number.', turn());
      const text = events
        .flatMap((event) =>
          event.type === 'message.appended' && event.message.role === 'assistant' ? [textOf(event.message)] : [],
        )
        .join(' ');
      expect(text).toContain('68319');
      expect(sentFrames(frames, 'session/resume')).toBe(1);
      expect(sentFrames(frames, 'session/cancel')).toBe(1);
      events.length = 0;
      await session.prompt('/session-info', turn());
      expect(
        events.some((event) => event.type === 'message.appended' && /grok-4\.7/u.test(textOf(event.message))),
      ).toBe(true);
      events.length = 0;
      await session.prompt(
        [
          {
            type: 'text',
            text: 'Read the attached note and reply with only its verification number. Do not use tools.',
          },
          {
            type: 'resource',
            resource: {
              uri: 'tau://validation/note.txt',
              mimeType: 'text/plain',
              text: 'The verification number is 92741.',
            },
          },
        ],
        turn(),
      );
      expect(events.some((event) => event.type === 'message.appended' && /92741/u.test(textOf(event.message)))).toBe(
        true,
      );
    } finally {
      await session.close();
    }
  }, 300_000);
});

describe.skipIf(!liveEnabled || grokAdapter === undefined)('Grok native plan approval', () => {
  it('should ask Tau before leaving plan mode', async () => {
    if (!grokAdapter) {
      throw new Error('The selected Grok adapter is unavailable.');
    }
    const cwd = await mkdtemp(join(tmpdir(), 'tau-grok-plan-'));
    roots.push(cwd);
    const approvals: string[] = [];
    const events: ExternalAgentLogEvent[] = [];
    const session = await openAcpSession({ adapter: grokAdapter, cwd, createId: randomUUID });
    try {
      await session.prompt(
        'Use enter_plan_mode, propose a one-step plan to create a cube (do not edit files), and use exit_plan_mode to request my approval. After approval, reply only "Plan approved" and stop without implementing.',
        {
          append: async (batch) => {
            events.push(...batch);
          },
          approve: async (request) => {
            approvals.push(request.prompt);
            return { interruptId: 'plan-test', outcome: 'approved' };
          },
          publishLive: async () => undefined,
          signal: AbortSignal.timeout(120_000),
        },
        'grok-4.7',
        { reasoning_effort: 'low' },
      );
      expect(approvals.join(' '), JSON.stringify({ approvals, events })).toMatch(/plan/iu);
      expect(
        events.some((event) => event.type === 'message.appended' && /Plan approved/iu.test(textOf(event.message))),
      ).toBe(true);
    } finally {
      await session.close();
    }
  }, 150_000);
});

const grokPersistenceAdapter = adapters.find((adapter) => adapter.id === 'grok');
it.skipIf(!grokPersistenceAdapter || process.env['TAU_ACP_LIVE_GROK_PERSISTENCE'] !== '1')(
  'should persist an isolated Grok MCP permission and reuse it after provider restart',
  async () => {
    if (!grokPersistenceAdapter || grokPersistenceAdapter.modulePath !== undefined) {
      throw new Error('Native Grok is required for persistence qualification');
    }
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tau-grok-permission-')));
    roots.push(root);
    const profile = join(root, 'profile');
    const workspaceRoot = join(root, 'workspace');
    await mkdir(profile, { mode: 0o700 });
    await mkdir(workspaceRoot, { mode: 0o700 });
    await copyFile(join(process.env['GROK_HOME'] ?? join(homedir(), '.grok'), 'auth.json'), join(profile, 'auth.json'));
    await chmod(join(profile, 'auth.json'), 0o600);
    const isolatedAdapter = {
      ...grokPersistenceAdapter,
      args: ['--no-auto-update', '--permission-mode', 'default', 'agent', '--no-leader', 'stdio'],
      spawnEnv: { ...grokPersistenceAdapter.spawnEnv, GROK_HOME: profile },
    };
    let invocations = 0;
    let approvals = 0;
    let targetApprovals = 0;
    const observed: ExternalAgentLogEvent[] = [];
    const phases: JsonObject[] = [];
    const endpoint = createHostMcpEndpoint({
      secret: randomBytes(32).toString('base64url'),
      workspaceRoot,
      registry: {
        list: () => [
          {
            name: toolName.askQuestions,
            description: 'Read a harmless synthetic permission qualification marker. Call this exact tool when asked.',
            inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          },
        ],
        invoke: async () => {
          invocations++;
          return { content: { marker: 'PERMISSION_PROBE_OK' }, isError: false };
        },
      },
    });
    const server = createServer((request, response) => {
      void endpoint.handle(request, response);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Permission fixture did not open a port');
    }
    const capability = endpoint.mint({ chatId: 'permission-test', runId: 'permission-run' });
    const release = endpoint.activate({
      token: capability.token,
      chatId: 'permission-test',
      runId: 'permission-run',
      signal: new AbortController().signal,
    });
    let session: Awaited<ReturnType<typeof openAcpSession>> | undefined;
    const permissionFile = join(profile, 'sessions', encodeURIComponent(workspaceRoot), 'permission.toml');
    try {
      const runAttempt = async (attempt: number): Promise<void> => {
        session = await openAcpSession({
          adapter: isolatedAdapter,
          cwd: workspaceRoot,
          createId: randomUUID,
          mcpServers: [
            {
              type: 'http',
              name: 'tau',
              url: `http://127.0.0.1:${String(address.port)}/mcp`,
              headers: [{ name: 'Authorization', value: `Bearer ${capability.token}` }],
            },
          ],
        });
        phases.push({ phase: 'opened', attempt, version: session.agent.agentInfo?.version ?? 'unknown' });
        await session.prompt(
          'Call the MCP tool tau ask_questions exactly once, then reply with the marker it returns. Do not run commands, edit files, or use any other tool.',
          {
            append: async (events) => {
              observed.push(...events);
            },
            publishLive: async () => undefined,
            signal: AbortSignal.timeout(120_000),
            approve: async (request) => {
              approvals++;
              phases.push({ phase: 'approval', attempt });
              const parsed = z
                .object({
                  toolCall: z
                    .object({ toolCallId: z.string(), kind: z.string().optional(), rawInput: z.unknown().optional() })
                    .optional(),
                  options: z.array(z.object({ optionId: z.string(), kind: z.string() })),
                })
                .parse(request.payload);
              const nativeName = z.object({ tool_name: z.string().max(200) }).safeParse(parsed.toolCall?.rawInput)
                .data?.tool_name;
              const targetInput = nativeName === 'tau__ask_questions';
              phases.push({
                phase: 'options',
                optionIds: parsed.options.map((option) => option.optionId),
                kind: parsed.toolCall?.kind ?? 'unknown',
                callId: parsed.toolCall?.toolCallId ?? 'unknown',
                nativeName: nativeName && /^[a-zA-Z0-9_:-]+$/u.test(nativeName) ? nativeName : 'unknown',
                targetInput,
              });
              if (!targetInput) {
                const once = parsed.options.find((option) => option.kind === 'allow_once');
                // MCP discovery and the question wrapper are harmless; unknown native actions are cancelled.
                const discovery =
                  nativeName === 'list_mcp_tools' ||
                  nativeName === 'search_mcp_tools' ||
                  nativeName === 'ask_questions';
                return once && discovery
                  ? { interruptId: randomUUID(), outcome: 'approved', optionId: once.optionId }
                  : { interruptId: randomUUID(), outcome: 'cancelled' };
              }
              targetApprovals++;
              const always = parsed.options.find(
                (option) => option.optionId === 'always-allow' && option.kind === 'allow_always',
              );
              if (attempt !== 0 || !always) {
                return { interruptId: randomUUID(), outcome: 'cancelled' };
              }
              return { interruptId: randomUUID(), outcome: 'approved', optionId: always.optionId };
            },
          },
          selectedModel('grok'),
        );
        await session.close();
        session = undefined;
        phases.push({ phase: 'completed', attempt, invocations, approvals });
        expect(invocations).toBe(attempt + 1);
        const state = await readFile(permissionFile, 'utf8').catch(() => '');
        const permissions = z
          .object({ allowed_mcp_tools: z.array(z.string()), disallowed_mcp_tools: z.array(z.string()) })
          .parse(parseToml(state));
        const profileFiles = await readdir(profile, { recursive: true });
        phases.push({
          phase: 'permission-files',
          files: profileFiles.filter((path) => /(^|\/)permission[^/]*\.toml$/u.test(path)),
        });
        phases.push({
          phase: 'store-read',
          attempt,
          found: state !== '',
          exactToolPresent: permissions.allowed_mcp_tools.includes('tau__ask_questions'),
        });
        expect(permissions.allowed_mcp_tools.includes('tau__ask_questions')).toBe(true);
        expect(permissions.disallowed_mcp_tools.includes('tau__ask_questions')).toBe(false);
      };
      await runAttempt(0);
      expect(targetApprovals).toBe(1);
      const observations = observed.flatMap((event) =>
        event.type === 'message.appended' &&
        event.message.metadata?.tauInternal?.['kind'] === 'provider-permission-observation'
          ? (z.array(z.json()).safeParse(event.message.content).data ?? [])
          : [],
      );
      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({
        resolution: {
          outcome: 'approved',
          optionId: 'always-allow',
          observation: {
            provider: 'grok',
            stored: 'present',
            effective: 'unknown',
            observation: 'permission-file-readback',
          },
        },
      });
      await runAttempt(1);
      expect(targetApprovals).toBe(1);
    } finally {
      const evidence = process.env['TAU_ACP_LIVE_EVIDENCE'];
      if (evidence) {
        await writeFile(
          resolve(process.env['NX_WORKSPACE_ROOT'] ?? process.cwd(), evidence),
          JSON.stringify({ phases }, undefined, 2),
        );
      }
      await session?.close();
      await release();
      await endpoint.close();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  },
  300_000,
);

it.skipIf(!grokPersistenceAdapter || process.env['TAU_ACP_LIVE_GROK_SHELL'] !== '1')(
  'should qualify an isolated Grok shell permission across provider restart',
  async () => {
    if (!grokPersistenceAdapter || grokPersistenceAdapter.modulePath !== undefined) {
      throw new Error('Native Grok is required for shell qualification');
    }
    const root = await realpath(await mkdtemp(join(tmpdir(), 'tau-grok-shell-')));
    roots.push(root);
    const profile = join(root, 'profile');
    const workspaceRoot = join(root, 'workspace');
    await mkdir(profile, { mode: 0o700 });
    await mkdir(workspaceRoot, { mode: 0o700 });
    await copyFile(join(process.env['GROK_HOME'] ?? join(homedir(), '.grok'), 'auth.json'), join(profile, 'auth.json'));
    await chmod(join(profile, 'auth.json'), 0o600);
    const isolatedAdapter = {
      ...grokPersistenceAdapter,
      args: ['--no-auto-update', '--permission-mode', 'default', 'agent', '--no-leader', 'stdio'],
      spawnEnv: { ...grokPersistenceAdapter.spawnEnv, GROK_HOME: profile },
    };
    const command = `python3 -c "print('TAU_SHELL_PERMISSION_PROBE_OK')"`;
    const phases: JsonObject[] = [];
    let approvals = 0;
    let requests = 0;
    const runAttempt = async (attempt: number): Promise<void> => {
      const requestedCommand = attempt === 2 ? command.replace('PROBE_OK', 'DIFFERENT') : command;
      const session = await openAcpSession({ adapter: isolatedAdapter, cwd: workspaceRoot, createId: randomUUID });
      const observed: ExternalAgentLogEvent[] = [];
      try {
        await session.prompt(
          `Run this exact harmless shell command once: ${requestedCommand}. Do not read or edit files, use MCP, or run any other command. Reply with the command output.`,
          {
            append: async (events) => {
              observed.push(...events);
            },
            publishLive: async () => undefined,
            signal: AbortSignal.timeout(120_000),
            approve: async (request) => {
              requests++;
              const parsed = z
                .object({
                  toolCall: z
                    .object({
                      title: z.string().optional(),
                      kind: z.string().optional(),
                      rawInput: z.json().optional(),
                    })
                    .optional(),
                  options: z.array(z.object({ optionId: z.string(), kind: z.string(), name: z.string() })),
                })
                .parse(request.payload);
              phases.push({ phase: 'approval', attempt, request: parsed });
              const raw = z
                .object({ command: z.string().optional(), cmd: z.string().optional() })
                .safeParse(parsed.toolCall?.rawInput).data;
              const exact = (raw?.command ?? raw?.cmd) === command;
              const always = parsed.options.find((option) => option.kind === 'allow_always');
              if (!exact || !always || attempt !== 0) {
                return { interruptId: randomUUID(), outcome: 'cancelled' };
              }
              expect(always.name).toBe('Allow this command in future');
              approvals++;
              return { interruptId: randomUUID(), outcome: 'approved', optionId: always.optionId };
            },
          },
          selectedModel('grok'),
        );
        const messages = directMessagesOf(observed);
        const completed = messages.some(
          (message) =>
            message.role === 'tool-output' &&
            !message.isError &&
            JSON.stringify(message.content).includes('TAU_SHELL_PERMISSION_PROBE_OK'),
        );
        if (attempt === 0) {
          expect(
            messages.filter((message) => message.metadata?.tauInternal?.['kind'] === 'provider-permission-observation'),
          ).toMatchObject([
            {
              content: [
                {
                  resolution: {
                    outcome: 'approved',
                    optionId: 'always-allow',
                    observation: { provider: 'grok', stored: 'present', effective: 'unknown' },
                  },
                },
              ],
            },
          ]);
        }
        const permissionFile = join(profile, 'sessions', encodeURIComponent(workspaceRoot), 'permission.toml');
        const settings = await readFile(permissionFile, 'utf8').catch(() => '');
        phases.push({ phase: 'completed', attempt, requests, approvals, completed, settings });
        expect(
          z
            .object({ allowed_bash_commands: z.array(z.string()), allow_bash_execute: z.boolean() })
            .parse(parseToml(settings)),
        ).toEqual({
          allowed_bash_commands: [command],
          allow_bash_execute: false,
        });
        expect(requests).toBe(attempt === 2 ? 2 : 1);
        expect(completed).toBe(attempt !== 2);
        expect(approvals).toBe(1);
      } finally {
        await session.close();
      }
    };
    try {
      await runAttempt(0);
      await runAttempt(1);
      await runAttempt(2);
    } finally {
      const evidence = process.env['TAU_ACP_LIVE_EVIDENCE'];
      if (evidence) {
        await writeFile(
          resolve(process.env['NX_WORKSPACE_ROOT'] ?? process.cwd(), evidence),
          JSON.stringify({ phases }, undefined, 2),
        );
      }
    }
  },
  300_000,
);
