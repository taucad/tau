/* eslint-disable @nx/enforce-module-boundaries, @typescript-eslint/naming-convention -- installed-codec fixtures cross the package boundary and assert native provider wire keys. */
import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- qualification must exercise the genuine portable-host codec.
import { createGatewayModelTransport } from '../../../../../packages/agent-host/src/transport/gateway-model-transport.js';
// oxlint-disable-next-line no-restricted-imports -- fixture messages use the codec owner's exact public wire types.
import type { ModelProviderKind, ProviderMessage } from '../../../../../packages/agent-host/src/log/event-types.js';
import { CodeOwnedBillableModelQualificationResolver } from '#api/billing/billable-model-qualification.js';
import {
  billableModelInputBound,
  billableModelRequestSchema,
  safeParseBillableModelRequest,
} from '#api/billing/billable-model-request.js';
import type { BillableModelRequest } from '#api/billing/billable-model-request.js';
import type {
  BillableModelProviderAdapter,
  BillableProviderWire,
} from '#api/billing/billable-model-invocation.types.js';

const validPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const image = { type: 'image', mimeType: 'image/png', data: validPng } as const;
const screenshotResult = {
  success: true,
  images: [{ view: 'isometric', dataUrl: `data:image/png;base64,${validPng}` }],
} as const;

const providerWireFor = (
  providerKind: Extract<ModelProviderKind, 'openai' | 'anthropic' | 'vertexai'>,
): BillableProviderWire =>
  providerKind === 'openai' ? 'openai-responses' : providerKind === 'anthropic' ? 'anthropic' : 'openai-completions';

let adapterExecutions = 0;

const capture = async (input: {
  providerKind: Extract<ModelProviderKind, 'openai' | 'anthropic' | 'vertexai'>;
  modelId: string;
  messages: readonly ProviderMessage[];
}): Promise<unknown> => {
  let body: unknown;
  const transport = createGatewayModelTransport({
    baseUrl: 'http://127.0.0.1:1',
    model: { contextWindow: 1_000_000, maxTokens: 16 },
    fetch: async (_request, init) => {
      if (typeof init?.body !== 'string') {
        throw new TypeError('Expected the installed codec to emit a JSON string body.');
      }
      body = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          error: { type: 'fixture_stop', message: 'captured' },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });
  await expect(async () => {
    for await (const _event of transport.stream({
      attemptId: `attempt-${input.providerKind}`,
      invocationPurpose: 'generation',
      modelId: input.modelId,
      providerKind: input.providerKind,
      maxTokens: 16,
      systemPrompt: 'fixture-system',
      messages: input.messages,
      tools: [
        {
          name: 'screenshot',
          description: 'Capture CAD.',
          inputSchema: { type: 'object' },
        },
      ],
      signal: new AbortController().signal,
    })) {
      // Controlled fetch stops immediately after recording the installed codec output.
    }
  }).rejects.toThrow('captured');
  return body;
};

const qualify = (input: {
  providerKind: Extract<ModelProviderKind, 'openai' | 'anthropic' | 'vertexai'>;
  modelId: string;
  body: unknown;
}) => {
  const routeId = input.modelId;
  const providerWire = providerWireFor(input.providerKind);
  const adapter: BillableModelProviderAdapter = {
    createEvidenceCollector: () => {
      adapterExecutions += 1;
      throw new Error('Request qualification must not execute the fixture adapter.');
    },
    executeOnce: async () => {
      adapterExecutions += 1;
      throw new Error('Request qualification must not execute the fixture adapter.');
    },
    classifyFinality: () => ({ state: 'unknown' }),
  };
  const resolver = new CodeOwnedBillableModelQualificationResolver({
    adapters: new Map([[routeId, adapter]]),
    credentialAccounts: new Map([[input.providerKind, 'fixture-account']]),
    executionTimeout: 1,
  });
  return resolver.resolve({
    environment: 'development',
    surface: 'gateway',
    attempt: { version: 1, key: `attempt-${input.providerKind}` },
    providerWire,
    body: input.body,
    priceHeaders: input.providerKind === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {},
    activity: 'agent',
  });
};

const initialMessages: readonly ProviderMessage[] = [
  {
    id: 'user-initial',
    role: 'user',
    content: [{ type: 'text', text: 'fixture' }, image],
  },
];

const followupMessages = (input: {
  providerKind: Extract<ModelProviderKind, 'openai' | 'anthropic' | 'vertexai'>;
  modelId: string;
}): readonly ProviderMessage[] => {
  const isResponses = input.providerKind === 'openai';
  const isAnthropic = input.providerKind === 'anthropic';
  return [
    { id: 'user-initial', role: 'user', content: 'fixture' },
    {
      id: 'assistant-tool',
      role: 'assistant',
      content: [
        {
          type: 'thinking',
          thinking: 'opaque-fixture',
          thinkingSignature: isResponses
            ? '{"type":"reasoning","id":"rs_fixture","summary":[],"encrypted_content":"opaque-fixture"}'
            : isAnthropic
              ? 'signature-fixture'
              : 'reasoning_content',
        },
        {
          type: 'toolCall',
          id: isResponses ? 'call-fixture|fc_fixture' : 'call-fixture',
          name: 'screenshot',
          arguments: { targetFile: 'fixture.step' },
        },
      ],
      metadata: {
        api: isResponses ? 'openai-responses' : isAnthropic ? 'anthropic-messages' : 'openai-completions',
        provider: input.providerKind,
        model: input.modelId,
      },
    },
    {
      id: 'tool-output',
      role: 'tool-output',
      toolCallId: isResponses ? 'call-fixture|fc_fixture' : 'call-fixture',
      toolName: 'screenshot',
      content: screenshotResult,
      isError: false,
    },
  ];
};

describe('billable model request contract', () => {
  it.each([
    { name: 'Responses', providerKind: 'openai', modelId: 'openai-gpt-5.6-luna', supplierModelId: 'gpt-5.6-luna' },
    {
      name: 'Anthropic',
      providerKind: 'anthropic',
      modelId: 'anthropic-claude-sonnet-5',
      supplierModelId: 'claude-sonnet-5',
    },
    {
      name: 'Completions',
      providerKind: 'vertexai',
      modelId: 'google-gemini-3.5-flash',
      supplierModelId: 'google/gemini-3.5-flash',
    },
  ] as const)(
    'accepts genuine installed Pi $name initial and synthetic screenshot-shaped follow-up requests',
    async ({ providerKind, modelId, supplierModelId }) => {
      const initial = await capture({
        providerKind,
        modelId,
        messages: initialMessages,
      });
      const followup = await capture({
        providerKind,
        modelId,
        messages: followupMessages({ providerKind, modelId }),
      });

      const providerWire = providerWireFor(providerKind);
      expect(safeParseBillableModelRequest(initial, providerWire).success).toBe(true);
      expect(safeParseBillableModelRequest(followup, providerWire).success).toBe(true);
      const forwarded = (body: unknown) => ({
        ...(body as Record<string, unknown>),
        model: supplierModelId,
      });
      expect(qualify({ providerKind, modelId, body: initial }).normalizedRequest.body).toEqual(forwarded(initial));
      expect(qualify({ providerKind, modelId, body: followup }).normalizedRequest.body).toEqual(forwarded(followup));
    },
  );

  it('rejects unsupported chargeable fields and non-data image URLs', () => {
    const base = {
      model: 'gpt-5.6-luna',
      stream: true,
      max_output_tokens: 16,
    } as const;
    expect(safeParseBillableModelRequest({ ...base, service_tier: 'priority' }, 'openai-responses').success).toBe(
      false,
    );
    expect(safeParseBillableModelRequest({ ...base, tools: [{ type: 'function' }] }, 'openai-responses').success).toBe(
      false,
    );
    expect(
      safeParseBillableModelRequest(
        {
          ...base,
          tools: [
            {
              type: 'function',
              name: 'screenshot',
              parameters: {},
              function: { name: 'screenshot', parameters: {}, strict: false },
            },
          ],
        },
        'openai-responses',
      ).success,
    ).toBe(false);
    expect(safeParseBillableModelRequest({ ...base, tool_choice: { type: 'tool' } }, 'openai-responses').success).toBe(
      false,
    );
    expect(
      safeParseBillableModelRequest(
        {
          model: 'claude-sonnet-5',
          stream: true,
          max_tokens: 16,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'fixture',
                  cache_control: { type: 'ephemeral', ttl: '1h' },
                },
              ],
            },
          ],
        },
        'anthropic',
      ).success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(
        {
          ...base,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_image',
                  detail: 'auto',
                  image_url: 'https://example.test/a.png',
                },
              ],
            },
          ],
        },
        'openai-responses',
      ).success,
    ).toBe(false);
  });

  it('rejects aggregate UTF-8 bytes and depth before schema traversal', () => {
    expect(
      safeParseBillableModelRequest(
        {
          model: 'gpt-5.6-luna',
          stream: true,
          max_output_tokens: 16,
          instructions: 'é'.repeat(2_000_001),
        },
        'openai-responses',
      ).success,
    ).toBe(false);
    let nested: Record<string, unknown> = {};
    for (let index = 0; index < 64; index++) {
      nested = { nested };
    }
    expect(safeParseBillableModelRequest(nested, 'openai-responses').success).toBe(false);
  });

  it('accepts native Responses string inputs, string message content, instructions, and encrypted reasoning inclusion', () => {
    const base = {
      model: 'gpt-5.6-luna',
      stream: true,
      store: false,
      max_output_tokens: 64,
    };
    expect(
      safeParseBillableModelRequest({ ...base, input: 'fixture', instructions: 'Respond briefly.' }, 'openai-responses')
        .success,
    ).toBe(true);
    expect(
      safeParseBillableModelRequest(
        {
          ...base,
          input: [
            { role: 'developer', content: 'fixture-system' },
            { role: 'user', content: 'fixture-user' },
          ],
          include: ['reasoning.encrypted_content'],
        },
        'openai-responses',
      ).success,
    ).toBe(true);
  });

  it('admits only the catalog-owned Anthropic and Gemini reasoning controls', () => {
    const anthropic = {
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'fixture' }],
      max_tokens: 64,
      stream: true,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'high' },
    };
    const gemini = {
      model: 'gemini-3.7-flash',
      messages: [{ role: 'user', content: 'fixture' }],
      max_completion_tokens: 64,
      stream: true,
      extra_body: {
        google: {
          thinking_config: { include_thoughts: true, thinking_level: 'MEDIUM' },
          thought_tag_marker: 'think',
          stream_function_call_arguments: true,
        },
      },
    };

    expect(safeParseBillableModelRequest(anthropic, 'anthropic').success).toBe(true);
    expect(
      safeParseBillableModelRequest(
        { ...anthropic, thinking: { type: 'enabled', budget_tokens: 1024, display: 'summarized' } },
        'anthropic',
      ).success,
    ).toBe(true);
    expect(safeParseBillableModelRequest(gemini, 'openai-completions').success).toBe(true);
    expect(
      safeParseBillableModelRequest(
        { ...gemini, extra_body: { ...gemini.extra_body, arbitrary_passthrough: true } },
        'openai-completions',
      ).success,
    ).toBe(false);
  });

  it('rejects Anthropic cache metadata inside Completions content', () => {
    expect(
      safeParseBillableModelRequest(
        {
          model: 'gemini-3.5-flash',
          stream: true,
          max_completion_tokens: 16,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'fixture',
                  cache_control: { type: 'ephemeral' },
                },
              ],
            },
          ],
        },
        'openai-completions',
      ).success,
    ).toBe(false);
  });

  it('should admit only the bounded Google thought-signature extension for Completions tool calls', () => {
    const body = (extraContent: unknown) => ({
      model: 'google-gemini-3.5-flash',
      stream: true,
      max_completion_tokens: 16,
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-fixture',
              type: 'function',
              function: { name: 'screenshot', arguments: '{}' },
              extra_content: extraContent,
            },
          ],
        },
      ],
    });
    const accepted = body({
      google: { thought_signature: 'sentinel-signature' },
    });

    expect(safeParseBillableModelRequest(accepted, 'openai-completions').success).toBe(true);
    expect(
      qualify({
        providerKind: 'vertexai',
        modelId: accepted.model,
        body: accepted,
      }).normalizedRequest.body,
    ).toEqual({ ...accepted, model: 'google/gemini-3.5-flash' });
    expect(
      safeParseBillableModelRequest(
        body({ google: { thought_signature: 'sentinel', other: true } }),
        'openai-completions',
      ).success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(body({ google: { thought_signature: 1 } }), 'openai-completions').success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(
        body({
          google: { thought_signature: 'sentinel' },
          other: { thought_signature: 'sentinel' },
        }),
        'openai-completions',
      ).success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(
        body({ google: { thought_signature: 'x'.repeat(4_000_001) } }),
        'openai-completions',
      ).success,
    ).toBe(false);
  });

  it('should keep the Google thought signature inside the funded request bound', () => {
    const signed = (signature: string) => ({
      model: 'google-gemini-3.5-flash',
      stream: true,
      max_completion_tokens: 16,
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-fixture',
              type: 'function',
              function: { name: 'screenshot', arguments: '{}' },
              extra_content: { google: { thought_signature: signature } },
            },
          ],
        },
      ],
    });
    const unsigned = {
      model: 'google-gemini-3.5-flash',
      stream: true,
      max_completion_tokens: 16,
      messages: [
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call-fixture', type: 'function', function: { name: 'screenshot', arguments: '{}' } }],
        },
      ],
    };

    /* The per-field ceiling counts UTF-16 code units, so a multi-byte signature
     * under it still has to be refused by the aggregate UTF-8 body bound. */
    const multiByte = 'é'.repeat(2_000_001);
    expect(multiByte.length).toBeLessThan(4_000_000);
    expect(new TextEncoder().encode(multiByte).byteLength).toBeGreaterThan(4_000_000);
    expect(safeParseBillableModelRequest(signed(multiByte), 'openai-completions').success).toBe(false);

    /* Admitted signature bytes are billable input text, so they raise the priced
     * maximum by exactly their own UTF-8 length and by nothing else. */
    const signature = 'sentinel-signature';
    const withSignature = qualify({
      providerKind: 'vertexai',
      modelId: 'google-gemini-3.5-flash',
      body: signed(signature),
    });
    const withoutSignature = qualify({
      providerKind: 'vertexai',
      modelId: 'google-gemini-3.5-flash',
      body: unsigned,
    });
    const inputOf = (qualification: typeof withSignature): bigint =>
      qualification.maximumQuantities.find((meter) => meter.dimension === 'uncached_input')!.quantity;
    const signatureBytes = BigInt(
      new TextEncoder().encode(JSON.stringify({ google: { thought_signature: signature } })).byteLength,
    );
    /* `extra_content` and its member name enter the serialized request alongside the value. */
    expect(inputOf(withSignature) - inputOf(withoutSignature)).toBe(
      signatureBytes + BigInt('"extra_content":,'.length),
    );
    expect(withSignature.invocation.jointInputMaximum).toBeUndefined();
  });

  it('rejects mixed native envelopes and foreign content before adapter execution', async () => {
    adapterExecutions = 0;
    const responses = await capture({
      providerKind: 'openai',
      modelId: 'openai-gpt-5.6-luna',
      messages: initialMessages,
    });
    const anthropic = await capture({
      providerKind: 'anthropic',
      modelId: 'anthropic-claude-sonnet-5',
      messages: initialMessages,
    });
    const completions = await capture({
      providerKind: 'vertexai',
      modelId: 'google-gemini-3.5-flash',
      messages: initialMessages,
    });

    expect(() =>
      qualify({
        providerKind: 'openai',
        modelId: 'openai-gpt-5.6-luna',
        body: { ...(responses as Record<string, unknown>), messages: [] },
      }),
    ).toThrow();
    expect(() =>
      qualify({
        providerKind: 'anthropic',
        modelId: 'anthropic-claude-sonnet-5',
        body: {
          ...(anthropic as Record<string, unknown>),
          instructions: 'foreign',
        },
      }),
    ).toThrow();
    expect(() =>
      qualify({
        providerKind: 'vertexai',
        modelId: 'google-gemini-3.5-flash',
        body: { ...(completions as Record<string, unknown>), input: [] },
      }),
    ).toThrow();
    expect(adapterExecutions).toBe(0);
  });
});

/* D24: the three native PDF document blocks, one per provider wire. */
const pdfBase64 = 'JVBERi0xLjcKJeLjz9MK';
const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;
const documentBlock = {
  type: 'document',
  source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
} as const;
const inputFileBlock = { type: 'input_file', filename: 'bracket-spec.pdf', file_data: pdfDataUrl } as const;
const fileBlock = { type: 'file', file: { filename: 'bracket-spec.pdf', file_data: pdfDataUrl } } as const;
const anthropicBody = (block: unknown) => ({
  model: 'claude-sonnet-5',
  stream: true,
  max_tokens: 16,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'read it' }, block] }],
});
const responsesBody = (block: unknown) => ({
  model: 'gpt-5.6-luna',
  stream: true,
  max_output_tokens: 16,
  input: [{ role: 'user', content: [{ type: 'input_text', text: 'read it' }, block] }],
});
const completionsBody = (block: unknown) => ({
  model: 'google/gemini-3.5-flash',
  stream: true,
  max_completion_tokens: 16,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'read it' }, block] }],
});

describe('document block admission', () => {
  it('admits each provider document block on its own wire', () => {
    expect(safeParseBillableModelRequest(anthropicBody(documentBlock), 'anthropic').success).toBe(true);
    expect(
      safeParseBillableModelRequest(anthropicBody({ ...documentBlock, title: 'bracket-spec.pdf' }), 'anthropic')
        .success,
    ).toBe(true);
    expect(safeParseBillableModelRequest(responsesBody(inputFileBlock), 'openai-responses').success).toBe(true);
    expect(safeParseBillableModelRequest(completionsBody(fileBlock), 'openai-completions').success).toBe(true);
  });

  /*
   * The pi Anthropic codec marks the last block of the last user message as the
   * rolling cache breakpoint, and a PDF placed after the text is that block.
   * Refusing the marker would refuse the turn; dropping it would forfeit the
   * cache on the most expensive turns there are.
   */
  it('admits the cache breakpoint on an Anthropic document block, and only a well-formed one', () => {
    expect(
      safeParseBillableModelRequest(
        anthropicBody({ ...documentBlock, cache_control: { type: 'ephemeral' } }),
        'anthropic',
      ).success,
    ).toBe(true);
    expect(
      safeParseBillableModelRequest(
        anthropicBody({ ...documentBlock, cache_control: { type: 'ephemeral', ttl: '1h' } }),
        'anthropic',
      ).success,
    ).toBe(false);
  });

  it('refuses a document block on a foreign provider wire', () => {
    expect(safeParseBillableModelRequest(anthropicBody(inputFileBlock), 'anthropic').success).toBe(false);
    expect(safeParseBillableModelRequest(responsesBody(documentBlock), 'openai-responses').success).toBe(false);
    expect(safeParseBillableModelRequest(completionsBody(documentBlock), 'openai-completions').success).toBe(false);
  });

  it('refuses an extra key on any document block', () => {
    expect(safeParseBillableModelRequest(anthropicBody({ ...documentBlock, context: 'x' }), 'anthropic').success).toBe(
      false,
    );
    expect(
      safeParseBillableModelRequest(
        anthropicBody({ ...documentBlock, source: { ...documentBlock.source, url: 'x' } }),
        'anthropic',
      ).success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(responsesBody({ ...inputFileBlock, file_id: 'f' }), 'openai-responses').success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(
        completionsBody({ ...fileBlock, file: { ...fileBlock.file, file_id: 'f' } }),
        'openai-completions',
      ).success,
    ).toBe(false);
  });

  it('refuses document bytes that are not a PDF', () => {
    expect(
      safeParseBillableModelRequest(
        anthropicBody({ ...documentBlock, source: { ...documentBlock.source, media_type: 'image/png' } }),
        'anthropic',
      ).success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(
        anthropicBody({ ...documentBlock, source: { ...documentBlock.source, data: 'not base64!' } }),
        'anthropic',
      ).success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(
        responsesBody({ ...inputFileBlock, file_data: 'https://example.test/bracket-spec.pdf' }),
        'openai-responses',
      ).success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(
        responsesBody({ ...inputFileBlock, file_data: `data:image/png;base64,${validPng}` }),
        'openai-responses',
      ).success,
    ).toBe(false);
    expect(
      safeParseBillableModelRequest(
        completionsBody({
          ...fileBlock,
          file: { ...fileBlock.file, file_data: 'data:application/pdf;base64,not base64!' },
        }),
        'openai-completions',
      ).success,
    ).toBe(false);
  });

  it('bounds document bytes at the base64 length of 20 MiB', () => {
    /* The aggregate 4 MB request gate in `safeParseBillableModelRequest` trips long before
     * this bound, so the per-document ceiling is asserted against the schema itself. */
    const oversize = 'A'.repeat(4 * Math.ceil((20 * 1024 * 1024) / 3) + 1);
    expect(
      billableModelRequestSchema.safeParse(
        anthropicBody({ ...documentBlock, source: { ...documentBlock.source, data: oversize } }),
      ).success,
    ).toBe(false);
    expect(
      billableModelRequestSchema.safeParse(
        responsesBody({ ...inputFileBlock, file_data: `data:application/pdf;base64,${oversize}` }),
      ).success,
    ).toBe(false);
  });

  it('falls closed on the funded input bound for a document request', () => {
    /* A PDF's tokens are not bounded by its base64 length, so `document`, `input_file` and
     * `file` stay out of the bounded-element registry and pin the whole provider context. */
    const parsed = safeParseBillableModelRequest(responsesBody(inputFileBlock), 'openai-responses');
    expect(parsed.success).toBe(true);
    expect(billableModelInputBound((parsed as Extract<typeof parsed, { success: true }>).data)).toBeUndefined();
  });
});

const boundOf = (body: unknown): bigint | undefined => {
  const parsed = safeParseBillableModelRequest(body, 'openai-responses');
  expect(parsed.success).toBe(true);
  return billableModelInputBound((parsed as Extract<typeof parsed, { success: true }>).data);
};

const utf8 = (value: unknown): bigint => BigInt(new TextEncoder().encode(JSON.stringify(value)).byteLength);

describe('billableModelInputBound', () => {
  it('bounds a text request by its own serialized bytes plus the ratified overheads', () => {
    const body = {
      model: 'openai-gpt-5.6-luna',
      input: [{ role: 'user', content: 'hello' }],
      max_output_tokens: 16,
      stream: true,
    };

    expect(boundOf(body)).toBe(utf8(body) + 64n + 4096n);
  });

  it('replaces image bytes with the documented per-image maximum', () => {
    const element = { type: 'input_image', image_url: `data:image/png;base64,${validPng}` };
    const body = {
      model: 'openai-gpt-5.6-luna',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'hello' }, element] }],
      max_output_tokens: 16,
      stream: true,
    };

    /* A compressed image is not bounded by its own base64 length, so its bytes leave
     * the total and the per-route image maximum takes their place. */
    expect(boundOf(body)).toBe(utf8(body) - utf8(element) + 3000n + 64n + 4096n);
  });

  it('bounds free-form tool schemas by bytes without reading their JSON-Schema types', () => {
    const body = {
      model: 'openai-gpt-5.6-luna',
      input: 'hello',
      max_output_tokens: 16,
      stream: true,
      tools: [
        {
          type: 'function',
          name: 'read_file',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      ],
    };

    expect(boundOf(body)).toBe(utf8(body) + 64n + 4096n);
  });

  it('fails closed on a request element that carries no documented bound', () => {
    const body = {
      model: 'openai-gpt-5.6-luna',
      input: [{ role: 'user', content: [{ type: 'input_audio', audio: 'AAAA' }] }],
      max_output_tokens: 16,
      stream: true,
    } as unknown as BillableModelRequest;

    expect(billableModelInputBound(body)).toBeUndefined();
  });
});
