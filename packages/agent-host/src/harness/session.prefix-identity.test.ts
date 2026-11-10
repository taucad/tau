/**
 * I1 (chat latency and prompt cache program): the request prefix through the last pre-turn history message is
 * byte-identical between consecutive user turns of one chat, except after compaction or an explicit model, tools or
 * mode change. I2: per-turn context never sits before history.
 *
 * Each scenario drives the real `createAgentSession` middleware stack, `createGatewayModelTransport` and pi-ai's
 * Anthropic codec through two turns over one durable log; only `fetch` is scripted. The last request of turn one is
 * compared with the first request of turn two in cache order (`prefix-identity.fixture`).
 *
 * P1 (provider reasoning replay contract): where the prefix does change, the reply to the first request after the
 * change records one typed break on its durable row (`metadata.prefix.break`), and no other reply records any.
 *
 * P2: every scripted reply thinks first under a signature of its own, and every chat any scenario here drives is held
 * to two checks over the bodies it sent (`runChat`). The binding oracle is the hermetic twin of Anthropic's
 * `prefix_mismatch_behavior: "error"`: a replayed thinking block follows exactly what its minting request sent. The
 * prefix contract holds P1 in both directions: a changed prefix has a typed break, and a typed break has a change.
 */
import { describe, expect, it } from 'vitest';
import { skillsUpdateMessageId } from '#harness/cad-middleware.js';
import type { ClientContext, RecentSkill } from '#harness/cad-middleware.js';
import { createMemoryEventLogFile } from '#harness/harness.fixture.js';
import {
  bindingViolations,
  canonicalize,
  classifyBoundary,
  fixtureTools,
  prefixContractViolations,
  recordingFetch,
  replayedSignatures,
} from '#harness/prefix-identity.fixture.js';
import type { CapturedBody, ScriptedReply, SentRequest } from '#harness/prefix-identity.fixture.js';
import { createSessionRecord } from '#harness/session-record.js';
import { attachTurnContexts, createAgentSession } from '#harness/session.js';
import { failureMarkerClearance } from '#host/run-history.js';
import type { AgentLogEvent, ProviderMessage, TurnContextSnapshot, UserProviderMessage } from '#log/event-types.js';
import { reduceEventLog } from '#log/reducer.js';
import { createCachedSystemPromptBlocks, createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import { readPrefixStamp } from '#log/prefix-stamp.js';
import type { PrefixBreakCause } from '#log/prefix-stamp.js';
import type {
  HostToolDefinition,
  ModelStreamEvent,
  ModelStreamRequest,
  ModelTransport,
  ToolRegistry,
} from '#waist/ports.js';

/** A registry whose `read_file` answers with the given body. */
const registryReading = (body: string): ToolRegistry => ({
  list: () => fixtureTools,
  invoke: async (invocation) => ({
    content: {
      success: true,
      path: String((invocation.input as { targetFile?: string }).targetFile ?? ''),
      content: body,
      lineCount: 1,
    },
    isError: false,
  }),
});
const toolRegistry = registryReading('module nut() {}');

const staticPrompt = 'STATIC '.repeat(400).trim();
const dynamicPrompt = 'Your conversation log: `.tau/chats/chat-t1/events.jsonl`\n\nModel: anthropic-claude-haiku-4.5';

const snapshotText = (activeFile: string, files: readonly string[]): string =>
  `<system-reminder>\n<active_file>\nThe file currently being rendered by the CAD engine: ${activeFile}\n</active_file>\n\n<open_files>\nFiles currently open in the editor tabs: ${files.join(', ')}\n</open_files>\n\n<project_layout>\n/project/\n${files.map((file) => `- ${file}`).join('\n')}\n</project_layout>\n</system-reminder>\n\n`;

const readFile: ScriptedReply = { tool: 'read_file', input: { targetFile: 'main.scad' } };
const done: ScriptedReply = { text: 'Done.' };

type Turn = Readonly<{
  runId: string;
  userText: string;
  snapshot?: string | undefined;
  clientContext?: ClientContext | undefined;
  recent?: readonly RecentSkill[] | undefined;
  replies: readonly ScriptedReply[];
  modelId?: string | undefined;
  staticPrompt?: string | undefined;
  tools?: readonly HostToolDefinition[] | undefined;
  /** Rows the host would have appended before this turn's commit, such as approval answers it tells the run. */
  before?: readonly UserProviderMessage[] | undefined;
  /** Continue the run the previous turn left (a Resume) instead of prompting a new one. */
  resume?: boolean | undefined;
  /** How the run ends; a turn whose model stops answering (a lost reply) fails and is resumed next. */
  expectOutcome?: 'completed' | 'failed' | undefined;
  /** A small window, so a reply's reported input tokens drive compaction. */
  contextWindow?: number | undefined;
  /** The summary compaction writes; the placeholder when absent. */
  summarize?: string | undefined;
  effort?: 'medium' | 'high' | undefined;
  /** What `read_file` answers with; a long body gives tool-result clearing something to free. */
  fileBody?: string | undefined;
  /** The composing build's release label. */
  release?: string | undefined;
  /** A seeded regression: what a harness defect does to the request on its way to the transport. */
  tamper?: ((request: ModelStreamRequest) => ModelStreamRequest) | undefined;
}>;

const contextMessagesOf = (turn: Turn): UserProviderMessage[] | undefined =>
  turn.snapshot === undefined
    ? undefined
    : [
        {
          id: `tau:snapshot-context:${turn.runId}`,
          role: 'user',
          content: turn.snapshot,
          metadata: { tauInternal: { kind: 'snapshot-context', anchorId: 'chat-t1', pruning: 'replace-by-id' } },
        },
      ];

type ChatRun = Readonly<{
  turns: readonly CapturedBody[][];
  requests: readonly ModelStreamRequest[][];
  /** The typed prefix break each reply's durable row records, per turn in reply order; `undefined` where none. */
  breaks: ReadonlyArray<ReadonlyArray<PrefixBreakCause | undefined>>;
  /** Every answered request of the chat in send order, with the signature its reply's thinking carries. */
  sent: readonly SentRequest[];
  /** The durable log the chat left. */
  events: readonly AgentLogEvent[];
}>;

/** The final durable row of every assistant message, in the order the messages first appeared. */
const finalReplies = (events: readonly AgentLogEvent[], runId?: string): ProviderMessage[] => {
  const replies = new Map<string, ProviderMessage>();
  for (const event of events) {
    const message =
      event.type === 'message.appended'
        ? event.message
        : event.type === 'message.envelope-replaced'
          ? event.replacement
          : undefined;
    if ((runId === undefined || event.runId === runId) && message?.role === 'assistant') {
      replies.set(message.id, message);
    }
  }
  return [...replies.values()];
};

/** The break recorded on the reply that minted a signature. */
const breakOfReply = (replies: readonly ProviderMessage[], minted: string): PrefixBreakCause | undefined => {
  const reply = replies.find((message) => JSON.stringify(message.content).includes(`"thinkingSignature":"${minted}"`));
  return readPrefixStamp(reply?.metadata?.['prefix'])?.break;
};

/** The break each run's replies recorded: the last row of each assistant message is its final one. */
const recordedBreaks = (events: readonly AgentLogEvent[], runId: string): Array<PrefixBreakCause | undefined> =>
  finalReplies(events, runId).map((message) => readPrefixStamp(message.metadata?.['prefix'])?.break);

/** Run one chat, turn by turn, over one durable log; each turn opens its own session as a host does. */
const runChat = async (turns: readonly Turn[]): Promise<ChatRun> => {
  const file = createMemoryEventLogFile();
  const perTurn: CapturedBody[][] = [];
  const perTurnRequests: ModelStreamRequest[][] = [];
  const sent: SentRequest[] = [];
  let ids = 0;
  const nextId = (): string => {
    ids += 1;
    return `id-${String(ids)}`;
  };
  const nowAt = (): Date => new Date(1_700_000_000_000 + ids * 1000);
  const nowIso = (): string => nowAt().toISOString();
  for (const turn of turns) {
    const captured: CapturedBody[] = [];
    const requests: ModelStreamRequest[] = [];
    const gateway = createGatewayModelTransport({
      baseUrl: 'https://gateway.example',
      fetch: recordingFetch(turn.replies, captured, sent),
      ...(turn.release === undefined ? {} : { release: turn.release }),
    });
    const transport: ModelTransport = {
      funding: gateway.funding,
      stream: (request) => {
        const sent = turn.tamper?.(request) ?? request;
        requests.push(sent);
        return gateway.stream(sent);
      },
    };
    // oxlint-disable-next-line no-await-in-loop -- turns are sequential by nature.
    const log = await file.open();
    if (turn.before !== undefined || turn.resume) {
      // oxlint-disable-next-line no-await-in-loop -- the host appends these rows before it starts the run.
      const record = await createSessionRecord({
        log,
        runId: turn.runId,
        leaderEpoch: 'epoch-1',
        createId: nextId,
        now: nowIso,
      });
      /* What `prepareResume` does: a failed run's marker is retracted before the run continues. */
      // oxlint-disable-next-line no-await-in-loop -- as above.
      const cleared = turn.resume ? failureMarkerClearance(await record.history()) : undefined;
      if (cleared) {
        // oxlint-disable-next-line no-await-in-loop -- as above.
        await record.append(cleared);
      }
      for (const message of turn.before ?? []) {
        // oxlint-disable-next-line no-await-in-loop -- rows are appended in order.
        await record.append({ type: 'message.appended', message });
      }
    }
    const prompt = turn.staticPrompt ?? staticPrompt;
    // oxlint-disable-next-line no-await-in-loop -- turns are sequential by nature.
    const session = await createAgentSession({
      chatId: 'chat-t1',
      runId: turn.runId,
      leaderEpoch: 'epoch-1',
      systemPrompt: `${prompt}\n\n${dynamicPrompt}`,
      systemPromptBlocks: createCachedSystemPromptBlocks({ staticPrompt: prompt, dynamicPrompt }),
      model: {
        id: turn.modelId ?? 'anthropic-claude-haiku-4.5',
        contextWindow: turn.contextWindow ?? 200_000,
        maxTokens: 8192,
        providerKind: 'anthropic',
        ...(turn.effort === undefined ? {} : { reasoning: { effort: turn.effort } }),
      },
      modelTransport: transport,
      toolRegistry: {
        ...(turn.fileBody === undefined ? toolRegistry : registryReading(turn.fileBody)),
        ...(turn.tools === undefined ? {} : { list: () => turn.tools! }),
      },
      eventLog: log,
      ...(turn.summarize === undefined ? {} : { summarize: async () => turn.summarize! }),
      contextMessages: contextMessagesOf(turn),
      clientContext: turn.clientContext,
      recentSkills: { load: async () => turn.recent ?? [] },
      createId: nextId,
      now: nowAt,
    });
    // oxlint-disable-next-line no-await-in-loop -- as above.
    const outcome = await (turn.resume
      ? session.continue()
      : session.prompt({ id: `user-${turn.runId}`, role: 'user', content: turn.userText }));
    // oxlint-disable-next-line no-await-in-loop -- as above.
    await session.close();
    perTurn.push(captured);
    perTurnRequests.push(requests);
    expect(outcome.outcome, JSON.stringify(outcome.failure)).toBe(turn.expectOutcome ?? 'completed');
  }
  const log = await file.open();
  const events = await log.read();
  const breaks = turns.map((turn) => recordedBreaks(events, turn.runId));
  /* The guard every scenario runs under. Only a scenario that seeds a defect may record a break nothing explains. */
  const replies = finalReplies(events);
  expect(bindingViolations(sent)).toEqual([]);
  expect(
    prefixContractViolations(
      sent,
      sent.map((request) => breakOfReply(replies, request.minted)),
    ),
  ).toEqual([]);
  if (!turns.some((turn) => turn.tamper !== undefined)) {
    expect(breaks.flat()).not.toContain('unsanctioned');
  }
  return { turns: perTurn, requests: perTurnRequests, breaks, sent, events };
};

/** A turn boundary: the last request of one turn against the first request of the next. */
const turnBoundary = (run: ChatRun, from = 0): ReturnType<typeof classifyBoundary> => {
  const previous = canonicalize(run.turns[from]!.at(-1)!);
  const next = canonicalize(run.turns[from + 1]![0]!);
  return classifyBoundary(previous, next);
};

const baseSnapshot = snapshotText('main.scad', ['main.scad', 'README.md']);
const skillsA = [{ name: 'openscad-basics', description: 'OpenSCAD idioms.', fingerprint: 'f1' }];
const turnOne: Turn = {
  runId: 'run-1',
  userText: 'Make a hex nut',
  snapshot: baseSnapshot,
  clientContext: { skills: skillsA },
  replies: [readFile, done],
};
const turnTwo: Turn = {
  runId: 'run-2',
  userText: 'Make it M8',
  snapshot: baseSnapshot,
  clientContext: { skills: skillsA },
  replies: [done],
};

const expectIdentical = (run: ChatRun): void => {
  const verdict = turnBoundary(run);
  expect(verdict.identicalThroughHistory, `diverged at ${JSON.stringify(verdict.divergence)}`).toBe(true);
};

describe('I1 request prefix identity across consecutive user turns', () => {
  describe('controls', () => {
    it('should keep the prefix when the editor, skills, memory and recent skills are unchanged (S0)', async () => {
      expectIdentical(await runChat([turnOne, turnTwo]));
    });

    it('should keep the prefix when neither turn carries an editor snapshot (S6)', async () => {
      expectIdentical(
        await runChat([
          { ...turnOne, snapshot: undefined },
          { ...turnTwo, snapshot: undefined },
        ]),
      );
    });
  });

  it('should keep the prefix when the active file changed between turns (S1)', async () => {
    expectIdentical(
      await runChat([turnOne, { ...turnTwo, snapshot: snapshotText('README.md', ['main.scad', 'README.md']) }]),
    );
  });

  it('should keep the prefix when the file tree grew between turns (S2)', async () => {
    expectIdentical(
      await runChat([
        turnOne,
        { ...turnTwo, snapshot: snapshotText('main.scad', ['main.scad', 'README.md', 'nut.scad']) },
      ]),
    );
  });

  it('should keep the system blocks when the skills catalog arrives after the first turn (S3)', async () => {
    /* Turn one ran before the catalog was read; the catalog the chat pins is turn one's, and the newer listing rides
     * as a note before turn two's message instead of rewriting the cached system prefix. */
    const run = await runChat([{ ...turnOne, clientContext: undefined }, turnTwo]);
    expectIdentical(run);
    const previous = canonicalize(run.turns[0]!.at(-1)!);
    const next = canonicalize(run.turns[1]![0]!);
    expect(next.bytes.slice(0, previous.systemEnd)).toEqual(previous.bytes.slice(0, previous.systemEnd));
    const note = run.requests[1]![0]!.messages.find((message) => message.id.startsWith('tau:skills-update'));
    expect(note, 'the newer catalog rides as a tail note').toBeDefined();
    expect(JSON.stringify(note?.content)).toContain('openscad-basics');
  });

  it('should note a catalog change once, in the turn it changed, and keep the prefix on every later turn', async () => {
    const skillsWithGears = [...skillsA, { name: 'gears', description: 'Involute gears.', fingerprint: 'f2' }];
    const files = ['main.scad', 'README.md'];
    const run = await runChat([
      turnOne,
      { ...turnTwo, clientContext: { skills: skillsWithGears } },
      {
        ...turnTwo,
        runId: 'run-3',
        snapshot: snapshotText('README.md', files),
        clientContext: { skills: skillsWithGears },
      },
      {
        ...turnTwo,
        runId: 'run-4',
        snapshot: snapshotText('nut.scad', files),
        clientContext: { skills: skillsWithGears },
      },
    ]);
    /* The history keeps turn two's note where it was; no later turn adds one of its own. */
    const notes = run.requests.map(
      (requests) => requests[0]!.messages.filter((message) => message.id === skillsUpdateMessageId).length,
    );
    expect(notes).toEqual([0, 1, 1, 1]);
    for (const from of [0, 1, 2]) {
      const verdict = turnBoundary(run, from);
      expect(verdict.identicalThroughHistory, `turn ${String(from + 1)} to ${String(from + 2)}`).toBe(true);
    }
  });

  it('should keep the prefix when agent memory was edited between turns (S4)', async () => {
    expectIdentical(
      await runChat([
        { ...turnOne, clientContext: { skills: skillsA, memory: { '.tau/AGENTS.md': 'prefers metric' } } },
        {
          ...turnTwo,
          clientContext: { skills: skillsA, memory: { '.tau/AGENTS.md': 'prefers metric\nhex nuts are M8' } },
        },
      ]),
    );
  });

  it('should keep the prefix when a skill used in turn one adds a recent-skills summary to turn two (S5)', async () => {
    expectIdentical(
      await runChat([
        turnOne,
        {
          ...turnTwo,
          recent: [{ skillName: 'openscad-basics', resourceUri: 'skill://openscad-basics', fingerprint: 'f1' }],
        },
      ]),
    );
  });

  it('should keep the prefix when a run is resumed with its committed context', async () => {
    /* Turn one's model never answers the second step: the run fails and is resumed as the same run. */
    const run = await runChat([
      { ...turnOne, replies: [readFile], expectOutcome: 'failed' },
      { ...turnOne, resume: true, replies: [done] },
    ]);
    expectIdentical(run);
    /* The committed context rides once: a resume never inserts it again. */
    const resumed = run.requests[1]![0]!;
    expect(resumed.messages.filter((message) => message.id.startsWith('tau:snapshot-context:'))).toHaveLength(1);
  });

  it('should keep the prefix when the host tells the new run an approval answer first, and place the context before it', async () => {
    const told: UserProviderMessage = {
      id: 'tau:approval-answer:interrupt-1',
      role: 'user',
      content:
        '<system-reminder>\nThe last run paused for the person\'s approval, and they answered:\n- denied: "Delete it?" (your call call-1 to delete_file)\nThat run has ended, so its answers do not carry into this one: a call that needs approval asks again.\n</system-reminder>',
      metadata: {
        tauInternal: {
          kind: 'approval-answer',
          anchorId: 'interrupt-1',
          pruning: 'preserve-until-compaction',
          opensTurn: true,
        },
        timestamp: 1_700_000_000_500,
      },
    };
    const run = await runChat([
      turnOne,
      { ...turnTwo, snapshot: snapshotText('README.md', ['main.scad', 'README.md']), before: [told] },
    ]);
    expectIdentical(run);
    const ids = run.requests[1]![0]!.messages.map((message) => message.id);
    expect(ids.indexOf('tau:snapshot-context:run-2')).toBeLessThan(ids.indexOf('tau:approval-answer:interrupt-1'));
    expect(ids.indexOf('tau:approval-answer:interrupt-1')).toBeLessThan(ids.indexOf('user-run-2'));
  });

  it('should hand every provider the previous request as a prefix of the next (I2, provider-neutral)', async () => {
    const run = await runChat([
      turnOne,
      { ...turnTwo, snapshot: snapshotText('README.md', ['main.scad', 'README.md']) },
    ]);
    const previous = run.requests[0]!.at(-1)!;
    const next = run.requests[1]![0]!;
    const onTheWire = (request: ModelStreamRequest) =>
      request.messages.map((message) => ({ role: message.role, content: message.content }));
    expect(onTheWire(next).slice(0, previous.messages.length)).toEqual(onTheWire(previous));
    /* The new turn's context rides immediately before its user message, after all history (I2). */
    const ids = next.messages.map((message) => message.id);
    expect(ids.indexOf('tau:snapshot-context:run-2')).toBe(ids.indexOf('user-run-2') - 1);
    expect(ids.indexOf('tau:snapshot-context:run-2')).toBeGreaterThan(previous.messages.length - 1);
  });

  it('should spend at most four Anthropic cache breakpoints on every request', async () => {
    const run = await runChat([
      { ...turnOne, clientContext: { skills: skillsA, memory: { '.tau/AGENTS.md': 'prefers metric' } } },
      { ...turnTwo, clientContext: { skills: skillsA, memory: { '.tau/AGENTS.md': 'prefers metric' } } },
    ]);
    for (const body of run.turns.flat()) {
      expect(canonicalize(body).breakpoints.length).toBeLessThanOrEqual(4);
    }
  });

  describe('typed breaks: where the prefix leaves the previous request, and what the reply records', () => {
    it('should diverge only in the tools when the tool set changes, and record a tools break', async () => {
      const run = await runChat([turnOne, { ...turnTwo, tools: fixtureTools.slice(0, 2) }]);
      const verdict = turnBoundary(run);
      expect(verdict.identicalThroughHistory).toBe(false);
      expect(verdict.divergence?.label.startsWith('tools[')).toBe(true);
      expect(run.breaks[1]).toEqual(['tools']);
    });

    it('should diverge only in the static system block when the mode changes, and record an instructions break', async () => {
      const run = await runChat([
        turnOne,
        { ...turnTwo, staticPrompt: `${staticPrompt}\n\n<plan_mode>plan</plan_mode>` },
      ]);
      const verdict = turnBoundary(run);
      expect(verdict.identicalThroughHistory).toBe(false);
      expect(verdict.divergence?.label).toBe('system[0]');
      expect(run.breaks[1]).toEqual(['instructions']);
    });

    it('should carry a model change on the request and render the other model’s reasoning as text, under a model break', async () => {
      const run = await runChat([turnOne, { ...turnTwo, modelId: 'anthropic-claude-sonnet-4.5' }]);
      const switched = run.turns[1]![0]!;
      expect(switched['model']).toBe('anthropic-claude-sonnet-4.5');
      /* System and tools are the same bytes; the history leaves the previous request at the first reply, whose
       * thinking another model cannot replay natively. */
      const verdict = turnBoundary(run);
      expect(verdict.divergence?.label).toBe('messages[2]:assistant');
      expect(replayedSignatures(switched)).toEqual([]);
      expect(JSON.stringify(switched['messages'])).toContain('reasoning sig-1');
      expect(run.breaks[1]).toEqual(['model']);
    });

    it('should diverge only at the compaction summary, and keep identity within the run before and after it', async () => {
      /* Turn one's second reply reports a context past the window's budget, so compaction runs before the third request
       * and summarises the turn's head; the turn's own message stays, and its context stays before it. */
      const run = await runChat([
        {
          ...turnOne,
          contextWindow: 8192,
          summarize: 'Earlier work.',
          replies: [
            { ...readFile, inputTokens: 3000 },
            { ...readFile, inputTokens: 7000 },
            { ...done, inputTokens: 200 },
          ],
        },
        {
          ...turnTwo,
          snapshot: snapshotText('README.md', ['main.scad', 'README.md']),
          contextWindow: 8192,
          summarize: 'Earlier work.',
        },
      ]);
      const steps = run.turns[0]!.map((body) => canonicalize(body));
      expect(steps).toHaveLength(3);
      const compacted = run.requests[0]![2]!;
      const summaryIndex = compacted.messages.findIndex((message) =>
        JSON.stringify(message.content).includes('<summary>'),
      );
      expect(summaryIndex).toBeGreaterThan(0);
      /* Before the compaction, each request reproduces the previous one through its last message. */
      expect(classifyBoundary(steps[0]!, steps[1]!).identicalThroughHistory).toBe(true);
      /* The compaction rewrites the history from the summary on, and nothing before it: the named exception. */
      const across = classifyBoundary(steps[1]!, steps[2]!);
      expect(across.identicalThroughHistory).toBe(false);
      expect(across.lcp).toBeGreaterThanOrEqual(steps[1]!.systemEnd);
      expect(across.divergence?.label.startsWith(`messages[${String(summaryIndex)}]`)).toBe(true);
      const ids = compacted.messages.map((message) => message.id);
      expect(ids.indexOf('tau:snapshot-context:run-1')).toBe(ids.indexOf('user-run-1') - 1);
      /* After it, the next turn reproduces the compacted request through its last message. */
      expectIdentical(run);
      const next = run.requests[1]![0]!.messages.map((message) => message.id);
      expect(next.slice(0, ids.length)).toEqual(ids);
      expect(next.indexOf('tau:snapshot-context:run-2')).toBe(next.indexOf('user-run-2') - 1);
      expect(run.breaks).toEqual([[undefined, undefined, 'compaction'], [undefined]]);
    });
  });
});

/**
 * A chat whose old tool results are cleared in place and no summary is written. Clearing stands in for a summary only
 * when it lands the history at a fifth of the window by itself (ruling U15), so the results have to be most of the
 * history: forty reads of about 550 tokens against a 32,768-token window, of which clearing keeps the newest five.
 * The last read's reply reports a request over the trigger, so the pass runs before the next step of the same run.
 */
const clearingReads = 40;
const clearingWindow = 32_768;
const clearingChat: Turn[] = [
  {
    ...turnOne,
    contextWindow: clearingWindow,
    summarize: 'Earlier work.',
    clientContext: undefined,
    fileBody: `module nut() {} // ${'x'.repeat(2200)}`,
    replies: [
      ...Array.from(
        { length: clearingReads },
        (_, index): ScriptedReply => ({
          tool: 'read_file',
          input: { targetFile: `part-${String(index)}.scad` },
          inputTokens: index === clearingReads - 1 ? 27_000 : 3,
        }),
      ),
      { ...done, inputTokens: 200 },
    ],
  },
  {
    ...turnTwo,
    contextWindow: clearingWindow,
    summarize: 'Earlier work.',
    clientContext: undefined,
    fileBody: `module nut() {} // ${'x'.repeat(2200)}`,
  },
];

describe('P2 native reasoning is replayed only under the prefix that minted it', () => {
  const window = { contextWindow: 8192, summarize: 'Earlier work.' } as const;
  const replayed = (run: ChatRun): string[][] => run.sent.map((request) => replayedSignatures(request.body));

  it('should replay every reply’s reasoning on every later request while requests only append', async () => {
    const run = await runChat([
      { ...turnOne, replies: [readFile, readFile, readFile, done] },
      turnTwo,
      { ...turnTwo, runId: 'run-3', userText: 'Thicker' },
    ]);
    /* The guard proves nothing on a chat that never replays a block, so the control states what was replayed. */
    expect(replayed(run)).toEqual([
      [],
      ['sig-1'],
      ['sig-1', 'sig-2'],
      ['sig-1', 'sig-2', 'sig-3'],
      ['sig-1', 'sig-2', 'sig-3', 'sig-4'],
      ['sig-1', 'sig-2', 'sig-3', 'sig-4', 'sig-5'],
    ]);
  });

  it.each([
    ['the tool set changes', { tools: fixtureTools.slice(0, 2) }],
    ['the mode changes', { staticPrompt: `${staticPrompt}\n\n<plan_mode>plan</plan_mode>` }],
  ] as const)('should leave out all earlier reasoning when %s, then replay what is minted after', async (_, change) => {
    const run = await runChat([turnOne, { ...turnTwo, ...change, replies: [readFile, done] }]);
    expect(replayed(run)).toEqual([[], ['sig-1'], [], ['sig-3']]);
  });

  it('should keep reasoning across an effort change, which no provider binds it to', async () => {
    const run = await runChat([
      { ...turnOne, effort: 'high' },
      { ...turnTwo, effort: 'medium' },
    ]);
    expect(replayed(run)).toEqual([[], ['sig-1'], ['sig-1', 'sig-2']]);
  });

  it('should take a model’s reasoning back when the chat returns to the prefix it was minted under', async () => {
    const plan = `${staticPrompt}\n\n<plan_mode>plan</plan_mode>`;
    const run = await runChat([
      turnOne,
      { ...turnTwo, staticPrompt: plan },
      { ...turnTwo, runId: 'run-3', userText: 'Thicker' },
      { ...turnTwo, runId: 'run-4', userText: 'Chamfer it', staticPrompt: plan },
    ]);
    /* The plan-mode reply never saw the agent-mode reasoning, and the agent-mode replies never saw its own: each
     * lineage replays exactly its blocks, so no block ever follows a prefix it was not minted under. */
    expect(replayed(run)).toEqual([[], ['sig-1'], [], ['sig-1', 'sig-2'], ['sig-3']]);
    expect(run.breaks).toEqual([[undefined, undefined], ['instructions'], ['instructions'], ['instructions']]);
  });

  it('should leave out the reasoning minted after a cleared tool result, inside the run that cleared it', async () => {
    const run = await runChat(clearingChat);
    const signatures = replayed(run);
    /* Every read's reply thought before the results were cleared. The first precedes the first cleared result and
     * stays valid; the ones after it are left out, in the open tool loop, and stay out on the next turn. */
    expect(signatures[clearingReads - 1]).toHaveLength(clearingReads - 1);
    expect(signatures[clearingReads]).toEqual(['sig-1']);
    expect(signatures[clearingReads + 1]).toEqual(['sig-1', `sig-${String(clearingReads + 1)}`]);
  });

  it('should leave out the reasoning a summary’s retained tail holds', async () => {
    const run = await runChat([
      { ...turnOne, ...window },
      { ...turnTwo, ...window },
      { ...turnTwo, ...window, runId: 'run-3', userText: 'Thicker', replies: [{ ...done, inputTokens: 7000 }] },
      { ...turnTwo, ...window, runId: 'run-4', userText: 'Chamfer it' },
    ]);
    const signatures = replayed(run);
    expect(run.breaks.flat().filter((cause) => cause !== undefined)).toEqual(['compaction']);
    /* The tail kept replies with their thinking in the log; the request after the summary replays none of them. */
    expect(signatures[3]).toEqual(['sig-1', 'sig-2', 'sig-3']);
    expect(signatures[4]).toEqual([]);
    const tail = run.requests[3]![0]!.messages.filter((message) => message.role === 'assistant');
    expect(JSON.stringify(tail)).toContain('thinkingSignature');
  });

  it('should leave out reasoning after a defect rewrites the prefix, so even an unexplained edit cannot be refused', async () => {
    const run = await runChat([
      turnOne,
      {
        ...turnTwo,
        tamper: (request) => ({
          ...request,
          messages: request.messages.map((message) =>
            message.role === 'tool-output' ? { ...message, content: '[older result trimmed]' } : message,
          ),
        }),
      },
    ]);
    /* The first reply precedes the rewritten result; the second was minted after it. */
    expect(replayed(run)).toEqual([[], ['sig-1'], ['sig-1']]);
  });

  it('should leave the durable log as the provider wrote it: reasoning is left out of requests, never erased', async () => {
    const run = await runChat([turnOne, { ...turnTwo, tools: fixtureTools.slice(0, 2), replies: [readFile, done] }]);
    const kept = finalReplies(run.events).map(
      (reply) => /"thinkingSignature":"(sig-\d+)"/u.exec(JSON.stringify(reply))?.[1],
    );
    expect(kept).toEqual(['sig-1', 'sig-2', 'sig-3', 'sig-4']);
  });
});

describe('the guard itself', () => {
  const body = (system: string, messages: unknown[], effort = 'high'): CapturedBody => ({
    model: 'fixture',
    system,
    tools: [],
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic's wire key.
    output_config: { effort },
    messages,
  });
  const ask = { role: 'user', content: 'Make a nut' };
  const reply = {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 't', signature: 'sig-1' },
      { type: 'text', text: 'Done.' },
    ],
  };
  const next = { role: 'user', content: 'Make it M8' };

  it('should pass a block replayed under the prefix that minted it', () => {
    const sent = [
      { body: body('S', [ask]), minted: 'sig-1' },
      { body: body('S', [ask, reply, next]), minted: 'sig-2' },
    ];
    expect(bindingViolations(sent)).toEqual([]);
    expect(prefixContractViolations(sent, [undefined, undefined])).toEqual([]);
  });

  it.each([
    ['the system text changed', body('S2', [ask, reply, next])],
    ['an earlier message changed', body('S', [{ role: 'user', content: 'Make a bolt' }, reply, next])],
  ])('should report a block replayed after %s', (_, second) => {
    const sent = [
      { body: body('S', [ask]), minted: 'sig-1' },
      { body: second, minted: 'sig-2' },
    ];
    expect(bindingViolations(sent)).toEqual([
      'request 2: messages.1.content.0 (sig-1) is replayed after an edited prefix',
    ]);
    expect(prefixContractViolations(sent, [undefined, undefined])).toHaveLength(1);
    expect(prefixContractViolations(sent, [undefined, 'instructions'])).toEqual([]);
  });

  it('should report an effort change with no typed break, and a typed break with no change', () => {
    const sent = [
      { body: body('S', [ask]), minted: 'sig-1' },
      { body: body('S', [ask, reply, next], 'medium'), minted: 'sig-2' },
    ];
    expect(prefixContractViolations(sent, [undefined, undefined])).toEqual([
      'request 2: the prefix or its cache parameters changed (parameters) with no typed break',
    ]);
    expect(prefixContractViolations(sent, [undefined, 'settings'])).toEqual([]);
    const same = [sent[0]!, { body: body('S', [ask, reply, next]), minted: 'sig-2' }];
    expect(prefixContractViolations(same, [undefined, 'settings'])).toEqual([
      'request 2: a settings break is recorded and nothing changed',
    ]);
  });
});

describe('P1 typed prefix breaks on the durable log', () => {
  const window = { contextWindow: 8192, summarize: 'Earlier work.' } as const;

  it('should record no break while every request only appends', async () => {
    const run = await runChat([turnOne, turnTwo, { ...turnTwo, runId: 'run-3', userText: 'Thicker' }]);
    expect(run.breaks).toEqual([[undefined, undefined], [undefined], [undefined]]);
  });

  it.each([
    ['tools', { tools: fixtureTools.slice(0, 2) }],
    ['instructions', { staticPrompt: `${staticPrompt}\n\n<plan_mode>plan</plan_mode>` }],
    ['settings', { effort: 'medium' }],
  ] as const)('should record one %s break on the first reply after the change', async (cause, change) => {
    const run = await runChat([
      { ...turnOne, effort: 'high' },
      { ...turnTwo, effort: 'high', ...change, replies: [readFile, done] },
    ]);
    expect(run.breaks).toEqual([
      [undefined, undefined],
      [cause, undefined],
    ]);
  });

  it('should record a definitions break when the prompt text changes under another release', async () => {
    const run = await runChat([
      { ...turnOne, release: 'ui@1' },
      { ...turnTwo, release: 'ui@2', staticPrompt: `${staticPrompt}\n\nA sentence the release added.` },
    ]);
    expect(run.breaks).toEqual([[undefined, undefined], ['definitions']]);
  });

  it('should record a model break on a switch and on the switch back, and none on the turn that follows', async () => {
    const run = await runChat([
      turnOne,
      { ...turnTwo, modelId: 'anthropic-claude-sonnet-4.5' },
      { ...turnTwo, runId: 'run-3', userText: 'Thicker' },
      { ...turnTwo, runId: 'run-4', userText: 'Chamfer it' },
    ]);
    expect(run.breaks).toEqual([[undefined, undefined], ['model'], ['model'], [undefined]]);
  });

  it('should record one compaction break on the first reply after a summary replaced the head', async () => {
    const run = await runChat([
      {
        ...turnOne,
        ...window,
        replies: [
          { ...readFile, inputTokens: 3000 },
          { ...readFile, inputTokens: 7000 },
          { ...done, inputTokens: 200 },
        ],
      },
      { ...turnTwo, ...window },
    ]);
    expect(run.breaks).toEqual([[undefined, undefined, 'compaction'], [undefined]]);
  });

  it('should record one clearing break on the first reply after old tool results were cleared in place', async () => {
    const run = await runChat(clearingChat);
    expect(run.breaks.flat().filter((cause) => cause !== undefined)).toEqual(['clearing']);
    expect(run.breaks[0]!.indexOf('clearing')).toBe(clearingReads);
  });

  it('should record an unsanctioned break when a defect rewrites an earlier message with nothing to explain it', async () => {
    /* The seeded regression: a sliding window that trims a tool result the previous request already sent. */
    const run = await runChat([
      turnOne,
      {
        ...turnTwo,
        tamper: (request) => ({
          ...request,
          messages: request.messages.map((message) =>
            message.role === 'tool-output' ? { ...message, content: '[older result trimmed]' } : message,
          ),
        }),
      },
    ]);
    expect(run.breaks).toEqual([[undefined, undefined], ['unsanctioned']]);
  });
});

describe('committed turn contexts in the durable log', () => {
  it('should commit each turn with the context it ran with, so a later run reads it back byte for byte', async () => {
    const file = createMemoryEventLogFile();
    const session = await createAgentSession({
      chatId: 'chat-t1',
      runId: 'run-1',
      leaderEpoch: 'epoch-1',
      systemPrompt: staticPrompt,
      model: { id: 'stub', contextWindow: 200_000, providerKind: 'anthropic' },
      modelTransport: {
        funding: { type: 'unfunded' },
        async *stream(): AsyncGenerator<ModelStreamEvent> {
          yield { type: 'text-delta', text: 'ok' };
          yield { type: 'completed', stopReason: 'stop' };
        },
      },
      toolRegistry,
      eventLog: await file.open(),
      contextMessages: contextMessagesOf({ ...turnOne, snapshot: baseSnapshot }),
    });
    await session.prompt({ id: 'user-run-1', role: 'user', content: 'Make a hex nut' });
    const log = await file.open();
    const events = await log.read();
    const committed = events.find((event) => event.type === 'turn.history-projection-committed');
    expect(committed?.type === 'turn.history-projection-committed' && committed.context.initialMessages).toEqual(
      contextMessagesOf({ ...turnOne, snapshot: baseSnapshot }),
    );
    expect(reduceEventLog(events).map((message) => message.id)).toEqual(['user-run-1', expect.any(String)]);
  });

  it('should keep the context of a turn whose message compaction evicted right after that run’s summary', () => {
    /* A turn split by its own run's compaction: the summary replaced its message, and that run's requests carried the
     * context right after the summary. The next turn's request reproduces those bytes (I1). */
    const summary: ProviderMessage = { id: 'sum', role: 'user', content: '<summary>\nold\n</summary>' };
    const kept: ProviderMessage = { id: 'a1', role: 'assistant', content: 'kept' };
    const contextOf = (tag: string): TurnContextSnapshot => ({
      version: 1,
      systemPrompt: 's',
      initialMessages: [{ id: `ctx-${tag}`, role: 'user', content: `init ${tag}` }],
      postCompactionMessages: [{ id: `ctx-${tag}`, role: 'user', content: `post ${tag}` }],
    });
    const turns = [{ anchorId: 'u1', context: contextOf('1'), summaryIds: ['sum'] }];
    const duringTurnOne = attachTurnContexts([summary, kept], turns);
    expect(duringTurnOne.map((message) => message.id)).toEqual(['sum', 'ctx-1', 'a1']);
    const nextUser: ProviderMessage = { id: 'u2', role: 'user', content: 'next' };
    const turnTwo = attachTurnContexts(
      [summary, kept, nextUser],
      [...turns, { anchorId: 'u2', context: contextOf('2'), summaryIds: [] }],
    );
    const bytes = (messages: readonly ProviderMessage[]): string[] =>
      messages.map((message) => JSON.stringify({ role: message.role, content: message.content }));
    expect(bytes(turnTwo).slice(0, duringTurnOne.length)).toEqual(bytes(duringTurnOne));
    expect(turnTwo.map((message) => message.id)).toEqual(['sum', 'ctx-1', 'a1', 'ctx-2', 'u2']);
  });

  it('should drop the context of a turn a later run’s compaction evicted, which its summary covers', () => {
    const summary: ProviderMessage = { id: 'sum-2', role: 'user', content: '<summary>\nboth\n</summary>' };
    const context: TurnContextSnapshot = {
      version: 1,
      systemPrompt: 's',
      initialMessages: [{ id: 'ctx-1', role: 'user', content: 'init 1' }],
      postCompactionMessages: [{ id: 'ctx-1', role: 'user', content: 'post 1' }],
    };
    const attached = attachTurnContexts([summary], [{ anchorId: 'u1', context, summaryIds: ['sum-1'] }]);
    expect(attached.map((message) => message.id)).toEqual(['sum-2']);
  });
});
