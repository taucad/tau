import { describe, expectTypeOf, it } from 'vitest';
import type { PrintRequestState, PrintRequestSummary } from '@taucad/runtime/machine';
import type { RequestPrintOutput } from '#schemas/tools/print.tool.schema.js';

/* The transcript validates persisted outputs against this contract, so a ledger
 * state it did not know would fail every chat that recorded one. */
describe('print request transcript contract', () => {
  it('should mirror every state and summary fact the print request ledger records', () => {
    expectTypeOf<RequestPrintOutput['request']['state']>().toEqualTypeOf<PrintRequestState>();
    expectTypeOf<PrintRequestSummary>().toExtend<RequestPrintOutput['request']['summary']>();
  });
});
