/* eslint-disable @typescript-eslint/naming-convention -- OpenAI's native count response uses snake_case. */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { financialEnvironmentSchema } from '@taucad/billing';
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
/* Two qualifications only, each strict, so an unrecognised `qualification` is refused by the
 * discriminated union before any network call. `controlled-local-zero` is the synthetic
 * development stub (loopback, no credential, no supplier liability); `openai-input-tokens-v1`
 * is OpenAI's own counter, valid in any billing environment once an operator configures it. */
const capabilitySchema = z.discriminatedUnion('qualification', [
  z
    .object({
      qualification: z.literal('controlled-local-zero'),
      environment: z.literal('development'),
      credentialAccount: z.string().min(1),
      sourceRevision: z.string().min(1),
      url: z.string().min(1),
    })
    .strict(),
  z
    .object({
      qualification: z.literal('openai-input-tokens-v1'),
      environment: financialEnvironmentSchema,
      credentialAccount: z.string().min(1),
      sourceRevision: z.string().min(1),
      url: z.string().min(1),
      /** Supplier credential for the count call. Never digested, persisted or logged. */
      apiKey: z.string().min(1),
    })
    .strict(),
]);
const countPathname = '/v1/responses/input_tokens';
const responseSchema = z
  .object({ object: z.literal('response.input_tokens'), input_tokens: z.number().int().nonnegative() })
  .strict();
const maximumResponseBytes = 1024;
const countTimeoutMilliseconds = 5000;

/** Explicitly qualified input-count capability: the synthetic local stub, or OpenAI's own counter. */
export type InputCountCapability = z.infer<typeof capabilitySchema>;

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

const assertCapability = (input: CountInput): { url: URL; capability: InputCountCapability } => {
  const parsed = capabilitySchema.safeParse(input.capability);
  if (
    !parsed.success ||
    input.credentialAccount.length === 0 ||
    parsed.data.credentialAccount !== input.credentialAccount ||
    parsed.data.environment !== input.environment
  ) {
    throw new Error('Input count capability does not match the invocation scope.');
  }
  const capability = parsed.data;
  const url = new URL(capability.url);
  const origin =
    capability.qualification === 'controlled-local-zero'
      ? url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname)
      : url.protocol === 'https:' && url.hostname === 'api.openai.com';
  if (
    !origin ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== countPathname ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('Input count capability URL is not a qualified count endpoint.');
  }
  return { url, capability };
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

/** Count a validated OpenAI Responses request through an explicitly qualified capability. */
export const countBillableModelInput = async (input: CountInput): Promise<InputCountEvidence> => {
  const { url, capability } = assertCapability(input);
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
    headers: {
      'content-type': 'application/json',
      ...(capability.qualification === 'controlled-local-zero' ? {} : { authorization: `Bearer ${capability.apiKey}` }),
    },
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
    sourceRevision: capability.sourceRevision,
    environment: input.environment,
    credentialAccount: input.credentialAccount,
    modelId: parsed.data.model,
    createRequestDigest: digest(createJson),
    countRequestDigest: digest(countJson),
    inputTokens: String(result.input_tokens),
    /* The liability of the count call itself, recorded per operation: zero for the controlled
     * loopback stub, and the supplier's own unpriced counter otherwise (see W10 liability review). */
    liability: capability.qualification,
  };
};
