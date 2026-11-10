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
} from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import type { ChatMode } from '@taucad/chat/constants';
import {
  createLiveSession,
  createLiveToolRegistry,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveChatSettings,
  liveCompletionCeiling,
  liveCredentialName,
  liveRepeats,
  liveSessionModel,
  runWithRateLimitRetry,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveChatSettings, LiveGateway } from '#testing/live/live-gateway.harness.js';
import {
  expectCompleted,
  expectPairedToolMessages,
  finalText,
  refusal,
  textOf,
  toolCalls,
} from '#testing/live/live-assertions.js';

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
 * carries the distinctive marker a scripted tool result handed back. Nothing
 * here asserts a model's prose style.
 */

/** Markers no model can guess, so a turn-two answer proves turn-one context replayed. */
const alphaMarker = 'TAU-7Q4X-ALPHA';
const betaMarker = 'TAU-5M2J-BETA';
const leftMarker = 'TAU-3K8D-LEFT';
const rightMarker = 'TAU-9V6S-RIGHT';
const ledgerMarker = 'TAU-4P1Z-LEDGER';

/**
 * Bulk that pushes one tool result past a reduced context window.
 *
 * The compaction row needs a history the model itself produced to be larger
 * than the window it runs under; padding the file the tool returns is the
 * cheapest live way to get there.
 */
const ledgerRows = (count: number): string =>
  Array.from(
    { length: count },
    (_, index) =>
      `// row ${String(index).padStart(3, '0')}: bearing seat ${String(12 + (index % 37))}mm, clearance ${String(index % 9)}um, batch L-${String(index * 7)}`,
  ).join('\n');
const ledgerBody = ledgerRows(480);
const deltaMarker = 'TAU-8B5R-DELTA';
const rowsMarkers = { a: 'TAU-2H7C-ROWSA', b: 'TAU-6N3W-ROWSB' } as const;

/** The scripted project the toolbelt reads; only the results are scripted, the tool listing is production. */
const scriptedFiles: Readonly<Record<string, string>> = {
  'alpha.ts': `export const marker = '${alphaMarker}';\n`,
  'beta.ts': `export const marker = '${betaMarker}';\n`,
  'left.ts': `export const marker = '${leftMarker}';\n`,
  'right.ts': `export const marker = '${rightMarker}';\n`,
  'ledger.ts': `${ledgerBody}\nexport const marker = '${ledgerMarker}';\n`,
  // The reasoning-replay rows: a fifth small file, a twin of the ledger, and two files of bulk.
  'delta.ts': `export const marker = '${deltaMarker}';\n`,
  'ledger-odd.ts': `${ledgerBody}\nexport const marker = '${ledgerMarker}';\n`,
  'rows-a.ts': `${ledgerRows(1000)}\nexport const marker = '${rowsMarkers.a}';\n`,
  'rows-b.ts': `${ledgerRows(1000)}\nexport const marker = '${rowsMarkers.b}';\n`,
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

type ReasoningEffort = NonNullable<NonNullable<AgentSessionModel['reasoning']>['effort']>;

/** Manual Anthropic thinking uses a minimum budget rather than an effort word. */
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
 * @param options - `contextWindow` overrides the catalog's for a compacting leg; `maxTokens` is the completion
 * ceiling, the economy ceiling when absent; `effort` is for a row that needs the model to think, the cheapest when
 * absent.
 * @returns The `AgentSessionModel` this suite runs a leg with.
 */
const legModel = (
  modelId: string,
  { contextWindow, maxTokens, effort = 'low' }: Pick<LegOptions, 'contextWindow' | 'maxTokens' | 'effort'>,
): AgentSessionModel => {
  const { reasoning: declared, ...identity } = liveSessionModel(modelId);
  const reasoning: AgentSessionModel['reasoning'] =
    declared === undefined
      ? undefined
      : declared.budgetTokens === undefined
        ? { ...declared, effort }
        : { budgetTokens: economyThinkingBudget };
  return {
    ...identity,
    maxTokens: maxTokens ?? liveCompletionCeiling(modelId),
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
  /** Reasoning effort; the reasoning-replay rows run high so the model mints reasoning to replay. */
  readonly effort?: ReasoningEffort | undefined;
  /** Chat mode of the system prompt; absent, agent mode. */
  readonly mode?: ChatMode | undefined;
  /** Offer the GeoSpec tools too, which changes the tool list and nothing else. */
  readonly testingTools?: boolean | undefined;
  /**
   * Compose the leg as a browser turn does (ruling U10): the system prompt and tool list of the defaults, with these
   * settings said in the state note and masked by the tool choice. Absent, `mode` and `testingTools` edit the prompt
   * and the tool list themselves, which is how a change of definitions looks to the host.
   */
  readonly settings?: LiveChatSettings | undefined;
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
    model: legModel(options.modelId, options),
    ...(options.settings === undefined
      ? {
          systemPrompt: liveCadSystemPrompt({ chatId: thread.chatId, modelId: options.modelId, mode: options.mode }),
          toolRegistry: createLiveToolRegistry({
            results: scriptedResults,
            testingEnabled: options.testingTools ?? false,
          }),
        }
      : {
          ...liveChatSettings({ chatId: thread.chatId, modelId: options.modelId, ...options.settings }),
          toolRegistry: createLiveToolRegistry({ results: scriptedResults, testingEnabled: true }),
        }),
    eventLog: await createNodeEventLog({ filePath: thread.filePath, access: 'write' }),
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

/** @returns The rows the later leg added, so "B called a tool itself" cannot be satisfied by A's call. */
const addedBy = (leg: HostRunSnapshot, previous: HostRunSnapshot): readonly ProviderMessage[] =>
  leg.messages.slice(previous.messages.length);

const readFileTurn = (file: string): string =>
  `Call ${toolName.readFile} on ${file}, then reply with the exact marker that file exports and nothing else.`;

const recallTurn = `Without calling any tool, reply with the exact marker the earlier ${toolName.readFile} result contained, and nothing else.`;

/** The ordered pairs a user can switch between, both directions each. */
const switchPairs: ReadonlyArray<{ readonly from: string; readonly to: string }> = [
  { from: 'anthropic-claude-sonnet-5.5', to: 'anthropic-claude-fable-5.2' },
  { from: 'anthropic-claude-fable-5.2', to: 'anthropic-claude-sonnet-5.5' },
  { from: 'openai-gpt-6.1-terra', to: 'google-gemini-3.8-flash' },
  { from: 'google-gemini-3.8-flash', to: 'openai-gpt-6.1-terra' },
  { from: 'openai-gpt-6.1-terra', to: 'anthropic-claude-sonnet-5.5' },
  { from: 'anthropic-claude-sonnet-5.5', to: 'openai-gpt-6.1-terra' },
  { from: 'anthropic-claude-sonnet-5.5', to: 'google-gemini-3.8-flash' },
  { from: 'google-gemini-3.8-flash', to: 'anthropic-claude-sonnet-5.5' },
  { from: 'xai-grok-4.7', to: 'google-gemini-3.8-flash' },
  { from: 'google-gemini-3.8-flash', to: 'xai-grok-4.7' },
  { from: 'xai-grok-4.7', to: 'anthropic-claude-sonnet-5.5' },
  { from: 'anthropic-claude-sonnet-5.5', to: 'xai-grok-4.7' },
  { from: 'google-gemini-3.8-flash', to: 'google-gemini-3.1-pro' },
  { from: 'google-gemini-3.1-pro', to: 'google-gemini-3.8-flash' },
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
  describe.skipIf(!bothAvailable(from, to))(switchTitle(from, to, 'pair'), { repeats: liveRepeats }, () => {
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
      expect(finalText(first!)).toContain(alphaMarker);
      expect(second, `the switch never ran: ${refusal(first!)}`).toBeDefined();
      expectCompleted(second!);
      expect(finalText(second!)).toContain(alphaMarker);
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
            prompt: `Call ${toolName.readFile} on beta.ts. Then reply with two markers separated by one space: first the marker beta.ts exports, then the exact marker the earlier ${toolName.readFile} result contained. Reply with nothing else.`,
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
      expect(finalText(second!)).toContain(betaMarker);
      expect(finalText(second!)).toContain(alphaMarker);
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
            prompt: `Continue the interrupted work: reply with the exact marker the earlier ${toolName.readFile} result contained, and nothing else.`,
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
      expect(finalText(second!)).toContain(alphaMarker);
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
  { from: 'anthropic-claude-fable-5.2', to: 'anthropic-claude-fable-5.2' },
  { from: 'google-gemini-3.8-flash', to: 'anthropic-claude-sonnet-5.5' },
  { from: 'anthropic-claude-sonnet-5.5', to: 'google-gemini-3.8-flash' },
  { from: 'anthropic-claude-sonnet-5.5', to: 'openai-gpt-6.1-terra' },
];

for (const { from, to } of orphanRows) {
  describe.skipIf(!bothAvailable(from, to))(switchTitle(from, to, 'orphaned call'), { repeats: liveRepeats }, () => {
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
  { from: 'anthropic-claude-sonnet-5.5', to: 'google-gemini-3.8-flash' },
  { from: 'openai-gpt-6.1-terra', to: 'anthropic-claude-sonnet-5.5' },
  { from: 'google-gemini-3.8-flash', to: 'openai-gpt-6.1-terra' },
];

for (const { from, to } of compactionRows) {
  describe.skipIf(!bothAvailable(from, to))(switchTitle(from, to, 'compaction'), { repeats: liveRepeats }, () => {
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
              'Without calling any tool, reply with the exact marker the file ledger.ts exported, and nothing else.',
          }),
        ];
      });
      const [first, , compacted, switched] = legs;
      const performed = JSON.stringify(compactions.map(({ tier, cleared, evicted }) => ({ tier, cleared, evicted })));

      expect(first, 'the first leg produced no snapshot').toBeDefined();
      expectCompleted(first!);
      expect(compacted, `the compacting leg never ran: ${refusal(legs.at(-1)!)}`).toBeDefined();
      expect(compacted!.state, `${refusal(compacted!)} after compactions ${performed}`).toBe('completed');
      expect(
        compacted!.messages.some((message) => message.role === 'user' && textOf(message).includes('<summary>')),
        `the history was never compacted: ${String(compacted!.messages.length)} rows survived after compactions ${performed}`,
      ).toBe(true);
      expect(
        compacted!.messages.some((message) => message.role === 'tool-output'),
        'the oversized tool result was not evicted, so the switch replays it rather than the summary',
      ).toBe(false);
      expect(switched, 'the switch never ran').toBeDefined();
      expectCompleted(switched!);
      expect(finalText(switched!)).toContain(ledgerMarker);
    });
  });
}

/** A parallel tool batch then a switch, on the two wires whose signature and id rules differ most. */
const parallelRows: ReadonlyArray<{ readonly from: string; readonly to: string }> = [
  { from: 'anthropic-claude-sonnet-5.5', to: 'google-gemini-3.8-flash' },
  { from: 'google-gemini-3.8-flash', to: 'anthropic-claude-sonnet-5.5' },
];

for (const { from, to } of parallelRows) {
  describe.skipIf(!bothAvailable(from, to))(switchTitle(from, to, 'parallel batch'), { repeats: liveRepeats }, () => {
    it('should replay a parallel tool batch on the new provider', async () => {
      const [first, second] = await liveSwitch(slugFor(from, to, 'parallel'), async (thread) => {
        const legOne = await runLeg({
          thread,
          modelId: from,
          index: 1,
          prompt: `In one step, call ${toolName.readFile} twice at the same time — once on left.ts and once on right.ts — then reply with both exact markers separated by a space and nothing else.`,
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
              'Without calling any tool, reply with both exact markers from the two files read earlier, separated by one space, and nothing else.',
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
      expect(finalText(second!)).toContain(leftMarker);
      expect(finalText(second!)).toContain(rightMarker);
    });
  });
}

/*
 * Reasoning replay under an edited prefix (provider reasoning replay contract, WP3).
 *
 * Fable 5.2 answers 400 when a replayed thinking block follows content that changed since the block was minted, on
 * every account. Each row edits the prefix the way Tau really does — clearing tool results, summarising, changing
 * mode, changing the tool list — and continues the chat. A row proves nothing unless reasoning existed to be refused,
 * so each asserts signed reasoning in the durable log behind the edit, and that the first reply after the edit
 * records the typed break with reasoning left out.
 */

const replayModelId = 'anthropic-claude-fable-5.2';

const replayTitle = (modelId: string, row: string): string =>
  `live reasoning replay (${row}): ${modelId} (set ${liveCredentialName(modelId)} in apps/api/.env to run)`;

/** A question the model has to work out, so the turn mints reasoning: a turn that only echoes a word may mint none. */
const countQuestion = (limit: number): string =>
  `how many integers from 1 to ${String(limit)} are divisible by 7 or 11 but not by 13`;

const thinkTurn = (limit: number): string =>
  `Do not call any tool. Reason carefully before answering: ${countQuestion(limit)}? Reply with the count only.`;

const thinkThenRead = (limit: number, files: readonly string[]): string =>
  `Reason carefully first: ${countQuestion(limit)}? Then call ${toolName.readFile} on each of ${files.join(', ')}, and reply with the count followed by the exact marker each file exports, and nothing else.`;

/** The file read depends on the count, so the reasoning comes before the call and sits in the open tool loop. */
const thinkThenReadLedger = (limit: number): string =>
  `Reason carefully first: ${countQuestion(limit)}? If that count is even, call ${toolName.readFile} on ledger.ts; if it is odd, call it on ledger-odd.ts instead. Then reply with the count followed by the exact marker that file exports, and nothing else.`;

/** Clearing keeps the newest five tool results, so five small reads after the bulk make the bulk what it clears. */
const bulkFiles = ['rows-a.ts', 'rows-b.ts'] as const;
const smallFiles = ['alpha.ts', 'beta.ts', 'left.ts', 'right.ts', 'delta.ts'] as const;

/** @returns A lower bound on what pi's characters-over-four estimator counts for one scripted file's result. */
const estimatedTokens = (file: string): number => Math.floor((scriptedFiles[file]?.length ?? 0) / 4);

/**
 * A window a history is over the compaction threshold of, and back under the target of once its bulk leaves.
 *
 * Compaction starts above 80 % of the window and tool-result clearing is taken when it brings the estimate to 70 %
 * or less, so the window has to lie between `(anchor - evictable) / 0.7` and `anchor / 0.8`. The midpoint keeps both
 * edges equally far; a fixed fill ratio sits on one of them as the system prompt grows.
 *
 * @param anchor - Provider-reported tokens of the newest answer.
 * @param evictable - Estimated tokens of the tool results compaction can take out.
 * @returns The context window for the compacting leg.
 */
const windowThatEvicts = (anchor: number, evictable: number): number => {
  if (evictable <= anchor / 8) {
    expect.fail(
      `the bulk (${String(evictable)} estimated tokens) is under an eighth of the history (${String(anchor)}), so no window both triggers compaction and is satisfied by evicting it; enlarge the bulk files`,
    );
  }
  return Math.ceil(((anchor - evictable) / 0.7 + anchor / 0.8) / 2);
};

/**
 * Estimated tokens of headroom the mid-loop leg starts with: more than its prompt, less than the ledger it reads
 * (about 7,000), so compaction cannot fire at admission and must fire once that result is in the loop.
 */
const midLoopHeadroom = 4000;

/** What a reply's request recorded about its prefix (`metadata.prefix`). */
type RecordedPrefix = { readonly break?: string; readonly dropped?: number; readonly replayed?: number };

const prefixOf = (message: ProviderMessage): RecordedPrefix =>
  (message.metadata?.['prefix'] as RecordedPrefix | undefined) ?? {};

/** @returns How many signed reasoning payloads one row carries: thinking blocks and tool-call thought signatures. */
const signedReasoning = (message: ProviderMessage | undefined): number =>
  message?.role === 'assistant' && Array.isArray(message.content)
    ? (message.content as readonly JsonValue[]).filter(
        (block) =>
          isObject(block) &&
          ((block['type'] === 'thinking' && typeof block['thinkingSignature'] === 'string') ||
            typeof block['thoughtSignature'] === 'string'),
      ).length
    : 0;

const reasoningIn = (messages: readonly ProviderMessage[]): number =>
  messages.reduce((total, message) => total + signedReasoning(message), 0);

/** @returns Where leg `index` starts in a history: the position of its own user message. */
const askedAt = (messages: readonly ProviderMessage[], index: number): number =>
  messages.findIndex((message) => message.role === 'user' && message.id.endsWith(`-user-${String(index)}`));

/** @returns The assistant rows leg `index` added. */
const repliesOf = (leg: HostRunSnapshot, index: number): readonly ProviderMessage[] => {
  const asked = askedAt(leg.messages, index);
  return asked === -1 ? [] : leg.messages.slice(asked + 1).filter((message) => message.role === 'assistant');
};

/** @returns The typed breaks leg `index` recorded, in order. */
const breaksOf = (leg: HostRunSnapshot, index: number): readonly RecordedPrefix[] =>
  repliesOf(leg, index)
    .map((reply) => prefixOf(reply))
    .filter((prefix) => prefix.break !== undefined);

/** The leg after an edit broke the prefix exactly once, for the named cause, and left reasoning out because of it. */
const expectBreak = (leg: HostRunSnapshot, index: number, cause: string): void => {
  const breaks = breaksOf(leg, index);
  expect(
    breaks.map((prefix) => prefix.break),
    `leg ${String(index)} recorded other prefix breaks than one ${cause}`,
  ).toEqual([cause]);
  expect(breaks[0]?.dropped ?? 0, `the ${cause} break left no reasoning out, so nothing was at risk`).toBeGreaterThan(
    0,
  );
};

/** The leg replayed reasoning minted earlier: a rule that strips everything would also pass a refusal check. */
const expectReplayed = (leg: HostRunSnapshot, index: number, what: string): void => {
  expect(
    Math.max(0, ...repliesOf(leg, index).map((reply) => prefixOf(reply).replayed ?? 0)),
    `leg ${String(index)} replayed none of ${what}`,
  ).toBeGreaterThan(0);
};

/** Every leg ran and completed; the first that did not says why. */
const expectAllCompleted = (legs: readonly HostRunSnapshot[], expected: number, context = ''): void => {
  for (const leg of legs) {
    expect(leg.state, `${refusal(leg)}${context}`).toBe('completed');
  }
  expect(legs, 'a leg never ran').toHaveLength(expected);
};

/**
 * Run legs in order, stopping at the first that did not complete: a later leg on a failed run's log resumes a
 * half-written thread.
 *
 * @param legs - Each leg, given the snapshots before it.
 * @returns The snapshots produced.
 */
const inOrder = async (
  legs: ReadonlyArray<(earlier: readonly HostRunSnapshot[]) => Promise<HostRunSnapshot>>,
): Promise<readonly HostRunSnapshot[]> => {
  const done: HostRunSnapshot[] = [];
  for (const leg of legs) {
    // oxlint-disable-next-line no-await-in-loop -- each leg replays the log the previous one wrote
    const snapshot = await leg(done);
    done.push(snapshot);
    if (snapshot.state !== 'completed') {
      break;
    }
  }
  return done;
};

type DurableEvent = {
  readonly type?: string;
  readonly messageId?: string;
  readonly message?: ProviderMessage;
  readonly details?: { readonly tier?: string };
};

/**
 * What a thread's durable log held when tool-result clearing first landed.
 *
 * @param filePath - The thread's event log.
 * @param index - The leg that was running, or about to, when clearing landed.
 * @returns Signed reasoning recorded after the first cleared result (what the edit put behind changed content), and
 * how much of it leg `index` had itself recorded — its open tool loop; `undefined` when nothing was cleared.
 */
const beforeClearing = async (
  filePath: string,
  index: number,
): Promise<{ readonly atRisk: number; readonly inOpenLoop: number } | undefined> => {
  const contents = await readFile(filePath, 'utf8');
  const events = contents
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as DurableEvent);
  const cleared = events.findIndex(
    (event) => event.type === 'message.envelope-replaced' && event.details?.tier === 'tool_result_clearing',
  );
  if (cleared === -1) {
    return undefined;
  }
  const since = (from: number): number =>
    from === -1 || from > cleared
      ? 0
      : events
          .slice(from + 1, cleared)
          .reduce(
            (total, event) => total + (event.type === 'message.appended' ? signedReasoning(event.message) : 0),
            0,
          );
  return {
    atRisk: since(
      events.findIndex(
        (event) => event.type === 'message.appended' && event.message?.id === events[cleared]?.messageId,
      ),
    ),
    // A user turn is recorded by its own event type, so any event carrying the message places the leg.
    inOpenLoop: since(
      events.findIndex((event) => event.message !== undefined && askedAt([event.message], index) === 0),
    ),
  };
};

const tiersOf = (compactions: readonly CompactionOutcome[]): string =>
  JSON.stringify(compactions.map(({ tier, cleared, evicted }) => ({ tier, cleared, evicted })));

/** Two bulk reads, then five small ones, each turn reasoning first: the history every clearing row starts from. */
const clearableHistory = (thread: LiveThread, modelId: string): ReadonlyArray<() => Promise<HostRunSnapshot>> => [
  async () => runLeg({ thread, modelId, index: 1, effort: 'high', prompt: thinkThenRead(4001, bulkFiles) }),
  async () => runLeg({ thread, modelId, index: 2, effort: 'high', prompt: thinkThenRead(4978, smallFiles) }),
];

const expectClearableHistory = (legs: readonly HostRunSnapshot[]): void => {
  const [bulk, small] = legs;
  expect(bulk, 'the first leg produced no snapshot').toBeDefined();
  expectCompleted(bulk!);
  expect(toolCalls(bulk!.messages, toolName.readFile).map((call) => namedFile(call.content))).toEqual(
    expect.arrayContaining([...bulkFiles]),
  );
  expect(small, `the small reads never ran: ${refusal(bulk!)}`).toBeDefined();
  expectCompleted(small!);
  expect(
    toolCalls(small!.messages.slice(bulk!.messages.length), toolName.readFile).map((call) => namedFile(call.content)),
    'fewer than five results follow the bulk, so clearing keeps it',
  ).toEqual(expect.arrayContaining([...smallFiles]));
};

describe.skipIf(!hasLiveCredential(replayModelId))(
  replayTitle(replayModelId, 'tool results cleared between turns'),
  { repeats: liveRepeats },
  () => {
    it('should continue a chat whose reasoning followed tool results that were then cleared', async () => {
      const compactions: CompactionOutcome[] = [];
      let logged: Awaited<ReturnType<typeof beforeClearing>>;
      const legs = await liveSwitch('replay-clearing', async (thread) => {
        compactions.length = 0;
        const done = await inOrder([
          ...clearableHistory(thread, replayModelId),
          async (earlier) =>
            runLeg({
              thread,
              modelId: replayModelId,
              index: 3,
              effort: 'high',
              prompt: thinkTurn(31_415),
              contextWindow: windowThatEvicts(
                anchorTokens(earlier.at(-1)!),
                bulkFiles.reduce((total, file) => total + estimatedTokens(file), 0),
              ),
              maxTokens: compactionMaxTokens,
              onCompaction: (outcome) => compactions.push(outcome),
            }),
          async () => runLeg({ thread, modelId: replayModelId, index: 4, effort: 'high', prompt: thinkTurn(27_183) }),
        ]);
        logged = await beforeClearing(thread.filePath, 3);
        return done;
      });
      const [bulk] = legs;
      const cleared = legs[2];
      const after = legs[3];

      expectClearableHistory(legs);
      expect(
        compactions.map((outcome) => outcome.tier),
        `the compacting leg did not clear tool results: ${tiersOf(compactions)}`,
      ).toEqual(['tool_result_clearing']);
      expect(
        logged?.atRisk ?? 0,
        'no signed reasoning followed the cleared results, so the row proves nothing',
      ).toBeGreaterThan(0);
      expect(reasoningIn(repliesOf(bulk!, 1).slice(0, 1)), 'no reasoning preceded the cleared results').toBeGreaterThan(
        0,
      );
      expectAllCompleted(legs, 4, ` after ${tiersOf(compactions)}`);
      expectBreak(cleared!, 3, 'clearing');
      expectReplayed(cleared!, 3, 'the reasoning minted before the cleared results, which the edit did not touch');
      expect(
        reasoningIn(repliesOf(cleared!, 3)),
        'the leg after the edit minted no reasoning to replay',
      ).toBeGreaterThan(0);
      expect(breaksOf(after!, 4), 'the prefix broke again with nothing edited').toEqual([]);
      expectReplayed(after!, 4, 'the reasoning minted after the edit');
    });
  },
);

/**
 * Clearing inside a run: the reasoning that chose the pending tool call is itself behind the edit.
 *
 * Gemini runs the same row because a strip inside a run has to send the current-turn call without its thought
 * signature (docs/research/chat-compaction-morph-google-thought-signature-failure.md).
 */
for (const modelId of [replayModelId, 'google-gemini-3.8-flash']) {
  describe.skipIf(!hasLiveCredential(modelId))(
    replayTitle(modelId, 'tool results cleared mid tool loop'),
    { repeats: liveRepeats },
    () => {
      it('should finish a run whose tool results were cleared between its own steps', async () => {
        const compactions: CompactionOutcome[] = [];
        let logged: Awaited<ReturnType<typeof beforeClearing>>;
        const legs = await liveSwitch('replay-mid-loop', async (thread) => {
          compactions.length = 0;
          const done = await inOrder([
            ...clearableHistory(thread, modelId),
            async (earlier) =>
              runLeg({
                thread,
                modelId,
                index: 3,
                effort: 'high',
                prompt: thinkThenReadLedger(31_415),
                contextWindow: Math.ceil((anchorTokens(earlier.at(-1)!) + midLoopHeadroom) / 0.8),
                maxTokens: compactionMaxTokens,
                onCompaction: (outcome) => compactions.push(outcome),
              }),
            async () => runLeg({ thread, modelId, index: 4, effort: 'high', prompt: thinkTurn(27_183) }),
          ]);
          logged = await beforeClearing(thread.filePath, 3);
          return done;
        });
        const looped = legs[2];
        const after = legs[3];

        expectClearableHistory(legs);
        expect(
          compactions.map((outcome) => outcome.tier),
          `the looping leg did not clear tool results: ${tiersOf(compactions)}`,
        ).toEqual(['tool_result_clearing']);
        expect(
          logged?.inOpenLoop ?? 0,
          'clearing did not land behind signed reasoning of the running leg, so the row proves nothing',
        ).toBeGreaterThan(0);
        expectAllCompleted(legs, 4, ` after ${tiersOf(compactions)}`);
        expectPairedToolMessages(looped!);
        expect(finalText(looped!)).toContain(ledgerMarker);
        expectBreak(looped!, 3, 'clearing');
        expect(breaksOf(after!, 4), 'the prefix broke again with nothing edited').toEqual([]);
      });
    },
  );
}

describe.skipIf(!hasLiveCredential(replayModelId))(
  replayTitle(replayModelId, 'summary with a reasoning tail'),
  { repeats: liveRepeats },
  () => {
    it('should continue a chat whose retained tail holds reasoning minted before the summary', async () => {
      const compactions: CompactionOutcome[] = [];
      const legs = await liveSwitch('replay-summary', async (thread) => {
        compactions.length = 0;
        const leg = async (index: number, prompt: string, window?: number): Promise<HostRunSnapshot> =>
          runLeg({
            thread,
            modelId: replayModelId,
            index,
            effort: 'high',
            prompt,
            ...(window === undefined
              ? {}
              : {
                  contextWindow: window,
                  maxTokens: compactionMaxTokens,
                  onCompaction: (outcome: CompactionOutcome) => compactions.push(outcome),
                }),
          });
        return inOrder([
          async () => leg(1, readFileTurn('rows-a.ts')),
          async () => leg(2, thinkTurn(48_271)),
          async () => leg(3, thinkTurn(31_415)),
          // One result is within what clearing keeps, so only a summary can evict it; the two turns after it are the tail.
          async (earlier) =>
            leg(4, thinkTurn(27_183), windowThatEvicts(anchorTokens(earlier.at(-1)!), estimatedTokens('rows-a.ts'))),
          async () => leg(5, thinkTurn(16_180)),
        ]);
      });
      const summarised = legs[3];
      const after = legs[4];

      expect(summarised, `the compacting leg never ran: ${refusal(legs.at(-1)!)}`).toBeDefined();
      const tail = summarised!.messages.slice(0, askedAt(summarised!.messages, 4));
      expect(
        compactions.map((outcome) => outcome.tier),
        `the compacting leg did not summarise: ${tiersOf(compactions)}`,
      ).toEqual(['summarization']);
      expect(
        tail.some((message) => message.role === 'user' && textOf(message).includes('<summary>')),
        'the history was never summarised',
      ).toBe(true);
      expect(
        reasoningIn(tail),
        'the retained tail holds no signed reasoning, so the row proves nothing',
      ).toBeGreaterThan(0);
      expectAllCompleted(legs, 5, ` after ${tiersOf(compactions)}`);
      expectBreak(summarised!, 4, 'compaction');
      expect(
        reasoningIn(repliesOf(summarised!, 4)),
        'the leg after the edit minted no reasoning to replay',
      ).toBeGreaterThan(0);
      expect(breaksOf(after!, 5), 'the prefix broke again with nothing edited').toEqual([]);
      expectReplayed(after!, 5, 'the reasoning minted after the summary');
    });
  },
);

describe.skipIf(!hasLiveCredential(replayModelId))(
  replayTitle(replayModelId, 'mode change'),
  { repeats: liveRepeats },
  () => {
    it('should continue a chat across a change of mode and back', async () => {
      const legs = await liveSwitch('replay-mode', async (thread) => {
        const leg = async (index: number, prompt: string, mode: ChatMode): Promise<HostRunSnapshot> =>
          runLeg({ thread, modelId: replayModelId, index, effort: 'high', prompt, mode });
        return inOrder([
          async () => leg(1, thinkThenRead(4001, ['alpha.ts']), 'agent'),
          async () => leg(2, thinkTurn(31_415), 'plan'),
          async () => leg(3, thinkTurn(27_183), 'agent'),
        ]);
      });
      const [agent, plan, back] = legs;

      expect(agent, 'the first leg produced no snapshot').toBeDefined();
      expect(
        reasoningIn(repliesOf(agent!, 1)),
        'agent mode minted no signed reasoning, so the row proves nothing',
      ).toBeGreaterThan(0);
      expectAllCompleted(legs, 3);
      expectBreak(plan!, 2, 'instructions');
      expect(breaksOf(back!, 3).map((prefix) => prefix.break)).toEqual(['instructions']);
      expectReplayed(back!, 3, 'the reasoning minted in agent mode, whose prefix the change back restored');
    });
  },
);

describe.skipIf(!hasLiveCredential(replayModelId))(
  replayTitle(replayModelId, 'tool list change'),
  { repeats: liveRepeats },
  () => {
    it('should continue a chat after its tool list changed', async () => {
      const legs = await liveSwitch('replay-tools', async (thread) => {
        const leg = async (index: number, prompt: string, testingTools: boolean): Promise<HostRunSnapshot> =>
          runLeg({ thread, modelId: replayModelId, index, effort: 'high', prompt, testingTools });
        return inOrder([
          async () => leg(1, thinkThenRead(4001, ['alpha.ts']), false),
          async () => leg(2, thinkTurn(31_415), true),
          async () => leg(3, thinkTurn(27_183), true),
        ]);
      });
      const [before, changed, after] = legs;

      expect(before, 'the first leg produced no snapshot').toBeDefined();
      expect(
        reasoningIn(repliesOf(before!, 1)),
        'the first leg minted no signed reasoning, so the row proves nothing',
      ).toBeGreaterThan(0);
      expectAllCompleted(legs, 3);
      expectBreak(changed!, 2, 'tools');
      expect(
        reasoningIn(repliesOf(changed!, 2)),
        'the leg after the edit minted no reasoning to replay',
      ).toBeGreaterThan(0);
      expect(breaksOf(after!, 3), 'the prefix broke again with nothing edited').toEqual([]);
      expectReplayed(after!, 3, 'the reasoning minted under the new tool list');
    });
  },
);

/** How much of one reply's input the provider read back from its prompt cache. */
const cacheReadShare = (reply: ProviderMessage | undefined): number => {
  const usage = reply?.metadata?.usage;
  const input = usage === undefined ? 0 : usage.input + usage.cacheRead + usage.cacheWrite;
  return usage === undefined || input === 0 ? 0 : usage.cacheRead / input;
};

/* What a person's own toggles cost after ruling U10: nothing. The settings ride in the state note and the tool
 * choice, so every leg only appends, and the row holds that against the provider's own cache and binding, on a model
 * of each wire that returns signed reasoning. */
for (const settingsModelId of [replayModelId, 'openai-gpt-6.1-terra', 'google-gemini-3.8-flash']) {
  describe.skipIf(!hasLiveCredential(settingsModelId))(
    replayTitle(settingsModelId, 'settings change'),
    { repeats: liveRepeats },
    () => {
      it('should keep the prefix, the cache and every reply’s reasoning across the chat’s settings', async () => {
        const legs = await liveSwitch('replay-settings', async (thread) => {
          const leg = async (index: number, prompt: string, settings: LiveChatSettings): Promise<HostRunSnapshot> =>
            runLeg({ thread, modelId: settingsModelId, index, effort: 'high', prompt, settings });
          return inOrder([
            async () => leg(1, thinkThenRead(4001, ['alpha.ts']), {}),
            async () => leg(2, thinkTurn(31_415), { mode: 'plan' }),
            async () => leg(3, thinkTurn(27_183), { testingEnabled: false, toolChoice: 'none' }),
            async () => leg(4, thinkTurn(16_180), {}),
            /* Nothing changes here: the boundary the three before it are read against. */
            async () => leg(5, thinkTurn(48_271), {}),
          ]);
        });
        const [first, ...later] = legs;

        expect(first, 'the first leg produced no snapshot').toBeDefined();
        expect(
          reasoningIn(repliesOf(first!, 1)),
          'the first leg minted no signed reasoning, so the row proves nothing',
        ).toBeGreaterThan(0);
        expectAllCompleted(legs, 5);
        for (const [position, changed] of later.entries()) {
          const index = position + 2;
          expect(breaksOf(changed, index), `leg ${String(index)} broke the prefix`).toEqual([]);
          expectReplayed(changed, index, 'the reasoning minted before the settings changed');
        }
        /* Vertex caches implicitly and at its own discretion: a turn that changes nothing can read nothing back, so
         * a share there says nothing about the prefix. Anthropic and OpenAI read what the prefix allows. */
        if (settingsModelId.startsWith('google-')) {
          return;
        }
        const control = cacheReadShare(repliesOf(later[3]!, 5)[0]);
        expect(control, 'the control read nothing from the cache, so the row proves nothing').toBeGreaterThan(0.5);
        for (const [position, changed] of later.entries()) {
          const index = position + 2;
          const share = cacheReadShare(repliesOf(changed, index)[0]);
          expect(
            share,
            `leg ${String(index)} read ${share.toFixed(3)} from the cache, the control ${control.toFixed(3)}`,
          ).toBeGreaterThan(control - 0.1);
        }
      });
    },
  );
}
