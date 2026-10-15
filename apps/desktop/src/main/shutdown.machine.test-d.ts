import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { shutdownMachine } from '#main/shutdown.machine.js';

expectTypeOf(shutdownMachine).toExtend<AnyStateMachine>();
