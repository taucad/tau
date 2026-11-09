/** Stable safeguard pattern identifiers shared with the transitional agent. @public */
export const anomalyPattern = {
  identicalError: 'identical_error',
  identicalCall: 'identical_call',
  perTargetEdit: 'per_target_edit',
  pingPong: 'ping_pong',
  emptyResult: 'empty_result',
  sameErrorDifferentArgs: 'same_error_different_args',
} as const;

/** Stable identifier for one safeguard detector family. @public */
export type AnomalyPattern = (typeof anomalyPattern)[keyof typeof anomalyPattern];

/** A detector family, or the session's output-limit recovery, which records its nudges as safeguards too. @public */
export type SafeguardPattern = AnomalyPattern | 'output_limit';

const prefixed: readonly AnomalyPattern[] = [
  anomalyPattern.perTargetEdit,
  anomalyPattern.pingPong,
  anomalyPattern.emptyResult,
  anomalyPattern.sameErrorDifferentArgs,
];

/**
 * The family of a recorded `safeguard.recorded` row, read from its `safeguardId`.
 *
 * The id is the detection's signature (`safeguards.ts`): four families prefix it with their pattern, an identical call
 * ends it with `:any-result`, an identical error is the bare `tool:args:error` triple, and the output-limit recovery
 * prefixes `output-limit:` (`session.ts`). Change a signature there and this reading with it.
 *
 * @param safeguardId - The row's `safeguardId`.
 * @returns The pattern that fired.
 * @public
 */
export const safeguardPatternOf = (safeguardId: string): SafeguardPattern => {
  if (safeguardId.startsWith('output-limit:')) {
    return 'output_limit';
  }
  const pattern = prefixed.find((candidate) => safeguardId.startsWith(`${candidate}:`));
  if (pattern !== undefined) {
    return pattern;
  }
  return safeguardId.endsWith(':any-result') ? anomalyPattern.identicalCall : anomalyPattern.identicalError;
};
