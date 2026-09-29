import { expectTypeOf } from 'vitest';
import type { ActorRefFrom, AnyStateMachine, InputFrom } from 'xstate';

import { projectRevisionsMachine, selectRevisionStatus } from '#project-revisions.machine.js';
import type { ProjectRevisionsMachineInput } from '#project-revisions.machine.js';
import type { RevisionStatusProjection } from '#project-revisions.types.js';

expectTypeOf(projectRevisionsMachine).toExtend<AnyStateMachine>();
expectTypeOf<NonNullable<InputFrom<typeof projectRevisionsMachine>>>().toEqualTypeOf<ProjectRevisionsMachineInput>();
expectTypeOf(selectRevisionStatus).returns.toEqualTypeOf<RevisionStatusProjection>();

declare const root: ActorRefFrom<typeof projectRevisionsMachine>;

/* RM-A16: a turn verb names one attempt, so a key without `attempt` is not a key (D14). */
// @ts-expect-error `attempt` is required on the key.
root.send({ type: 'turnCompleted', key: { chatId: 'chat-1', turnId: 'turn-1', runId: 'run-1' } });
// @ts-expect-error the verbs are keyed; a bare turn id names no attempt.
root.send({ type: 'turnAbandoned', turnId: 'turn-1' });
/* `release` had no sender outside the package and is deleted (RM-S10). */
// @ts-expect-error `release` is gone.
root.send({ type: 'release', turnId: 'turn-1' });
