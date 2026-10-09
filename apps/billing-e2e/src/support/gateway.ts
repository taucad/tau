import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { gatewayErrorCodes } from '@taucad/agent-host/wire';
import { unsignedIntegerStringSchema, wireOperationReceiptSchema } from '@taucad/billing';
import type { WireOperationReceipt } from '@taucad/billing';
import { apiCalls, apiUrl, baseUrl, ok } from '#support/api.js';
import type { Api, ApiCall } from '#support/api.js';

/** The gateway's typed refusal envelope (`LlmGatewayError`), checked against the codes the host switches on. */
export const gatewayErrorSchema = z
  .object({
    type: z.literal('error'),
    error: z
      .object({
        type: z.enum(gatewayErrorCodes),
        message: z.string().min(1),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .strict(),
  })
  .strict();
export type GatewayError = z.infer<typeof gatewayErrorSchema>;

/** The shortfall an `INSUFFICIENT_CREDIT` refusal carries for the credits card. */
export const insufficientCreditDetailsSchema = z
  .object({
    requiredCreditAtoms: unsignedIntegerStringSchema,
    availableCreditAtoms: unsignedIntegerStringSchema,
    routeId: z.string().min(1),
  })
  .strict();

/** The catalog routes the rows call: the program's Haiku pathway, and the route that proves settlement end to end. */
export const gatewayRoutes = {
  haiku: {
    routeId: 'anthropic-claude-haiku-4.5',
    modelName: 'Haiku 4.5',
    path: '/v1/llm/anthropic/v1/messages',
    body: (prompt: string, maximumTokens: number): Record<string, unknown> => ({
      model: 'anthropic-claude-haiku-4.5',
      messages: [{ role: 'user', content: prompt }],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- provider wire field
      max_tokens: maximumTokens,
      stream: true,
    }),
    headers: { 'anthropic-version': '2023-06-01' },
  },
  luna: {
    routeId: 'openai-gpt-6-luna',
    modelName: 'GPT-6 Luna',
    path: '/v1/llm/openai/v1/responses',
    body: (prompt: string, maximumTokens: number): Record<string, unknown> => ({
      model: 'openai-gpt-6-luna',
      input: prompt,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- provider wire field
      max_output_tokens: maximumTokens,
      stream: true,
      store: false,
    }),
    headers: {},
  },
} as const;
export type GatewayRoute = keyof typeof gatewayRoutes;

/** One gateway call: what came back, and the identities a receipt or attempt lookup needs. */
export type GatewayCall = ApiCall & {
  readonly attemptId: string;
  readonly operationId?: string;
  /** The parsed refusal, when the gateway refused. */
  readonly refusal?: GatewayError;
  /** The streamed body, cut to its first 2,000 characters, when the gateway relayed. */
  readonly streamed?: string;
  /** Whatever the `whileStreaming` probe returned, read after the headers and before the body. */
  readonly probe?: unknown;
};

type CallOptions = {
  readonly prompt?: string;
  readonly maximumTokens?: number;
  /** A replayed attempt id; a fresh one otherwise. */
  readonly attemptId?: string;
  /** Runs once the response headers arrive and before the body is read, so a hold is still open. */
  readonly whileStreaming?: (operationId: string | undefined) => Promise<unknown>;
};

/**
 * Calls the model gateway as the browser agent host does: the session cookie, the app origin, a fresh
 * `x-tau-attempt-id` and the route's own funded request contract (`stream: true`, one output bound). The call is
 * recorded with the row's other API calls, so its request id reaches the matrix.
 *
 * @param api - The signed-in account's client.
 * @param route - Which catalog route to call.
 * @param options - Prompt, bound, attempt id and a mid-stream probe.
 * @returns The status, identities and either the refusal or the start of the stream.
 */
export const callGateway = async (api: Api, route: GatewayRoute, options: CallOptions = {}): Promise<GatewayCall> => {
  const definition = gatewayRoutes[route];
  const attemptId = options.attemptId ?? randomUUID();
  const response = await fetch(`${apiUrl}${definition.path}`, {
    method: 'POST',
    headers: {
      origin: baseUrl,
      cookie: [...api.jar].map(([name, value]) => `${name}=${value}`).join('; '),
      'content-type': 'application/json',
      'x-tau-attempt-id': attemptId,
      ...definition.headers,
    },
    body: JSON.stringify(
      definition.body(options.prompt ?? 'Reply with the single word OK.', options.maximumTokens ?? 32),
    ),
  });
  const operationId = response.headers.get('x-tau-operation-id') ?? undefined;
  const call: ApiCall = {
    at: new Date().toISOString(),
    method: 'POST',
    path: definition.path,
    status: response.status,
    requestId: response.headers.get('request-id') ?? undefined,
  };
  apiCalls.push(call);
  const probe =
    response.ok && options.whileStreaming !== undefined ? await options.whileStreaming(operationId) : undefined;
  const text = await response.text();
  if (response.ok) {
    return { ...call, attemptId, operationId, streamed: text.slice(0, 2000), probe };
  }
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    // A refusal that is not JSON fails the parse below with its text in the message.
  }
  const refusal = gatewayErrorSchema.safeParse(parsed);
  if (!refusal.success) {
    throw new Error(
      `${definition.path} answered ${response.status} outside the gateway envelope: ${text.slice(0, 500)}`,
    );
  }
  return { ...call, attemptId, operationId, refusal: refusal.data, probe };
};

/** One evidence line for a gateway call. */
export const describeCall = (call: GatewayCall): string =>
  [
    `${call.path} ${call.status}`,
    call.refusal === undefined
      ? undefined
      : `${call.refusal.error.type} "${call.refusal.error.message}"${
          call.refusal.error.details === undefined ? '' : ` ${JSON.stringify(call.refusal.error.details)}`
        }`,
    call.operationId === undefined ? undefined : `operation ${call.operationId}`,
    `attempt ${call.attemptId}`,
    call.requestId === undefined ? undefined : `(${call.requestId})`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ');

/** The attempt lookup's answer: a receipt, or a key the gateway voided before admitting it. */
export const attemptLookupSchema = z.union([
  wireOperationReceiptSchema,
  z.object({ state: z.literal('not_found'), voided: z.literal(true).optional() }).strict(),
]);
export type AttemptLookup = z.infer<typeof attemptLookupSchema>;

/** `GET /v1/billing/attempts/gateway/:attemptId`, signed in as the browser's agent host is. */
export const lookupAttempt = async (api: Api, attemptId: string): Promise<AttemptLookup> =>
  ok(
    await api.request('GET', `/v1/billing/attempts/gateway/${encodeURIComponent(attemptId)}`, { origin: baseUrl }),
    attemptLookupSchema,
  );

/** `GET /v1/billing/operations/:operationId`: the pending hold or the terminal receipt. */
export const readOperation = async (api: Api, operationId: string): Promise<WireOperationReceipt> =>
  ok(await api.request('GET', `/v1/billing/operations/${encodeURIComponent(operationId)}`), wireOperationReceiptSchema);

/**
 * Polls an operation every 2 s until it leaves `pending` or `terminalBudget` passes.
 *
 * @param api - The account's API client.
 * @param operationId - The operation to read.
 * @param terminalBudget - Milliseconds to keep polling.
 */
export const waitForTerminal = async (
  api: Api,
  operationId: string,
  terminalBudget = 60_000,
): Promise<WireOperationReceipt> => {
  const started = Date.now();
  let operation = await readOperation(api, operationId);
  while (operation.state === 'pending' && Date.now() - started < terminalBudget) {
    // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one operation
    await delay(2000);
    // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one operation
    operation = await readOperation(api, operationId);
  }
  return operation;
};

/** One evidence line for an operation receipt or attempt lookup. */
export const describeOperation = (operation: AttemptLookup): string => {
  if (operation.state === 'terminal') {
    const { receipt } = operation;
    return `operation ${operation.operationId} terminal: ${receipt.executionStatus}/${receipt.customerState}, charged ${
      receipt.chargedCreditAtoms
    } of ${receipt.authorizedMaxCreditAtoms} authorized, delta ${receipt.accountDeltaCreditAtoms}, model ${
      receipt.model.displayName ?? receipt.model.id
    }, tokens ${receipt.tokens.status}`;
  }
  if (operation.state === 'pending') {
    return `operation ${operation.operationId} pending (${operation.dispatchState}), ${operation.authorizedMaxCreditAtoms} authorized`;
  }
  if (operation.state === 'unavailable') {
    return `operation ${operation.operationId} unavailable (${operation.reason})`;
  }
  return `attempt not found${operation.voided === true ? ' (voided)' : ''}`;
};
