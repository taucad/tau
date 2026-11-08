import { llmGatewayProviders } from '@taucad/telemetry';
import type { promptCacheOutcomes, turnStepTokenTypes } from '@taucad/telemetry';
import type { NormalizedMeterItem, TerminalEvidence } from '#api/billing/credit-ledger.types.js';
import type { TurnTelemetry } from '#api/llm/model-invocation.types.js';
import type { MetricsService } from '#telemetry/metrics.js';

type GatewayProviderLabel = (typeof llmGatewayProviders)[number];
type PromptCacheOutcome = (typeof promptCacheOutcomes)[number];
type TurnStepTokenType = (typeof turnStepTokenTypes)[number];

const providerLabels: ReadonlySet<string> = new Set(llmGatewayProviders);

/**
 * The bounded `gen_ai.provider.name` of a gateway latency or cache series.
 *
 * @param providerId - The qualified provider id.
 * @returns The id when it is a gateway provider, otherwise `other`.
 */
export const gatewayProviderLabel = (providerId: string): GatewayProviderLabel =>
  providerLabels.has(providerId) ? (providerId as GatewayProviderLabel) : 'other';

/**
 * The turn-step token type of one settled meter item. The 1-hour write is the `cache_write`
 * dimension's `1h` tier; every other write tier (5 m, 30 m) is `cache_write`.
 *
 * @param item - One normalized meter item.
 * @returns Its token type, or undefined for a dimension that is not a token count.
 */
export const turnStepTokenType = (
  item: Pick<NormalizedMeterItem, 'dimension' | 'tier'>,
): TurnStepTokenType | undefined => {
  switch (item.dimension) {
    case 'uncached_input': {
      return 'input';
    }
    case 'cache_read': {
      return 'cache_read';
    }
    case 'cache_write': {
      return item.tier === '1h' ? 'cache_write_1h' : 'cache_write';
    }
    case 'output': {
      return 'output';
    }
    default: {
      return undefined;
    }
  }
};

/**
 * Classifies one settled step's prompt-cache use: `hit` when cache reads are at least half of
 * everything it read as input, `partial` below that, `miss` with none, and `unreported` when the
 * provider reported no cache-read dimension at all.
 *
 * @param meterItems - The step's settled meter items.
 * @returns The outcome label.
 */
export const promptCacheOutcome = (meterItems: readonly NormalizedMeterItem[]): PromptCacheOutcome => {
  let read: bigint | undefined;
  let other = 0n;
  for (const item of meterItems) {
    if (item.dimension === 'cache_read') {
      read = (read ?? 0n) + item.quantity;
    } else if (item.dimension === 'uncached_input' || item.dimension === 'cache_write') {
      other += item.quantity;
    }
  }
  if (read === undefined) {
    return 'unreported';
  }
  if (read === 0n) {
    return 'miss';
  }
  return read * 2n >= read + other ? 'hit' : 'partial';
};

/**
 * Records one settled funded step on the turn-step series. A call without turn labels (helpers,
 * older clients) and a step with no settled usage record nothing.
 *
 * @param metrics - The API metrics, absent in tests that do not observe them.
 * @param input - The step's provider, asserted turn labels, terminal evidence and its supplier
 * time to first token when the step streamed.
 */
export const recordTurnStepCache = (
  metrics:
    | Pick<MetricsService, 'llmTurnStepCacheTokens' | 'llmTurnStepCacheOutcomes' | 'llmTurnStepTimeToFirstToken'>
    | undefined,
  input: {
    readonly providerId: string;
    readonly turn: TurnTelemetry | undefined;
    readonly evidence: TerminalEvidence;
    readonly timeToFirstTokenSeconds: number | undefined;
  },
): void => {
  const { turn, evidence } = input;
  if (metrics === undefined || turn === undefined || evidence.kind !== 'final_usage') {
    return;
  }
  const labels = {
    'gen_ai.provider.name': gatewayProviderLabel(input.providerId),
    'tau.turn.step': turn.step,
    'tau.turn.gap': turn.gap,
  };
  for (const item of evidence.meterItems) {
    const tokenType = turnStepTokenType(item);
    if (tokenType !== undefined && item.quantity > 0n) {
      metrics.llmTurnStepCacheTokens.add(Number(item.quantity), { ...labels, 'gen_ai.token.type': tokenType });
    }
  }
  const outcome = promptCacheOutcome(evidence.meterItems);
  metrics.llmTurnStepCacheOutcomes.add(1, { ...labels, 'tau.prompt_cache.outcome': outcome });
  if (input.timeToFirstTokenSeconds !== undefined) {
    metrics.llmTurnStepTimeToFirstToken.record(input.timeToFirstTokenSeconds, {
      ...labels,
      'tau.prompt_cache.outcome': outcome,
    });
  }
};

/** A base64 image carried inline: Anthropic's `source.data`, or a `data:image/` URL (OpenAI wires). */
const dataImagePrefix = 'data:image/';

/**
 * The base64 image bytes one node of a request body carries inline, counted during the walk the
 * gateway already makes over every body (`assertRequestBound`), so no second pass is added.
 *
 * @param record - One object node of the request body.
 * @returns The inline image characters directly on this node.
 */
export const inlineImageBytesOf = (record: Readonly<Record<string, unknown>>): number => {
  let bytes = 0;
  if (
    record['type'] === 'base64' &&
    typeof record['media_type'] === 'string' &&
    record['media_type'].startsWith('image/') &&
    typeof record['data'] === 'string'
  ) {
    bytes += record['data'].length;
  }
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && value.startsWith(dataImagePrefix)) {
      bytes += value.length;
    }
  }
  return bytes;
};
