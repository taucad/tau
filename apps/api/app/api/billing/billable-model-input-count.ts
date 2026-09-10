/* eslint-disable @typescript-eslint/naming-convention -- OpenAI's native count response uses snake_case. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { safeParseBillableModelRequest } from '#api/billing/billable-model-request.js';
import type { BillingEnvironment, InputCountEvidence } from '#api/billing/credit-ledger.types.js';

const countModels = new Set(['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5']);
const createFields = new Set([
  'model',
  'input',
  'instructions',
  'reasoning',
  'tools',
  'tool_choice',
  'max_output_tokens',
  'stream',
  'stream_options',
  'store',
  'include',
]);
const projectedFields = ['model', 'input', 'instructions', 'reasoning', 'tools', 'tool_choice'] as const;
const capabilitySchema = z
  .object({
    qualification: z.literal('controlled-local-zero'),
    environment: z.literal('development'),
    credentialAccount: z.string().min(1),
    sourceRevision: z.string().min(1),
    url: z.string().min(1),
  })
  .strict();
const responseSchema = z
  .object({ object: z.literal('response.input_tokens'), input_tokens: z.number().int().nonnegative() })
  .strict();
const maximumResponseBytes = 1024;
const countTimeoutMilliseconds = 5000;

/** Explicitly qualified synthetic local input-count capability. */
export type InputCountCapability = {
  readonly qualification: 'controlled-local-zero';
  readonly environment: 'development';
  readonly credentialAccount: string;
  readonly sourceRevision: string;
  readonly url: string;
};

type CountInput = {
  readonly body: unknown;
  readonly maximumInput: bigint;
  readonly capability: InputCountCapability;
  readonly environment: BillingEnvironment;
  readonly credentialAccount: string;
  readonly signal: AbortSignal;
  readonly fetchOnce?: typeof fetch;
};

const digest = (serialized: string): string => `sha256:${createHash('sha256').update(serialized).digest('hex')}`;

const assertCapability = (input: CountInput): URL => {
  const capability = capabilitySchema.safeParse(input.capability);
  if (
    !capability.success ||
    input.environment !== 'development' ||
    input.credentialAccount.length === 0 ||
    capability.data.credentialAccount !== input.credentialAccount
  ) {
    throw new Error('Input count capability does not match the invocation scope.');
  }
  const url = new URL(capability.data.url);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/v1/responses/input_tokens' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Input count capability URL is not a controlled loopback endpoint.');
  }
  return url;
};

const readBoundedJson = async (response: Response): Promise<unknown> => {
  if (response.body === null) {
    throw new Error('Input count endpoint returned an invalid response.');
  }
  if (!response.ok || response.redirected) {
    await response.body.cancel().catch(() => undefined);
    throw new Error('Input count endpoint returned an invalid response.');
  }
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  let length = 0;
  let done = false;
  try {
    while (!done) {
      // oxlint-disable-next-line no-await-in-loop -- stream chunks must be read sequentially to enforce the byte ceiling.
      const result = await reader.read();
      if (result.done) {
        done = true;
        continue;
      }
      length += result.value.byteLength;
      if (length > maximumResponseBytes) {
        throw new Error('Input count response exceeds 1 KiB.');
      }
      chunks.push(new Uint8Array(result.value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
};

/** Count a validated OpenAI Responses request through an explicitly qualified local capability. */
export const countBillableModelInput = async (input: CountInput): Promise<InputCountEvidence> => {
  const url = assertCapability(input);
  if (input.maximumInput < 0n) {
    throw new Error('Input maximum must be nonnegative.');
  }
  const parsed = safeParseBillableModelRequest(input.body, 'openai-responses');
  if (!parsed.success || !countModels.has(parsed.data.model)) {
    throw new Error('Request is outside the qualified input-count contract.');
  }
  const body = input.body as Record<string, unknown>;
  if (Object.keys(body).some((field) => !createFields.has(field))) {
    throw new Error('Request contains an unmatched input-count field.');
  }
  const countBody = Object.fromEntries(
    projectedFields.filter((field) => field in body).map((field) => [field, body[field]]),
  );
  const createJson = JSON.stringify(body);
  const countJson = JSON.stringify(countBody);
  const deadline = AbortSignal.timeout(countTimeoutMilliseconds);
  const signal = AbortSignal.any([input.signal, deadline]);
  const response = await (input.fetchOnce ?? fetch)(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: countJson,
    redirect: 'error',
    signal,
  });
  const result = responseSchema.parse(await readBoundedJson(response));
  if (BigInt(result.input_tokens) > input.maximumInput) {
    throw new Error('Input count exceeds the qualified maximum.');
  }
  return {
    version: 'openai-input-count-v1',
    sourceRevision: input.capability.sourceRevision,
    environment: input.environment,
    credentialAccount: input.credentialAccount,
    modelId: parsed.data.model,
    createRequestDigest: digest(createJson),
    countRequestDigest: digest(countJson),
    inputTokens: String(result.input_tokens),
    liability: 'controlled-local-zero',
  };
};
