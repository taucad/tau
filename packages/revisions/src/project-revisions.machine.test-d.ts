import { expectTypeOf } from 'vitest';
import type { AnyStateMachine, InputFrom } from 'xstate';

import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import type { ProjectRevisionsMachineInput } from '#project-revisions.machine.js';
import type { RevisionStatusProjection } from '#project-revisions.types.js';

expectTypeOf(projectRevisionsMachine).toExtend<AnyStateMachine>();
expectTypeOf<NonNullable<InputFrom<typeof projectRevisionsMachine>>>().toEqualTypeOf<ProjectRevisionsMachineInput>();
expectTypeOf(selectRevisionStatus).returns.toEqualTypeOf<RevisionStatusProjection>();
