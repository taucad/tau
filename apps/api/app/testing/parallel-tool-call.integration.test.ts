import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseJsonEventStream } from '@ai-sdk/provider-utils';
import { uiMessageChunkSchema } from 'ai';
import type { UIMessageChunk } from 'ai';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { collectFinalMessage, collectStreamChunks } from '#testing/stream-consumer.js';
import { expectNoErrors, extractToolCallParts } from '#testing/stream-assertions.js';
import type { RpcTimingEvent } from '#testing/headless-chat-rpc.service.js';
import { buildCadAgent, requiresEnv } from '#testing/skip-helpers.js';

/**
 * Real-LLM integration coverage for parallel tool-call durability and
 * immediate RPC flushing.
 *
 * The chat controller streams LangGraph's agent graph without a
 * `maxConcurrency` cap because @langchain/langgraph 1.1.5
 * `PregelRunner._executeTasksWithRetry` silently drops tasks beyond the
 * cap when the cap is below `tasks.length` (see `parallel-tool-call.test.ts`
 * for the deterministic regression). This file validates the production
 * behavior end-to-end against a real provider:
 *
 * - Parallel reads: the agent issues multiple `read_file` calls in one
 *   assistant turn; both must complete with `output-available`.
 * - Parallel writes (immediate flush + sequential read-back): the agent
 *   issues multiple `create_file` calls in parallel. The SSE stream must
 *   read the RPC results back **sequentially in the same order as the
 *   inputs were emitted** — i.e. if the model emits inputs for `one.txt`,
 *   `two.txt`, `three.txt` in that order, the matching
 *   `tool-output-available` chunks must arrive in the same `one`/`two`/`three`
 *   order without scrambling (LangGraph's `messages` stream commits the
 *   channel after the parallel superstep settles, preserving Pregel task
 *   order). At the moment each `tool-output-available` chunk is observed
 *   the corresponding file must already exist on memFs (proves the RPC
 *   dispatched and persisted before the API emitted the output chunk —
 *   "fired immediately when the tool input was available").
 *
 * Run locally with:
 * `pnpm nx test api app/testing/parallel-tool-call.integration.test.ts --watch=false`
 *
 * Requires `ANTHROPIC_API_KEY` in `apps/api/.env`.
 */
describe.skipIf(requiresEnv('ANTHROPIC_API_KEY'))('Parallel tool-call durability (real LLM)', () => {
  const modelId = 'anthropic-claude-haiku-4.5';
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('runs multiple parallel read_file calls to completion', async () => {
    await testApp.memFs.writeFile('alpha.txt', 'alpha content');
    await testApp.memFs.writeFile('beta.txt', 'beta content');
    await testApp.memFs.writeFile('gamma.txt', 'gamma content');

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-parallel-read-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'Read the contents of all three files in a single turn so they execute in parallel:',
                  '- alpha.txt',
                  '- beta.txt',
                  '- gamma.txt',
                  'Then summarize what you found.',
                ].join('\n'),
              },
            ],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

    const chunks = await collectStreamChunks(response);
    expectNoErrors(chunks);

    const message = await collectFinalMessage(chunks);
    const reads = extractToolCallParts(message, 'read_file');
    const completed = reads.filter((part) => part.state === 'output-available');

    expect(
      completed.length,
      `Expected at least 2 parallel read_file calls to complete; observed ${completed.length} (states: ${reads.map((p) => p.state).join(', ')})`,
    ).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('flushes parallel create_file RPCs immediately and reads results back sequentially', async () => {
    type CreateFileToolInput = { targetFile: string; content: string };

    type TimelineEvent =
      | { kind: 'input'; toolCallId: string; targetFile: string }
      | { kind: 'output'; toolCallId: string; targetFile: string };

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-parallel-write-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'Create three files in parallel in a single turn:',
                  '- one.txt with content "ONE"',
                  '- two.txt with content "TWO"',
                  '- three.txt with content "THREE"',
                  'All three create_file tool calls must be in the same assistant turn.',
                ].join('\n'),
              },
            ],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
    expect(response.body, 'response body must be a readable stream').not.toBeNull();

    const inputsByToolCallId = new Map<string, CreateFileToolInput>();
    const timeline: TimelineEvent[] = [];
    const observedChunks: UIMessageChunk[] = [];

    async function existsOnEither(relativePath: string): Promise<boolean> {
      if (await testApp.memFs.exists(relativePath)) {
        return true;
      }

      return testApp.memFs.exists(`/${relativePath}`);
    }

    const rawStream = parseJsonEventStream({
      stream: response.body!,
      // oxlint-disable-next-line typescript-eslint/consistent-type-assertions, typescript-eslint/no-explicit-any, typescript-eslint/no-unsafe-assignment -- AI SDK schema type mismatch (mirrors `collectStreamChunks` in stream-consumer.ts)
      schema: uiMessageChunkSchema as any,
    });

    const chunkStream: ReadableStream<UIMessageChunk> = rawStream.pipeThrough(
      new TransformStream<{ success: boolean; value?: unknown; error?: unknown }, UIMessageChunk>({
        transform(parsed, controller) {
          if (!parsed.success) {
            throw parsed.error;
          }

          // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- chunk validated by AI SDK schema in parseJsonEventStream
          controller.enqueue(parsed.value as UIMessageChunk);
        },
      }),
    );

    const reader = chunkStream.getReader();
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- read loop pattern
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- sequential stream read
      const result = await reader.read();
      if (result.done) {
        break;
      }

      const chunk: UIMessageChunk = result.value;
      observedChunks.push(chunk);

      if (chunk.type === 'tool-input-available' && chunk.toolName === 'create_file') {
        // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- create_file input shape is fixed by the chat tool schema
        const input = chunk.input as CreateFileToolInput;
        inputsByToolCallId.set(chunk.toolCallId, input);
        timeline.push({ kind: 'input', toolCallId: chunk.toolCallId, targetFile: input.targetFile });
        continue;
      }

      if (chunk.type === 'tool-output-available') {
        const input = inputsByToolCallId.get(chunk.toolCallId);
        if (!input) {
          continue;
        }

        timeline.push({ kind: 'output', toolCallId: chunk.toolCallId, targetFile: input.targetFile });

        // Immediate-flush guarantee: the API awaits the RPC before emitting
        // `tool-output-available`, so the file must already be on memFs at
        // the exact moment we observe this chunk.
        // oxlint-disable-next-line no-await-in-loop -- per-chunk side-effect verification
        const exists = await existsOnEither(input.targetFile);
        expect(
          exists,
          `Expected ${input.targetFile} to be persisted on memFs at the moment tool-output-available was observed for ${chunk.toolCallId}`,
        ).toBe(true);
      }
    }

    expectNoErrors(observedChunks);

    expect(timeline.length, 'Expected at least one create_file input/output pair in the stream').toBeGreaterThan(0);

    const inputCount = timeline.filter((event) => event.kind === 'input').length;
    const outputCount = timeline.filter((event) => event.kind === 'output').length;

    expect(
      inputCount,
      `Expected at least 2 parallel create_file inputs; observed ${inputCount}`,
    ).toBeGreaterThanOrEqual(2);
    expect(
      outputCount,
      `Expected create_file outputs to match inputs (no dropped tasks); observed ${outputCount} outputs vs ${inputCount} inputs`,
    ).toBe(inputCount);

    // Sequential read-back: outputs must arrive in the same order as the
    // inputs were emitted. Pregel runs the parallel `Send`-spawned ToolNode
    // tasks concurrently, but LangGraph's `messages` stream commits the
    // channel update at the end of the superstep with the tool messages in
    // task-creation order. If the SSE stream ever scrambles the output
    // order we'd see a divergence here — the regression case where the
    // dispatcher returns results out-of-order would also surface as the
    // wrong file content landing under the wrong tool-call id (the chat
    // UI hooks each output back to its initiating tool part by id).
    const inputOrder = timeline.filter((event) => event.kind === 'input').map((event) => event.toolCallId);
    const outputOrder = timeline.filter((event) => event.kind === 'output').map((event) => event.toolCallId);
    expect(
      outputOrder,
      `Expected create_file outputs to read back in the same order as inputs.\nInputs:  ${inputOrder.join(', ')}\nOutputs: ${outputOrder.join(', ')}\nTimeline: ${JSON.stringify(timeline)}`,
    ).toEqual(inputOrder);

    // No tool call is left dangling without a settled output.
    const settledIds = new Set(outputOrder);
    const danglingInputs = inputOrder.filter((toolCallId) => !settledIds.has(toolCallId));
    expect(
      danglingInputs,
      `Expected every create_file input to settle with a tool-output-available chunk; never settled: ${danglingInputs.join(', ')}`,
    ).toEqual([]);

    // Final-state guardrail: every targetFile the model proposed must end up
    // on memFs. Catches the upstream PregelRunner off-by-one regression that
    // silently drops the second parallel task.
    const targetFiles = [...inputsByToolCallId.values()].map((input) => input.targetFile);
    const persisted = await Promise.all(targetFiles.map(async (targetFile) => existsOnEither(targetFile)));
    const persistedCount = persisted.filter(Boolean).length;
    expect(
      persistedCount,
      `Expected every create_file target to persist on memFs; missing: ${targetFiles
        .filter((_, index) => !persisted[index])
        .join(', ')}`,
    ).toBe(targetFiles.length);
  }, 120_000);

  /**
   * Eager-dispatch certification test for three parallel `create_file` calls.
   *
   * Captures stream-relative timestamps for `tool-*` chunks plus headless RPC
   * lifecycle events, then asserts the Cursor-like ordering invariant:
   * each tool's `tool-output-available` lands before the *next* tool's
   * `tool-input-available` when sorted by time, and `rpc-invoked` fires within
   * 5ms of the matching `tool-input-available` (same `t0` baseline).
   */
  // oxlint-disable-next-line eslint/complexity -- timing-baseline test threads many chunk types through one consumer; splitting hides the chronological intent
  it('eagerly dispatches parallel create_file calls in stream-relative order', async () => {
    type CreateFileToolInput = { targetFile: string; content: string };

    type StampedEvent =
      | { kind: 'tool-input-start'; t: number; toolCallId: string }
      | { kind: 'tool-input-delta'; t: number; toolCallId: string; delta: string }
      | { kind: 'tool-input-available'; t: number; toolCallId: string; targetFile: string }
      | { kind: 'tool-output-available'; t: number; toolCallId: string; targetFile: string }
      | { kind: 'finish-step'; t: number }
      | { kind: 'start-step'; t: number }
      | { kind: 'rpc-invoked'; t: number; toolCallId: string; rpcName: string }
      | { kind: 'rpc-dispatched'; t: number; toolCallId: string; rpcName: string }
      | { kind: 'rpc-resolved'; t: number; toolCallId: string; rpcName: string };

    const t0 = performance.now();

    const rpcEvents: RpcTimingEvent[] = [];
    testApp.headlessRpc.setTimingObserver((event) => {
      rpcEvents.push(event);
    });

    const response = await fetch(`${testApp.baseUrl}/v1/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `test-eager-dispatch-${Date.now()}`,
        messages: [
          {
            id: 'msg_1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: [
                  'Create three files in parallel in a single turn, each with exactly 5 lines of distinct lorem ipsum text:',
                  '- lipsum1.txt',
                  '- lipsum2.txt',
                  '- lipsum3.txt',
                  'All three create_file tool calls must be in the same assistant turn.',
                ].join('\n'),
              },
            ],
            metadata: { model: modelId, kernel: 'replicad' },
          },
        ],
        agent: buildCadAgent(modelId, 'replicad'),
      }),
    });

    expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);
    expect(response.body, 'response body must be a readable stream').not.toBeNull();

    const inputsByToolCallId = new Map<string, CreateFileToolInput>();
    const targetFileByToolCallId = new Map<string, string>();
    const events: StampedEvent[] = [];
    const observedChunks: UIMessageChunk[] = [];

    const rawStream = parseJsonEventStream({
      stream: response.body!,
      // oxlint-disable-next-line typescript-eslint/consistent-type-assertions, typescript-eslint/no-explicit-any, typescript-eslint/no-unsafe-assignment -- AI SDK schema type mismatch
      schema: uiMessageChunkSchema as any,
    });

    const chunkStream: ReadableStream<UIMessageChunk> = rawStream.pipeThrough(
      new TransformStream<{ success: boolean; value?: unknown; error?: unknown }, UIMessageChunk>({
        transform(parsed, controller) {
          if (!parsed.success) {
            throw parsed.error;
          }

          // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- chunk validated by AI SDK schema in parseJsonEventStream
          controller.enqueue(parsed.value as UIMessageChunk);
        },
      }),
    );

    const reader = chunkStream.getReader();
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- read loop pattern
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- sequential stream read
      const result = await reader.read();
      if (result.done) {
        break;
      }

      const chunk: UIMessageChunk = result.value;
      observedChunks.push(chunk);
      const t = performance.now() - t0;

      if (chunk.type === 'tool-input-start' && chunk.toolName === 'create_file') {
        events.push({ kind: 'tool-input-start', t, toolCallId: chunk.toolCallId });
        continue;
      }

      if (chunk.type === 'tool-input-delta') {
        events.push({
          kind: 'tool-input-delta',
          t,
          toolCallId: chunk.toolCallId,
          delta: chunk.inputTextDelta,
        });
        continue;
      }

      if (chunk.type === 'tool-input-available' && chunk.toolName === 'create_file') {
        // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- create_file input shape is fixed by the chat tool schema
        const input = chunk.input as CreateFileToolInput;
        inputsByToolCallId.set(chunk.toolCallId, input);
        targetFileByToolCallId.set(chunk.toolCallId, input.targetFile);
        events.push({
          kind: 'tool-input-available',
          t,
          toolCallId: chunk.toolCallId,
          targetFile: input.targetFile,
        });
        continue;
      }

      if (chunk.type === 'tool-output-available') {
        const targetFile = targetFileByToolCallId.get(chunk.toolCallId);
        if (!targetFile) {
          continue;
        }

        events.push({ kind: 'tool-output-available', t, toolCallId: chunk.toolCallId, targetFile });
        continue;
      }

      if (chunk.type === 'finish-step') {
        events.push({ kind: 'finish-step', t });
        continue;
      }

      if (chunk.type === 'start-step') {
        events.push({ kind: 'start-step', t });
        continue;
      }
    }

    // Detach the timing observer to avoid leaking into other tests.
    testApp.headlessRpc.setTimingObserver(undefined);

    expectNoErrors(observedChunks);

    const inputAvailable = events.filter((event) => event.kind === 'tool-input-available');
    const outputAvailable = events.filter((event) => event.kind === 'tool-output-available');
    expect(inputAvailable.length, 'Expected 3 parallel create_file inputs').toBe(3);
    expect(outputAvailable.length, 'Expected 3 parallel create_file outputs').toBe(3);

    // Merge RPC timing events into the unified timeline, normalising to the
    // same `t0` clock so RPC dispatch points slot in chronologically next to
    // the SSE chunks.
    for (const rpcEvent of rpcEvents) {
      const stampedKind: 'rpc-invoked' | 'rpc-dispatched' | 'rpc-resolved' =
        rpcEvent.stage === 'invoked'
          ? 'rpc-invoked'
          : rpcEvent.stage === 'dispatched'
            ? 'rpc-dispatched'
            : 'rpc-resolved';
      events.push({
        kind: stampedKind,
        t: rpcEvent.t - t0,
        toolCallId: rpcEvent.toolCallId,
        rpcName: String(rpcEvent.rpcName),
      });
    }

    events.sort((a, b) => a.t - b.t);

    // Build a compact, machine-readable timing report so the failure mode is
    // visible in the test log even when assertions pass.
    const formatTime = (t: number): string => `${t.toFixed(0).padStart(6, ' ')}ms`;

    const lines: string[] = [];
    lines.push('--- eager-dispatch timing baseline ---');
    for (const event of events) {
      switch (event.kind) {
        case 'tool-input-start': {
          lines.push(`${formatTime(event.t)}  input-start      ${event.toolCallId}`);
          break;
        }

        case 'tool-input-delta': {
          // Suppress per-delta noise; only log the closing delta.
          if (event.delta.includes(String.raw`\"}`)) {
            lines.push(`${formatTime(event.t)}  input-end-delta  ${event.toolCallId}`);
          }
          break;
        }

        case 'tool-input-available': {
          lines.push(`${formatTime(event.t)}  input-available  ${event.toolCallId}  ${event.targetFile}`);
          break;
        }

        case 'tool-output-available': {
          lines.push(`${formatTime(event.t)}  output-available ${event.toolCallId}  ${event.targetFile}`);
          break;
        }

        case 'finish-step': {
          lines.push(`${formatTime(event.t)}  finish-step`);
          break;
        }

        case 'start-step': {
          lines.push(`${formatTime(event.t)}  start-step`);
          break;
        }

        case 'rpc-invoked': {
          lines.push(`${formatTime(event.t)}  rpc-invoked      ${event.toolCallId}  ${event.rpcName}`);
          break;
        }

        case 'rpc-dispatched': {
          lines.push(`${formatTime(event.t)}  rpc-dispatched   ${event.toolCallId}  ${event.rpcName}`);
          break;
        }

        case 'rpc-resolved': {
          lines.push(`${formatTime(event.t)}  rpc-resolved     ${event.toolCallId}  ${event.rpcName}`);
          break;
        }
      }
    }

    // Per-tool gap analysis: how long between each input-available and its
    // matching output-available? Today this gap is bounded by the agent
    // superstep, so all three gaps are roughly identical (and small) because
    // every input-available chunk emits at the same t. With eager dispatch
    // the gap for the first tool would be a real RPC duration, decoupled
    // from the LLM's continued streaming of subsequent tools.
    lines.push('--- per-tool input→output gap ---');
    for (const inputEvent of inputAvailable) {
      const matched = outputAvailable.find((o) => o.toolCallId === inputEvent.toolCallId);
      if (matched) {
        const gap = matched.t - inputEvent.t;
        lines.push(
          `${formatTime(inputEvent.t)} → ${formatTime(matched.t)}  Δ=${gap.toFixed(0).padStart(5, ' ')}ms  ${inputEvent.toolCallId}  ${inputEvent.targetFile}`,
        );
      }
    }

    // Per-tool RPC analysis: align each tool's lifecycle (input-available →
    // rpc-invoked → rpc-dispatched → rpc-resolved → output-available) so we
    // can see WHERE the latency lives. Three diagnostic gaps:
    //   - Δ(input-available → rpc-invoked): how long after the LLM
    //     finalised the args before the agent runtime called sendRpcRequest
    //   - Δ(rpc-dispatched → rpc-resolved): the actual RPC work duration
    //   - Δ(rpc-resolved → output-available): how long after the RPC
    //     returned before the SSE chunk actually emitted to the client
    lines.push('--- per-tool RPC alignment ---');
    const rpcByToolCallId = new Map<
      string,
      { invoked?: number; dispatched?: number; resolved?: number; rpcName?: string }
    >();
    for (const event of events) {
      if (event.kind === 'rpc-invoked' || event.kind === 'rpc-dispatched' || event.kind === 'rpc-resolved') {
        const slot = rpcByToolCallId.get(event.toolCallId) ?? {};
        slot.rpcName = event.rpcName;
        if (event.kind === 'rpc-invoked') {
          slot.invoked = event.t;
        } else if (event.kind === 'rpc-dispatched') {
          slot.dispatched = event.t;
        } else {
          slot.resolved = event.t;
        }
        rpcByToolCallId.set(event.toolCallId, slot);
      }
    }

    for (const inputEvent of inputAvailable) {
      const rpc = rpcByToolCallId.get(inputEvent.toolCallId);
      const output = outputAvailable.find((o) => o.toolCallId === inputEvent.toolCallId);
      if (!rpc || !output || rpc.invoked === undefined || rpc.resolved === undefined) {
        lines.push(`(no RPC observed for ${inputEvent.toolCallId} ${inputEvent.targetFile})`);
        continue;
      }
      const inputToInvoke = rpc.invoked - inputEvent.t;
      const rpcDuration = rpc.resolved - rpc.invoked;
      const resolveToOutput = output.t - rpc.resolved;
      lines.push(
        `${inputEvent.targetFile} (${rpc.rpcName ?? '?'}): input-available@${formatTime(inputEvent.t)} → rpc-invoked@${formatTime(rpc.invoked)} (Δ=${inputToInvoke.toFixed(0)}ms) → rpc-resolved@${formatTime(rpc.resolved)} (work=${rpcDuration.toFixed(0)}ms) → output-available@${formatTime(output.t)} (Δ=${resolveToOutput.toFixed(0)}ms)`,
      );
    }

    // Spread across all 3 RPCs: how clustered are the dispatch/resolve
    // timestamps? In headless mode the `dispatched` values should differ
    // by ~milliseconds (parallel writes to memFs), but `invoked` should
    // ALSO be tightly clustered because every RPC fires at the same
    // tools-superstep entry — that's the smoking gun for the Pregel
    // barrier. With eager dispatch the `invoked` events would spread out
    // across the LLM's argument-streaming window instead.
    const invokedTimes = inputAvailable
      .map((iae) => rpcByToolCallId.get(iae.toolCallId)?.invoked)
      .filter((t): t is number => t !== undefined)
      .sort((a, b) => a - b);
    const resolvedTimes = inputAvailable
      .map((iae) => rpcByToolCallId.get(iae.toolCallId)?.resolved)
      .filter((t): t is number => t !== undefined)
      .sort((a, b) => a - b);
    if (invokedTimes.length === 3 && resolvedTimes.length === 3) {
      const invokedSpread = invokedTimes.at(-1)! - invokedTimes[0]!;
      const resolvedSpread = resolvedTimes.at(-1)! - resolvedTimes[0]!;
      lines.push(`rpc-invoked spread:  ${invokedSpread.toFixed(0)}ms (across 3 tools)`);
      lines.push(`rpc-resolved spread: ${resolvedSpread.toFixed(0)}ms (across 3 tools)`);
    }

    // Diagnostic: ordering check vs next tool input-available (used in logs).
    lines.push('--- stream-relative ordering (output vs next input-available) ---');
    const sortedInputsForDiag = [...inputAvailable].sort((a, b) => a.t - b.t);
    for (let i = 0; i < sortedInputsForDiag.length - 1; i += 1) {
      const currentInput = sortedInputsForDiag[i];
      const nextInput = sortedInputsForDiag[i + 1];
      const currentOutput = outputAvailable.find((o) => o.toolCallId === currentInput?.toolCallId);
      if (!currentInput || !nextInput || !currentOutput) {
        continue;
      }

      const violated = currentOutput.t > nextInput.t;
      lines.push(
        `${violated ? 'VIOLATED' : 'OK      '}  ${currentInput.targetFile} output@${formatTime(currentOutput.t)} vs next input@${formatTime(nextInput.t)}`,
      );
    }

    // Always print the report so each CI run captures the current numbers.
    // oxlint-disable-next-line no-console -- timing report is the test's deliverable
    console.log(lines.join('\n'));

    const sortedInputAvailable = [...inputAvailable].sort((a, b) => a.t - b.t);
    for (let index = 0; index < sortedInputAvailable.length - 1; index += 1) {
      const currentInputStamp = sortedInputAvailable[index];
      const nextInputStamp = sortedInputAvailable[index + 1];
      const currentOutputStamp = outputAvailable.find((stamp) => stamp.toolCallId === currentInputStamp?.toolCallId);
      expect(
        currentOutputStamp?.t,
        `Tool ${currentInputStamp!.targetFile} output must land before ${nextInputStamp!.targetFile} input-available`,
      ).toBeLessThan(nextInputStamp!.t);
    }

    const createFileInputToolCallIds = new Set(inputAvailable.map((stamp) => stamp.toolCallId));

    for (const invokedRpc of rpcEvents.filter(
      (lifecycle) => lifecycle.stage === 'invoked' && createFileInputToolCallIds.has(lifecycle.toolCallId),
    )) {
      const pairedInputStamp = inputAvailable.find((stamp) => stamp.toolCallId === invokedRpc.toolCallId);
      expect(
        pairedInputStamp,
        `rpc-invoked for ${invokedRpc.toolCallId} must correlate to a tool-input-available chunk`,
      ).toBeDefined();
      // Eager invocation can record `rpc-invoked` shortly before the matching
      // `tool-input-available` chunk reaches this reader (~tens of millis in real runs).
      expect(Math.abs(pairedInputStamp!.t - (invokedRpc.t - t0))).toBeLessThanOrEqual(50);
    }
  }, 180_000);
});
