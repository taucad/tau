// @vitest-environment node
/* eslint-disable @typescript-eslint/naming-convention -- Scripted LangChain model fixtures use BaseChatModel's required underscore methods and usage_metadata fields. */
/* oxlint-disable @typescript-eslint/class-literal-property-style -- LangChain BaseChatModel pattern. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage, UsageMetadata } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import type { ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { toolName } from '@taucad/chat/constants';
import type { UIMessage } from 'ai';
import { createTestApp, createTestModel } from '#testing/create-test-app.js';
import type { CreateTestAppOptions, TestApp } from '#testing/create-test-app.js';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import { expectNoErrors } from '#testing/stream-assertions.js';
import { buildCadAgent } from '#testing/skip-helpers.js';

/**
 * Round-5 harness audit: composed end-to-end invariant probes.
 *
 * Unlike the per-file rounds (docs/research/harness-cache-hygiene-audit.md
 * CH-1..CH-16, reasoned from source), these probes drive the REAL composed
 * pipeline — ChatController → ChatService middleware stack → LangGraph →
 * checkpointer — with a scripted model, and measure what actually reaches
 * the provider boundary, the persisted state, and the transcript.
 *
 * These are CHARACTERIZATION tests: they assert CURRENT (defective) behavior
 * to pin the audit findings as measured facts. Each assertion is annotated
 * with the CH finding it confirms and the flip expected when the W7 fix
 * lands. When a W7 fix is applied, the corresponding assertion here MUST be
 * inverted into the regression the charter specifies — do not delete.
 *
 * No provider keys required: the model is scripted, the checkpointer is
 * in-memory, RPC is headless against memFs.
 *
 * Run: pnpm nx test api app/testing/harness-invariants-audit.integration.test.ts --watch=false
 */

const modelId = 'anthropic-claude-haiku-4.5';

/** Marker routed by the scripted model to emit a read_file tool call. */
const readBigMarker = 'READ_BIG';
const bigFilePath = 'big-fixture.txt';
const bigToolCallId = 'call_read_big_1';

/**
 * Marker routed to a three-way parallel read_file fan-out, then a follow-up
 * small read in the same graph run, then done (PROBE-E measures the model
 * call between the two tool stages).
 */
const readTrioMarker = 'READ_TRIO';
const trioFiles = [
  { id: 'call_trio_a', path: 'trio-a.txt', lines: 111, width: 690 },
  { id: 'call_trio_b', path: 'trio-b.txt', lines: 110, width: 680 },
  { id: 'call_trio_c', path: 'trio-c.txt', lines: 109, width: 670 },
] as const;
const trioTailCall = { id: 'call_trio_tail', path: 'trio-tail.txt' } as const;

/**
 * Marker routed to a two-read tool loop whose AI turns report ~150k input
 * tokens (0.75 of the 200k window) — the mid-turn surface where the
 * token-usage reminder gate is supposed to fire (PROBE-D).
 */
const usageLoopMarker = 'USAGE_LOOP';
const usageLoopFiles = [
  { id: 'call_usage_1', path: 'd-one.txt', usage: 150_000 },
  { id: 'call_usage_2', path: 'd-two.txt', usage: 152_000 },
] as const;

/**
 * Marker `HIGH_USAGE:<n>` makes the reply report `input_tokens: n`, steering
 * the previous-usage compaction trigger (0.85 × window) independently of
 * real content size.
 */
const highUsagePattern = /HIGH_USAGE:(\d+)/;

type ScriptedTurn = {
  text: string;
  toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
  usage: UsageMetadata;
};

let scriptedMessageCounter = 0;

/**
 * Stateless scripted model: routes on conversation shape so one instance
 * serves every chat in the suite.
 * - History contains a ToolMessage → plain "done" turn (post-tool wrap-up).
 * - Latest human text contains READ_BIG → single read_file tool call.
 * - Latest human text contains READ_TRIO → three parallel read_file calls.
 * - Latest human text contains HIGH_USAGE:<n> → reply reporting n input tokens.
 * - Otherwise → plain acknowledgement.
 *
 * Streams via `_streamResponseChunks` with stable message ids and
 * `tool_call_chunks`, mirroring real providers: the UI stream then carries
 * text parts + the message id, so the threaded client transcript
 * fingerprint-matches graph state (otherwise the reconciler replaces real
 * history — and its `usage_metadata` — with `[interrupted]` placeholders),
 * and the eager handler sees the same token callbacks it sees in production.
 */
class ScriptedAuditModel extends BaseChatModel {
  public constructor() {
    super({});
  }

  public override _llmType(): string {
    return 'scripted-audit-model';
  }

  public override _combineLLMOutput(): Record<string, unknown> {
    return {};
  }

  public override bindTools(): this {
    return this;
  }

  private scriptTurn(messages: BaseMessage[]): ScriptedTurn {
    const toolResultCount = messages.filter((message) => message instanceof ToolMessage).length;
    // Route on the latest REAL human text: skip tool payloads and injected
    // <system-reminder> internals so mid-loop routing stays keyed to the
    // user's marker.
    const lastHumanText = [...messages]
      .reverse()
      .filter((message) => message.type === 'human' && typeof message.content === 'string')
      .map((message) => message.content as string)
      .find((text) => text.length > 0 && !text.startsWith('<system-reminder>'));

    if (lastHumanText?.includes(readBigMarker) && toolResultCount === 0) {
      return {
        text: '',
        toolCalls: [{ id: bigToolCallId, name: toolName.readFile, args: { targetFile: bigFilePath } }],
        usage: { input_tokens: 100, output_tokens: 1, total_tokens: 101 },
      };
    }

    if (lastHumanText?.includes(readTrioMarker)) {
      if (toolResultCount === 0) {
        return {
          text: '',
          toolCalls: trioFiles.map((file) => ({
            id: file.id,
            name: toolName.readFile,
            args: { targetFile: file.path },
          })),
          usage: { input_tokens: 100, output_tokens: 1, total_tokens: 101 },
        };
      }
      if (toolResultCount === 3) {
        return {
          text: '',
          toolCalls: [{ id: trioTailCall.id, name: toolName.readFile, args: { targetFile: trioTailCall.path } }],
          usage: { input_tokens: 100, output_tokens: 1, total_tokens: 101 },
        };
      }
    }

    if (lastHumanText?.includes(usageLoopMarker)) {
      const stage = usageLoopFiles[toolResultCount];
      if (stage) {
        return {
          text: '',
          toolCalls: [{ id: stage.id, name: toolName.readFile, args: { targetFile: stage.path } }],
          usage: { input_tokens: stage.usage, output_tokens: 1, total_tokens: stage.usage + 1 },
        };
      }
    }

    const highUsage = lastHumanText ? highUsagePattern.exec(lastHumanText) : null;
    const inputTokens = highUsage ? Number(highUsage[1]) : 100;
    return {
      text: toolResultCount > 0 ? 'done' : 'ack',
      usage: { input_tokens: inputTokens, output_tokens: 2, total_tokens: inputTokens + 2 },
    };
  }

  private buildChunk(turn: ScriptedTurn): ChatGenerationChunk {
    scriptedMessageCounter += 1;
    const id = `scripted-msg-${scriptedMessageCounter}`;
    return new ChatGenerationChunk({
      text: turn.text,
      message: new AIMessageChunk({
        id,
        content: turn.text,
        ...(turn.toolCalls
          ? {
              tool_call_chunks: turn.toolCalls.map((call, index) => ({
                id: call.id,
                name: call.name,
                args: JSON.stringify(call.args),
                index,
                type: 'tool_call_chunk',
              })),
            }
          : {}),
        usage_metadata: turn.usage,
        response_metadata: { model: 'scripted-audit-model' },
      }),
    });
  }

  public override async *_streamResponseChunks(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const chunk = this.buildChunk(this.scriptTurn(messages));
    yield chunk;
    await runManager?.handleLLMNewToken(chunk.text, { prompt: 0, completion: 0 }, undefined, undefined, undefined, {
      chunk,
    });
  }

  public override async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const chunk = this.buildChunk(this.scriptTurn(messages));
    const message = chunk.message as AIMessageChunk;
    return {
      generations: [
        {
          text: chunk.text,
          message: new AIMessage({
            id: message.id,
            content: message.content,
            tool_calls: message.tool_calls,
            usage_metadata: message.usage_metadata,
            response_metadata: message.response_metadata,
          }),
        },
      ],
    };
  }
}

const scriptedModel = new ScriptedAuditModel();

const scriptedModelService: NonNullable<CreateTestAppOptions['modelService']> = {
  models: [createTestModel({ id: modelId, providerId: 'anthropic', family: 'claude' })],
  buildModel() {
    return {
      model: scriptedModel,
      support: {
        tools: true,
        toolChoice: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
    };
  },
  getProviderId() {
    return 'anthropic';
  },
  createProviderDiagnosticsContext(options) {
    return {
      ...options,
      verbose: false,
      nextProviderAttemptId: () => 1,
      setLatestModelCallSummary: () => undefined,
      getLatestModelCallSummary: () => undefined,
    };
  },
  getContextWindow() {
    return 200_000;
  },
  getKnowledgeCutoff() {
    return '2026-01-01';
  },
  getModelSupport() {
    return {
      tools: true,
      toolChoice: true,
      modalities: { input: ['text', 'image'], output: ['text'] },
    };
  },
  filterProviderToolNamesForModel({ toolNames }) {
    return [...toolNames];
  },
  getOtelProviderName() {
    return 'test';
  },
  normalizeUsageTokens(_modelId, usage) {
    return usage;
  },
  getModelCost() {
    return {
      inputTokensCost: 0,
      outputTokensCost: 0,
      cacheReadTokensCost: 0,
      cacheWriteTokensCost: 0,
      totalCost: 0,
    };
  },
};

/**
 * Faithful client turn: sends the FULL cumulative UI transcript (prior turns'
 * user + streamed assistant messages) plus the new user message, exactly like
 * the production client. Sending only the new message makes the thread
 * reconciler treat prior turns as client-deleted and RemoveMessage them.
 * Returns the updated transcript including the streamed assistant reply.
 */
async function postTurn(
  testApp: TestApp,
  options: {
    chatId: string;
    messageId: string;
    text: string;
    snapshot?: Record<string, unknown>;
    history?: UIMessage[];
  },
): Promise<UIMessage[]> {
  const agent = {
    ...buildCadAgent(modelId, 'replicad'),
    ...(options.snapshot ? { snapshot: options.snapshot } : {}),
  };

  const userMessage = {
    id: options.messageId,
    role: 'user',
    parts: [{ type: 'text', text: options.text }],
    metadata: { model: modelId, kernel: 'replicad' },
  } as unknown as UIMessage;

  const messages = [...(options.history ?? []), userMessage];

  const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: options.chatId, messages, agent }),
  });

  expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
  const chunks = await collectStreamChunks(response);
  expectNoErrors(chunks);
  const assistantMessage = await collectFinalMessage(chunks);
  return [...messages, assistantMessage];
}

async function readTranscriptLines(testApp: TestApp, chatId: string): Promise<Array<Record<string, unknown>>> {
  const raw = await testApp.memFs.readFile(`.tau/transcripts/${chatId}.jsonl`);
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function serializeForDiff(message: BaseMessage): string {
  const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  return `${message.type}|${content}`;
}

describe('Round-5 composed invariant probes (scripted model, no provider keys)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ modelService: scriptedModelService });
    testApp.providerRequestRecorder.enable();
  }, 30_000);

  afterAll(async () => {
    testApp.providerRequestRecorder.disable();
    await testApp.app.close();
  });

  it('PROBE-A (CH-14): eager dispatch persists oversized tool results unenveloped and drops transcript tool lines', async () => {
    const chatId = `probe-a-${Date.now()}`;
    // 150 lines x 700 chars ≈ 105k chars — read_file's whole-file path allows
    // it (<2000 lines) and it exceeds the 80k offload threshold, so the
    // ToolNode path would persist a <persisted-output> envelope.
    const line = 'x'.repeat(700);
    await testApp.memFs.writeFile(bigFilePath, Array.from({ length: 150 }, () => line).join('\n'));

    testApp.providerRequestRecorder.clear();
    const history = await postTurn(testApp, {
      chatId,
      messageId: 'a-1',
      text: `${readBigMarker} please read the fixture`,
    });
    await postTurn(testApp, { chatId, messageId: 'a-2', text: 'thanks, summarize', history });

    // Turn 2's provider request replays canonical (checkpointed) history —
    // whatever bytes the ToolMessage shows here are what state holds forever.
    const records = testApp.providerRequestRecorder.getRecords();
    const lastCall = records.at(-1)?.messages[0];
    expect(lastCall, 'expected a recorded provider request for turn 2').toBeDefined();

    const toolMessage = lastCall!.find(
      (message): message is ToolMessage => message instanceof ToolMessage && message.tool_call_id === bigToolCallId,
    );
    expect(toolMessage, 'expected the read_file ToolMessage in turn-2 replayed history').toBeDefined();

    const toolContent =
      typeof toolMessage!.content === 'string' ? toolMessage!.content : JSON.stringify(toolMessage!.content);

    // CH-14 CONFIRMED when: full bytes, no envelope. The eager short-circuit
    // returned the bare tool result, skipping tool-offloading (position 6).
    // W7 flip: expect(toolContent).toContain('<persisted-output>') and length < 10_000.
    expect(toolContent.length, 'oversized result should exceed the 80k offload threshold').toBeGreaterThan(80_000);
    expect(
      toolContent.startsWith('<persisted-output>'),
      `CH-14: expected CURRENT behavior = no offload envelope on the eager path (got ${toolContent.slice(0, 40)}…)`,
    ).toBe(false);

    // CH-14 CONFIRMED when: no role:"tool" transcript line. The transcript
    // middleware's wrapToolCall (innermost) never ran for the eager call.
    // W7 flip: expect exactly one tool line with toolCallId === bigToolCallId.
    const transcriptLines = await readTranscriptLines(testApp, chatId);
    const toolLines = transcriptLines.filter((entry) => entry['role'] === 'tool');
    expect(
      toolLines.length,
      `CH-14: expected CURRENT behavior = zero role:"tool" transcript lines for eager calls (got ${JSON.stringify(toolLines)})`,
    ).toBe(0);
  }, 30_000);

  it('PROBE-B (CH-9): constant-id snapshot-context rewrites in place mid-history across turns', async () => {
    const chatId = `probe-b-${Date.now()}`;
    const treeEntry = (size: number, lineCount: number) => ({
      fileTree: [
        { path: 'probe-tree-file.ts', name: 'probe-tree-file.ts', type: 'file', size, contentKind: 'text', lineCount },
      ],
    });

    testApp.providerRequestRecorder.clear();
    const history = await postTurn(testApp, {
      chatId,
      messageId: 'b-1',
      text: 'turn one hello',
      snapshot: treeEntry(111, 11),
    });
    const recordsAfterTurn1 = testApp.providerRequestRecorder.getRecords();
    const call1 = recordsAfterTurn1.at(-1)?.messages[0];

    await postTurn(testApp, {
      chatId,
      messageId: 'b-2',
      text: 'turn two hello',
      snapshot: treeEntry(222, 22),
      history,
    });
    const records = testApp.providerRequestRecorder.getRecords();
    const call2 = records.at(-1)?.messages[0];

    expect(call1, 'expected turn-1 provider request').toBeDefined();
    expect(call2, 'expected turn-2 provider request').toBeDefined();

    const snapshotIndexCall1 = call1!.findIndex((message) => serializeForDiff(message).includes('probe-tree-file.ts'));
    const snapshotIndexCall2 = call2!.findIndex((message) => serializeForDiff(message).includes('probe-tree-file.ts'));
    expect(snapshotIndexCall1, 'turn-1 request must contain the snapshot message').toBeGreaterThanOrEqual(0);

    // CH-9 CONFIRMED when: the snapshot sits at the SAME early index in both
    // calls (in-place replacement at its turn-1 position), carries turn-2
    // bytes, and exists exactly once — while everything before it is
    // byte-identical. The prefix therefore diverges at the snapshot on every
    // turn whose workspace changed.
    // W7 flip (ephemeral tail injection): snapshot appears at the TAIL of
    // call2 (index > position of turn-2 user message) and turn-1's slot is gone.
    expect(snapshotIndexCall2, 'snapshot must still be present in turn 2').toBeGreaterThanOrEqual(0);
    expect(
      snapshotIndexCall2,
      'CH-9: expected CURRENT behavior = snapshot pinned at its turn-1 index in the turn-2 request',
    ).toBe(snapshotIndexCall1);

    const snapshotCall2 = serializeForDiff(call2![snapshotIndexCall2]!);
    expect(snapshotCall2, 'CH-9: pinned message must carry turn-2 bytes (in-place rewrite)').toContain('222');
    expect(snapshotCall2, 'CH-9: turn-1 bytes must be gone from the pinned slot').not.toContain('111B');

    const snapshotCount = call2!.filter((message) => serializeForDiff(message).includes('probe-tree-file.ts')).length;
    expect(snapshotCount, 'replace-by-id must not duplicate the snapshot').toBe(1);

    // Prefix stability accounting: everything BEFORE the snapshot index is
    // byte-identical across turns; the divergence point is the snapshot slot,
    // not the appended tail — i.e. the cache-valid prefix ends at the
    // snapshot's turn-1 position for the rest of the session.
    for (let index = 0; index < snapshotIndexCall1; index += 1) {
      expect(serializeForDiff(call2![index]!), `prefix message ${index} should be byte-stable across turns`).toBe(
        serializeForDiff(call1![index]!),
      );
    }

    const divergenceRatio = snapshotIndexCall1 / call2!.length;
    // Documented measurement: the stable prefix ends this early in the request.
    expect(
      divergenceRatio,
      `CH-9 measured: cache-valid prefix ends at message index ${snapshotIndexCall1} of ${call2!.length}`,
    ).toBeLessThan(0.5);
  }, 30_000);

  it('PROBE-C (CH-11): the transcript records the snapshot injection as the turn-1 user message', async () => {
    const chatId = `probe-c-${Date.now()}`;
    const promptText = 'this is the real user prompt for probe C';

    await postTurn(testApp, {
      chatId,
      messageId: 'c-1',
      text: promptText,
      snapshot: {
        fileTree: [
          {
            path: 'probe-c-tree.ts',
            name: 'probe-c-tree.ts',
            type: 'file',
            size: 42,
            contentKind: 'text',
            lineCount: 4,
          },
        ],
      },
    });

    const transcriptLines = await readTranscriptLines(testApp, chatId);
    const userLines = transcriptLines.filter((entry) => entry['role'] === 'user' && entry['type'] === undefined);
    expect(userLines.length, 'expected exactly one user transcript line for the turn').toBe(1);

    const recorded = String(userLines[0]!['content']);
    // CH-11 CONFIRMED when: the recorded "user" line is the snapshot-context
    // injection (appended after the user message on turn 1), not the prompt.
    // W7 flip: recorded === promptText and never contains the tree filename.
    expect(
      recorded.includes('probe-c-tree.ts'),
      `CH-11: expected CURRENT behavior = snapshot text recorded as the user line (got: ${recorded.slice(0, 120)}…)`,
    ).toBe(true);
    expect(recorded.includes(promptText), 'CH-11: the real prompt is absent from the recorded user line').toBe(false);
  }, 30_000);

  it('PROBE-D (CH-17/CH-1): the token-usage reminder never fires — live streamed chunks fail the instanceof AIMessage gate', async () => {
    const chatId = `probe-d-${Date.now()}`;
    const isReminder = (message: BaseMessage) => /Token usage: \d+ used/.test(serializeForDiff(message));
    await testApp.memFs.writeFile(usageLoopFiles[0].path, 'tiny file one');
    await testApp.memFs.writeFile(usageLoopFiles[1].path, 'tiny file two');

    // One POST, three model calls in a single graph run: the tool-call
    // replies report 150k/152k input tokens of a 200k window — 0.75/0.76,
    // above the 0.7 reminder gate and below the 0.85 compaction trigger.
    // Mid-turn is the reminder's PRIMARY production surface (tool-heavy CAD
    // turns): the prior AI message is live in `request.messages` with its
    // usage_metadata attached.
    testApp.providerRequestRecorder.clear();
    await postTurn(testApp, { chatId, messageId: 'd-1', text: `${usageLoopMarker} read both tiny files in sequence` });

    const records = testApp.providerRequestRecorder.getRecords();
    expect(records.length, 'expected three model calls in the tool loop').toBeGreaterThanOrEqual(3);
    const call2 = records[1]!.messages[0]!;
    const call3 = records[2]!.messages[0]!;

    // The gate's inputs are demonstrably present: the live AI message carries
    // usage_metadata well above the 0.7 threshold (duck-typed read — the
    // middleware's own `instanceof AIMessage` is exactly what fails).
    const liveUsage2 = call2
      .filter((message) => message.type === 'ai')
      .map((message) => (message as AIMessage).usage_metadata)
      .find((usage) => usage !== undefined);
    expect(liveUsage2?.input_tokens, 'live streamed AI message carries 150k usage in the call-2 request').toBe(150_000);

    // CH-17 CONFIRMED when: despite visible over-threshold usage, no reminder
    // is injected on any call — `findMostRecentUsage` checks
    // `message instanceof AIMessage`, and live streamed messages are
    // AIMessageChunk instances (extends BaseMessageChunk, NOT AIMessage;
    // verified against @langchain/core). The 0.7 self-throttle feature is
    // inert in production streaming, and CH-1's head-of-history cache bust is
    // therefore LATENT, not active — fix placement (CH-1) and the type gate
    // (CH-17) together.
    // W7 flip: reminder present at the TAIL of call2/call3 with used ≥ 150001.
    expect(
      call2.some((message) => isReminder(message)),
      'CH-17: expected CURRENT behavior = no reminder despite 0.75 utilization mid-turn',
    ).toBe(false);
    expect(
      call3.some((message) => isReminder(message)),
      'CH-17: expected CURRENT behavior = no reminder on the next mid-turn call either',
    ).toBe(false);
  }, 30_000);

  it('PROBE-E (CH-2 RETRACTION): budget envelopes are durable — the round-2 ephemerality claim is disproven', async () => {
    const chatId = `probe-e-${Date.now()}`;
    // Three reads, each under the 80k per-tool offload cap, aggregating
    // ~227k chars > the 200k budget — only the aggregate layer can act.
    // A fourth small read in the SAME graph run produces the next model call,
    // where the trio is no longer the trailing run — if the envelope were
    // ephemeral (round-2 CH-2's claim), it would evaporate there.
    await Promise.all(
      trioFiles.map(async (file) => {
        const line = 'y'.repeat(file.width);
        await testApp.memFs.writeFile(file.path, Array.from({ length: file.lines }, () => line).join('\n'));
      }),
    );
    await testApp.memFs.writeFile(trioTailCall.path, 'tiny tail file');
    const trioIds = new Set<string>(trioFiles.map((file) => file.id));
    const trioMessages = (call: readonly BaseMessage[]) =>
      call.filter(
        (message): message is ToolMessage => message instanceof ToolMessage && trioIds.has(message.tool_call_id),
      );
    const contentOf = (message: ToolMessage) =>
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

    testApp.providerRequestRecorder.clear();
    await postTurn(testApp, { chatId, messageId: 'e-1', text: `${readTrioMarker} read all three then the tail` });

    // Model calls in the single run: [1] emits the fan-out, [2] sees the trio
    // as the trailing run (the enforcement call), [3] runs after the tail read
    // (trio no longer trailing — enforcement cannot re-fire there).
    const records = testApp.providerRequestRecorder.getRecords();
    expect(records.length, 'expected three model calls (fan-out, enforcement, post-tail)').toBeGreaterThanOrEqual(3);
    const enforcementCall = records[1]!.messages[0]!;
    const nextCall = records[2]!.messages[0]!;

    const enforcedTrio = trioMessages(enforcementCall);
    expect(enforcedTrio.length, 'all three tool results must be in the enforcement call').toBe(3);

    const enveloped = enforcedTrio.filter((message) => contentOf(message).startsWith('<persisted-output>'));
    expect(enveloped.length, 'budget envelopes exactly the largest result to satisfy the cap').toBe(1);
    expect(enveloped[0]!.tool_call_id, 'the largest result (trio-a) is enveloped first').toBe('call_trio_a');

    // RETRACTION MEASUREMENT — round-2 CH-2 predicted the envelope evaporates
    // after one model call (wrapModelCall assumed ephemeral, by analogy with
    // the trimmer's per-request design). Measured reality: the model node
    // persists the effective request messages, so the envelope survives BOTH
    // the next model call of the same run AND the checkpoint. CH-2 is
    // retracted; the middleware's own cross-turn cache test was right.
    const nextTrio = trioMessages(nextCall);
    expect(nextTrio.length, 'all three tool results are still in the very next call').toBe(3);
    const trioANext = nextTrio.find((message) => message.tool_call_id === 'call_trio_a');
    expect(
      contentOf(trioANext!).startsWith('<persisted-output>'),
      'MEASURED: the envelope survives the very next model call (durable, not ephemeral)',
    ).toBe(true);

    const tuple = await testApp.checkpointer.getTuple({ configurable: { thread_id: chatId } });
    const stateMessages = (tuple?.checkpoint.channel_values?.['messages'] ?? []) as BaseMessage[];
    const stateTrio = stateMessages.filter(
      (message): message is ToolMessage => message instanceof ToolMessage && trioIds.has(message.tool_call_id),
    );
    expect(stateTrio.length, 'exactly three trio results in checkpointed state (no duplicates)').toBe(3);
    const stateTrioA = stateTrio.find((message) => message.tool_call_id === 'call_trio_a');
    expect(
      contentOf(stateTrioA!).startsWith('<persisted-output>'),
      'MEASURED: the envelope is in the CHECKPOINT — wrapModelCall message replacement persists in this stack',
    ).toBe(true);

    // The mechanism therefore works end-to-end: post-envelope aggregate fits
    // the cap, and the offloaded bytes are on disk for re-reads.
    const aggregateChars = nextTrio.reduce((total, message) => total + contentOf(message).length, 0);
    expect(aggregateChars, 'post-envelope aggregate sits under the 200k cap').toBeLessThan(200_000);
    const persisted = await testApp.memFs.readFile(`.tau/tool-results/${chatId}/call_trio_a.txt`);
    const persistedText = typeof persisted === 'string' ? persisted : new TextDecoder().decode(persisted);
    expect(persistedText.length, 'the offload file exists with the full bytes').toBeGreaterThan(70_000);
  }, 30_000);
});

describe('Round-5 composed invariant probes: compaction path (captured compact() calls)', () => {
  type CapturedCompactCall = {
    messages: BaseMessage[];
    query: string;
    keepContextTags?: string[];
  };

  const buildCompactionCapture = (calls: CapturedCompactCall[]) => ({
    async compact(options: CapturedCompactCall) {
      calls.push(options);
      return {
        compactedMessages: [new AIMessage('[Compacted conversation history]\nprobe summary')],
        stats: {
          tokensBeforeCompaction: 2000,
          tokensAfterCompaction: 25,
          compressionRatio: 0.0125,
          messagesEvicted: options.messages.length,
        },
      };
    },
  });

  const wideWindowCompactCalls: CapturedCompactCall[] = [];
  const tinyWindowCompactCalls: CapturedCompactCall[] = [];
  let wideWindowApp: TestApp;
  let tinyWindowApp: TestApp;

  beforeAll(async () => {
    wideWindowApp = await createTestApp({
      modelService: scriptedModelService,
      compactionService: buildCompactionCapture(wideWindowCompactCalls),
    });
    tinyWindowApp = await createTestApp({
      modelService: {
        ...scriptedModelService,
        getContextWindow() {
          // Small enough that the chars/4 ESTIMATE (system prompt alone)
          // exceeds the 0.85 trigger on every call — compaction fires without
          // needing the (dead, see PROBE-F1) previous-usage path.
          return 2000;
        },
      },
      compactionService: buildCompactionCapture(tinyWindowCompactCalls),
    });
  }, 30_000);

  afterAll(async () => {
    await wideWindowApp.app.close();
    await tinyWindowApp.app.close();
  });

  it('PROBE-F1 (CH-17): the previous-usage compaction trigger never records under streaming', async () => {
    const chatId = `probe-f1-${Date.now()}`;

    // Report usage at 0.875 of the 200k window — comfortably past the 0.85
    // previous-usage trigger. If the trigger worked, the NEXT turn would
    // compact.
    let history = await postTurn(wideWindowApp, { chatId, messageId: 'f1-1', text: 'turn one filler' });
    history = await postTurn(wideWindowApp, { chatId, messageId: 'f1-2', text: 'HIGH_USAGE:175000 turn two', history });

    const tuple = await wideWindowApp.checkpointer.getTuple({ configurable: { thread_id: chatId } });
    const channelValues = tuple?.checkpoint.channel_values ?? {};
    const stateMessages = (channelValues['messages'] ?? []) as BaseMessage[];
    const lastStateMessage = stateMessages.at(-1) as AIMessage | undefined;

    // The contradiction, measured: the state's last AI message carries the
    // 175k usage_metadata, but the afterModel recorder skipped it — at
    // recording time the live message is an AIMessageChunk, which is NOT
    // `instanceof AIMessage` (verified against @langchain/core), so
    // `_lastProviderInputTokens` never populates.
    expect(lastStateMessage?.usage_metadata?.input_tokens, 'the checkpointed reply carries the reported usage').toBe(
      175_000,
    );
    expect(
      channelValues['_lastProviderInputTokens'],
      'CH-17: expected CURRENT behavior = previous-usage channel never records under streaming',
    ).toBeUndefined();

    await postTurn(wideWindowApp, { chatId, messageId: 'f1-3', text: 'turn three filler', history });

    // CH-17 CONFIRMED when: no compaction fires despite reported usage 0.875
    // of the window — the previous-usage hard trigger is dead in production
    // streaming; only the chars/4 estimate guards the window.
    // W7 flip: compaction fires on the turn after usage crosses 0.85.
    expect(
      wideWindowCompactCalls.length,
      'CH-17: expected CURRENT behavior = previous-usage trigger never fires compaction',
    ).toBe(0);
  }, 30_000);

  it('PROBE-F2 (CH-3): compaction is invoked without keepContextTags while safety-tagged content sits in the evicted set', async () => {
    const chatId = `probe-f2-${Date.now()}`;
    const safetyLine = '<system-reminder>NEVER export without confirmation</system-reminder>';
    await tinyWindowApp.memFs.writeFile(usageLoopFiles[0].path, 'tiny file one');
    await tinyWindowApp.memFs.writeFile(usageLoopFiles[1].path, 'tiny file two');

    // Single POST, mid-run eviction (no client round-trip): with a
    // 2000-token window the estimate path fires on every model call; the
    // first call with an evictable slice is call 3 of the tool loop
    // ([u1, ai1, tm1, ai2, tm2] → keep 4 → evict u1, which carries the
    // safety-tagged line).
    await postTurn(tinyWindowApp, {
      chatId,
      messageId: 'f2-1',
      text: `${usageLoopMarker} respect this: ${safetyLine} while reading both tiny files`,
    });

    expect(tinyWindowCompactCalls.length, 'compaction must have fired via the estimate path').toBeGreaterThanOrEqual(1);
    const call = tinyWindowCompactCalls[0]!;

    // CH-3 CONFIRMED when: the composed pipeline passes NO keepContextTags —
    // the preservation hook exists in CompactionService but the middleware
    // never feeds it, so the renderer's <keepContext> wrap can never fire and
    // safety-tagged content reaches the summarizer unprotected.
    // W7 flip: expect(call.keepContextTags) to contain '<system-reminder>'
    // (and the Part 6 regression asserts verbatim survival end-to-end).
    expect(
      'keepContextTags' in call,
      'CH-3: expected CURRENT behavior = compact() invoked without keepContextTags',
    ).toBe(false);

    const evictedTexts = call.messages.map((message) =>
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
    );
    expect(
      evictedTexts.some((text) => text.includes('NEVER export without confirmation')),
      'the safety-tagged instruction is in the evicted set headed to the summarizer, unprotected',
    ).toBe(true);
  }, 30_000);
});
