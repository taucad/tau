/* eslint-disable @typescript-eslint/naming-convention -- provider wire fields use snake_case. */
import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { evidenceSchema } from '@taucad/agent-observability/contract';
import { contractId, verifyEvidenceDigest } from '@taucad/agent-observability/identity';
import { LlmGatewayError, resolveGatewayModelRoute } from '@taucad/api-llm-gateway';
import type { ModelInvocationIntent, ModelInvocationResult, ModelInvocationService } from '@taucad/api-llm-gateway';
import { providerAttemptEvidence } from '#model-invocation-evidence.js';
import type { ObservedAttempt } from '#model-invocation-evidence.js';
import type {
  AttemptPermission,
  CapturedContent,
  ModelInvocationEvidenceRecorder,
} from '#model-invocation-recorder.service.js';
import { ObservedModelInvocationService } from '#model-invocation-observer.js';

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

  it("should record the caller's activity and the supplier's model id for the route", async () => {
    const route = 'anthropic-claude-opus-5.5';
    const { observed, recorded } = setup(async () => streaming());

    const result = await observed.invoke(
      intent({ activity: 'compaction', body: { model: route, messages: [{ role: 'user', content: secret }] } }),
    );
    if (result.state === 'streaming') {
      await result.response.arrayBuffer();
    }

    expect(recorded).toMatchObject([
      { activity: 'compaction', supplierModel: resolveGatewayModelRoute(route, 'anthropic').modelId },
    ]);
  });

  it("should count a Vertex call's thinking as output, as the ledger does (LA3)", async () => {
    const route = 'google-gemini-3.8-flash';
    const completions = new TextEncoder().encode(
      [
        { id: 'cmpl_1', model: 'gemini-test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        {
          id: 'cmpl_1',
          model: 'gemini-test',
          choices: [],
          usage: { prompt_tokens: 1935, completion_tokens: 205, completion_tokens_details: { reasoning_tokens: 127 } },
        },
      ]
        .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
        .join(''),
    );
    const { observed, recorded } = setup(async () => ({
      state: 'streaming',
      operationId: 'op-1',
      response: new Response(new Blob([completions]).stream(), { status: 200 }),
      completion: Promise.resolve(),
    }));

    const result = await observed.invoke(
      intent({
        providerWire: 'openai-completions',
        body: { model: route, messages: [{ role: 'user', content: secret }] },
      }),
    );
    if (result.state === 'streaming') {
      await result.response.arrayBuffer();
    }

    expect(resolveGatewayModelRoute(route, 'openai-completions').providerId).toBe('vertexai');
    expect(recorded).toMatchObject([{ provider: 'vertexai', stream: { usage: { output: 332, reasoning: 127 } } }]);
  });

  it('should record the host labels the caller asserted, and none for a call that sent none', async () => {
    const { observed, recorded } = setup(async () => streaming());
    const hostLabels = { host: 'browser', build: '0123456789ab', kernel: 'replicad', model: 'unknown' } as const;

    const drain = async (result: ModelInvocationResult): Promise<void> => {
      if (result.state === 'streaming') {
        await result.response.arrayBuffer();
      }
    };
    await drain(await observed.invoke(intent({ hostLabels })));
    await drain(await observed.invoke(intent()));

    expect(recorded.map((attempt) => attempt.labels)).toEqual([hostLabels, undefined]);
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

describe('ObservedModelInvocationService content capture', () => {
  const contentBody = new TextEncoder().encode(
    [
      { type: 'message_start', message: { id: 'msg_1', model: 'claude-test', usage: { input_tokens: 4 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: secret } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
    ]
      .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
      .join(''),
  );
  const relay = (bytes: Uint8Array<ArrayBuffer>): ModelInvocationResult => ({
    state: 'streaming',
    operationId: 'op-1',
    response: new Response(new Blob([bytes]).stream(), { status: 200 }),
    completion: Promise.resolve(),
  });
  /** A recorder whose mode and lookup answer as a test says. */
  const capturing = (
    answer: () => boolean | undefined,
    options: Readonly<{ eligible?: boolean; bytes?: Uint8Array<ArrayBuffer> }> = {},
  ) => {
    const inner = mock<ModelInvocationService>();
    const order: string[] = [];
    inner.invoke.mockImplementation(async () => {
      order.push('invoke');
      return relay(options.bytes ?? contentBody);
    });
    const recorder = mock<ModelInvocationEvidenceRecorder>();
    Object.defineProperty(recorder, 'capable', { value: true });
    recorder.contentEligible.mockReturnValue(options.eligible ?? true);
    recorder.permission.mockImplementation((): AttemptPermission => {
      order.push('permission');
      return {
        authority: new Promise(() => {
          /* The lookup never answers here; the relay reads only `content`. */
        }),
        content: answer,
      };
    });
    const records: Array<{ attempt: ObservedAttempt; captured: CapturedContent | undefined }> = [];
    recorder.record.mockImplementation((attempt, _permission, captured) => {
      records.push({ attempt, captured });
    });
    return { observed: new ObservedModelInvocationService(inner, recorder), records, order, recorder };
  };
  const drain = async (observed: ObservedModelInvocationService): Promise<Uint8Array<ArrayBuffer>> => {
    const result = await observed.invoke(intent());
    if (result.state !== 'streaming') {
      throw new Error(result.state);
    }
    return new Uint8Array(await result.response.arrayBuffer());
  };

  it('starts the purpose lookup before the supplier is called', async () => {
    const { observed, order } = capturing(() => true);

    await drain(observed);

    expect(order).toEqual(['permission', 'invoke']);
  });

  it('captures the output and keeps the request body when content is effective at the first chunk', async () => {
    const { observed, records } = capturing(() => true);

    expect(await drain(observed)).toEqual(contentBody);
    expect(records).toHaveLength(1);
    const [{ attempt, captured }] = records as [(typeof records)[number]];
    expect(attempt.capture).toBeUndefined();
    expect(captured?.body).toEqual(intent().body);
    expect(captured?.output.messages()).toEqual([{ role: 'assistant', parts: [{ kind: 'text', text: secret }] }]);
    /* The attempt itself still carries no text; only the capture, which the recorder opens off the request path. */
    expect(JSON.stringify(attempt)).not.toContain(secret);
  });

  it('records missing and buffers nothing when the lookup has not answered by the first chunk', async () => {
    const { observed, records } = capturing(() => undefined);

    expect(await drain(observed)).toEqual(contentBody);
    expect(records).toMatchObject([{ attempt: { capture: 'missing' }, captured: undefined }]);
  });

  it('captures nothing, and does not wait for the lookup, when the mode cannot permit the account', async () => {
    const answer = vi.fn(() => true);
    const { observed, records } = capturing(answer, { eligible: false });

    expect(await drain(observed)).toEqual(contentBody);
    expect(records).toMatchObject([{ attempt: { capture: 'omitted' }, captured: undefined }]);
    expect(answer).not.toHaveBeenCalled();
  });

  it('captures nothing for a refused account or a compaction call', async () => {
    const refused = capturing(() => false);
    const compaction = capturing(() => true);

    await drain(refused.observed);
    const result = await compaction.observed.invoke(intent({ activity: 'compaction' }));
    if (result.state === 'streaming') {
      await result.response.arrayBuffer();
    }

    expect(refused.records).toMatchObject([{ attempt: { capture: 'omitted' }, captured: undefined }]);
    expect(compaction.records).toMatchObject([{ attempt: { capture: 'omitted' }, captured: undefined }]);
  });

  it('relays the exact bytes when the capture decision throws', async () => {
    const { observed, records } = capturing(() => {
      throw new Error('lookup exploded');
    });

    expect(await drain(observed)).toEqual(contentBody);
    expect(records).toMatchObject([{ attempt: { capture: 'omitted' }, captured: undefined }]);
  });

  it('relays the exact bytes of an oversized output and labels the capture truncated', async () => {
    const huge = 'x'.repeat(400_000);
    const bytes = new TextEncoder().encode(
      [
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: huge } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: huge } },
      ]
        .map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
        .join(''),
    );
    const { observed, records } = capturing(() => true, { bytes });

    expect(await drain(observed)).toEqual(bytes);
    expect(records[0]?.captured?.output.truncated).toBe(true);
  });
});

describe('providerAttemptEvidence', () => {
  const observedAttempt = (change: Partial<ObservedAttempt> = {}): ObservedAttempt => ({
    principal: 'user-a',
    project: 'project-a',
    attemptKey: 'run-1:1:0',
    chat: 'chat-a',
    surface: 'gateway',
    wire: 'anthropic',
    requestedModel: 'anthropic-claude-test',
    provider: 'anthropic',
    operation: 'op-1',
    startedAt: 1_800_000_000_000,
    duration: 50,
    stream: undefined,
    ended: 'completed',
    ...change,
  });
  const authority = { policyEpoch: 'epoch-a', protection: 'pro' } as const;

  it('should carry the host labels on the provider fact, so a later mapper can tag the generation', async () => {
    const labels = { host: 'desktop', build: '1.24.0', kernel: 'openscad', model: 'anthropic-claude-test' } as const;
    const evidence = await providerAttemptEvidence(observedAttempt({ labels }), authority);

    expect(evidenceSchema.safeParse(evidence).success).toBe(true);
    await expect(verifyEvidenceDigest(evidence)).resolves.toBe(true);
    expect(evidence.payload).toMatchObject({ plane: 'summary', fact: { kind: 'provider', labels } });
    /* The labels ride on the fact, not the envelope: the API's own build stays the envelope's, as before LW17. */
    expect(evidence.versions.hostBuild).toBeNull();
  });

  it('should write the same fact as before LW17 for a call that sent no host labels', async () => {
    const unlabelled = await providerAttemptEvidence(observedAttempt(), authority);
    const empty = await providerAttemptEvidence(observedAttempt({ labels: {} }), authority);

    expect(unlabelled.payload.plane === 'summary' ? unlabelled.payload.fact : undefined).not.toHaveProperty('labels');
    /* An empty label set is no label set: same source, same digest. */
    expect(empty).toEqual(unlabelled);
  });

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
    /* The same derivation every host uses, so API and host facts about one attempt join. */
    expect(evidence.source.kind === 'invocation' ? evidence.source.invocation : '').toBe(
      await contractId('inv', 'attempt with spaces/and slashes'),
    );
  });
});
