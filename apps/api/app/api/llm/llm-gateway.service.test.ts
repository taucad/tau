import { EventEmitter } from 'node:events';
import { generateKeyPairSync } from 'node:crypto';
import { setImmediate as waitForImmediate, setTimeout as wait } from 'node:timers/promises';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import { modelList } from '#api/models/model.constants.js';
import type {
  CommitInput,
  CreditLedgerService,
  ReserveInput,
  ReserveResult,
} from '#api/billing/credit-ledger.service.js';
import { TokenBudgetService } from '#api/chat/token-budget.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import type { LlmGatewayAdmission, LlmGatewayLimiter } from '#api/llm/llm-gateway-limiter.service.js';
import type { LlmGatewayOptions } from '#api/llm/llm-gateway.options.js';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';

const encoder = new TextEncoder();

const defaultOptions: LlmGatewayOptions = {
  requestsPerMinute: 60,
  maxConcurrentRequests: 4,
  maxProviderConcurrentRequests: 100,
  upstreamIdleTimeoutMs: 1000,
  postAbortSettlementTimeoutMs: 5000,
  concurrencyLeaseMs: 300_000,
  concurrencyHeartbeatMs: 60_000,
  maxSseEventBytes: 256 * 1024,
};

class TestLedger {
  public readonly reserves: ReserveInput[] = [];
  public readonly commits: CommitInput[] = [];
  public readonly releases: Array<{ reservationId: string; userId: string; reason: string }> = [];
  public readonly events: string[] = [];
  public readonly reservations = new Map<string, ReserveInput>();
  public balanceMicro: bigint;

  public constructor(balanceMicro: bigint) {
    this.balanceMicro = balanceMicro;
  }

  public async reserve(input: ReserveInput): Promise<ReserveResult> {
    this.events.push('reserve');
    this.reserves.push(input);
    const held = [...this.reservations.values()].reduce((sum, reservation) => sum + reservation.amountMicro, 0n);
    if (this.balanceMicro <= 0n || this.balanceMicro - held < input.amountMicro) {
      return { ok: false, balanceMicro: this.balanceMicro };
    }
    const reservationId = `reservation_${String(this.reserves.length)}`;
    this.reservations.set(reservationId, input);
    return { ok: true, reservationId };
  }

  public async commit(input: CommitInput): Promise<{ committed: boolean; balanceMicro: bigint }> {
    this.commits.push(input);
    if (!this.reservations.delete(input.reservationId)) return { committed: false, balanceMicro: this.balanceMicro };
    this.balanceMicro -= input.actualMicro;
    return { committed: true, balanceMicro: this.balanceMicro };
  }

  public async release(input: { reservationId: string; userId: string; reason: string }): Promise<void> {
    this.releases.push(input);
    this.reservations.delete(input.reservationId);
  }
}

class TestRawResponse extends EventEmitter {
  public destroyed = false;
  public writableEnded = false;
  public readonly writes: Uint8Array<ArrayBuffer>[] = [];
  public readonly trailers: Record<string, string> = {};
  public readonly headers: Record<string, string> = {};
  public statusCode: number | undefined;
  public destroyCalls = 0;
  public writeResults: boolean[] = [];
  public onWrite: (() => void) | undefined;

  public writeHead(status: number, headers: Record<string, string>): this {
    this.statusCode = status;
    Object.assign(this.headers, headers);
    return this;
  }

  public write(chunk: Uint8Array<ArrayBuffer>): boolean {
    this.writes.push(chunk);
    this.onWrite?.();
    return this.writeResults.shift() ?? true;
  }

  public addTrailers(trailers: Record<string, string>): void {
    Object.assign(this.trailers, trailers);
  }

  public end(): this {
    this.writableEnded = true;
    this.emit('finish');
    return this;
  }

  public destroy(): this {
    this.destroyCalls += 1;
    this.destroyed = true;
    this.emit('close');
    return this;
  }

  public clientClose(): void {
    this.destroyed = true;
    this.emit('close');
  }
}

const vertexPrivateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' })
  .toString();

const vertexCredentials = {
  type: 'service_account',
  ['project_id']: 'tau-test-project',
  ['private_key_id']: 'test-key-id',
  ['private_key']: vertexPrivateKey,
  ['client_email']: 'gateway@tau-test-project.iam.gserviceaccount.com',
  ['client_id']: '123456789',
  ['auth_uri']: 'https://accounts.google.com/o/oauth2/auth',
  ['token_uri']: 'https://oauth2.googleapis.com/token',
  ['auth_provider_x509_cert_url']: 'https://www.googleapis.com/oauth2/v1/certs',
  ['client_x509_cert_url']: 'https://www.googleapis.com/robot/v1/metadata/x509/gateway',
  ['universe_domain']: 'googleapis.com',
};

const gatewayConfig = {
  get(key: string) {
    if (key === 'TAU_CREDIT_MARKUP_FRACTION') return 0.3;
    if (key === 'OPENAI_API_KEY') return 'openai-test-key';
    if (key === 'ANTHROPIC_API_KEY') return 'anthropic-test-key';
    if (key === 'TOGETHER_API_KEY') return 'together-test-key';
    if (key === 'MORPH_API_KEY') return 'morph-test-key';
    if (key === 'XAI_API_KEY') return 'xai-test-key';
    if (key === 'GOOGLE_VERTEX_AI_CREDENTIALS') return vertexCredentials;
    return undefined;
  },
} as unknown as ConfigService<Environment, true>;

const createHarness = (
  input: {
    balanceMicro?: bigint;
    options?: Partial<LlmGatewayOptions>;
    config?: ConfigService<Environment, true>;
  } = {},
) => {
  const ledger = new TestLedger(input.balanceMicro ?? 1_000_000n);
  const release = vi.fn(async () => undefined);
  const admission: LlmGatewayAdmission = { release };
  const limiter = { acquire: vi.fn(async () => admission) } as unknown as LlmGatewayLimiter;
  const service = new LlmGatewayService(
    ledger as unknown as CreditLedgerService,
    new TokenBudgetService(),
    input.config ?? gatewayConfig,
    limiter,
    { ...defaultOptions, ...input.options },
  );
  const raw = new TestRawResponse();
  const reply = {
    raw,
    hijack: vi.fn(),
    getHeaders: () => ({
      vary: 'Origin',
      'access-control-allow-origin': 'https://tau.new',
      'access-control-allow-credentials': 'true',
    }),
  } as unknown as FastifyReply;
  return { service, ledger, limiter, release, raw, reply };
};

const openAiBody = (model = 'openai-gpt-5.6-luna') => ({
  model,
  messages: [{ role: 'user', content: 'Reply OK.' }],
  stream: true,
  // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI wire field.
  max_completion_tokens: 8,
});

const errorType = (error: unknown): string | undefined => {
  if (!(error instanceof LlmGatewayError)) return undefined;
  const response = error.getResponse() as { error?: { type?: string } };
  return response.error?.type;
};

const sseResponse = (stream: ReadableStream<Uint8Array<ArrayBuffer>>): Response =>
  new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });

const streamFrom = (chunks: readonly string[], onPull?: (count: number) => void) => {
  let index = 0;
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      pull(controller) {
        onPull?.(index + 1);
        const chunk = chunks[index++];
        if (chunk === undefined) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunk));
      },
    },
    { highWaterMark: 0 },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('gateway typed admission refusals', () => {
  it('meters an unknown-model attempt before validation without reserving or calling a provider', async () => {
    const harness = createHarness();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const refusal = harness.service.relay({
      provider: 'openai',
      body: openAiBody('openai-not-in-catalog'),
      principalId: 'user_unknown',
      reply: harness.reply,
    });
    await expect(refusal).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError && error.getStatus() === 400 && errorType(error) === 'MODEL_NOT_IN_CATALOG',
    );
    expect(harness.limiter.acquire).toHaveBeenCalledOnce();
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.ledger.reserves).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an enabled catalog row whose provider is not positively gateway-routable', async () => {
    const entry = modelList.openai['gpt-5.6-luna']!;
    const provider = entry.provider as { id: string };
    const originalProviderId = provider.id;
    provider.id = 'ollama';
    try {
      const harness = createHarness();
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);

      await expect(
        harness.service.relay({
          provider: 'openai',
          body: openAiBody(),
          principalId: 'user_unroutable',
          reply: harness.reply,
        }),
      ).rejects.toSatisfy((error: unknown) => errorType(error) === 'MODEL_NOT_IN_CATALOG');
      expect(harness.ledger.reserves).toHaveLength(0);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      provider.id = originalProviderId;
    }
  });

  it('uses the real token/cost evaluators and a balance-enforcing test ledger for typed 402 refusal', async () => {
    const harness = createHarness({ balanceMicro: 0n });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const refusal = harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_empty',
      reply: harness.reply,
    });
    await expect(refusal).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError && error.getStatus() === 402 && errorType(error) === 'INSUFFICIENT_CREDIT',
    );
    expect(harness.ledger.reserves).toHaveLength(1);
    expect(harness.ledger.reserves[0]!.amountMicro).toBeGreaterThan(0n);
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it('returns a typed refusal and releases credit when provider configuration is absent', async () => {
    const missingProviderConfig = {
      get(key: string) {
        return key === 'TAU_CREDIT_MARKUP_FRACTION' ? 0.3 : undefined;
      },
    } as unknown as ConfigService<Environment, true>;
    const harness = createHarness({ config: missingProviderConfig });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      harness.service.relay({
        provider: 'openai',
        body: openAiBody(),
        principalId: 'user_missing_provider',
        reply: harness.reply,
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError && error.getStatus() === 503 && errorType(error) === 'PROVIDER_UNAVAILABLE',
    );
    expect(harness.ledger.releases).toHaveLength(1);
    expect(harness.ledger.commits).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  // GPT-5.x rejects the legacy cap upstream; forwarding it turned a fixable
  // client mistake into an opaque "provider unavailable" for the browser host.
  it('normalizes a legacy output cap to max_completion_tokens for a direct OpenAI catalog model', async () => {
    const harness = createHarness();
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body['max_completion_tokens']).toBe(8);
      expect(body['max_tokens']).toBeUndefined();
      return sseResponse(
        streamFrom(['data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\ndata: [DONE]\n\n']),
      );
    });
    vi.stubGlobal('fetch', fetch);

    await harness.service.relay({
      provider: 'openai',
      body: {
        model: 'openai-gpt-5.6-luna',
        messages: [{ role: 'user', content: 'Reply OK.' }],
        stream: true,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Legacy OpenAI wire field.
        max_tokens: 8,
      },
      principalId: 'user_legacy_cap',
      reply: harness.reply,
    });

    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    [400, 502, 'UPSTREAM_REJECTED'],
    [404, 502, 'UPSTREAM_REJECTED'],
    [422, 502, 'UPSTREAM_REJECTED'],
    // Tau's own provider credential, not anything the caller can change.
    [401, 503, 'PROVIDER_UNAVAILABLE'],
    [403, 503, 'PROVIDER_UNAVAILABLE'],
    [429, 429, 'RATE_LIMITED'],
    [500, 503, 'PROVIDER_UNAVAILABLE'],
    [503, 503, 'PROVIDER_UNAVAILABLE'],
  ] as const)(
    'reports an upstream %i as HTTP %i / %s rather than one undifferentiated outage',
    async (upstreamStatus, status, type) => {
      const harness = createHarness();
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('{"error":{"message":"upstream detail"}}', { status: upstreamStatus })),
      );

      await expect(
        harness.service.relay({
          provider: 'openai',
          body: openAiBody(),
          principalId: 'user_upstream_status',
          reply: harness.reply,
        }),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof LlmGatewayError && error.getStatus() === status && errorType(error) === type,
      );
    },
  );

  it('never leaks the upstream body into the sanitized rejection message', async () => {
    const harness = createHarness();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"secret upstream detail"}}', { status: 400 })),
    );

    await expect(
      harness.service.relay({
        provider: 'openai',
        body: openAiBody(),
        principalId: 'user_upstream_leak',
        reply: harness.reply,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof LlmGatewayError)) return false;
      const response = error.getResponse() as { error?: { message?: string } };
      return (
        response.error?.message !== undefined &&
        !response.error.message.includes('secret upstream detail') &&
        response.error.message.includes('400')
      );
    });
  });
});

/*
 * The Responses wire exists because gpt-5.6-luna answers HTTP 400 to any
 * /v1/chat/completions request carrying function tools, and the browser host
 * always sends tools. It is admitted by the same pipeline as completions, with
 * the wire's own body shape (`input`/`instructions`/`max_output_tokens`).
 */
describe('gateway OpenAI Responses wire', () => {
  const responsesBody = (model = 'openai-gpt-5.6-luna') => ({
    model,
    input: [
      { role: 'developer', content: 'You are a terse test fixture.' },
      { role: 'user', content: [{ type: 'input_text', text: 'Reply OK.' }] },
    ],
    stream: true,
    store: false,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI wire field.
    max_output_tokens: 16,
    tools: [
      {
        type: 'function',
        name: 'read_file',
        description: 'Read one workspace file.',
        parameters: { type: 'object', properties: { targetFile: { type: 'string' } }, required: ['targetFile'] },
      },
    ],
  });

  it('relays a direct-OpenAI catalog row to the Responses endpoint and commits terminal usage', async () => {
    const harness = createHarness();
    const chunks = [
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"delta":"OK"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp-1","status":"completed","usage":{"input_tokens":10,"output_tokens":2,"input_tokens_details":{"cached_tokens":4},"output_tokens_details":{"reasoning_tokens":1},"total_tokens":12}}}\n\n',
    ] as const;
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      harness.ledger.events.push('fetch');
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer openai-test-key');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body['model']).toBe('gpt-5.6-luna');
      expect(body['max_output_tokens']).toBe(16);
      // Chat Completions' usage opt-in has no Responses equivalent; the terminal
      // event always carries usage.
      expect(body['stream_options']).toBeUndefined();
      expect(body['input']).toHaveLength(2);
      return sseResponse(streamFrom(chunks));
    });
    vi.stubGlobal('fetch', fetch);

    await harness.service.relay({
      provider: 'openai-responses',
      body: responsesBody(),
      principalId: 'user_responses',
      reply: harness.reply,
    });

    expect(harness.ledger.events.slice(0, 2)).toEqual(['reserve', 'fetch']);
    expect(harness.ledger.commits).toHaveLength(1);
    expect(harness.ledger.commits[0]!.note).toBe('gateway-terminal-usage');
    expect(harness.raw.trailers).toMatchObject({
      'x-tau-usage-input-tokens': '6',
      'x-tau-usage-output-tokens': '2',
      'x-tau-usage-cache-read-tokens': '4',
      'x-tau-usage-cache-write-tokens': '0',
    });
    expect(new TextDecoder().decode(Buffer.concat(harness.raw.writes.map((chunk) => Buffer.from(chunk))))).toBe(
      chunks.join(''),
    );
  });

  it('bills a max_output_tokens truncation from the terminal response.incomplete event', async () => {
    const harness = createHarness();
    const fetch = vi.fn(async () =>
      sseResponse(
        streamFrom([
          'event: response.incomplete\ndata: {"type":"response.incomplete","response":{"id":"resp-2","status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"usage":{"input_tokens":9,"output_tokens":16,"total_tokens":25}}}\n\n',
        ]),
      ),
    );
    vi.stubGlobal('fetch', fetch);

    await harness.service.relay({
      provider: 'openai-responses',
      body: responsesBody(),
      principalId: 'user_responses_incomplete',
      reply: harness.reply,
    });

    expect(harness.ledger.commits[0]!.note).toBe('gateway-terminal-usage');
    expect(harness.raw.trailers['x-tau-usage-output-tokens']).toBe('16');
  });

  it('refuses an OpenAI-compatible catalog row on the Responses wire', async () => {
    const harness = createHarness();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      harness.service.relay({
        provider: 'openai-responses',
        body: responsesBody('google-gemini-3.1-pro'),
        principalId: 'user_responses_wrong_wire',
        reply: harness.reply,
      }),
    ).rejects.toSatisfy((error: unknown) => errorType(error) === 'MODEL_NOT_IN_CATALOG');
    expect(harness.ledger.reserves).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['input', { ...responsesBody(), input: 'Reply OK.' }],
    ['stream', { ...responsesBody(), stream: false }],
    ['max_output_tokens', { ...responsesBody(), ['max_output_tokens']: 0 }],
  ])('refuses a Responses body whose %s is invalid before reserving', async (_field, body) => {
    const harness = createHarness();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      harness.service.relay({
        provider: 'openai-responses',
        body,
        principalId: 'user_responses_invalid',
        reply: harness.reply,
      }),
    ).rejects.toSatisfy((error: unknown) => errorType(error) === 'INVALID_REQUEST');
    expect(harness.ledger.reserves).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('counts the Responses tool and instruction shapes in the reserved worst case', async () => {
    const harness = createHarness();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(
          streamFrom([
            'event: response.completed\ndata: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
          ]),
        ),
      ),
    );

    await harness.service.relay({
      provider: 'openai-responses',
      body: { ...responsesBody(), instructions: 'x'.repeat(8000) },
      principalId: 'user_responses_budget_big',
      reply: harness.reply,
    });
    const withInstructions = harness.ledger.reserves[0]!.inputFloorMicro;

    const lean = createHarness();
    await lean.service.relay({
      provider: 'openai-responses',
      body: { ...responsesBody(), tools: [] },
      principalId: 'user_responses_budget_small',
      reply: lean.reply,
    });

    expect(withInstructions).toBeGreaterThan(lean.ledger.reserves[0]!.inputFloorMicro);
  });
});

describe('gateway provider settlement', () => {
  it('tracks a close during admission and never reserves or starts provider I/O', async () => {
    const harness = createHarness();
    let admissionStarted!: () => void;
    let finishAdmission!: () => void;
    const started = new Promise<void>((resolve) => {
      admissionStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      finishAdmission = resolve;
    });
    vi.mocked(harness.limiter.acquire).mockImplementation(async () => {
      admissionStarted();
      await blocked;
      return { release: harness.release };
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const relaying = harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_admission_close',
      reply: harness.reply,
    });
    await started;
    harness.raw.clientClose();
    finishAdmission();
    await relaying;

    expect(harness.ledger.reserves).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it('tracks a close during reservation, releases the resulting hold, and never starts provider I/O', async () => {
    const harness = createHarness();
    const originalReserve = harness.ledger.reserve.bind(harness.ledger);
    let reservationStarted!: () => void;
    let finishReservation!: () => void;
    const started = new Promise<void>((resolve) => {
      reservationStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      finishReservation = resolve;
    });
    vi.spyOn(harness.ledger, 'reserve').mockImplementation(async (input) => {
      reservationStarted();
      await blocked;
      return originalReserve(input);
    });
    const fetch = vi.fn(async () =>
      sseResponse(streamFrom(['data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\n'])),
    );
    vi.stubGlobal('fetch', fetch);

    const relaying = harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_lost_close',
      reply: harness.reply,
    });
    await started;
    harness.raw.clientClose();
    finishReservation();
    await relaying;

    expect(fetch).not.toHaveBeenCalled();
    expect(harness.ledger.releases).toHaveLength(1);
    expect(harness.ledger.reservations.size).toBe(0);
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it('detects an already-closed response after metering without reserving or calling a provider', async () => {
    const harness = createHarness();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    harness.raw.clientClose();

    await harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_already_closed',
      reply: harness.reply,
    });

    expect(harness.limiter.acquire).toHaveBeenCalledOnce();
    expect(harness.ledger.reserves).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it.each([
    ['together-kimi-k3', 'https://api.together.ai/v1/chat/completions', 'moonshotai/Kimi-K3', 'together-test-key'],
    ['morph-minimax-m2.7', 'https://api.morphllm.com/v1/chat/completions', 'morph-minimax27-230b', 'morph-test-key'],
    ['xai-grok-4.6', 'https://api.x.ai/v1/chat/completions', 'grok-4.6', 'xai-test-key'],
  ] as const)(
    'routes catalog model %s through its OpenAI-compatible provider',
    async (model, url, upstreamModel, key) => {
      const harness = createHarness();
      const fetch = vi.fn(async (actualUrl: string, init: RequestInit) => {
        expect(actualUrl).toBe(url);
        expect((init.headers as Record<string, string>)['authorization']).toBe(`Bearer ${key}`);
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body['model']).toBe(upstreamModel);
        expect(body['max_tokens']).toBe(8);
        expect(body['max_completion_tokens']).toBeUndefined();
        return sseResponse(
          streamFrom(['data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\ndata: [DONE]\n\n']),
        );
      });
      vi.stubGlobal('fetch', fetch);

      await harness.service.relay({
        provider: 'openai',
        body: openAiBody(model),
        principalId: 'user_provider_route',
        reply: harness.reply,
      });

      expect(fetch).toHaveBeenCalledOnce();
      expect(harness.ledger.commits[0]!.note).toBe('gateway-terminal-usage');
    },
  );

  it('reserves before Vertex OAuth and routes the catalog model through its OpenAI-compatible endpoint', async () => {
    const harness = createHarness();
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      harness.ledger.events.push('fetch');
      if (url === 'https://oauth2.googleapis.com/token') {
        expect(String(init.body)).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
        return Response.json({ ['access_token']: 'vertex-access-token', ['expires_in']: 3600 });
      }
      expect(url).toBe(
        'https://aiplatform.googleapis.com/v1/projects/tau-test-project/locations/global/endpoints/openapi/chat/completions',
      );
      expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer vertex-access-token');
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body['model']).toBe('google/gemini-3.1-pro-preview');
      expect(body['max_tokens']).toBe(8);
      return sseResponse(
        streamFrom(['data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\ndata: [DONE]\n\n']),
      );
    });
    vi.stubGlobal('fetch', fetch);

    await harness.service.relay({
      provider: 'openai',
      body: openAiBody('google-gemini-3.1-pro'),
      principalId: 'user_vertex',
      reply: harness.reply,
    });

    expect(harness.ledger.events).toEqual(['reserve', 'fetch', 'fetch']);
    expect(harness.ledger.commits[0]!.note).toBe('gateway-terminal-usage');
  });

  it('reserves before provider I/O, commits normalized terminal usage, and emits usage trailers', async () => {
    const harness = createHarness();
    const chunks = [
      'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":4}}}\n\ndata: [DONE]\n\n',
    ] as const;
    const upstream = streamFrom(chunks);
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      harness.ledger.events.push('fetch');
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(body['model']).toBe('gpt-5.6-luna');
      expect(body['max_completion_tokens']).toBe(8);
      expect((body['stream_options'] as Record<string, unknown>)['include_usage']).toBe(true);
      return sseResponse(upstream);
    });
    vi.stubGlobal('fetch', fetch);

    await harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_paid',
      reply: harness.reply,
    });

    expect(harness.ledger.events.slice(0, 2)).toEqual(['reserve', 'fetch']);
    expect(harness.ledger.commits).toHaveLength(1);
    expect(harness.ledger.commits[0]!.note).toBe('gateway-terminal-usage');
    expect(harness.ledger.reservations.size).toBe(0);
    expect(harness.raw.trailers).toEqual({
      'x-tau-usage-input-tokens': '6',
      'x-tau-usage-output-tokens': '2',
      'x-tau-usage-cache-read-tokens': '4',
      'x-tau-usage-cache-write-tokens': '0',
      'x-tau-usage-microdollars': String(harness.ledger.commits[0]!.actualMicro),
    });
    expect(harness.raw.headers['trailer']).toContain('x-tau-usage-microdollars');
    expect(harness.raw.headers).toMatchObject({
      vary: 'Origin',
      'access-control-allow-origin': 'https://tau.new',
      'access-control-allow-credentials': 'true',
    });
    expect(new TextDecoder().decode(Buffer.concat(harness.raw.writes.map((chunk) => Buffer.from(chunk))))).toBe(
      chunks.join(''),
    );
  });

  it('prices raw Anthropic input and cache counters without LangChain cache subtraction', async () => {
    const harness = createHarness();
    const upstream = streamFrom([
      'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":6,"output_tokens":0,"cache_read_input_tokens":4,"cache_creation_input_tokens":2}}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":3}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(upstream)),
    );

    await harness.service.relay({
      provider: 'anthropic',
      body: {
        model: 'anthropic-claude-haiku-4.5',
        messages: [{ role: 'user', content: 'Reply OK.' }],
        stream: true,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic wire field.
        max_tokens: 8,
      },
      principalId: 'user_anthropic',
      reply: harness.reply,
    });

    expect(harness.raw.trailers).toMatchObject({
      'x-tau-usage-input-tokens': '6',
      'x-tau-usage-output-tokens': '3',
      'x-tau-usage-cache-read-tokens': '4',
      'x-tau-usage-cache-write-tokens': '2',
    });
    expect(harness.ledger.commits[0]!.note).toBe('gateway-terminal-usage');
  });

  it('pauses upstream reads when raw.write returns false and resumes on drain', async () => {
    const harness = createHarness();
    harness.raw.writeResults = [false, true];
    let pulls = 0;
    let firstWrite!: () => void;
    const wrote = new Promise<void>((resolve) => {
      firstWrite = resolve;
    });
    harness.raw.onWrite = () => {
      if (harness.raw.writes.length === 1) firstWrite();
    };
    const upstream = streamFrom(
      [
        'data: {"choices":[{"delta":{"content":"O"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\ndata: [DONE]\n\n',
      ],
      (count) => {
        pulls = count;
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(upstream)),
    );
    const relaying = harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_slow',
      reply: harness.reply,
    });

    await wrote;
    await waitForImmediate();
    expect(harness.raw.writes).toHaveLength(1);
    expect(pulls).toBe(1);
    harness.raw.emit('drain');
    await relaying;
    expect(harness.raw.writes).toHaveLength(2);
  });

  it('aborts a connected downstream that never drains and settles the input floor', async () => {
    const harness = createHarness({
      options: { upstreamIdleTimeoutMs: 15, postAbortSettlementTimeoutMs: 100 },
    });
    harness.raw.writeResults = [false];
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"O"}}]}\n\n'));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(upstream)),
    );

    const outcome = await Promise.race([
      harness.service
        .relay({
          provider: 'openai',
          body: openAiBody(),
          principalId: 'user_stalled_reader',
          reply: harness.reply,
        })
        .then(() => 'completed'),
      wait(150, 'hung'),
    ]);

    expect(outcome).toBe('completed');
    expect(cancelled).toBe(true);
    expect(harness.raw.destroyCalls).toBe(1);
    expect(harness.ledger.commits[0]!.note).toBe('gateway-downstream-drain-floor');
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it('retries an idempotent terminal-usage commit after a transient throw', async () => {
    const harness = createHarness();
    const originalCommit = harness.ledger.commit.bind(harness.ledger);
    let attempts = 0;
    vi.spyOn(harness.ledger, 'commit').mockImplementation(async (input) => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient ledger failure');
      return originalCommit(input);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(streamFrom(['data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\n'])),
      ),
    );

    await harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_commit_retry',
      reply: harness.reply,
    });

    expect(attempts).toBe(2);
    expect(harness.ledger.reservations.size).toBe(0);
    expect(harness.raw.trailers['x-tau-usage-microdollars']).toBeDefined();
  });

  it('retries a release transition after a transient throw', async () => {
    const harness = createHarness();
    const originalRelease = harness.ledger.release.bind(harness.ledger);
    let attempts = 0;
    vi.spyOn(harness.ledger, 'release').mockImplementation(async (input) => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient ledger failure');
      await originalRelease(input);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    );

    await expect(
      harness.service.relay({
        provider: 'openai',
        body: openAiBody(),
        principalId: 'user_release_retry',
        reply: harness.reply,
      }),
    ).rejects.toSatisfy((error: unknown) => errorType(error) === 'PROVIDER_UNAVAILABLE');

    expect(attempts).toBe(2);
    expect(harness.ledger.reservations.size).toBe(0);
  });

  it('treats a retry that loses to the reservation sweeper as durable settlement', async () => {
    const harness = createHarness();
    let attempts = 0;
    vi.spyOn(harness.ledger, 'commit').mockImplementation(async (input) => {
      attempts += 1;
      if (attempts === 1) throw new Error('transient ledger failure');
      harness.ledger.reservations.delete(input.reservationId);
      return { committed: false, balanceMicro: harness.ledger.balanceMicro };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(streamFrom(['data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\n'])),
      ),
    );

    await harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_sweeper_race',
      reply: harness.reply,
    });

    expect(attempts).toBe(2);
    expect(harness.ledger.reservations.size).toBe(0);
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it('keeps the post-abort bound active while terminal usage settlement hangs', async () => {
    const harness = createHarness({ options: { postAbortSettlementTimeoutMs: 15 } });
    let attempts = 0;
    vi.spyOn(harness.ledger, 'commit').mockImplementation(() => {
      attempts += 1;
      return new Promise((_resolve) => {
        // Intentionally never acknowledged.
      });
    });
    harness.raw.onWrite = () => harness.raw.clientClose();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse(streamFrom(['data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\n'])),
      ),
    );

    const outcome = await Promise.race([
      harness.service
        .relay({
          provider: 'openai',
          body: openAiBody(),
          principalId: 'user_commit_hang',
          reply: harness.reply,
        })
        .then(() => 'completed'),
      wait(150, 'hung'),
    ]);

    expect(outcome).toBe('completed');
    expect(attempts).toBe(1);
    expect(harness.ledger.reservations.size).toBe(1);
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it('releases admission on the bounded recovery path when a pre-provider release hangs', async () => {
    const harness = createHarness({ options: { postAbortSettlementTimeoutMs: 15 } });
    const originalReserve = harness.ledger.reserve.bind(harness.ledger);
    let reservationStarted!: () => void;
    let finishReservation!: () => void;
    const started = new Promise<void>((resolve) => {
      reservationStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      finishReservation = resolve;
    });
    vi.spyOn(harness.ledger, 'reserve').mockImplementation(async (input) => {
      reservationStarted();
      await blocked;
      return originalReserve(input);
    });
    vi.spyOn(harness.ledger, 'release').mockImplementation(
      () =>
        new Promise((_resolve) => {
          // Intentionally never acknowledged.
        }),
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const relaying = harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_release_hang',
      reply: harness.reply,
    });
    await started;
    harness.raw.clientClose();
    finishReservation();
    const outcome = await Promise.race([relaying.then(() => 'completed'), wait(150, 'hung')]);

    expect(outcome).toBe('completed');
    expect(fetch).not.toHaveBeenCalled();
    expect(harness.ledger.reservations.size).toBe(1);
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it('forwards a parser-failing chunk and settles terminal usage parsed earlier in that chunk', async () => {
    const harness = createHarness({ options: { maxSseEventBytes: 160 } });
    const chunk = `data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\ndata: ${'x'.repeat(161)}\n\n`;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(streamFrom([chunk]))),
    );

    await harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_parser_failure',
      reply: harness.reply,
    });

    expect(new TextDecoder().decode(Buffer.concat(harness.raw.writes.map((part) => Buffer.from(part))))).toBe(chunk);
    expect(harness.ledger.commits).toHaveLength(1);
    expect(harness.ledger.commits[0]!.note).toBe('gateway-terminal-usage');
    expect(harness.ledger.commits[0]!.actualMicro).not.toBe(harness.ledger.reserves[0]!.inputFloorMicro);
  });

  it('commits the input floor and releases the reader when a post-abort provider drain stalls', async () => {
    const harness = createHarness({
      options: { upstreamIdleTimeoutMs: 1000, postAbortSettlementTimeoutMs: 15 },
    });
    let pullCount = 0;
    let releaseStall: (() => void) | undefined;
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull(controller) {
          pullCount += 1;
          if (pullCount === 1) {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"O"}}]}\n\n'));
            return;
          }
          return new Promise<void>((resolve) => {
            releaseStall = resolve;
          });
        },
        cancel() {
          cancelled = true;
          releaseStall?.();
        },
      },
      { highWaterMark: 0 },
    );
    harness.raw.onWrite = () => harness.raw.clientClose();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(upstream)),
    );

    await harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_abort',
      reply: harness.reply,
    });

    expect(cancelled).toBe(true);
    expect(upstream.locked).toBe(false);
    expect(harness.raw.destroyCalls).toBe(0);
    expect(harness.ledger.commits).toHaveLength(1);
    expect(harness.ledger.commits[0]!.actualMicro).toBe(harness.ledger.reserves[0]!.inputFloorMicro);
    expect(harness.ledger.commits[0]!.note).toBe('gateway-settlement-deadline-floor');
  });

  it('gateway-destroys an active downstream and commits the input floor when the provider stalls', async () => {
    const harness = createHarness({
      options: { upstreamIdleTimeoutMs: 15, postAbortSettlementTimeoutMs: 1000 },
    });
    let releaseStall: (() => void) | undefined;
    let cancelled = false;
    const upstream = new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        pull() {
          return new Promise<void>((resolve) => {
            releaseStall = resolve;
          });
        },
        cancel() {
          cancelled = true;
          releaseStall?.();
        },
      },
      { highWaterMark: 0 },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sseResponse(upstream)),
    );

    await harness.service.relay({
      provider: 'openai',
      body: openAiBody(),
      principalId: 'user_provider_stall',
      reply: harness.reply,
    });

    expect(cancelled).toBe(true);
    expect(upstream.locked).toBe(false);
    expect(harness.raw.destroyCalls).toBe(1);
    expect(harness.ledger.commits[0]!.actualMicro).toBe(harness.ledger.reserves[0]!.inputFloorMicro);
    expect(harness.ledger.commits[0]!.note).toBe('gateway-upstream-idle-floor');
  });

  it.each([
    [401, 'PROVIDER_UNAVAILABLE', 'release'],
    [429, 'RATE_LIMITED', 'floor'],
  ] as const)(
    'sanitizes upstream status %s without relaying provider account detail',
    async (status, type, settlement) => {
      const harness = createHarness();
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response('{"error":{"message":"secret upstream account configuration"}}', {
              status,
              headers: { 'content-type': 'application/json' },
            }),
        ),
      );
      let caught: unknown;
      try {
        await harness.service.relay({
          provider: 'openai',
          body: openAiBody(),
          principalId: 'user_error',
          reply: harness.reply,
        });
      } catch (error) {
        caught = error;
      }
      expect(errorType(caught)).toBe(type);
      expect(JSON.stringify((caught as LlmGatewayError).getResponse())).not.toContain('secret upstream');
      if (settlement === 'release') {
        expect(harness.ledger.releases).toHaveLength(1);
        expect(harness.ledger.commits).toHaveLength(0);
      } else {
        expect(harness.ledger.commits[0]!.actualMicro).toBe(harness.ledger.reserves[0]!.inputFloorMicro);
      }
    },
  );
});
