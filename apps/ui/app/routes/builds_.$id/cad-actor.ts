import { createActor } from 'xstate';
import { cadMachine } from '~/machines/cad.js';
import { inspect } from '~/machines/inspector.js';

export const cadActor = createActor(cadMachine, { inspect, input: { shouldInitializeKernelOnStart: true } });
cadActor.start();
