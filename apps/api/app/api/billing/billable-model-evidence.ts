import { z } from 'zod';
import type {
  BillableInvocationEvidenceCollector,
  BillableProviderWire,
} from '#api/billing/billable-model-invocation.types.js';
import type { NormalizedMeterItem, TerminalEvidence } from '#api/billing/credit-ledger.types.js';
import { providerFailureOf } from '#api/llm/provider-account-stream.js';

type Usage = {
  input?: bigint;
  cacheRead?: bigint;
  cacheWrite?: bigint;
  output?: bigint;
  reasoning?: bigint;
  requestId?: string;
  terminalReason?: string;
  costUsdTicks?: bigint;
};

const integer = (value: unknown): bigint | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value)) {
    return BigInt(value);
  }
  return undefined;
};

const recordSchema = z.record(z.string(), z.unknown());
const record = (value: unknown): Record<string, unknown> | undefined => {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const outputUsageFrom = (
  wire: BillableProviderWire,
  providerId: string,
  usage: Record<string, unknown>,
): Pick<Usage, 'output' | 'reasoning'> => {
  const outputDetails = record(usage['output_tokens_details']) ?? record(usage['completion_tokens_details']);
  const output = integer(usage['output_tokens']) ?? integer(usage['completion_tokens']);
  const reasoning = integer(outputDetails?.['reasoning_tokens']);
  return {
    output:
      wire === 'openai-completions' && providerId === 'vertexai' && output !== undefined
        ? output + (reasoning ?? 0n)
        : output,
    reasoning,
  };
};

const usageFrom = (wire: BillableProviderWire, providerId: string, value: unknown): Usage | undefined => {
  const root = record(value);
  if (!root) {
    return undefined;
  }
  const response = record(root['response']) ?? record(root['message']) ?? root;
  const usage = record(response['usage']);
  if (!usage) {
    return undefined;
  }
  if (wire === 'anthropic') {
    return {
      input: integer(usage['input_tokens']),
      cacheRead: integer(usage['cache_read_input_tokens']),
      cacheWrite: integer(usage['cache_creation_input_tokens']),
      output: integer(usage['output_tokens']),
      requestId: typeof response['id'] === 'string' ? response['id'] : undefined,
    };
  }
  const inputDetails = record(usage['input_tokens_details']) ?? record(usage['prompt_tokens_details']);
  const incompleteDetails = record(response['incomplete_details']);
  return {
    input: integer(usage['input_tokens']) ?? integer(usage['prompt_tokens']),
    // Vertex omits `prompt_tokens_details` entirely on a cache miss while the Gemini tariff pins
    // `cache_read`, so an absent cached count there is a reported zero, not unknown usage.
    cacheRead: integer(inputDetails?.['cached_tokens']) ?? (providerId === 'vertexai' ? 0n : undefined),
    cacheWrite: integer(inputDetails?.['cache_write_tokens']),
    ...outputUsageFrom(wire, providerId, usage),
    requestId: typeof response['id'] === 'string' ? response['id'] : undefined,
    terminalReason: typeof incompleteDetails?.['reason'] === 'string' ? incompleteDetails['reason'] : undefined,
    costUsdTicks: integer(usage['cost_in_usd_ticks']),
  };
};

const parseEvents = (bytes: Uint8Array<ArrayBuffer>): unknown[] => {
  const text = new TextDecoder().decode(bytes);
  const values: unknown[] = [];
  for (const block of text.split(/\r?\n\r?\n/u)) {
    const lines = block.split(/\r?\n/u);
    const dataLines = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart());
    const candidate = (dataLines.length > 0 ? dataLines.join('\n') : block).trim();
    if (!candidate || candidate === '[DONE]') {
      continue;
    }
    try {
      values.push(
        JSON.parse(
          candidate.replaceAll(
            /("(?:input_tokens|output_tokens|prompt_tokens|completion_tokens|cached_tokens|cache_write_tokens|cache_read_input_tokens|cache_creation_input_tokens|reasoning_tokens|cost_in_usd_ticks)"\s*:\s*)([0-9]+)/gu,
            '$1"$2"',
          ),
        ),
      );
    } catch {
      // A chunk may split one event; the owning collector buffers all bytes and reparses on completion.
    }
  }
  return values;
};

const isTerminalEvent = (wire: BillableProviderWire, value: unknown): boolean => {
  const root = record(value);
  if (!root) {
    return false;
  }
  if (wire === 'anthropic') {
    return root['type'] === 'message_stop';
  }
  if (wire === 'openai-responses') {
    const response = record(root['response']);
    return (
      (root['type'] === 'response.completed' && response?.['status'] === 'completed') ||
      (root['type'] === 'response.incomplete' && response?.['status'] === 'incomplete')
    );
  }
  const choices = z.array(recordSchema).safeParse(root['choices']);
  return choices.success && choices.data.some((choice) => typeof choice['finish_reason'] === 'string');
};

const isVertexFinalUsageEvent = (value: unknown): boolean => {
  const root = record(value);
  const choices = z.array(recordSchema).safeParse(root?.['choices']);
  const usage = record(root?.['usage']);
  return (
    choices.success &&
    choices.data.length === 0 &&
    integer(usage?.['prompt_tokens']) !== undefined &&
    integer(usage?.['completion_tokens']) !== undefined
  );
};

type FailureReason = Parameters<BillableInvocationEvidenceCollector['failed']>[0];

/**
 * The terminal kind of each failure that ends without complete usage; a refusal settles before
 * this is asked. Exhaustive on purpose: a reason added without a case here fails to compile
 * rather than silently absorbing the turn.
 */
const incompleteKindOf = (
  failure: Exclude<FailureReason, 'provider_rejected'>,
): 'absorbed_unknown' | 'authorized_exhausted' => {
  switch (failure) {
    case 'authorized_exhausted': {
      return 'authorized_exhausted';
    }
    case 'client_abort':
    case 'deadline':
    case 'malformed_response': {
      return 'absorbed_unknown';
    }
  }
};

/** Creates an exact protocol usage collector over preserved provider response bytes. */
export const createBillableModelEvidenceCollector = (
  wire: BillableProviderWire,
  expectedDimensions: ReadonlySet<string>,
  providerId: string,
): BillableInvocationEvidenceCollector => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];

  const finish = (failure?: Parameters<BillableInvocationEvidenceCollector['failed']>[0]): TerminalEvidence => {
    let size = 0;
    for (const chunk of chunks) {
      size += chunk.byteLength;
    }
    const joined = new Uint8Array(new ArrayBuffer(size));
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const events = parseEvents(joined);
    let latest: Usage | undefined;
    for (const event of events) {
      const next = usageFrom(wire, providerId, event);
      if (next) {
        latest =
          wire === 'anthropic'
            ? {
                input: next.input ?? latest?.input,
                cacheRead: next.cacheRead ?? latest?.cacheRead,
                cacheWrite: next.cacheWrite ?? latest?.cacheWrite,
                output: next.output ?? latest?.output,
                reasoning: next.reasoning ?? latest?.reasoning,
                requestId: next.requestId ?? latest?.requestId,
                terminalReason: next.terminalReason ?? latest?.terminalReason,
                costUsdTicks: next.costUsdTicks ?? latest?.costUsdTicks,
              }
            : next;
      }
    }
    const terminalEvent = events.some((event) => isTerminalEvent(wire, event));
    const failureFrame = events.map((event) => providerFailureOf(event)).find((found) => found !== undefined);
    const terminal =
      wire === 'openai-completions'
        ? (terminalEvent && /(?:^|\r?\n)data:\s*\[DONE\](?:\r?\n|$)/u.test(new TextDecoder().decode(joined))) ||
          // Vertex's OpenAI-compatible stream can close after a choice-less final
          // usage envelope without repeating the optional sentinel.
          (providerId === 'vertexai' && events.some((event) => isVertexFinalUsageEvent(event)))
        : terminalEvent;
    const cacheRead = expectedDimensions.has('cache_read') ? latest?.cacheRead : undefined;
    const cacheWrite = expectedDimensions.has('cache_write') ? latest?.cacheWrite : undefined;
    const invalidCache =
      wire !== 'anthropic' && latest?.input !== undefined && (cacheRead ?? 0n) + (cacheWrite ?? 0n) > latest.input;
    const inputPartitionKnown =
      wire === 'anthropic' ||
      ((!expectedDimensions.has('cache_read') || cacheRead !== undefined) &&
        (!expectedDimensions.has('cache_write') || cacheWrite !== undefined));
    const knownItems: NormalizedMeterItem[] = [
      ...(latest?.input === undefined || invalidCache || !inputPartitionKnown
        ? []
        : [
            {
              dimension: 'uncached_input',
              tier: null,
              quantity: wire === 'anthropic' ? latest.input : latest.input - (cacheRead ?? 0n) - (cacheWrite ?? 0n),
            } satisfies NormalizedMeterItem,
          ]),
      ...(cacheRead === undefined
        ? []
        : [
            {
              dimension: 'cache_read',
              tier: null,
              quantity: cacheRead,
            } satisfies NormalizedMeterItem,
          ]),
      ...(cacheWrite === undefined
        ? []
        : [
            {
              dimension: 'cache_write',
              tier: wire === 'anthropic' ? '5m' : '30m',
              quantity: cacheWrite,
            } satisfies NormalizedMeterItem,
          ]),
      ...(latest?.output === undefined
        ? []
        : [
            {
              dimension: 'output',
              tier: null,
              quantity: latest.output,
            } satisfies NormalizedMeterItem,
          ]),
    ];
    // A provider-reported reason wins; otherwise the gateway's own reason is retained, because
    // `executionStatus` alone cannot separate a client abort from a deadline or a ceiling cut.
    const terminalReason = latest?.terminalReason ?? failure;
    const history =
      latest === undefined && terminalReason === undefined
        ? {}
        : {
            ...(latest?.reasoning === undefined ? {} : { reasoningTokens: latest.reasoning }),
            normalizationEvidence: {
              version: 'provider-usage-v1',
              ...(latest?.requestId === undefined ? {} : { providerRequestId: latest.requestId }),
              ...(terminalReason === undefined ? {} : { terminalReason }),
              fields: {
                ...(latest?.input === undefined ? {} : { input: latest.input.toString() }),
                ...(latest?.output === undefined ? {} : { output: latest.output.toString() }),
                ...(latest?.costUsdTicks === undefined ? {} : { costUsdTicks: latest.costUsdTicks.toString() }),
              },
            },
          };
    /* A supplier that answered with a status ran nothing, so the refusal is proof of zero cost,
     * not unknown cost: it keeps its own kind and releases the customer now, with a known zero
     * supplier cost, instead of absorbing the turn as unpriced. */
    if (failure === 'provider_rejected') {
      return {
        kind: 'provider_rejected',
        executionStatus: 'rejected',
        normalizationEvidence: { version: 'provider-usage-v1', terminalReason: failure, fields: {} },
      };
    }
    /* A supplier that failed its own stream before reporting any usage ran nothing it can bill,
     * the same proof a pre-stream refusal gives, so the turn settles released at zero now instead
     * of holding the customer's credits until the recovery deadline: on staging (2026-10-09, FD-12)
     * a GPT-6 Luna `response.failed` on Tau's exhausted account kept a 717-atom hold and a
     * "Running" row open for 300 s. Usage reported before the failure keeps the unknown path, since
     * the supplier may charge for what it generated. */
    if (failure === undefined && latest === undefined && failureFrame !== undefined) {
      return {
        kind: 'provider_rejected',
        executionStatus: 'rejected',
        normalizationEvidence: {
          version: 'provider-usage-v1',
          terminalReason: 'provider_failed',
          fields: failureFrame.code === undefined ? {} : { providerCode: failureFrame.code },
        },
      };
    }
    /* A cut at the authorized ceiling is the designed outcome of an in-stream control (R8),
     * not a fault, so it keeps its own terminal kind instead of absorbing the turn at zero. */
    const incompleteKind = failure === undefined ? 'absorbed_unknown' : incompleteKindOf(failure);
    if (
      latest?.input === undefined ||
      latest.output === undefined ||
      (expectedDimensions.has('cache_read') && latest.cacheRead === undefined) ||
      (expectedDimensions.has('cache_write') && latest.cacheWrite === undefined)
    ) {
      return {
        kind: incompleteKind,
        executionStatus: failure ? 'cancelled' : 'unknown',
        ...(knownItems.length === 0 ? {} : { usageOccurredAt: new Date(), meterItems: knownItems }),
        ...history,
      };
    }
    if (invalidCache) {
      return {
        kind: incompleteKind,
        executionStatus: incompleteKind === 'authorized_exhausted' ? 'cancelled' : 'unknown',
      };
    }
    return {
      kind: failure === undefined && terminal ? 'final_usage' : incompleteKind,
      usageOccurredAt: new Date(),
      meterItems: knownItems,
      executionStatus: failure ? 'cancelled' : terminal ? 'succeeded' : 'unknown',
      ...history,
    };
  };

  return {
    accept(chunk) {
      chunks.push(new Uint8Array(chunk));
    },
    complete: () => finish(),
    failed: (reason) => finish(reason),
  };
};
