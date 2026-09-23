import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { remoteMachine, selectRemoteFacet } from '#remote.machine.js';
import type { RemoteFacet } from '#remote.types.js';

expectTypeOf(remoteMachine).toExtend<AnyStateMachine>();
expectTypeOf(selectRemoteFacet).returns.toEqualTypeOf<RemoteFacet>();
