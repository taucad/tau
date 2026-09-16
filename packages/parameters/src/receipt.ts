import type { ParameterChange } from '#planning.js';
import type { ParameterSnapshot } from '#snapshot.js';
import { sameIdentity } from '#request.js';

/** Evidence-based result of inspecting an uncertain checked write. @public */
export type ParameterReceipt = 'committed' | 'known-not-applied' | 'indeterminate';

/** Missing receipts, including after an ABA sequence, never establish non-application. @public */
export const classifyParameterReceipt = (
  input: Readonly<{
    change: Extract<ParameterChange, { status: 'prepared' }>;
    current?: ParameterSnapshot;
    refused?: boolean;
  }>,
): ParameterReceipt => {
  if (input.refused === true) {
    return 'known-not-applied';
  }
  const expected = input.change.proposed.entry.lastOperation;
  const actual = input.current?.entry.lastOperation;
  if (expected === undefined || actual === undefined || input.current === undefined) {
    return 'indeterminate';
  }
  return expected.requestId === actual.requestId &&
    expected.fingerprint === actual.fingerprint &&
    sameIdentity(expected, actual) &&
    sameIdentity(input.change.proposed.identity, input.current.identity)
    ? 'committed'
    : 'indeterminate';
};
