import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { publishMachine, selectPublishFacet } from '#publish.machine.js';
import type { PublishActors } from '#publish.machine.js';
import type { PublishFacet } from '#publish.types.js';

expectTypeOf(publishMachine).toExtend<AnyStateMachine>();
expectTypeOf(selectPublishFacet).returns.toEqualTypeOf<PublishFacet>();
expectTypeOf<PublishActors>().toHaveProperty('push');
