import { createActor } from 'xstate';
import { cadMachine } from '~/machines/cad.js';
import { inspect } from '~/machines/inspector.js';
import { graphicsActor } from '~/routes/builds_.$id/graphics-actor.js';

export const cadActor = createActor(cadMachine, {
  inspect,
  input: {
    shouldInitializeKernelOnStart: true,
    graphicsRef: graphicsActor,
  },
});
cadActor.start();
