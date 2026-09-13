import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { projectSessionMachine } from './project-session.machine.js';
import type { ProjectSessionCloseReason, ProjectSessionRegion } from './project-session.machine.js';

expectTypeOf(projectSessionMachine).toExtend<AnyStateMachine>();
expectTypeOf<ProjectSessionCloseReason>().toEqualTypeOf<'user' | 'idle' | 'budget' | 'quit'>();
expectTypeOf<ProjectSessionRegion>().toEqualTypeOf<'views' | 'runtime' | 'agentHost' | 'compute'>();
