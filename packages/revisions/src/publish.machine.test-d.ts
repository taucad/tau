import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { publishMachine, selectPublishFacet } from '#publish.machine.js';
import type { PublishActors, PublishFacet } from '#publish.machine.js';

expectTypeOf(publishMachine).toExtend<AnyStateMachine>();
expectTypeOf(selectPublishFacet).returns.toEqualTypeOf<PublishFacet>();
expectTypeOf<PublishActors>().toHaveProperty('push');
