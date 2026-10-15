import { describe, expectTypeOf, it } from 'vitest';
import type { MachineCheck, MachineJobState } from '@taucad/runtime/machine';
import type { RequestJobOutput } from '#schemas/tools/machine.tool.schema.js';

/* The transcript validates persisted outputs against this contract, so a job
 * state it did not know would fail every chat that recorded one. */
describe('job transcript contract', () => {
  it('should mirror every state and check state the job record carries', () => {
    expectTypeOf<RequestJobOutput['job']['state']>().toEqualTypeOf<MachineJobState>();
    expectTypeOf<NonNullable<RequestJobOutput['job']['checks']>[number]['state']>().toEqualTypeOf<
      MachineCheck['state']
    >();
  });
});
