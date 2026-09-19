import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type {
  AgentLiveEvent,
  AgentSession,
  AgentSessionModel,
  CompactionOutcome,
  HostRunSnapshot,
  HostToolInvocation,
  HostToolResult,
  JsonValue,
  ProviderMessage,
  ToolInputProviderMessage,
} from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import {
  createLiveSession,
  createLiveToolRegistry,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveCredentialName,
  liveSessionModel,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';

/**
 * Live provider-switch suite.
 *
 * One chat, one durable event log, two models: a switch is a second session on
 * the same log with a different model, which is exactly what the browser does
 * when a user changes the model mid-thread. Each ordered pair runs both
 * directions, because a user can switch either way, and every leg goes through
 * the production path — the agent host's gateway transport, Tau's own LLM
 * gateway in direct mode, the real provider — carrying the production CAD
 * system prompt and the full production toolbelt.
 *
 * Assertions are on durable outcomes only: the run's lifecycle state, the
 * paired tool-call/tool-result rows of the session log, and whether the answer
 * carries the distinctive token a scripted tool result handed back. Nothing
 * here asserts a model's prose style.
 */

/** Tokens no model can guess, so a turn-two answer proves turn-one context replayed. */
const alphaToken = 'TAU-7Q4X-ALPHA';
const betaToken = 'TAU-5M2J-BETA';
const leftToken = 'TAU-3K8D-LEFT';
const rightToken = 'TAU-9V6S-RIGHT';
const ledgerToken = 'TAU-4P1Z-LEDGER';

/**
 * Bulk that pushes one tool result past a reduced context window.
 *
 * The compaction row needs a history the model itself produced to be larger
 * than the window it runs under; padding the file the tool returns is the
 * cheapest live way to get there.
 */
const ledgerBody = Array.from(
  { length: 480 },
  (_, index) =>
    `// row ${String(index).padStart(3, '0')}: bearing seat ${String(12 + (index % 37))}mm, clearance ${String(index % 9)}um, batch L-${String(index * 7)}`,
).join('\n');

/** The scripted project the toolbelt reads; only the results are scripted, the tool listing is production. */
const scriptedFiles: Readonly<Record<string, string>> = {
  'alpha.ts': `export const token = '${alphaToken}';\n`,
  'beta.ts': `export const token = '${betaToken}';\n`,
  'left.ts': `export const token = '${leftToken}';\n`,
  'right.ts': `export const token = '${rightToken}';\n`,
  'ledger.ts': `${ledgerBody}\nexport const token = '${ledgerToken}';\n`,
};

const isObject = (value: JsonValue): value is Readonly<Record<string, JsonValue>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** @returns The file name a path-shaped tool input named, ignoring any rooting the model chose. */
const namedFile = (input: JsonValue): string | undefined => {
  const target = isObject(input) ? input['targetFile'] : undefined;
  return typeof target === 'string' ? (/[^/]+\/?$/u.exec(target)?.[0]?.replace(/\/$/u, '') ?? undefined) : undefined;
};

const readFileResult = (input: JsonValue): HostToolResult => {
  const file = namedFile(input);
  const content = file === undefined ? undefined : scriptedFiles[file];
  if (content === undefined) {
    return {
      content: {
        success: false,
        errorCode: 'FILE_NOT_FOUND',
        message: `This project has no file named ${file ?? 'that'}.`,
      },
      isError: true,
    };
  }
  return {
    content: {
      success: true,
      content,
      size: content.length,
      contentKind: 'text',
      totalLines: content.split('\n').length,
    },
    isError: false,
  };
};

/** Deterministic outcomes for the real toolbelt, so a switch replays a history the suite chose. */
const scriptedResults = (invocation: HostToolInvocation): HostToolResult =>
  invocation.toolName === toolName.readFile
    ? readFileResult(invocation.input)
    : {
        content: {
          success: false,
          errorCode: 'TOOL_UNAVAILABLE',
          message: `${invocation.toolName} is not available in this project; follow the instruction exactly.`,
        },
        isError: true,
      };

/** Cheap legs keep the smallest completion budget that still fits a tool loop with thinking. */
const economyMaxTokens = 4096;
/** Anthropic's reasoning floor is a thinking budget rather than an effort word. */
const economyThinkingBudget = 1024;
/**
 * How much of the compacting leg's window the history it inherits fills.
 *
 * The window is derived from what the provider actually billed for the turn
 * before, rather than fixed: a fixed small window would sit below the
 * production CAD system prompt, and no eviction can bring a history under a
 * window the unevictable prompt already exceeds. At this ratio the history is
 * over compaction's threshold (80% of the window) while the `ledger.ts` result
 * it must evict is worth roughly a fifth of it, so eviction alone is enough.
 */
const compactionWindowFill = 0.85;
/** The summarizer writes a structured summary; the economy ceiling can truncate it. */
const compactionMaxTokens = 8192;

/**
 * One catalog row projected onto the cheapest configuration that keeps reasoning on.
 *
 * @param modelId - Tau catalog model id.
 * @param contextWindow - Override used only by the compaction row.
 * @param maxTokens - Completion ceiling; the economy ceiling applies when absent.
 * @returns The `AgentSessionModel` this suite runs a leg with.
 */
const legModel = (modelId: string, contextWindow?: number, maxTokens?: number): AgentSessionModel => {
  const { reasoning: declared, ...identity } = liveSessionModel(modelId);
  const reasoning: AgentSessionModel['reasoning'] =
    declared === undefined
      ? undefined
      : identity.providerKind === 'anthropic'
        ? { budgetTokens: economyThinkingBudget }
        : { ...declared, effort: 'low' };
  return {
    ...identity,
    maxTokens: maxTokens ?? economyMaxTokens,
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(reasoning === undefined ? {} : { reasoning }),
  };
};

let started: { readonly gateway: LiveGateway; readonly root: string } | undefined;

/** @returns The one in-process gateway and scratch root this file's live turns share, booted on first use. */
const live = async (): Promise<{ readonly gateway: LiveGateway; readonly root: string }> => {
  started ??= {
    gateway: await startLiveGateway(),
    root: await mkdtemp(join(tmpdir(), 'tau-api-live-switch-')),
  };
  return started;
};

afterAll(async () => {
  if (!started) {
    return;
  }
  await started.gateway.close();
  await rm(started.root, { recursive: true, force: true });
});

/** One chat: the durable log both models of a pair replay. */
type LiveThread = {
  readonly gateway: LiveGateway;
  readonly chatId: string;
  readonly filePath: string;
};

type LegOptions = {
  readonly thread: LiveThread;
  readonly modelId: string;
  /** One-based position in the thread; it names this leg's run and user message. */
  readonly index: number;
  readonly prompt: string;
  /** Reduced window for the compaction row; absent, the catalog's own window applies. */
  readonly contextWindow?: number | undefined;
  /** Completion ceiling for the compaction row's summarizer; absent, the economy ceiling applies. */
  readonly maxTokens?: number | undefined;
  /** Records each compaction this leg performed, so a refused turn reports what it had already evicted. */
  readonly onCompaction?: ((outcome: CompactionOutcome) => void) | undefined;
  /**
   * Abort as soon as the assistant message that follows the tool result starts
   * streaming, leaving the run cancelled mid-loop with the result durable and
   * no final answer.
   */
  readonly stopAfterToolResult?: boolean | undefined;
};

/**
 * Run one user turn of a thread on one model.
 *
 * Every leg opens its own session on the same durable event log with its own
 * run id, because a session is terminal once its run ends. A leg whose model
 * differs from the previous one is the provider switch under test.
 *
 * @param options - The thread, the model this leg runs on, and the turn it sends.
 * @returns That run's snapshot, including the whole replayed history.
 */
const runLeg = async (options: LegOptions): Promise<HostRunSnapshot> => {
  const { thread } = options;
  const runId = `${thread.chatId}-run-${String(options.index)}`;
  const liveMessageIds = new Set<string>();
  // The abort hook is installed with the session it aborts, so the session
  // itself can only be reached through a holder.
  const running: { current?: AgentSession } = {};
  /*
   * The assistant message that follows a tool result can only start streaming
   * after that result was recorded, so a second distinct live message id is the
   * session API's own signal that the loop is past the result and before the
   * answer. That is the cleanest real stop point the API offers.
   */
  const stopAfterToolResult = (event: AgentLiveEvent): void => {
    liveMessageIds.add(event.messageId);
    if (liveMessageIds.size > 1) {
      running.current?.abort();
    }
  };
  const session = await createLiveSession({
    gateway: thread.gateway,
    chatId: thread.chatId,
    runId,
    leaderEpoch: `${thread.chatId}-epoch-1`,
    systemPrompt: liveCadSystemPrompt({ chatId: thread.chatId, modelId: options.modelId }),
    model: legModel(options.modelId, options.contextWindow, options.maxTokens),
    toolRegistry: createLiveToolRegistry({ results: scriptedResults }),
    eventLog: await createNodeEventLog({ filePath: thread.filePath }),
    ...(options.onCompaction === undefined ? {} : { onCompaction: options.onCompaction }),
    ...(options.stopAfterToolResult === true ? { onLiveEvent: stopAfterToolResult } : {}),
  });
  running.current = session;
  try {
    await session.prompt({
      id: `${thread.chatId}-user-${String(options.index)}`,
      role: 'user',
      content: options.prompt,
    });
    return await session.snapshot();
  } finally {
    await session.close();
  }
};

/**
 * Run one switch thread, honoring an upstream rate limit.
 *
 * The retry unit is the whole thread on a fresh chat: by the time a later leg
 * is refused the earlier legs have already written to the log, and a run is
 * terminal once it fails, so replaying only the failing leg against that log
 * would resume a half-written thread. A new chat id per attempt gives each
 * attempt its own log file.
 *
 * @param slug - Chat prefix identifying this row.
 * @param legs - Runs the thread's legs in order and returns their snapshots.
 * @returns The snapshots of the last attempt.
 */
const liveSwitch = async (
  slug: string,
  legs: (thread: LiveThread) => Promise<readonly HostRunSnapshot[]>,
): Promise<readonly HostRunSnapshot[]> => {
  let produced: readonly HostRunSnapshot[] = [];
  await runWithRateLimitRetry(async () => {
    const { gateway, root } = await live();
    const chatId = `${slug}-${randomUUID().slice(0, 8)}`;
    produced = await legs({ gateway, chatId, filePath: join(root, chatId, 'events.jsonl') });
    const decisive = produced.find((leg) => leg.state === 'failed') ?? produced.at(-1);
    if (!decisive) {
      throw new Error('A switch thread needs at least one leg.');
    }
    return decisive;
  });
  return produced;
};

/** @returns The role of the message one durable row appended, when it appended one. */
const appendedRole = (line: string): string | undefined => {
  const event = JSON.parse(line) as { readonly type?: string; readonly message?: { readonly role?: string } };
  return event.type === 'message.appended' ? event.message?.role : undefined;
};

/**
 * Cut the durable log at the first tool result, leaving the call unanswered.
 *
 * The session API has no way to end a run between recording a tool call and
 * recording its result — the host records the call and dispatches it in the
 * same step — so the orphan is produced the way a real one is: by dropping the
 * rows a host that died mid-dispatch never got to write. Only real rows the
 * provider produced are kept; nothing is fabricated.
 *
 * ponytail: suffix truncation of a real log; if the host ever grows an API that
 * can stop a run between the call and its dispatch, drive that instead.
 *
 * @param filePath - The thread's event log, with no writer holding it.
 * @returns How many rows were dropped and how many tool calls survived.
 */
const orphanTrailingToolCall = async (
  filePath: string,
): Promise<{ readonly dropped: number; readonly toolInputs: number }> => {
  const contents = await readFile(filePath, 'utf8');
  const lines = contents.split('\n').filter((line) => line.length > 0);
  const cut = lines.findIndex((line) => appendedRole(line) === 'tool-output');
  if (cut === -1) {
    throw new Error('The leg recorded no tool result, so there is no tool call to orphan.');
  }
  const kept = lines.slice(0, cut);
  await writeFile(filePath, `${kept.join('\n')}\n`);
  return {
    dropped: lines.length - cut,
    toolInputs: kept.filter((line) => appendedRole(line) === 'tool-input').length,
  };
};

/** @returns The provider's own refusal when there was one, so a failing row reports why. */
const refusal = (snapshot: HostRunSnapshot): string => JSON.stringify(snapshot.failure ?? snapshot.messages.slice(-2));

const expectCompleted = (snapshot: HostRunSnapshot): void => {
  expect(snapshot.state, refusal(snapshot)).toBe('completed');
};

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
          .join('')
      : '';

/** @returns The final answer's text, which is where a consumed tool result has to show up. */
const finalText = (snapshot: HostRunSnapshot): string => {
  const assistant = snapshot.messages.findLast((message) => message.role === 'assistant');
  if (!assistant) {
    expect.fail(`the thread produced no assistant message: ${refusal(snapshot)}`);
  }
  return textOf(assistant);
};

/**
 * Provider-reported context tokens of the newest answer.
 *
 * This is the number pi's compaction estimator anchors on once a history
 * carries real usage, so it is also the number a compaction row has to size its
 * window against.
 *
 * @param snapshot - A completed leg.
 * @returns Total tokens the provider billed for that answer's turn.
 */
const anchorTokens = (snapshot: HostRunSnapshot): number => {
  const usage = snapshot.messages.findLast(
    (message) => message.role === 'assistant' && (message.metadata?.usage?.input ?? 0) > 0,
  )?.metadata?.usage;
  if (!usage) {
    expect.fail(`the leg reported no usage to size a context window against: ${refusal(snapshot)}`);
  }
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
};

const toolCalls = (messages: readonly ProviderMessage[], name?: string): readonly ToolInputProviderMessage[] =>
  messages.filter(
    (message): message is ToolInputProviderMessage =>
      message.role === 'tool-input' && (name === undefined || message.toolName === name),
  );

/** @returns The rows the later leg added, so "B called a tool itself" cannot be satisfied by A's call. */
const addedBy = (leg: HostRunSnapshot, previous: HostRunSnapshot): readonly ProviderMessage[] =>
  leg.messages.slice(previous.messages.length);

/** Every tool call in this history was dispatched and answered; nothing was left open. */
const expectPairedToolMessages = (snapshot: HostRunSnapshot): void => {
  const answered = new Set(
    snapshot.messages.flatMap((message) => (message.role === 'tool-output' ? [message.toolCallId] : [])),
  );
  expect(
    toolCalls(snapshot.messages)
      .map((call) => call.toolCallId)
      .filter((id) => !answered.has(id)),
  ).toEqual([]);
  expect(toolCalls(snapshot.messages).length).toBeGreaterThan(0);
};

const readFileTurn = (file: string): string =>
  `Call ${toolName.readFile} on ${file}, then reply with the exact token that file contains and nothing else.`;

const recallTurn = `Without calling any tool, reply with the exact token the earlier ${toolName.readFile} result contained, and nothing else.`;

/** The ordered pairs a user can switch between, both directions each. */
const switchPairs: ReadonlyArray<{ readonly from: string; readonly to: string }> = [
  { from: 'openai-gpt-5.6-luna', to: 'google-gemini-3.7-flash' },
  { from: 'google-gemini-3.7-flash', to: 'openai-gpt-5.6-luna' },
  { from: 'openai-gpt-5.6-luna', to: 'anthropic-claude-haiku-4.5' },
  { from: 'anthropic-claude-haiku-4.5', to: 'openai-gpt-5.6-luna' },
  { from: 'anthropic-claude-haiku-4.5', to: 'google-gemini-3.7-flash' },
  { from: 'google-gemini-3.7-flash', to: 'anthropic-claude-haiku-4.5' },
  { from: 'anthropic-claude-haiku-4.5', to: 'google-gemini-3.8-flash' },
  { from: 'google-gemini-3.8-flash', to: 'anthropic-claude-haiku-4.5' },
  { from: 'xai-grok-4.6', to: 'google-gemini-3.7-flash' },
  { from: 'google-gemini-3.7-flash', to: 'xai-grok-4.6' },
  { from: 'xai-grok-4.6', to: 'anthropic-claude-haiku-4.5' },
  { from: 'anthropic-claude-haiku-4.5', to: 'xai-grok-4.6' },
  { from: 'google-gemini-3.7-flash', to: 'google-gemini-3.1-pro' },
  { from: 'google-gemini-3.1-pro', to: 'google-gemini-3.7-flash' },
];

const credentialsFor = (from: string, to: string): string =>
  from === to || liveCredentialName(from) === liveCredentialName(to)
    ? liveCredentialName(from)
    : `${liveCredentialName(from)} and ${liveCredentialName(to)}`;

const bothAvailable = (from: string, to: string): boolean => hasLiveCredential(from) && hasLiveCredential(to);

const switchTitle = (from: string, to: string, row: string): string =>
  `live provider switch (${row}): ${from} to ${to} (set ${credentialsFor(from, to)} in apps/api/.env to run)`;

const slugFor = (from: string, to: string, row: string): string => `${from}-to-${to}-${row}`;

/** The per-pair rows: turn two answers from turn one's tool result, then calls a tool itself, then resumes mid-loop. */
const describePair = ({ from, to }: { readonly from: string; readonly to: string }): void => {
  describe.skipIf(!bothAvailable(from, to))(switchTitle(from, to, 'pair'), () => {
    it("should answer on the new provider from the previous provider's tool result", async () => {
      const [first, second] = await liveSwitch(slugFor(from, to, 'recall'), async (thread) => {
        const legOne = await runLeg({ thread, modelId: from, index: 1, prompt: readFileTurn('alpha.ts') });
        if (legOne.state !== 'completed') {
          return [legOne];
        }
        return [legOne, await runLeg({ thread, modelId: to, index: 2, prompt: recallTurn })];
      });

      expect(first, 'the first leg produced no snapshot').toBeDefined();
      expectCompleted(first!);
      expectPairedToolMessages(first!);
      expect(finalText(first!)).toContain(alphaToken);
      expect(second, `the switch never ran: ${refusal(first!)}`).toBeDefined();
      expectCompleted(second!);
      expect(finalText(second!)).toContain(alphaToken);
    });

    it('should call a tool on the new provider and use both results', async () => {
      const [first, second] = await liveSwitch(slugFor(from, to, 'tool-on-b'), async (thread) => {
        const legOne = await runLeg({ thread, modelId: from, index: 1, prompt: readFileTurn('alpha.ts') });
        if (legOne.state !== 'completed') {
          return [legOne];
        }
        return [
          legOne,
          await runLeg({
            thread,
            modelId: to,
            index: 2,
            prompt: `Call ${toolName.readFile} on beta.ts. Then reply with two tokens separated by one space: first the token beta.ts contains, then the exact token the earlier ${toolName.readFile} result contained. Reply with nothing else.`,
          }),
        ];
      });

      expect(first, 'the first leg produced no snapshot').toBeDefined();
      expectCompleted(first!);
      expect(second, `the switch never ran: ${refusal(first!)}`).toBeDefined();
      expectCompleted(second!);
      expectPairedToolMessages(second!);
      const called = toolCalls(addedBy(second!, first!), toolName.readFile).map((call) => namedFile(call.content));
      expect(called, `${to} made no tool call of its own: ${refusal(second!)}`).toContain('beta.ts');
      expect(finalText(second!)).toContain(betaToken);
      expect(finalText(second!)).toContain(alphaToken);
    });

    it('should resume on the new provider a run stopped after a tool result', async () => {
      const [first, second] = await liveSwitch(slugFor(from, to, 'mid-loop'), async (thread) => {
        const legOne = await runLeg({
          thread,
          modelId: from,
          index: 1,
          prompt: readFileTurn('alpha.ts'),
          stopAfterToolResult: true,
        });
        if (legOne.state === 'failed') {
          return [legOne];
        }
        return [
          legOne,
          await runLeg({
            thread,
            modelId: to,
            index: 2,
            prompt: `Continue the interrupted work: reply with the exact token the earlier ${toolName.readFile} result contained, and nothing else.`,
          }),
        ];
      });

      expect(first, 'the first leg produced no snapshot').toBeDefined();
      expect(first!.state, `the first leg was not stopped mid-loop: ${refusal(first!)}`).toBe('cancelled');
      expect(
        first!.messages.filter((message) => message.role === 'tool-output').length,
        `the run was stopped before a tool result was recorded: ${refusal(first!)}`,
      ).toBeGreaterThan(0);
      expect(second, 'the switch never ran').toBeDefined();
      expectCompleted(second!);
      expect(finalText(second!)).toContain(alphaToken);
    });
  });
};

for (const pair of switchPairs) {
  describePair(pair);
}

/**
 * An unanswered tool call before a new user turn, once per target wire.
 *
 * Anthropic is the reason this row exists: pi answers the orphan with a
 * synthetic tool result, which the Messages wire encodes as a user message, so
 * the request carries two consecutive `user` messages (W4 pinned behaviour 3).
 */
const orphanRows: ReadonlyArray<{ readonly from: string; readonly to: string }> = [
  { from: 'google-gemini-3.7-flash', to: 'anthropic-claude-haiku-4.5' },
  { from: 'anthropic-claude-haiku-4.5', to: 'google-gemini-3.7-flash' },
  { from: 'anthropic-claude-haiku-4.5', to: 'openai-gpt-5.6-luna' },
];

for (const { from, to } of orphanRows) {
  describe.skipIf(!bothAvailable(from, to))(switchTitle(from, to, 'orphaned call'), () => {
    it('should accept a history whose last tool call never got a result', async () => {
      let orphan: { readonly dropped: number; readonly toolInputs: number } | undefined;
      const [first, second] = await liveSwitch(slugFor(from, to, 'orphan'), async (thread) => {
        const legOne = await runLeg({ thread, modelId: from, index: 1, prompt: readFileTurn('alpha.ts') });
        if (legOne.state !== 'completed') {
          return [legOne];
        }
        orphan = await orphanTrailingToolCall(thread.filePath);
        return [
          legOne,
          await runLeg({
            thread,
            modelId: to,
            index: 2,
            prompt:
              'The earlier tool call was abandoned. Do not call any tool. Reply with the word CONTINUE and nothing else.',
          }),
        ];
      });

      expect(first, 'the first leg produced no snapshot').toBeDefined();
      expectCompleted(first!);
      expect(orphan?.dropped, 'no rows were dropped, so nothing was orphaned').toBeGreaterThan(0);
      expect(orphan?.toolInputs, 'no tool call survived the cut').toBeGreaterThan(0);
      expect(second, 'the switch never ran').toBeDefined();
      expectCompleted(second!);
      expect(finalText(second!)).toContain('CONTINUE');
    });
  });
}

/** Compaction then switch, once per target wire, so the summary is proven to replay everywhere. */
const compactionRows: ReadonlyArray<{ readonly from: string; readonly to: string }> = [
  { from: 'anthropic-claude-haiku-4.5', to: 'google-gemini-3.7-flash' },
  { from: 'openai-gpt-5.6-luna', to: 'anthropic-claude-haiku-4.5' },
  { from: 'google-gemini-3.7-flash', to: 'openai-gpt-5.6-luna' },
];

for (const { from, to } of compactionRows) {
  describe.skipIf(!bothAvailable(from, to))(switchTitle(from, to, 'compaction'), () => {
    it('should answer on the new provider from knowledge that survived compaction', async () => {
      const compactions: CompactionOutcome[] = [];
      const legs = await liveSwitch(slugFor(from, to, 'compaction'), async (thread) => {
        compactions.length = 0;
        const legOne = await runLeg({ thread, modelId: from, index: 1, prompt: readFileTurn('ledger.ts') });
        if (legOne.state !== 'completed') {
          return [legOne];
        }
        // A small second turn, so the oversized tool result is no longer in the
        // recent tail: pi never offers a tool result as a cut point, and a
        // result the cut retains can never be summarised away.
        const legTwo = await runLeg({
          thread,
          modelId: from,
          index: 2,
          prompt: 'Reply with the word ACKNOWLEDGED and nothing else. Do not call any tool.',
        });
        if (legTwo.state !== 'completed') {
          return [legOne, legTwo];
        }
        // The reduced window applies to this leg only. Admitting it compacts the
        // oversized prefix, on the first provider, before the switch.
        const legThree = await runLeg({
          thread,
          modelId: from,
          index: 3,
          prompt: 'Reply with the word READY and nothing else. Do not call any tool.',
          contextWindow: Math.ceil(anchorTokens(legTwo) / compactionWindowFill),
          maxTokens: compactionMaxTokens,
          onCompaction: (outcome) => compactions.push(outcome),
        });
        if (legThree.state !== 'completed') {
          return [legOne, legTwo, legThree];
        }
        return [
          legOne,
          legTwo,
          legThree,
          await runLeg({
            thread,
            modelId: to,
            index: 4,
            prompt:
              'Without calling any tool, reply with the exact token the file ledger.ts contained, and nothing else.',
          }),
        ];
      });
      const [first, , compacted, switched] = legs;

      expect(first, 'the first leg produced no snapshot').toBeDefined();
      expectCompleted(first!);
      expect(compacted, `the compacting leg never ran: ${refusal(legs.at(-1)!)}`).toBeDefined();
      expect(
        compacted!.state,
        `${refusal(compacted!)} after compactions ${JSON.stringify(compactions.map(({ tier, cleared, evicted }) => ({ tier, cleared, evicted })))}`,
      ).toBe('completed');
      expect(
        compacted!.messages.some((message) => message.role === 'user' && textOf(message).includes('<summary>')),
        `the history was never compacted: ${String(compacted!.messages.length)} rows survived`,
      ).toBe(true);
      expect(
        compacted!.messages.some((message) => message.role === 'tool-output'),
        'the oversized tool result was not evicted, so the switch replays it rather than the summary',
      ).toBe(false);
      expect(switched, 'the switch never ran').toBeDefined();
      expectCompleted(switched!);
      expect(finalText(switched!)).toContain(ledgerToken);
    });
  });
}

/** A parallel tool batch then a switch, on the two wires whose signature and id rules differ most. */
const parallelRows: ReadonlyArray<{ readonly from: string; readonly to: string }> = [
  { from: 'anthropic-claude-haiku-4.5', to: 'google-gemini-3.7-flash' },
  { from: 'google-gemini-3.7-flash', to: 'anthropic-claude-haiku-4.5' },
];

for (const { from, to } of parallelRows) {
  describe.skipIf(!bothAvailable(from, to))(switchTitle(from, to, 'parallel batch'), () => {
    it('should replay a parallel tool batch on the new provider', async () => {
      const [first, second] = await liveSwitch(slugFor(from, to, 'parallel'), async (thread) => {
        const legOne = await runLeg({
          thread,
          modelId: from,
          index: 1,
          prompt: `In one step, call ${toolName.readFile} twice at the same time — once on left.ts and once on right.ts — then reply with both exact tokens separated by a space and nothing else.`,
        });
        if (legOne.state !== 'completed') {
          return [legOne];
        }
        return [
          legOne,
          await runLeg({
            thread,
            modelId: to,
            index: 2,
            prompt:
              'Without calling any tool, reply with both exact tokens from the two files read earlier, separated by one space, and nothing else.',
          }),
        ];
      });

      expect(first, 'the first leg produced no snapshot').toBeDefined();
      expectCompleted(first!);
      expectPairedToolMessages(first!);
      const read = toolCalls(first!.messages, toolName.readFile).map((call) => namedFile(call.content));
      expect(read).toContain('left.ts');
      expect(read).toContain('right.ts');
      expect(second, 'the switch never ran').toBeDefined();
      expectCompleted(second!);
      expect(finalText(second!)).toContain(leftToken);
      expect(finalText(second!)).toContain(rightToken);
    });
  });
}
