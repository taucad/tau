/* eslint-disable @typescript-eslint/naming-convention -- fixtures preserve OpenAI's native wire keys. */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { countBillableModelInput } from '#api/billing/billable-model-input-count.js';
import type { InputCountCapability } from '#api/billing/billable-model-input-count.js';

const validPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const body = {
  model: 'gpt-5.6-luna',
  instructions: 'Inspect the synthetic fixture.',
  input: [
    { type: 'reasoning', id: 'rs_fixture', summary: [], encrypted_content: 'opaque-fixture' },
    { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: 'inspect', arguments: '{"view":"iso"}' },
    {
      type: 'function_call_output',
      call_id: 'call_fixture',
      output: [
        { type: 'input_text', text: 'Synthetic result.' },
        { type: 'input_image', image_url: `data:image/png;base64,${validPng}`, detail: 'auto' },
      ],
    },
  ],
  reasoning: { effort: 'none' },
  tools: [{ type: 'function', name: 'inspect', description: 'Inspect.', parameters: { type: 'object' } }],
  tool_choice: 'auto',
  max_output_tokens: 64,
  stream: true,
  stream_options: { include_usage: true },
  store: false,
  include: ['reasoning.encrypted_content'],
};
const capability: InputCountCapability = {
  qualification: 'controlled-local-zero',
  environment: 'development',
  credentialAccount: 'fixture-account',
  sourceRevision: 'fixture-count-contract-v1',
  url: 'http://127.0.0.1:43199/v1/responses/input_tokens',
};
type CountInput = Parameters<typeof countBillableModelInput>[0];
const request = (overrides: Partial<CountInput> = {}): CountInput => ({
  body,
  maximumInput: 1_000_000n,
  capability,
  environment: 'development',
  credentialAccount: 'fixture-account',
  signal: new AbortController().signal,
  ...overrides,
});
const jsonResponse = (value: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const sha256 = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const forgeCapability = (values: Record<string, string>): InputCountCapability => {
  const forged = { ...capability };
  for (const [key, value] of Object.entries(values)) {
    Reflect.set(forged, key, value);
  }
  return forged;
};
const invalidCapabilities: ReadonlyArray<readonly [string, Partial<CountInput>]> = [
  ['production', { environment: 'prod-us' }],
  ['forged qualification', { capability: forgeCapability({ qualification: 'unqualified' }) }],
  ['forged capability environment', { capability: forgeCapability({ environment: 'prod-us' }) }],
  ['empty capability account', { capability: { ...capability, credentialAccount: '' }, credentialAccount: '' }],
  ['credential mismatch', { credentialAccount: 'other' }],
  ['non-loopback URL', { capability: { ...capability, url: 'https://api.openai.com/v1/responses/input_tokens' } }],
  ['query-bearing URL', { capability: { ...capability, url: `${capability.url}?credential=forbidden` } }],
  ['wrong path', { capability: { ...capability, url: 'http://127.0.0.1:43199/v1/responses' } }],
];

describe('countBillableModelInput', () => {
  it.each(['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'])(
    'preserves every count-affecting native field and pins exact create/count digests for %s',
    async (model) => {
      const createBody = { ...body, model };
      let captured = '';
      const evidence = await countBillableModelInput(
        request({
          body: createBody,
          fetchOnce: async (_url, init) => {
            if (typeof init?.body !== 'string') {
              throw new TypeError('Expected a serialized count body.');
            }
            captured = init.body;
            expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
            return jsonResponse({ object: 'response.input_tokens', input_tokens: 321 });
          },
        }),
      );
      const projected = {
        model,
        input: body.input,
        instructions: body.instructions,
        reasoning: body.reasoning,
        tools: body.tools,
        tool_choice: body.tool_choice,
      };
      expect(JSON.parse(captured)).toEqual(projected);
      expect(captured).not.toContain('max_output_tokens');
      expect(evidence).toEqual({
        version: 'openai-input-count-v1',
        sourceRevision: capability.sourceRevision,
        environment: 'development',
        credentialAccount: 'fixture-account',
        modelId: model,
        createRequestDigest: sha256(JSON.stringify(createBody)),
        countRequestDigest: sha256(JSON.stringify(projected)),
        inputTokens: '321',
        liability: 'controlled-local-zero',
      });
    },
  );

  it('preserves an actual zero count distinctly', async () => {
    const evidence = await countBillableModelInput(
      request({ fetchOnce: async () => jsonResponse({ object: 'response.input_tokens', input_tokens: 0 }) }),
    );
    expect(evidence.inputTokens).toBe('0');
  });

  it.each(invalidCapabilities)('rejects an unqualified %s capability before fetch', async (_name, overrides) => {
    const fetchOnce = vi.fn<typeof fetch>();
    await expect(countBillableModelInput(request({ ...overrides, fetchOnce }))).rejects.toThrow();
    expect(fetchOnce).not.toHaveBeenCalled();
  });

  it('rejects unsupported models and unmatched fields before fetch', async () => {
    const fetchOnce = vi.fn<typeof fetch>();
    await expect(
      countBillableModelInput(request({ body: { ...body, model: 'gpt-other' }, fetchOnce })),
    ).rejects.toThrow();
    await expect(
      countBillableModelInput(request({ body: { ...body, truncation: 'auto' }, fetchOnce })),
    ).rejects.toThrow();
    expect(fetchOnce).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', new Response('{', { status: 200 })],
    ['wrong object', jsonResponse({ object: 'response', input_tokens: 1 })],
    ['unsafe integer', jsonResponse({ object: 'response.input_tokens', input_tokens: Number.MAX_SAFE_INTEGER + 1 })],
    ['negative integer', jsonResponse({ object: 'response.input_tokens', input_tokens: -1 })],
    ['HTTP error', jsonResponse({ object: 'response.input_tokens', input_tokens: 1 }, { status: 500 })],
    ['redirect', new Response('', { status: 302, headers: { location: capability.url } })],
  ])('rejects a %s response', async (_name, response) => {
    await expect(countBillableModelInput(request({ fetchOnce: async () => response }))).rejects.toThrow();
  });

  it('rejects counts above the qualified maximum', async () => {
    await expect(
      countBillableModelInput(
        request({
          maximumInput: 4n,
          fetchOnce: async () => jsonResponse({ object: 'response.input_tokens', input_tokens: 5 }),
        }),
      ),
    ).rejects.toThrow('exceeds');
  });

  it('bounds response bytes and cancels the reader', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(new Uint8Array(1025));
      },
      cancel,
    });
    await expect(countBillableModelInput(request({ fetchOnce: async () => new Response(stream) }))).rejects.toThrow(
      '1 KiB',
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels a rejected HTTP response body', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({ cancel });
    await expect(
      countBillableModelInput(request({ fetchOnce: async () => new Response(stream, { status: 429 }) })),
    ).rejects.toThrow('invalid response');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('forwards parent cancellation and does not retry', async () => {
    const controller = new AbortController();
    const fetchOnce = vi.fn<typeof fetch>(async (_url, init) => {
      controller.abort(new Error('fixture abort'));
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason instanceof Error ? init.signal.reason : new Error('fixture abort'));
          return;
        }
        init?.signal?.addEventListener(
          'abort',
          () => {
            reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error('fixture abort'));
          },
          { once: true },
        );
      });
    });
    await expect(countBillableModelInput(request({ signal: controller.signal, fetchOnce }))).rejects.toThrow(
      'fixture abort',
    );
    expect(fetchOnce).toHaveBeenCalledOnce();
  });

  it('applies the five-second count timeout without retrying', async () => {
    const countTimeout = new AbortController();
    countTimeout.abort(new DOMException('fixture timeout', 'TimeoutError'));
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(countTimeout.signal);
    const fetchOnce = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.signal?.aborted) {
        throw init.signal.reason instanceof Error ? init.signal.reason : new Error('fixture timeout');
      }
      return jsonResponse({ object: 'response.input_tokens', input_tokens: 1 });
    });
    await expect(countBillableModelInput(request({ fetchOnce }))).rejects.toThrow('fixture timeout');
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(fetchOnce).toHaveBeenCalledOnce();
  });
});
