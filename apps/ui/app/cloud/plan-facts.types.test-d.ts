import { expectTypeOf, test } from 'vitest';
import type { CommercialFeatures } from '#cloud/plan-facts.types.js';

/* Adaptive app deployment mode W4 (I3): an unresolved plan has no capability to read. */
test('a capability read without narrowing does not compile', () => {
  const read = (plan: CommercialFeatures): boolean => {
    /* The read under test is the type error itself. */
    // @ts-expect-error -- `canSyncFiles` exists only once the plan is resolved.
    const unnarrowed: unknown = plan.canSyncFiles; // oxlint-disable-line typescript/no-unsafe-assignment -- the read under test is the type error itself
    return plan.isResolved ? plan.canSyncFiles : Boolean(unnarrowed);
  };
  expectTypeOf(read).returns.toEqualTypeOf<boolean>();
});
