import type { BillableProviderWire } from '#billable-model-invocation.types.js';
import type { NormalizedMeterItem, TerminalEvidence } from '#credit-ledger.types.js';

/*
 * A step the person stopped is billed for what it used (operator ruling D-3, 2026-11-27): the usage the
 * supplier reported before the stop, plus a rounded-down estimate of what it did not get to report, capped at
 * the authorization by the ledger. A stop before any output was relayed stays free, and so does every end
 * that is not the person's choice: the gateway deadline, a malformed stream, a service restart.
 *
 * Only Anthropic reports input early (`message_start`); output, and everything on the other wires, arrives in
 * the final frame a stop never reaches. So output is estimated from the text Tau relayed, at four characters
 * a token rounded down, and input the supplier never reported is the gateway's own exact count where it has
 * one (OpenAI), priced as cache reads (the cheapest input rate), and zero where it has none. Every estimate
 * errs low: Tau absorbs the remainder.
 */

/** The evidence field naming how many output characters Tau relayed before the stop; its presence marks a billed stop. */
export const relayedOutputCharactersField = 'relayedOutputCharacters';

/** The evidence field carrying the output-token estimate the stop was priced at. */
export const estimatedOutputTokensField = 'estimatedOutputTokens';

/** Characters per output token for the stop estimate; English prose runs about four, code fewer, so this errs low. */
const charactersPerToken = 4;

type JsonObject = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const textLength = (value: unknown): number => (typeof value === 'string' ? value.length : 0);

const anthropicCharacters = (event: JsonObject): number => {
  if (event['type'] !== 'content_block_delta' || !isRecord(event['delta'])) {
    return 0;
  }
  const { delta } = event;
  return textLength(delta['text']) + textLength(delta['thinking']) + textLength(delta['partial_json']);
};

const responsesCharacters = (event: JsonObject): number =>
  typeof event['type'] === 'string' && event['type'].endsWith('.delta') ? textLength(event['delta']) : 0;

const completionsCharacters = (event: JsonObject): number => {
  const { choices } = event;
  if (!Array.isArray(choices)) {
    return 0;
  }
  let total = 0;
  for (const choice of choices) {
    if (!isRecord(choice) || !isRecord(choice['delta'])) {
      continue;
    }
    const { delta } = choice;
    total += textLength(delta['content']) + textLength(delta['reasoning_content']) + textLength(delta['reasoning']);
    const toolCalls = delta['tool_calls'];
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (isRecord(call) && isRecord(call['function'])) {
          total += textLength(call['function']['arguments']);
        }
      }
    }
  }
  return total;
};

/**
 * Counts the generated characters a supplier stream carried: answer text, visible reasoning and tool-call
 * arguments. Encrypted or hidden reasoning is not counted, which only lowers the estimate.
 *
 * @param wire - The supplier wire the events were parsed from.
 * @param events - The parsed stream events.
 * @returns The number of generated characters relayed.
 */
export const relayedOutputCharacters = (wire: BillableProviderWire, events: readonly unknown[]): number => {
  let total = 0;
  for (const event of events) {
    if (!isRecord(event)) {
      continue;
    }
    total +=
      wire === 'anthropic'
        ? anthropicCharacters(event)
        : wire === 'openai-responses'
          ? responsesCharacters(event)
          : completionsCharacters(event);
  }
  return total;
};

/** One meter the pinned tariff prices, by dimension and tier. */
export type StopRateKey = Pick<NormalizedMeterItem, 'dimension' | 'tier'>;

const keyOf = (item: StopRateKey): string => `${item.dimension}:${item.tier ?? ''}`;
const inputDimensions = new Set(['uncached_input', 'cache_read', 'cache_write']);

/**
 * The meters a stopped step is priced at: every pinned meter, from the supplier's own report where it made
 * one before the stop, otherwise from the rounded-down estimates above.
 *
 * @param input - The pinned meters, what the supplier reported, the relayed characters and any exact input count.
 * @returns One item per pinned meter, or `undefined` when nothing was relayed (the stop is free).
 */
export const stoppedStepMeters = (input: {
  readonly rates: readonly StopRateKey[];
  readonly reported: readonly NormalizedMeterItem[];
  readonly relayedCharacters: number;
  readonly countedInputTokens?: bigint | undefined;
}): { readonly meterItems: NormalizedMeterItem[]; readonly estimatedOutputTokens: bigint } | undefined => {
  if (input.relayedCharacters <= 0) {
    return undefined;
  }
  const reported = new Map(input.reported.map((item) => [keyOf(item), item.quantity]));
  const estimatedOutputTokens = BigInt(Math.floor(input.relayedCharacters / charactersPerToken));
  const inputReported = input.reported.some((item) => inputDimensions.has(item.dimension));
  /* An exact count with no reported split is priced as cache reads where the tariff has them. */
  const countedKey =
    inputReported || input.countedInputTokens === undefined
      ? undefined
      : (input.rates.find((rate) => rate.dimension === 'cache_read') ??
        input.rates.find((rate) => rate.dimension === 'uncached_input'));
  const meterItems = input.rates.map((rate): NormalizedMeterItem => {
    const key = keyOf(rate);
    const reportedQuantity = reported.get(key);
    const quantity =
      rate.dimension === 'output'
        ? reportedQuantity !== undefined && reportedQuantity > estimatedOutputTokens
          ? reportedQuantity
          : estimatedOutputTokens
        : (reportedQuantity ??
          (countedKey !== undefined && keyOf(countedKey) === key ? input.countedInputTokens! : 0n));
    return { dimension: rate.dimension, tier: rate.tier, quantity };
  });
  return { meterItems, estimatedOutputTokens };
};

/**
 * Whether terminal evidence is a stop the person is billed for: a client cut that relayed output, priced by
 * {@link stoppedStepMeters}. Evidence recorded before the ruling carries no relayed count and stays free.
 *
 * @param evidence - The step's terminal evidence.
 * @returns `true` for a billed stop.
 */
export const isBilledStop = (
  evidence: TerminalEvidence,
): evidence is Extract<TerminalEvidence, { kind: 'absorbed_unknown' }> =>
  evidence.kind === 'absorbed_unknown' &&
  evidence.executionStatus === 'cancelled' &&
  evidence.normalizationEvidence?.terminalReason === 'client_abort' &&
  Number(evidence.normalizationEvidence.fields[relayedOutputCharactersField] ?? '0') > 0 &&
  (evidence.meterItems?.length ?? 0) > 0;
