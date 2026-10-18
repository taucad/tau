import { expectTypeOf, it } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { remoteMachine, selectRemoteFacet } from '#remote.machine.js';
import type { RemoteFacet } from '#remote.types.js';

it('preserves the complete remote.machine type contracts', () => {
  expectTypeOf(remoteMachine).toExtend<AnyStateMachine>();
  expectTypeOf(selectRemoteFacet).returns.toEqualTypeOf<RemoteFacet>();
});
