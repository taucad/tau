import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { resolutionMachine } from '#resolution.machine.js';
import type { ResolutionActors, ResolutionMachineInput, ResolutionSide } from '#resolution.machine.js';

expectTypeOf(resolutionMachine).toExtend<AnyStateMachine>();
/* One actor per conflicted revision, so the input names one (A38). */
expectTypeOf<ResolutionMachineInput>().toExtend<Readonly<{ projectId: string; revisionId: string }>>();
/* Every effect a host must provide is on the actor set the machine itself types. */
expectTypeOf<keyof ResolutionActors>().toEqualTypeOf<
  'loadConflict' | 'materialize' | 'applyResolution' | 'finishMerge' | 'seedTurn'
>();
/* `editor` is a side like the other two: the bytes ride the event, not context. */
expectTypeOf<ResolutionSide>().toEqualTypeOf<'mine' | 'theirs' | 'editor'>();
