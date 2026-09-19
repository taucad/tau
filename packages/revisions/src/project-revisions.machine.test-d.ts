import { expectTypeOf } from 'vitest';
import type { AnyStateMachine, InputFrom } from 'xstate';

import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import type { ProjectRevisionsMachineInput, RevisionStatusProjection } from '#project-revisions.machine.js';

expectTypeOf(projectRevisionsMachine).toExtend<AnyStateMachine>();
expectTypeOf<InputFrom<typeof projectRevisionsMachine>>().toEqualTypeOf<ProjectRevisionsMachineInput>();
expectTypeOf(selectRevisionStatus).returns.toEqualTypeOf<RevisionStatusProjection>();
