import { createActor } from 'xstate';
import { cadMachine } from '#machines/cad.machine.js';
import { inspect } from '#machines/inspector.js';
import { logActor } from '#machines/logs.machine.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';

export const cadActor = createActor(cadMachine, {
  inspect,
  input: {
    shouldInitializeKernelOnStart: true,
    graphicsRef: graphicsActor,
    logActorRef: logActor,
  },
});
cadActor.start();
