/**
 * W8 TS-S0 Q2 and TS-S9: `@taucad/revisions` cannot import `@taucad/agent-host`, so the placement port and the
 * settlement rows are declared twice. This host depends on both, so this is where the two are proven equal.
 */

import type { TurnAttemptKey, TurnPlacementGrant, TurnPlacementPort } from '@taucad/agent-host';
import type { TurnSettlementBody } from '@taucad/agent-host/wire';
import type { TurnAttemptKey as RevisionsAttemptKey } from '@taucad/revisions';
import type { TurnPlacementAdapter } from '@taucad/revisions/turn-placement';
import { describe, expectTypeOf, it } from 'vitest';

type Fact =
  TurnPlacementAdapter<TurnPlacementGrant['tools']> extends Readonly<{
    settlements: (input: never) => AsyncIterable<infer Emitted>;
  }>
    ? Emitted
    : never;
type Row = Extract<Fact, { kind: 'settled' }>['row'];

describe('the turn-placement contract across its two declarations', () => {
  it('should keep the attempt key equal in both directions', () => {
    expectTypeOf<TurnAttemptKey>().toEqualTypeOf<RevisionsAttemptKey>();
  });

  it('should let the adapter serve as the agent host port', () => {
    expectTypeOf<TurnPlacementAdapter<TurnPlacementGrant['tools']>>().toExtend<TurnPlacementPort>();
  });

  it('should publish only rows the settlement write gate accepts (one shape, D11)', () => {
    const gated = (row: Row): TurnSettlementBody => row;
    expectTypeOf(gated).returns.toEqualTypeOf<TurnSettlementBody>();
  });
});
