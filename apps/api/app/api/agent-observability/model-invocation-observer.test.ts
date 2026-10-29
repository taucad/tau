/* eslint-disable @typescript-eslint/naming-convention -- provider wire fields use snake_case. */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import { verifyEvidenceDigest } from '@taucad/agent-observability/identity';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import type {
  ModelInvocationIntent,
  ModelInvocationResult,
  ModelInvocationService,
} from '#api/llm/model-invocation.types.js';
import { providerAttemptEvidence } from '#api/agent-observability/model-invocation-evidence.js';
import type { ObservedAttempt } from '#api/agent-observability/model-invocation-evidence.js';
import type { ModelInvocationEvidenceRecorder } from '#api/agent-observability/model-invocation-recorder.service.js';
import { ObservedModelInvocationService } from '#api/agent-observability/model-invocation-observer.js';

const secret = 'PRIVATE_PROMPT_AND_OUTPUT_4be1';
const body = new TextEncoder().encode(
  [
    { type: 'message_start', message: { id: 'msg_1', model: 'claude-test', usage: { input_tokens: 4 } } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: secret } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
  ]
    .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
    .join(''),
);

const intent = (change: Partial<ModelInvocationIntent> = {}): ModelInvocationIntent => ({
  authUserId: 'user-a',
  surface: 'gateway',
  attempt: { version: 1, key: 'attempt-1' },
  providerWire: 'anthropic',
  body: { model: 'anthropic-claude-test', messages: [{ role: 'user', content: secret }] },
  priceHeaders: {},
  activity: 'agent',
  projectHint: 'project-a',
  chatHint: 'chat-a',
  signal: new AbortController().signal,
  ...change,
});

const streaming = (completion: Promise<void> = Promise.resolve()): ModelInvocationResult => ({
  state: 'streaming',
  operationId: 'op-1',
  response: new Response(new Blob([body]).stream(), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  completion,
});

const setup = (
  result: (intent: ModelInvocationIntent) => Promise<ModelInvocationResult>,
  capable = true,
  admits = false,
) => {
  const inner = mock<ModelInvocationService>();
  inner.invoke.mockImplementation(result);
  const recorder = mock<ModelInvocationEvidenceRecorder>();
  Object.defineProperty(recorder, 'capable', { value: capable });
  const recorded: ObservedAttempt[] = [];
  recorder.record.mockImplementation((attempt) => {
    recorded.push(attempt);
  });
  return { observed: new ObservedModelInvocationService(inner, recorder, { admits }), inner, recorder, recorded };
};

describe('ObservedModelInvocationService', () => {
  it('should relay the exact bytes and record one attempt with no prompt or output text', async () => {
    const { observed, recorded } = setup(async () => streaming());

    const result = await observed.invoke(intent());
    if (result.state !== 'streaming') {
      throw new Error(result.state);
    }
    const relayed = new Uint8Array(await result.response.arrayBuffer());

    expect(relayed).toEqual(body);
    expect(result.response.headers.get('content-type')).toBe('text/event-stream');
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      principal: 'user-a',
      project: 'project-a',
      attemptKey: 'attempt-1',
      chat: 'chat-a',
      operation: 'op-1',
      ended: 'completed',
      stream: { stop: 'stop', usage: { input: 4, output: 2 } },
    });
    expect(JSON.stringify(recorded)).not.toContain(secret);
  });

  it('should pass a cancel through to the provider stream and record the attempt as aborted', async () => {
    const cancelled = vi.fn();
    const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(body.slice(0, 10));
      },
      cancel: cancelled,
    });
    const { observed, recorded } = setup(async () => ({
      state: 'streaming',
      response: new Response(source),
      completion: Promise.resolve(),
    }));

    const result = await observed.invoke(intent());
    if (result.state !== 'streaming') {
      throw new Error(result.state);
    }
    const reader = result.response.body!.getReader();
    await reader.read();
    await reader.cancel('client left');
    await vi.waitFor(() => {
      expect(cancelled).toHaveBeenCalled();
    });

    expect(cancelled).toHaveBeenCalledWith('client left');
    expect(recorded.map((attempt) => attempt.ended)).toEqual(['aborted']);
  });

  it('should leave the owner untouched when capture is impossible or the attempt has no project', async () => {
    const original = streaming();
    const incapable = setup(async () => original, false);
    const unscoped = setup(async () => original);

    await expect(incapable.observed.invoke(intent())).resolves.toBe(original);
    await expect(unscoped.observed.invoke(intent({ projectHint: undefined }))).resolves.toBe(original);
    expect([...incapable.recorded, ...unscoped.recorded]).toEqual([]);
  });

  it('should not record a replay of a held operation, and record a supplier refusal once', async () => {
    const replay = setup(async () => ({ state: 'pending', operationId: 'op-1' }));
    const refused = setup(async () => {
      throw new LlmGatewayError(503, 'PROVIDER_UNAVAILABLE', 'down');
    });
    const tauRefusal = setup(async () => {
      throw new LlmGatewayError(402, 'INSUFFICIENT_CREDIT', 'no credit');
    });

    await replay.observed.invoke(intent());
    await expect(refused.observed.invoke(intent())).rejects.toThrow('down');
    await expect(tauRefusal.observed.invoke(intent())).rejects.toThrow('no credit');

    expect(replay.recorded).toEqual([]);
    expect(refused.recorded.map((attempt) => attempt.ended)).toEqual(['failed']);
    expect(tauRefusal.recorded).toEqual([]);
  });

  it('should not count a funded owner’s own refusal before admission as a supplier attempt', async () => {
    const beforeAdmission = setup(
      async () => {
        throw new LlmGatewayError(503, 'PROVIDER_UNAVAILABLE', 'Exact input count is not qualified.');
      },
      true,
      true,
    );
    const afterAdmission = setup(
      async (received) => {
        received.onAdmitted?.('op-2');
        throw new LlmGatewayError(503, 'PROVIDER_UNAVAILABLE', 'The model provider is unavailable.');
      },
      true,
      true,
    );

    await expect(beforeAdmission.observed.invoke(intent())).rejects.toThrow('not qualified');
    await expect(afterAdmission.observed.invoke(intent())).rejects.toThrow('unavailable');

    expect(beforeAdmission.recorded).toEqual([]);
    expect(afterAdmission.recorded).toMatchObject([{ ended: 'failed', operation: 'op-2' }]);
  });

  it('should keep the caller’s admission callback', async () => {
    const onAdmitted = vi.fn();
    const { observed, inner } = setup(async () => streaming());
    inner.invoke.mockImplementation(async (received) => {
      received.onAdmitted?.('op-9');
      return streaming();
    });

    await observed.invoke(intent({ onAdmitted }));

    expect(onAdmitted).toHaveBeenCalledWith('op-9');
  });
});

describe('providerAttemptEvidence', () => {
  it('should build valid API-reported summary evidence with a verified digest', async () => {
    const evidence = await providerAttemptEvidence(
      {
        principal: 'user-a',
        project: 'project-a',
        attemptKey: 'attempt with spaces/and slashes',
        chat: 'chat-a',
        surface: 'gateway',
        wire: 'anthropic',
        requestedModel: 'anthropic-claude-test',
        provider: 'anthropic',
        operation: 'op-1',
        startedAt: Date.now(),
        duration: 50,
        stream: {
          stop: 'stop',
          usage: { input: 4, output: 2, cacheRead: null, cacheWrite: null, reasoning: null, missing: 'none' },
          resolvedModel: 'claude-test',
          response: 'msg_1',
          firstChunk: 10,
          firstText: 12,
        },
        ended: 'completed',
      },
      { policyEpoch: 'epoch-a', protection: 'pro' },
    );

    expect(evidenceSchema.safeParse(evidence).success).toBe(true);
    await expect(verifyEvidenceDigest(evidence)).resolves.toBe(true);
    expect(evidence).toMatchObject({
      authority: 'api-reported',
      run: 'chat-a',
      lineage: [{ protection: 'pro' }],
      payload: { plane: 'summary', fact: { kind: 'provider', stop: 'stop', purpose: 'generation' } },
    });
    expect(evidence.source.kind === 'invocation' ? evidence.source.invocation : '').toMatch(/^inv-[a-f\d]{48}$/u);
  });
});
