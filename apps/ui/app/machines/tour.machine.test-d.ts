import { expectTypeOf } from 'vitest';
import type { AnyStateMachine } from 'xstate';

import { tourMachine } from './tour.machine.js';

expectTypeOf(tourMachine).toExtend<AnyStateMachine>();
